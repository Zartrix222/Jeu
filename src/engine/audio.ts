// Audio : bruitages synthétisés, lecture de la musique (continue ou « au rebond »),
// et rendu hors-ligne identique pour l'export vidéo.

import type { MusicSegment, SimEvent } from './sim';
import type { AudioSettings, DropSettings, Settings } from './types';
import { ambienceAt, bassAt, cutoffAt, musicMode, volumeAt, type DropTimeline } from './drop';

/**
 * Chaîne « ambiance » du mode drop : basses (low-shelf) → filtre passe-bas → volume.
 * Les automatisations sont calculées à partir de la même courbe que l'image,
 * en direct comme dans le rendu hors-ligne de l'export.
 */
export class DropChain {
  input: GainNode;
  output: GainNode;
  private shelf: BiquadFilterNode;
  private lp: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 220;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.8;
    this.lp.frequency.value = 20000;
    this.output = ctx.createGain();
    this.input.connect(this.shelf).connect(this.lp).connect(this.output);
  }

  /** Programme l'ambiance : le temps simulation `simFrom` correspond à l'instant `ctxAt` du contexte audio. */
  schedule(tl: DropTimeline | null, d: DropSettings, simFrom: number, ctxAt: number) {
    const fq = this.lp.frequency;
    const sg = this.shelf.gain;
    const vg = this.output.gain;
    for (const p of [fq, sg, vg]) p.cancelScheduledValues(0);
    if (!tl) {
      fq.setValueAtTime(20000, ctxAt);
      sg.setValueAtTime(0, ctxAt);
      vg.setValueAtTime(1, ctxAt);
      return;
    }
    const f0 = ambienceAt(tl, simFrom);
    fq.setValueAtTime(cutoffAt(d, f0), ctxAt);
    sg.setValueAtTime(bassAt(d, f0), ctxAt);
    vg.setValueAtTime(volumeAt(d, f0), ctxAt);
    for (const [t, f] of tl.keys) {
      if (t <= simFrom) continue;
      const at = ctxAt + (t - simFrom);
      fq.exponentialRampToValueAtTime(cutoffAt(d, f), at);
      sg.linearRampToValueAtTime(bassAt(d, f), at);
      vg.linearRampToValueAtTime(volumeAt(d, f), at);
    }
  }
}

const SCALES: Record<AudioSettings['scale'], number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function noteFreq(scale: AudioSettings['scale'], n: number, base = 261.63) {
  const sc = SCALES[scale];
  const span = sc.length * 2;
  // monte puis redescend (mélodie en « vague »)
  const k = n % (span * 2);
  const idx = k < span ? k : span * 2 - 1 - k;
  const semis = sc[idx % sc.length] + 12 * Math.floor(idx / sc.length);
  return base * Math.pow(2, semis / 12);
}

function limiter(ctx: BaseAudioContext) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -8;
  c.knee.value = 6;
  c.ratio.value = 10;
  c.attack.value = 0.003;
  c.release.value = 0.15;
  return c;
}

const lastSfx = new WeakMap<BaseAudioContext, { bounce: number; brk: number }>();
const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext) {
  let b = noiseBufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseBufs.set(ctx, b);
  }
  return b;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, when: number, freq: number, vol: number, dur: number, type: OscillatorType) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + dur + 0.02);
}

