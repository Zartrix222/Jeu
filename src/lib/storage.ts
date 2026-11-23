// Sauvegarde locale : projets dans localStorage, musiques (fichiers lourds) dans IndexedDB.
// Rien n'est envoyé sur Internet.

import { analyzeBuffer, type MusicAnalysis } from '../engine/analysis';
import { normalizeSettings } from '../engine/templates';
import type { Project } from '../engine/types';
import { uid } from '../engine/util';

const KEY = 'orbit.projects.v1';
const DB = 'orbit-studio';
const STORE = 'music';

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Project[]) : [];
    return list.map((p) => ({ ...p, settings: normalizeSettings(p.settings) })).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveProjects(list: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    // quota dépassé : on retire les miniatures les plus anciennes
    const slim = list.map((p, i) => (i > 10 ? { ...p, thumb: undefined } : p));
    try {
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      console.error('Sauvegarde impossible', e);
      throw e;
    }
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* facultatif */
  }
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredMusic {
  id: string;
  name: string;
  type: string;
  data: Blob;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const putMusic = (m: StoredMusic) => tx('readwrite', (s) => s.put(m));
export const getMusic = (id: string) => tx<StoredMusic | undefined>('readonly', (s) => s.get(id));
export const deleteMusic = (id: string) => tx('readwrite', (s) => s.delete(id));
export const allMusic = () => tx<StoredMusic[]>('readonly', (s) => s.getAll());

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
      const analysis = await analyzeBuffer(buffer, onProgress);
      return { buffer, analysis };
    })();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

// ---- sauvegarde / restauration complète ----
interface Backup {
  app: 'orbit-studio';
  version: 1;
  exportedAt: number;
  projects: Project[];
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

export async function makeBackup(projects: Project[], includeMusic: boolean): Promise<Blob> {
  const used = new Set(projects.map((p) => p.settings.audio.musicId).filter(Boolean) as string[]);
  const music: Backup['music'] = [];
  if (includeMusic) {
    for (const m of await allMusic()) if (used.has(m.id)) music.push({ id: m.id, name: m.name, type: m.type, base64: await blobToBase64(m.data) });
  }
  const data: Backup = { app: 'orbit-studio', version: 1, exportedAt: Date.now(), projects, music };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** Importe une sauvegarde ; renvoie la liste fusionnée des projets. */
export async function restoreBackup(file: File, current: Project[]): Promise<{ projects: Project[]; added: number }> {
  const data = JSON.parse(await file.text()) as Partial<Backup> & { settings?: unknown };
  let incoming: Project[] = [];
  if (data.app === 'orbit-studio' && Array.isArray(data.projects)) incoming = data.projects;
  else if (data && (data as Project).settings && (data as Project).id) incoming = [data as unknown as Project];
  else throw new Error("Ce fichier n'est pas une sauvegarde Orbit Studio.");
  for (const m of data.music ?? []) await putMusic({ id: m.id, name: m.name, type: m.type, data: base64ToBlob(m.base64, m.type) });
  const map = new Map(current.map((p) => [p.id, p]));
  for (const p of incoming) map.set(p.id, { ...p, settings: normalizeSettings(p.settings) });
  const projects = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  saveProjects(projects);
  return { projects, added: incoming.length };
}

export { saveFile as downloadBlob } from './host';
