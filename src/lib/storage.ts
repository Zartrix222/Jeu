// Sauvegarde locale dans IndexedDB : projets, modèles personnels, musiques.
// Les anciens projets (localStorage) sont migrés automatiquement au premier lancement.
// Rien n'est envoyé sur Internet.

import { analyzeBuffer, type MusicAnalysis } from '../engine/analysis';
import { normalizeSettings } from '../engine/templates';
import type { Preset, Project } from '../engine/types';
import { uid } from '../engine/util';

const LEGACY_KEY = 'orbit.projects.v1';
const DB = 'orbit-studio';
type Store = 'music' | 'projects' | 'presets' | 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['music', 'projects', 'presets'] as const) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error ?? r.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction annulée'));
  });
}

export class StorageFullError extends Error {
  constructor() {
    super('Stockage du navigateur plein. Exportez une sauvegarde puis supprimez d’anciens projets ou musiques.');
  }
}

async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if ((e as DOMException)?.name === 'QuotaExceededError') throw new StorageFullError();
    throw e;
  }
}

// ---------------- projets ----------------
export async function loadProjects(): Promise<Project[]> {
  await migrateLegacy();
  const list = await tx<Project[]>('projects', 'readonly', (s) => s.getAll());
  return list.map((p) => ({ ...p, settings: normalizeSettings(p.settings) })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const putProject = (p: Project) => guard(tx('projects', 'readwrite', (s) => s.put(p)));
export const deleteProject = (id: string) => tx('projects', 'readwrite', (s) => s.delete(id));

async function migrateLegacy() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const list = JSON.parse(raw) as Project[];
    for (const p of list) await putProject({ ...p, settings: normalizeSettings(p.settings) });
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.warn('Migration des projets impossible', e);
  }
}

// ---------------- modèles personnels ----------------
export async function loadPresets(): Promise<Preset[]> {
  const list = await tx<Preset[]>('presets', 'readonly', (s) => s.getAll());
  return list.map((p) => ({ ...p, settings: normalizeSettings(p.settings) })).sort((a, b) => b.createdAt - a.createdAt);
}
export const putPreset = (p: Preset) => guard(tx('presets', 'readwrite', (s) => s.put(p)));
export const deletePreset = (id: string) => tx('presets', 'readwrite', (s) => s.delete(id));

// ---------------- petites valeurs (cache des miniatures…) ----------------
export const kvGet = <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key: string, v: unknown) => guard(tx('kv', 'readwrite', (s) => s.put(v, key)));

export async function storageInfo(): Promise<{ used: number; quota: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { used: e.usage ?? 0, quota: e.quota ?? 0, persisted: (await navigator.storage.persisted?.()) ?? false };
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* facultatif */
  }
}

// ---------------- musiques ----------------
export interface StoredMusic {
  id: string;
  name: string;
  type: string;
  data: Blob;
}

export const putMusic = (m: StoredMusic) => guard(tx('music', 'readwrite', (s) => s.put(m)));
export const getMusic = (id: string) => tx<StoredMusic | undefined>('music', 'readonly', (s) => s.get(id));
export const deleteMusic = (id: string) => tx('music', 'readwrite', (s) => s.delete(id));
export const allMusic = () => tx<StoredMusic[]>('music', 'readonly', (s) => s.getAll());

export async function importMusicFile(file: File): Promise<StoredMusic> {
  const m: StoredMusic = { id: 'm_' + uid(), name: file.name.replace(/\.[^.]+$/, ''), type: file.type || 'audio/mpeg', data: file };
  await putMusic(m);
  return m;
}

// ---- décodage + analyse (mis en cache en mémoire) ----
export interface LoadedMusic {
  buffer: AudioBuffer;
  analysis: MusicAnalysis;
}
const cache = new Map<string, Promise<LoadedMusic>>();

export function loadMusic(id: string, onProgress?: (p: number) => void): Promise<LoadedMusic> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const m = await getMusic(id);
      if (!m) throw new Error('Musique introuvable');
      const ab = await m.data.arrayBuffer();
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      const buffer = await new Promise<AudioBuffer>((res, rej) => {
        const r = ctx.decodeAudioData(ab, res, rej);
        if (r && typeof r.then === 'function') r.then(res, rej);
      });
      const analysis = await analyzeInWorker(buffer, onProgress);
      return { buffer, analysis };
    })();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

/** Analyse dans un Web Worker (l'interface reste fluide) ; repli sur le fil principal. */
async function analyzeInWorker(buffer: AudioBuffer, onProgress?: (p: number) => void): Promise<MusicAnalysis> {
  try {
    const { default: AnalysisWorker } = await import('../workers/analysis.worker?worker&inline');
    const w = new AnalysisWorker();
    const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
    return await new Promise<MusicAnalysis>((resolve, reject) => {
      w.onmessage = (e: MessageEvent) => {
        if (e.data.progress !== undefined) onProgress?.(e.data.progress);
        else if (e.data.error) {
          w.terminate();
          reject(new Error(e.data.error));
        } else {
          w.terminate();
          resolve(e.data.analysis as MusicAnalysis);
        }
      };
      w.onerror = (e) => {
        w.terminate();
        reject(e);
      };
      w.postMessage({ sampleRate: buffer.sampleRate, length: buffer.length, chans }, chans.map((c) => c.buffer));
    });
  } catch (e) {
    console.warn('Analyse dans le fil principal', e);
    return analyzeBuffer(buffer, onProgress);
  }
}

// ---------------- sauvegarde / restauration ----------------
interface Backup {
  app: 'orbit-studio';
  version: 2;
  exportedAt: number;
  projects: Project[];
  presets?: Preset[];
  music: { id: string; name: string; type: string; base64: string }[];
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function makeBackup(projects: Project[], includeMusic: boolean, presets: Preset[] = []): Promise<Blob> {
  const used = new Set([...projects, ...presets].map((p) => p.settings.audio.musicId).filter(Boolean) as string[]);
  const music: Backup['music'] = [];
  if (includeMusic) {
    for (const m of await allMusic()) if (used.has(m.id)) music.push({ id: m.id, name: m.name, type: m.type, base64: await blobToBase64(m.data) });
  }
  const data: Backup = { app: 'orbit-studio', version: 2, exportedAt: Date.now(), projects, presets, music };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** Importe une sauvegarde (ou un projet seul) dans la base locale. */
export async function restoreBackup(file: File): Promise<{ projects: number; presets: number }> {
  const data = JSON.parse(await file.text()) as Partial<Backup> & Partial<Project>;
  let incoming: Project[] = [];
  if (data.app === 'orbit-studio' && Array.isArray(data.projects)) incoming = data.projects;
  else if (data.settings && data.id) incoming = [data as Project];
  else throw new Error("Ce fichier n'est pas une sauvegarde Orbit Studio.");
  for (const m of data.music ?? []) await putMusic({ id: m.id, name: m.name, type: m.type, data: base64ToBlob(m.base64, m.type) });
  for (const p of incoming) await putProject({ ...p, settings: normalizeSettings(p.settings) });
  for (const p of data.presets ?? []) await putPreset({ ...p, settings: normalizeSettings(p.settings) });
  return { projects: incoming.length, presets: data.presets?.length ?? 0 };
}

export { saveFile as downloadBlob } from './host';
