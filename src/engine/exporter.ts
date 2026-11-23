// Export vidéo.
// 1) Méthode principale : rendu image par image + WebCodecs (H.264 + AAC/Opus) → MP4,
//    dans un Web Worker avec OffscreenCanvas quand c'est possible (interface fluide),
//    sinon sur le fil principal. Aucune image perdue, identique à l'aperçu.
// 2) Secours : MediaRecorder en temps réel (MP4 si possible, sinon WebM).

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MusicAnalysis } from './analysis';
import { LiveAudio, renderAudioOffline } from './audio';
import { buildDropTimeline, musicMode, musicOffset } from './drop';
import { preloadBackground, renderFrame, type Quality } from './render';
import { SIM_DT, Simulation, type SimEvent, type MusicSegment } from './sim';
import type { Settings } from './types';
import { worldSize } from './types';
import { encodeAudio } from './encodeAudio';

export interface ExportResult {
  blob: Blob;
  mime: string;
  ext: string;
  method: string;
  width: number;
  height: number;
  duration: number;
}

export interface ExportOptions {
  settings: Settings;
  analysis: MusicAnalysis | null;
  buffer: AudioBuffer | null;
  onProgress: (p: number, label: string) => void;
  signal: AbortSignal;
  method?: 'auto' | 'realtime' | 'main';
}

export const RESOLUTIONS = [720, 1080, 1440, 2160] as const;
const MAX_DURATION = 180;

/** Durée automatique : jusqu'à la fin de l'animation (ou du dernier drop). */
export function computeDuration(s: Settings, analysis: MusicAnalysis | null): number {
  if (s.export.duration > 0) return Math.min(MAX_DURATION, s.export.duration);
  const hasMusic = !!analysis && s.audio.mode !== 'none';
  const tl = buildDropTimeline(s, hasMusic);
  if (tl && tl.points.length) {
    const last = tl.points[tl.points.length - 1];
    let dur = last.T + (Number.isFinite(last.R) ? last.R - last.T + 3 : 8);
    if (hasMusic && musicMode(s) === 'continuous') dur = Math.min(dur, analysis!.duration - musicOffset(s, true));
    return Math.max(3, Math.min(MAX_DURATION, Math.ceil(dur)));
  }
  if (s.rings.infinite || s.rings.regenerate > 0 || s.rings.count === 0 || (!s.rings.breakable && s.rings.hitsToBreak === 0)) {
    if (analysis && s.audio.mode === 'continuous') return Math.min(60, Math.max(5, analysis.duration - s.audio.startOffset));
    return 30;
  }
  const sim = new Simulation(s, analysis);
  const steps = MAX_DURATION / SIM_DT;
  for (let i = 0; i < steps && !sim.finished; i++) {
    sim.step();
    sim.events.length = 0;
    if (sim.particles.length > 200) sim.particles.length = 0;
  }
  return sim.finished ? Math.min(MAX_DURATION, Math.ceil(sim.finishedAt! + 5)) : 60;
}

/** Dimensions de la vidéo (paires, côté court = résolution choisie). */
export function exportDims(s: Settings, resolution = s.export.resolution) {
  const { W, H } = worldSize(s.export);
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return W <= H ? { width: even(resolution), height: even((resolution * H) / W) } : { width: even((resolution * W) / H), height: even(resolution) };
}

function bitrate(w: number, h: number, fps: number) {
  return Math.min(60_000_000, Math.max(4_000_000, Math.round(w * h * fps * 0.18)));
}

export async function pickVideoConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const lv of ['28', '2a', '32', '33', '34']) {
    for (const pr of ['64', '4d', '42']) {
      const cfg: VideoEncoderConfig = { codec: `avc1.${pr}00${lv}`, width, height, bitrate: bitrate(width, height, fps), framerate: fps, avc: { format: 'avc' } };
      try {
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
      } catch {
        /* suivant */
      }
    }
  }
  return null;
}

export async function pickAudioConfig(): Promise<{ cfg: AudioEncoderConfig; mux: 'aac' | 'opus' } | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const base = { sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 };
  for (const [codec, mux] of [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ] as const) {
    try {
      if ((await AudioEncoder.isConfigSupported({ codec, ...base })).supported) return { cfg: { codec, ...base }, mux };
    } catch {
      /* suivant */
    }
  }
  return null;
}

export interface ExportCaps {
  webcodecs: boolean;
  audio: 'aac' | 'opus' | null;
  realtime: boolean;
  realtimeMp4: boolean;
  supported: Record<string, boolean>; // `${res}@${fps}`
}

