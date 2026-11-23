// Rendu + encodage vidéo hors du fil principal (OffscreenCanvas + WebCodecs).
// L'audio est mixé par le fil principal (OfflineAudioContext n'existe pas ici)
// puis renvoyé au worker pour l'encodage et le multiplexage MP4.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { MusicAnalysis } from '../engine/analysis';
import { encodeAudio } from '../engine/encodeAudio';
import { preloadBackground, renderFrame, type Quality } from '../engine/render';
import { Simulation, type SimEvent } from '../engine/sim';
import type { Settings } from '../engine/types';

interface Start {
  type: 'start';
  settings: Settings;
  analysis: MusicAnalysis | null;
  width: number;
  height: number;
  duration: number;
  vcfg: VideoEncoderConfig;
  acfg: { cfg: AudioEncoderConfig; mux: 'aac' | 'opus' } | null;
  quality: Quality;
}

let muxer: Muxer<ArrayBufferTarget> | null = null;
let target: ArrayBufferTarget | null = null;
let job: Start | null = null;

const post = (m: unknown, tr: Transferable[] = []) => (self as unknown as Worker).postMessage(m, tr);

async function start(m: Start) {
  job = m;
  const { settings: s, width, height, duration, vcfg, acfg } = m;
  const fps = s.export.fps;
  if (typeof VideoEncoder === 'undefined' || (acfg && typeof AudioEncoder === 'undefined')) throw new Error('WebCodecs indisponible dans le worker');
  target = new ArrayBufferTarget();
  muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let err: unknown = null;
  const mx = muxer;
  const venc = new VideoEncoder({ output: (c, meta) => mx.addVideoChunk(c, meta), error: (e) => (err = e) });
  venc.configure(vcfg);
  await preloadBackground(s.effects.bgImage);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false }) as unknown as CanvasRenderingContext2D;
  const sim = new Simulation(s, m.analysis);
  const events: SimEvent[] = [];
  const frames = Math.round(duration * fps);
  const frameDur = 1e6 / fps;
  for (let f = 0; f < frames; f++) {
    if (err) throw err;
    sim.advanceTo(f / fps);
    for (const ev of sim.events) events.push(ev);
    sim.events.length = 0;
    renderFrame(ctx, sim, width, height, { quality: m.quality });
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * frameDur), duration: Math.round(frameDur) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
    if (f % 10 === 0) post({ type: 'progress', p: (f / frames) * (acfg ? 0.88 : 0.97), label: `Rendu ${width}×${height} — ${Math.floor(f / fps)} / ${Math.round(duration)} s` });
  }
  await venc.flush();
  venc.close();
  if (err) throw err;
  if (acfg) post({ type: 'events', events, segments: sim.segments });
  else finish();
}

function finish() {
  muxer!.finalize();
  const buf = target!.buffer;
  post({ type: 'done', buffer: buf }, [buf]);
}

self.onmessage = async (e: MessageEvent) => {
  try {
    if (e.data.type === 'start') await start(e.data as Start);
    else if (e.data.type === 'audio') {
      const { L, R } = e.data as { L: Float32Array; R: Float32Array };
      await encodeAudio(muxer!, job!.acfg!.cfg, L, R, 48000, (p) => post({ type: 'progress', p: 0.92 + p * 0.06, label: 'Encodage audio…' }));
      post({ type: 'progress', p: 0.99, label: 'Finalisation…' });
      finish();
    }
  } catch (err) {
    post({ type: 'error', error: (err as Error)?.message ?? String(err) });
  }
};
