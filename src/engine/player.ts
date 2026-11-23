// Aperçu temps réel : boucle d'animation, horloge, audio en direct.

import type { MusicAnalysis } from './analysis';
import { LiveAudio } from './audio';
import { renderFrame } from './render';
import { Simulation } from './sim';
import type { DropEvent, Settings } from './types';
import { musicMode, musicOffset } from './drop';
import { uid } from './util';

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
  (s) => JSON.stringify(s.drop),
];

export interface PlayerStats {
  t: number;
  remaining: number;
  destroyed: number;
  bounces: number;
  finished: boolean;
  playing: boolean;
  musicT: number; // position dans la musique (s)
  phase: 'calm' | 'free';
  ambience: number;
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
  private stopAt = Infinity;
  private skipRestart = false;

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
    if (this.skipRestart) {
      this.skipRestart = false;
      this.sim.rebuildDrops(s);
      this.scheduleChain();
    } else if (STRUCTURAL.some((f) => f(prev) !== f(s))) this.restart();
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
    this.stopAt = Infinity;
    if (this.playing) this.startClock();
  }

  private get continuous() {
    return musicMode(this.settings) === 'continuous' && !!this.buffer && this.settings.audio.mode !== 'none';
  }

  /** Décalage musique ↔ simulation. */
  get offset() {
    return musicOffset(this.settings, !!this.analysis && this.settings.audio.mode !== 'none');
  }

  /**
   * Se place à l'instant `simT` (calcul déterministe depuis le début, sans rendu ni son),
   * puis lit jusqu'à `until` si demandé.
   */
  seek(simT: number, play = false, until = Infinity) {
    const wasPlaying = this.playing;
    this.playing = false;
    this.audio?.resetSegments();
    this.sim = new Simulation(this.settings, this.analysis);
    const target = Math.max(0, simT);
    while (this.sim.t + 1e-9 < target - 1 / 120) {
      this.sim.advanceTo(Math.min(target, this.sim.t + 1));
      this.sim.events.length = 0;
      if (this.sim.particles.length > 1500) this.sim.particles.splice(0, this.sim.particles.length - 1500);
    }
    this.sim.events.length = 0;
    this.stopAt = until;
    if (play || wasPlaying) this.play();
    else this.emitStats(true);
  }

  /** Lit les `before` secondes avant et `after` secondes après l'instant `simT`. */
  previewAround(simT: number, before = 5, after = 5) {
    this.seek(simT - before, true, simT + after);
  }

  /** Écoute brute d'un extrait de la musique (sans animation). */
  listen(musicT: number, before = 3, after = 3) {
    this.pause();
    const a = this.ensureAudio();
    a.listen(Math.max(0, musicT - before), before + after);
  }

  /** Mode interactif : la balle sort maintenant ; renvoie l'événement à enregistrer. */
  triggerNow(ev: Omit<DropEvent, 'id' | 'time'>): DropEvent | null {
    if (!this.playing || this.sim.phase !== 'calm' || !this.sim.tl) return null;
    const T = this.sim.t + 0.3;
    const event: DropEvent = { ...ev, id: uid(), time: Math.round((T + this.offset) * 1000) / 1000 };
    this.skipRestart = true;
    return event;
  }

  private scheduleChain() {
    const a = this.audio;
    if (!a) return;
    if (!this.playing) {
      a.chain.schedule(null, this.settings.drop, 0, a.ctx.currentTime);
      return;
    }
    a.chain.schedule(this.sim.tl, this.settings.drop, this.sim.t, this.baseCtx + (this.sim.t - this.baseSim));
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
      if (this.continuous) a.startContinuous(this.settings.audio.startOffset + this.sim.t);
      a.chain.schedule(this.sim.tl, this.settings.drop, this.sim.t, this.baseCtx);
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
    this.stopAt = Infinity;
    this.audio?.resetSegments();
    this.emitStats(true);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  private clock() {
    const a = this.audio;
    if (a && a.ctx.state === 'running' && this.continuous) {
      return this.baseSim + Math.max(0, a.ctx.currentTime - this.baseCtx);
    }
    return this.baseSim + (performance.now() / 1000 - this.baseWall);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const sim = this.sim;
    if (this.playing) {
      let target = this.clock();
      if (this.continuous) {
        // la musique fait foi : l'image rattrape son retard sans jamais décaler les drops
        target = Math.min(target, sim.t + 0.5);
      } else if (target - sim.t > 0.25) {
        // sans musique : on recale l'horloge
        const lag = target - sim.t - 0.25;
        this.baseSim -= lag;
        target -= lag;
        this.scheduleChain();
      }
      sim.advanceTo(Math.min(target, this.stopAt));
      const a = this.audio;
      if (a) {
        for (const ev of sim.events) a.playEvent(ev, this.settings.audio);
        if (musicMode(this.settings) === 'bounce') a.syncSegments(sim.segments, sim.t);
      }
      sim.events.length = 0;
      if (sim.t >= this.stopAt - 1 / 120) this.pause();
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
      musicT: this.sim.t + this.offset,
      phase: this.sim.phase,
      ambience: this.sim.ambience,
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.audio?.close();
  }
}