/** Teste ce que ce navigateur sait réellement encoder (pour n'afficher que les options utilisables). */
export async function probeExport(s: Settings): Promise<ExportCaps> {
  const supported: Record<string, boolean> = {};
  for (const fps of [30, 60] as const) {
    for (const res of RESOLUTIONS) {
      const { width, height } = exportDims(s, res);
      supported[`${res}@${fps}`] = !!(await pickVideoConfig(width, height, fps));
    }
  }
  const a = await pickAudioConfig();
  return {
    webcodecs: Object.values(supported).some(Boolean),
    audio: a?.mux ?? null,
    realtime: typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype,
    realtimeMp4: typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4'),
    supported,
  };
}

function needsAudio(s: Settings, buffer: AudioBuffer | null) {
  return (s.audio.mode !== 'none' && !!buffer) || s.audio.sfx !== 'none';
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportVideo(o: ExportOptions): Promise<ExportResult> {
  const s = o.settings;
  o.onProgress(0, 'Préparation…');
  const duration = computeDuration(s, o.analysis);
  if (o.method !== 'realtime') {
    let { width, height } = exportDims(s);
    let vcfg = await pickVideoConfig(width, height, s.export.fps);
    if (!vcfg && s.export.resolution > 720) {
      ({ width, height } = exportDims(s, 720));
      vcfg = await pickVideoConfig(width, height, s.export.fps);
    }
    const wantAudio = needsAudio(s, o.buffer);
    const acfg = wantAudio ? await pickAudioConfig() : null;
    if (vcfg && (!wantAudio || acfg)) {
      if (o.method !== 'main' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        try {
          return await exportInWorker(o, duration, width, height, vcfg, acfg);
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          console.warn('Export dans le worker impossible, rendu sur le fil principal', e);
        }
      }
      return await exportMain(o, duration, width, height, vcfg, acfg);
    }
  }
  return await exportRealtime(o, duration);
}

// ---------------- rendu audio commun ----------------
async function renderAudio(o: ExportOptions, duration: number, events: SimEvent[], segments: MusicSegment[]) {
  const s = o.settings;
  const hasMusic = !!o.analysis && s.audio.mode !== 'none';
  return renderAudioOffline({
    duration,
    settings: s,
    tl: buildDropTimeline(s, hasMusic),
    audio: s.audio,
    buffer: s.audio.mode !== 'none' ? o.buffer : null,
    segments,
    events,
    sampleRate: 48000,
  });
}

// ---------------- export dans un Web Worker ----------------
async function exportInWorker(
  o: ExportOptions,
  duration: number,
  width: number,
  height: number,
  vcfg: VideoEncoderConfig,
  acfg: { cfg: AudioEncoderConfig; mux: 'aac' | 'opus' } | null,
): Promise<ExportResult> {
  const { default: ExportWorker } = await import('../workers/export.worker?worker&inline');
  const w: Worker = new ExportWorker();
  const quality: Quality = o.settings.export.quality;
  return await new Promise<ExportResult>((resolve, reject) => {
    const fail = (err: unknown) => {
      w.terminate();
      reject(err);
    };
    o.signal.addEventListener('abort', () => fail(new DOMException('Annulé', 'AbortError')), { once: true });
    w.onerror = (e) => fail(new Error(e.message || 'Erreur du worker'));
    w.onmessage = async (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress') o.onProgress(m.p, m.label);
      else if (m.type === 'error') fail(new Error(m.error));
      else if (m.type === 'events') {
        // le worker a rendu la vidéo : on mixe l'audio ici (OfflineAudioContext n'existe pas dans les workers)
        try {
          o.onProgress(0.9, 'Mixage audio…');
          const buf = await renderAudio(o, duration, m.events, m.segments);
          const L = buf.getChannelData(0).slice();
          const R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
          w.postMessage({ type: 'audio', L, R }, [L.buffer, R.buffer]);
        } catch (err) {
          fail(err);
        }
      } else if (m.type === 'done') {
        w.terminate();
        resolve({ blob: new Blob([m.buffer], { type: 'video/mp4' }), mime: 'video/mp4', ext: 'mp4', method: 'WebCodecs MP4 (worker)', width, height, duration });
      }
    };
    w.postMessage({ type: 'start', settings: o.settings, analysis: o.analysis, width, height, duration, vcfg, acfg, quality });
  });
}

// ---------------- export sur le fil principal ----------------
async function exportMain(
  o: ExportOptions,
  duration: number,
  width: number,
  height: number,
  vcfg: VideoEncoderConfig,
  acfg: { cfg: AudioEncoderConfig; mux: 'aac' | 'opus' } | null,
): Promise<ExportResult> {
  const s = o.settings;
  const fps = s.export.fps;
  const sr = 48000;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: sr } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encError: unknown = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (encError = e) });
  venc.configure(vcfg);
  await preloadBackground(s.effects.bgImage);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const sim = new Simulation(s, o.analysis);
  const events: SimEvent[] = [];
  const frames = Math.round(duration * fps);
  const frameDur = 1e6 / fps;
  for (let f = 0; f < frames; f++) {
    if (o.signal.aborted) throw new DOMException('Annulé', 'AbortError');
    if (encError) throw encError;
    sim.advanceTo(f / fps);
    for (const ev of sim.events) events.push(ev);
    sim.events.length = 0;
    renderFrame(ctx, sim, width, height, { quality: s.export.quality });
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    if (f % 8 === 0) {
      o.onProgress((f / frames) * (acfg ? 0.88 : 0.97), `Rendu ${width}×${height} — ${Math.floor(f / fps)} / ${Math.round(duration)} s`);
      await tick();
    }
  }
  await venc.flush();
  venc.close();
  if (encError) throw encError;
  if (acfg) {
    o.onProgress(0.9, 'Mixage audio…');
    const audioBuf = await renderAudio(o, duration, events, sim.segments);
    await encodeAudio(muxer, acfg.cfg, audioBuf.getChannelData(0), audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : audioBuf.getChannelData(0), sr, (p) =>
      o.onProgress(0.9 + p * 0.08, 'Encodage audio…'),
    );
  }
  o.onProgress(0.99, 'Finalisation…');
  muxer.finalize();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), mime: 'video/mp4', ext: 'mp4', method: 'WebCodecs MP4', width, height, duration };
}