/** Joue le bruitage d'un événement à l'instant `when` du contexte. */
export function playSfx(ctx: BaseAudioContext, dest: AudioNode, when: number, ev: SimEvent, a: AudioSettings) {
  if (a.sfx === 'none' || a.sfxVolume <= 0) return;
  if (ev.type === 'drop') {
    const v = a.sfxVolume * Math.min(1.5, ev.strength);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55 * v, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + 0.75);
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, when);
    lp.frequency.exponentialRampToValueAtTime(300, when + 0.18);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * v, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    n.connect(lp).connect(ng).connect(dest);
    n.start(when);
    n.stop(when + 0.2);
    return;
  }
  if (ev.type !== 'bounce' && ev.type !== 'break' && ev.type !== 'end') return;
  let last = lastSfx.get(ctx);
  if (!last) {
    last = { bounce: -1, brk: -1 };
    lastSfx.set(ctx, last);
  }
  const v = a.sfxVolume;
  if (ev.type === 'end') {
    [0, 4, 7, 12].forEach((s, i) => tone(ctx, dest, when + i * 0.09, 523.25 * Math.pow(2, s / 12), 0.25 * v, 0.9, 'triangle'));
    return;
  }
  if (ev.type === 'bounce') {
    if (when - last.bounce < 0.045) return;
    last.bounce = when;
    const loud = Math.min(1, 0.35 + ev.strength / 2500);
    if (a.sfx === 'notes' || a.sfx === 'both') {
      const f = noteFreq(a.scale, ev.n);
      tone(ctx, dest, when, f, 0.32 * v * loud, 0.5, 'triangle');
      tone(ctx, dest, when, f * 2, 0.08 * v * loud, 0.25, 'sine');
    } else {
      tone(ctx, dest, when, 180, 0.3 * v * loud, 0.12, 'sine');
    }
    return;
  }
  // cassure
  if (when - last.brk < 0.03) return;
  last.brk = when;
  if (a.sfx === 'pop' || a.sfx === 'both') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1100, when);
    o.frequency.exponentialRampToValueAtTime(260, when + 0.07);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.3 * v, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.1);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + 0.12);
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12 * v, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    n.connect(hp).connect(ng).connect(dest);
    n.start(when);
    n.stop(when + 0.1);
  } else {
    const f = noteFreq(a.scale, ev.n) * 2;
    tone(ctx, dest, when, f, 0.16 * v, 0.3, 'sine');
  }
}

/** Lecture en direct (aperçu et export temps réel). */
export class LiveAudio {
  ctx: AudioContext;
  out: AudioNode;
  music: GainNode;
  sfx: GainNode;
  chain: DropChain;
  buffer: AudioBuffer | null = null;
  private src: { node: AudioBufferSourceNode; gain: GainNode; seg: number; end: number } | null = null;
  private handled = 0;

