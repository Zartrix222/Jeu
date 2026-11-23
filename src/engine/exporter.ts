// Export vidéo.
// 1) Méthode principale : rendu image par image + WebCodecs (H.264/AAC) → MP4.
//    Plus rapide que le temps réel sur la plupart des téléphones, résultat parfait
//    (aucune image perdue) et identique à l'aperçu (simulation déterministe).
// 2) Méthode de secours : MediaRecorder en temps réel (MP4 si le navigateur le
//    permet, sinon WebM), pour les navigateurs sans WebCodecs.

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MusicAnalysis } from './analysis';
import { LiveAudio, renderAudioOffline } from './audio';
import { renderFrame } from './render';
import { SIM_DT, Simulation, type SimEvent } from './sim';
import type { Settings } from './types';
import { buildDropTimeline, musicMode, musicOffset } from './drop';

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
  method?: 'auto' | 'realtime';
}

const MAX_DURATION = 180;

/** Durée automatique : jusqu'à la destruction du dernier anneau + 5 s de final. */
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
  if (s.rings.infinite || s.rings.count === 0 || (!s.rings.breakable && s.rings.hitsToBreak === 0)) {
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

function dims(s: Settings) {
  return s.export.resolution === 1080 ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
}

async function pickVideoConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const big = width * height > 921600;
  const levels = fps > 30 || big ? ['2a', '32', '33'] : ['28', '2a', '32'];
  const profiles = ['64', '4d', '42'];
  for (const lv of levels) {
    for (const pr of profiles) {
      const cfg: VideoEncoderConfig = {
        codec: `avc1.${pr}00${lv}`,
        width,
        height,
        bitrate: width >= 1080 ? 12_000_000 : 7_000_000,
        framerate: fps,
        avc: { format: 'avc' },
      };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch {
        /* suivant */
      }
    }
  }
  return null;
}

async function pickAudioConfig(): Promise<{ cfg: AudioEncoderConfig; mux: 'aac' | 'opus' } | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
  const base = { sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 };
  for (const [codec, mux] of [
    ['mp4a.40.2', 'aac'],
    ['opus', 'opus'],
  ] as const) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec, ...base });
      if (r.supported) return { cfg: { codec, ...base }, mux };
    } catch {
      /* suivant */
    }
  }
  return null;
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
    let { width, height } = dims(s);
    let vcfg = await pickVideoConfig(width, height, s.export.fps);
    if (!vcfg && width === 1080) {
      ({ width, height } = { width: 720, height: 1280 });
      vcfg = await pickVideoConfig(width, height, s.export.fps);
    }
    const wantAudio = needsAudio(s, o.buffer);
    const acfg = wantAudio ? await pickAudioConfig() : null;
    if (vcfg && (!wantAudio || acfg)) {
      return await exportWebCodecs(o, duration, width, height, vcfg, acfg);
    }
  }
  return await exportRealtime(o, duration);
}

async function exportWebCodecs(
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
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encError = e),
  });
  venc.configure(vcfg);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const sim = new Simulation(s, o.analysis);
  const events: SimEvent[] = [];
  const frames = Math.round(duration * fps);
  const frameDur = 1e6 / fps;
  const label = `Rendu ${width}×${height}`;

  for (let f = 0; f < frames; f++) {
    if (o.signal.aborted) throw new DOMException('Annulé', 'AbortError');
    if (encError) throw encError;
    sim.advanceTo(f / fps);
    for (const ev of sim.events) events.push(ev);
    sim.events.length = 0;
    renderFrame(ctx, sim, width, height);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    if (f % 8 === 0) {
      o.onProgress((f / frames) * (acfg ? 0.88 : 0.97), `${label} — ${Math.floor(f / fps)} / ${Math.round(duration)} s`);
      await tick();
    }
  }
  await venc.flush();
  venc.close();
  if (encError) throw encError;

  if (acfg) {
    o.onProgress(0.9, 'Mixage audio…');
    const audioBuf = await renderAudioOffline({
      duration,
      settings: s,
      tl: sim.tl,
      audio: s.audio,
      buffer: s.audio.mode !== 'none' ? o.buffer : null,
      segments: sim.segments,
      events,
      sampleRate: sr,
    });
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (encError = e),
    });
    aenc.configure(acfg.cfg);
    const L = audioBuf.getChannelData(0);
    const R = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : L;
    const CH = 2048;
    for (let i = 0; i < audioBuf.length; i += CH) {
      const n = Math.min(CH, audioBuf.length - i);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0);
      data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: sr,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((i / sr) * 1e6),
        data,
      });
      aenc.encode(ad);
      ad.close();
      if ((i / CH) % 50 === 0) {
        while (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 2));
        o.onProgress(0.9 + (i / audioBuf.length) * 0.08, 'Encodage audio…');
      }
    }
    await aenc.flush();
    aenc.close();
    if (encError) throw encError;
  }

  o.onProgress(0.99, 'Finalisation…');
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  return { blob, mime: 'video/mp4', ext: 'mp4', method: 'WebCodecs (MP4)', width, height, duration };
}

function pickRecorderMime(): string {
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
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
  const { width, height } = dims(s);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const sim = new Simulation(s, o.analysis);
  renderFrame(ctx, sim, width, height);

  const stream = canvas.captureStream(fps);
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  const dest = actx.createMediaStreamDestination();
  // la sortie audio va dans la piste enregistrée (pas dans le haut-parleur)
  const audio = new LiveAudio(actx, dest);
  audio.buffer = o.buffer;
  audio.music.gain.value = s.audio.musicVolume;
  await audio.resume();
  for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);

  const mime = pickRecorderMime();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: width >= 1080 ? 10_000_000 : 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);

  const c0 = audio.ctx.currentTime + 0.02;
  if (musicMode(s) === 'continuous' && o.buffer) audio.startContinuous(s.audio.startOffset);
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
      renderFrame(ctx, sim, width, height);
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
  const blob = new Blob(chunks, { type });
  return {
    blob,
    mime: type,
    ext: type.includes('mp4') ? 'mp4' : 'webm',
    method: 'Enregistrement temps réel',
    width,
    height,
    duration,
  };
}
