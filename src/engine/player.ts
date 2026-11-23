// Aperçu temps réel : boucle d'animation, horloge, audio en direct.

import type { MusicAnalysis } from './analysis';
import { LiveAudio } from './audio';
import { renderFrame } from './render';
import { Simulation } from './sim';
import type { Settings } from './types';

const STRUCTURAL: ((s: Settings) => unknown)[] = [
  (s) => s.seed,
  (s) => s.balls.count,
  (s) => s.balls.speed,
  (s) => s.balls.radius,
  (s) => s.balls.growOnBounce,
  (s) => s.rings.count,
  (s) => s.rings.infinite,
  (s) => s.rings.centerY,
  (s) => s.rings.twist,
  (s) => s.rings.jitter,
  (s) => s.audio.mode,
  (s) => s.audio.musicId,
  (s) => s.audio.startOffset,
];

export interface PlayerStats {
  t: number;
  remaining: number;
  destroyed: number;
  bounces: number;
  finished: boolean;
  playing: boolean;
}

export class Player {
  sim: Simulation;
  playing = false;
  onStats?: (s: PlayerStats) => void;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: Settings;
  private analysis: MusicAnalysis | null = null;
  private audio: LiveAudio | null = null;
  private buffer: AudioBuffer | null = null;
  private raf = 0;
  private baseWall = 0; // performance.now() en secondes au démarrage
  private baseSim = 0;
  private baseCtx = 0;
  private lastStats = 0;
  private ro: ResizeObserver;
  private muted = false;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.settings = settings;
    this.sim = new Simulation(settings, null);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(90, Math.round(r.width * dpr));
    const h = Math.max(160, Math.round(r.height * dpr));
    // limite la résolution d'aperçu pour rester fluide
    const k = Math.min(1, 1100 / w);
    this.canvas.width = Math.round(w * k);
    this.canvas.height = Math.round(h * k);
  }

  setMusic(buffer: AudioBuffer | null, analysis: MusicAnalysis | null) {
    this.buffer = buffer;
    this.analysis = analysis;
    if (this.audio) this.audio.buffer = buffer;
    this.restart();
  }

  setSettings(s: Settings) {
    const prev = this.settings;
    this.settings = s;
    if (STRUCTURAL.some((f) => f(prev) !== f(s))) this.restart();
    else this.sim.setSettings(s);
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.audio) return;
    this.audio.music.gain.value = this.muted ? 0 : this.settings.audio.musicVolume;
    this.audio.sfx.gain.value = this.muted ? 0 : 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  restart() {
    this.sim = new Simulation(this.settings, this.analysis);
    this.audio?.resetSegments();
    if (this.playing) this.startClock();
  }

  private ensureAudio() {
    if (!this.audio) {
      this.audio = new LiveAudio();
      this.audio.buffer = this.buffer;
      this.applyVolumes();
    }
    void this.audio.resume();
    return this.audio;
  }

  private startClock() {
    this.baseWall = performance.now() / 1000;
    this.baseSim = this.sim.t;
    const a = this.audio;
    if (a) {
      this.baseCtx = a.ctx.currentTime + 0.02;
      a.resetSegments();
      if (this.settings.audio.mode === 'continuous' && this.buffer) {
        a.startContinuous(this.settings.audio.startOffset + this.sim.t);
      }
    }
  }

  play() {
    if (this.playing) return;
    this.ensureAudio();
    this.playing = true;
    this.startClock();
  }

  pause() {
    this.playing = false;
    this.audio?.resetSegments();
    this.emitStats(true);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  private clock() {
    const a = this.audio;
    if (a && a.ctx.state === 'running' && this.settings.audio.mode === 'continuous' && this.buffer) {
      return this.baseSim + Math.max(0, a.ctx.currentTime - this.baseCtx);
    }
    return this.baseSim + (performance.now() / 1000 - this.baseWall);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const sim = this.sim;
    if (this.playing) {
      let target = this.clock();
      if (target - sim.t > 0.25) {
        // l'appareil a pris du retard : on recale l'horloge
        const lag = target - sim.t - 0.25;
        this.baseSim -= lag;
        target -= lag;
      }
      sim.advanceTo(target);
      const a = this.audio;
      if (a) {
        for (const ev of sim.events) a.playEvent(ev, this.settings.audio);
        if (this.settings.audio.mode === 'bounce') a.syncSegments(sim.segments, sim.t);
      }
      sim.events.length = 0;
    }
    renderFrame(this.ctx, sim, this.canvas.width, this.canvas.height);
    this.emitStats(false);
  };

  private emitStats(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastStats < 200) return;
    this.lastStats = now;
    this.onStats?.({
      t: this.sim.t,
      remaining: this.sim.remaining,
      destroyed: this.sim.destroyed,
      bounces: this.sim.bounces,
      finished: this.sim.finished,
      playing: this.playing,
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.audio?.close();
  }
}