  constructor(ctx?: AudioContext, out?: AudioNode) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = ctx ?? new AC({ latencyHint: 'interactive' });
    this.out = out ?? this.ctx.destination;
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    const comp = limiter(this.ctx);
    comp.connect(this.out);
    this.chain = new DropChain(this.ctx);
    this.music.connect(this.chain.input);
    this.chain.output.connect(comp);
    this.sfx.connect(comp);
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
  }

  setVolumes(a: AudioSettings) {
    this.music.gain.value = a.musicVolume;
    this.sfx.gain.value = 1;
  }

  /** Musique continue à partir de `offset` secondes. */
  startContinuous(offset: number) {
    this.stopMusic();
    if (!this.buffer || offset >= this.buffer.duration) return;
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    const gain = this.ctx.createGain();
    node.connect(gain).connect(this.music);
    node.start(this.ctx.currentTime + 0.02, offset);
    this.src = { node, gain, seg: -1, end: Infinity };
  }

  /** Synchronise la lecture « au rebond » avec les segments de la simulation. */
  syncSegments(segments: MusicSegment[], simT: number) {
    if (!this.buffer) return;
    const now = this.ctx.currentTime;
    while (this.handled < segments.length) {
      const i = this.handled++;
      const seg = segments[i];
      if (seg.end <= simT) continue;
      this.stopMusic();
      const node = this.ctx.createBufferSource();
      node.buffer = this.buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.008);
      node.connect(gain).connect(this.music);
      const off = Math.min(this.buffer.duration - 0.01, seg.offset + Math.max(0, simT - seg.start));
      node.start(now, Math.max(0, off));
      this.src = { node, gain, seg: i, end: NaN };
    }
    const cur = this.src;
    if (cur && cur.seg >= 0) {
      const seg = segments[cur.seg];
      if (seg.end !== cur.end) {
        cur.end = seg.end;
        if (Number.isFinite(seg.end)) {
          const at = now + Math.max(0.01, seg.end - simT);
          cur.gain.gain.cancelScheduledValues(now);
          cur.gain.gain.setValueAtTime(1, now);
          cur.gain.gain.setValueAtTime(1, Math.max(now, at - 0.012));
          cur.gain.gain.linearRampToValueAtTime(0, at);
          try {
            cur.node.stop(at + 0.01);
          } catch {
            /* déjà arrêté */
          }
        } else {
          cur.gain.gain.cancelScheduledValues(now);
          cur.gain.gain.setValueAtTime(1, now);
        }
      }
    }
  }

  stopMusic() {
    if (this.src) {
      try {
        this.src.node.stop();
      } catch {
        /* ignoré */
      }
      this.src.node.disconnect();
      this.src = null;
    }
  }

  resetSegments() {
    this.stopMusic();
    this.handled = 0;
  }

  /** Écoute brute d'un extrait de la musique (sans filtre). */
  listen(from: number, dur: number) {
    this.stopMusic();
    if (!this.buffer) return;
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime + 0.02;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.02);
    gain.gain.setValueAtTime(1, now + dur - 0.15);
    gain.gain.linearRampToValueAtTime(0, now + dur);
    node.connect(gain).connect(this.out);
    node.start(now, Math.max(0, from), dur + 0.05);
    this.src = { node, gain, seg: -1, end: Infinity };
  }

  playEvent(ev: SimEvent, a: AudioSettings) {
    playSfx(this.ctx, this.sfx, this.ctx.currentTime + 0.005, ev, a);
  }

  close() {
    this.stopMusic();
    void this.ctx.close().catch(() => undefined);
  }
}

/** Rendu audio hors-ligne pour l'export (musique + bruitages), identique à l'aperçu. */
export async function renderAudioOffline(opts: {
  duration: number;
  settings: Settings;
  tl: DropTimeline | null;
  audio: AudioSettings;
  buffer: AudioBuffer | null;
  segments: MusicSegment[];
  events: SimEvent[];
  sampleRate: number;
}): Promise<AudioBuffer> {
  const { duration, buffer, segments, events, sampleRate } = opts;
  const audio = { ...opts.audio, mode: musicMode(opts.settings) };
  const len = Math.max(1, Math.ceil(duration * sampleRate));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate });
  const comp = limiter(ctx);
  comp.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = audio.musicVolume;
  const chain = new DropChain(ctx);
  music.connect(chain.input);
  chain.output.connect(comp);
  chain.schedule(opts.tl, opts.settings.drop, 0, 0);
  const sfx = ctx.createGain();
  sfx.connect(comp);

  if (buffer && audio.mode === 'continuous') {
    const n = ctx.createBufferSource();
    n.buffer = buffer;
    n.connect(music);
    if (audio.startOffset < buffer.duration) n.start(0, audio.startOffset);
  } else if (buffer && audio.mode === 'bounce') {
    for (const seg of segments) {
      if (seg.start >= duration) break;
      const end = Math.min(duration, seg.end);
      const n = ctx.createBufferSource();
      n.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, seg.start);
      g.gain.linearRampToValueAtTime(1, seg.start + 0.008);
      g.gain.setValueAtTime(1, Math.max(seg.start + 0.008, end - 0.012));
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(g).connect(music);
      n.start(seg.start, Math.min(buffer.duration - 0.01, seg.offset));
      n.stop(end + 0.01);
    }
  }
  for (const ev of events) if (ev.t < duration) playSfx(ctx, sfx, ev.t, ev, audio);

  return await ctx.startRendering();
}