// ---------------- secours : temps réel ----------------
function pickRecorderMime(): string {
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const m of list) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

async function exportRealtime(o: ExportOptions, duration: number): Promise<ExportResult> {
  if (typeof MediaRecorder === 'undefined') throw new Error("Ce navigateur ne permet pas l'enregistrement vidéo.");
  const s = o.settings;
  const fps = s.export.fps;
  const { width, height } = exportDims(s, Math.min(1080, s.export.resolution) as 720 | 1080);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  await preloadBackground(s.effects.bgImage);
  const sim = new Simulation(s, o.analysis);
  renderFrame(ctx, sim, width, height, { quality: 'balanced' });
  const stream = canvas.captureStream(fps);
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  const dest = actx.createMediaStreamDestination();
  const audio = new LiveAudio(actx, dest);
  audio.buffer = o.buffer;
  audio.music.gain.value = s.audio.musicVolume;
  await audio.resume();
  for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
  const mime = pickRecorderMime();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate(width, height, fps) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const c0 = audio.ctx.currentTime + 0.02;
  if (musicMode(s) === 'continuous' && o.buffer && s.audio.mode !== 'none') audio.startContinuous(s.audio.startOffset);
  audio.chain.schedule(sim.tl, s.drop, 0, c0);
  await new Promise<void>((resolve, reject) => {
    const loop = () => {
      if (o.signal.aborted) {
        reject(new DOMException('Annulé', 'AbortError'));
        return;
      }
      const t = Math.min(duration, Math.max(0, audio.ctx.currentTime - c0));
      sim.advanceTo(t);
      for (const ev of sim.events) audio.playEvent(ev, s.audio);
      sim.events.length = 0;
      if (musicMode(s) === 'bounce') audio.syncSegments(sim.segments, sim.t);
      renderFrame(ctx, sim, width, height, { quality: 'balanced' });
      o.onProgress(t / duration, `Enregistrement en temps réel — ${Math.floor(t)} / ${Math.round(duration)} s`);
      if (t >= duration) resolve();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }).finally(() => {
    if (rec.state !== 'inactive') rec.stop();
    audio.close();
  });
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const type = (mime || chunks[0]?.type || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: type.includes('mp4') ? 'mp4' : 'webm', method: 'Enregistrement temps réel', width, height, duration };
}

/** Image fixe (PNG) de l'instant courant, à la résolution d'export. */
export async function captureFrame(sim: Simulation, s: Settings): Promise<Blob> {
  await preloadBackground(s.effects.bgImage);
  const { width, height } = exportDims(s);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  renderFrame(canvas.getContext('2d')!, sim, width, height, { quality: 'high' });
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Capture impossible'))), 'image/png'));
}
