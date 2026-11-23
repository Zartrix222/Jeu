// Moteur physique 2D déterministe (pas fixe de 1/120 s, aléatoire à graine).
// Conçu pour des balles à l'intérieur d'anneaux concaves (cas mal géré par les
// moteurs génériques type Matter.js) : collisions continues contre des parois
// mobiles, ouvertures rotatives, trous, destruction, trajectoires planifiées.
// Aperçu et export exécutent exactement le même code avec le même pas de temps.

import type { MusicAnalysis } from './analysis';
import { frameAt } from './analysis';
import { INTENSITY, ambienceAt, buildDropTimeline, musicMode, musicOffset, timeScaleAt, type DropTimeline } from './drop';
import type { BallBehavior, BallStyle, DropIntensity, DropStyle, Settings } from './types';
import { worldSize } from './types';
import { TAU, angDiff, hexToRgb, hslToRgb, mulberry32, type RGB } from './util';

export const SIM_DT = 1 / 120;
const MAX_PARTICLES = 2600;
const PER_BOUNCE_HUES = [28, 140, 55, 205, 305, 0, 175, 265, 90, 330];

/** Réglages résolus d'une balle (communs + individuels). */
export interface BallProps {
  behavior: BallBehavior;
  style: BallStyle;
  radius: number;
  color: string;
  color2: string;
  colorMode: Settings['balls']['colorMode'];
  mass: number;
  speedMul: number;
  opacity: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  prevD: number;
  bounces: number;
  trail: number[];
  hueSeed: number;
  pi: number; // index des réglages individuels
  angle: number; // rotation propre (rad)
  spin: number; // vitesse de rotation (rad/s)
  E0: number; // énergie (mode rebonds infinis)
  planned: boolean; // trajectoire calculée en cours
  hitFlash: number;
}

export interface Ring {
  idx: number;
  alive: boolean;
  angle: number;
  r: number;
  prevR: number;
  hits: number;
  hitFlash: number;
  home: number;
  rand: number;
  holes: [number, number][]; // trous [angle, demi-largeur] (destruction partielle)
  dent: { a: number; amp: number; t0: number } | null; // déformation au choc
  hue: number; // décalage de teinte accumulé
  born: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rgb: RGB;
  drag: number;
  grav: number;
  css?: string;
}

export interface Ghost {
  r: number;
  angle: number;
  idx: number;
  t0: number;
  fade?: boolean;
}

export interface Shard {
  r: number;
  a0: number;
  a1: number;
  vr: number;
  va: number;
  t0: number;
  life: number;
  idx: number;
  th: number;
}

export interface SimEvent {
  type: 'bounce' | 'break' | 'beat' | 'end' | 'drop' | 'rejoin';
  t: number;
  strength: number;
  n: number;
}

export interface MusicSegment {
  start: number;
  end: number;
  offset: number;
}

export class Simulation {
  s: Settings;
  readonly analysis: MusicAnalysis | null;
  readonly W: number;
  readonly H: number;
  readonly cx: number;
  readonly cy: number;
  t = 0;
  rings: Ring[] = [];
  alive: Ring[] = [];
  balls: Ball[] = [];
  particles: Particle[] = [];
  ghosts: Ghost[] = [];
  shards: Shard[] = [];
  hitWaves: { t0: number; x: number; y: number; strength: number }[] = [];
  novas: { t0: number; strength: number }[] = [];
  portal: { t0: number; angle: number } | null = null;
  events: SimEvent[] = [];
  bounces = 0;
  destroyed = 0;
  finishedAt: number | null = null;
  shake = 0;
  flash = 0;
  pulse = 0;
  bass = 0;
  energy = 0;
  low = 0;
  high = 0;
  musicTime = 0;
  musicActive = false;
  beatHue = 0;
  segments: MusicSegment[] = [];
  cam = { x: 0, y: 0, zoom: 1, rot: 0 };
  private gateUntil = -1;
  private cursor = 0;
  private lastMusicFrame = -1;
  private trailAcc = 0;
  private nextIdx = 0;
  private rng: () => number;
  private fx: () => number;
  private dirty = false;
  private regen: { t: number }[] = [];
  private innerOff = 0;
  private props: BallProps[] = [];
  private propsFor: Settings | null = null;

  // ---- mode Drop parfait ----
  readonly hasMusic: boolean;
  tl: DropTimeline | null = null;
  phase: 'calm' | 'free' = 'free';
  ambience = 1;
  tension = 0;
  timeScale = 1;
  exitAngle = 0;
  crackFrom = Infinity;
  crackT = Infinity;
  dropGap = 0;
  lastDrop: { t: number; intensity: DropIntensity; style: DropStyle } | null = null;
  shockwaves: { t0: number; strength: number }[] = [];
  plan: { T: number; ok: boolean } | null = null;
  private dtp = SIM_DT;
  private nextDrop = 0;
  private rejoinAt = Infinity;
  private noBreak = false;
  private noDrag = false;
  private heroBounced = false;
  private chain: { t: number; ring: Ring }[] = [];

  constructor(settings: Settings, analysis: MusicAnalysis | null) {
    this.s = settings;
    this.analysis = settings.audio.mode !== 'none' ? analysis : null;
    this.hasMusic = !!this.analysis;
    const { W, H } = worldSize(settings.export);
    this.W = W;
    this.H = H;
    this.cx = W / 2;
    this.cy = H * settings.rings.centerY;
    this.cam = { x: this.cx, y: this.cy, zoom: 1, rot: 0 };
    this.rng = mulberry32(settings.seed * 9973 + 17);
    this.fx = mulberry32(settings.seed * 31 + 5);
    this.cursor = settings.audio.startOffset;
    this.tl = buildDropTimeline(settings, this.hasMusic);
    if (this.tl) {
      this.phase = 'calm';
      this.ambience = ambienceAt(this.tl, 0);
    }
    const rs = settings.rings;
    for (let i = 0; i < rs.count; i++) this.rings.push(this.makeRing(i, i));
    this.alive = this.rings.slice();
    this.sortAlive();
    this.nextIdx = rs.count;

    const bs = settings.balls;
    const inner = rs.count > 0 ? this.innerRadius - rs.thickness / 2 - bs.radius : Math.min(W, H) * 0.4;
    for (let i = 0; i < bs.count; i++) {
      let px = 0;
      let py = 0;
      if (bs.count === 1) {
        py = -inner * 0.35;
      } else {
        const a = this.rng() * TAU;
        const rr = Math.sqrt(this.rng()) * Math.max(0, inner * 0.7);
        px = Math.cos(a) * rr;
        py = Math.sin(a) * rr;
      }
      const va = this.rng() * TAU;
      const p = this.ballProps(i);
      const sp = bs.speed * p.speedMul * (0.85 + this.rng() * 0.3);
      this.addBall(this.cx + px, this.cy + py, Math.cos(va) * sp, Math.sin(va) * sp, i, p.radius);
    }
  }

  // ======================= réglages =======================

  setSettings(s: Settings) {
    this.s = s;
  }

  /** Réglages d'une balle (communs + individuels), mis en cache par version des réglages. */
  ballProps(i: number): BallProps {
    if (this.propsFor !== this.s) {
      this.propsFor = this.s;
      this.props = [];
    }
    let p = this.props[i];
    if (!p) {
      const b = this.s.balls;
      const o = b.list[i] ?? {};
      p = {
        behavior: o.behavior ?? b.behavior,
        style: o.style ?? b.style,
        radius: o.radius ?? b.radius,
        color: o.color ?? b.color,
        color2: o.color2 ?? b.color2,
        colorMode: o.colorMode ?? b.colorMode,
        mass: o.mass ?? b.mass,
        speedMul: o.speedMul ?? 1,
        opacity: o.opacity ?? b.opacity,
      };
      this.props[i] = p;
    }
    return p;
  }

  private addBall(x: number, y: number, vx: number, vy: number, pi: number, r: number): Ball {
    const g = this.s.balls.gravity;
    const b: Ball = {
      x,
      y,
      vx,
      vy,
      r,
      prevD: Math.hypot(x - this.cx, y - this.cy),
      bounces: 0,
      trail: [],
      hueSeed: (this.balls.length * 47) % 360,
      pi,
      angle: 0,
      spin: 0,
      E0: 0.5 * (vx * vx + vy * vy) - g * y,
      planned: false,
      hitFlash: 0,
    };
    this.balls.push(b);
    return b;
  }

  private makeRing(idx: number, slot: number): Ring {
    const rs = this.s.rings;
    const base = -Math.PI / 4;
    const angle = base + (rs.twist * idx * Math.PI) / 180 + ((this.rng() - 0.5) * rs.jitter * Math.PI) / 180;
    const r = this.ringTarget(slot, slot);
    return { idx, alive: true, angle, r, prevR: r, hits: 0, hitFlash: 0, home: slot, rand: this.rng() * 2 - 1, holes: [], dent: null, hue: 0, born: this.t };
  }

  get innerRadius() {
    return Math.max(40, this.s.rings.innerRadius + this.innerOff);
  }

  /**
   * Rayon visé d'un anneau à l'instant t (resserrement, rayon personnalisé, vibration,
   * tension, pulsation des basses). Fonction du temps uniquement : sert aussi à
   * prédire où sera le bord au moment d'un drop ou d'un temps musical.
   */
  private ringTarget(slot: number, home: number, t = this.t) {
    const rs = this.s.rings;
    const custom = rs.custom[home]?.radius;
    let r = !rs.collapse && custom ? custom : this.innerRadius + (rs.collapse ? slot : home) * rs.spacing;
    if (rs.vibrate > 0) r += rs.vibrate * Math.sin(t * 13 + home * 0.9);
    const ten = this.tensionAt(t);
    if (ten > 0 && this.s.drop.buildShake > 0) r += this.s.drop.buildShake * ten * 5 * Math.sin(t * 41 + home * 1.7);
    const bp = this.s.audio.map.bassPulse;
    if (bp > 0) r += bp * this.bassAt(t) * 16 * Math.exp(-slot * 0.05);
    return r;
  }

  /** Tension (0..1) à l'instant t ; retombe à 0 dans les 0,6 s avant le drop (bord stable). */
  private tensionAt(t: number) {
    const tl = this.tl;
    if (!tl || this.phase !== 'calm' || this.s.drop.buildUp <= 0) return 0;
    const next = tl.points[this.nextDrop];
    if (!next) return 0;
    const ten = Math.max(0, Math.min(1, 1 - (next.T - t) / this.s.drop.buildUp));
    return ten * Math.max(0, Math.min(1, (next.T - t - 0.05) / 0.6));
  }

  private bassAt(t: number) {
    const a = this.analysis;
    if (!a || musicMode(this.s) !== 'continuous') return t === this.t ? this.bass : this.pulse;
    const mt = this.s.audio.startOffset + t;
    return mt < a.duration ? a.bass[frameAt(a, mt)] : 0;
  }

  ringTh(R: Ring) {
    return this.s.rings.custom[R.home]?.thickness ?? this.s.rings.thickness;
  }

  private sortAlive() {
    this.alive.sort((a, b) => a.r - b.r);
  }

  get total() {
    return this.s.rings.infinite ? Infinity : this.rings.length;
  }

  get remaining() {
    return this.alive.length;
  }

  get finished() {
    return this.finishedAt !== null;
  }

  /** Prochain drop (ou null). */
  get upcoming() {
    return this.tl?.points[this.nextDrop] ?? null;
  }

  get fxMul() {
    if (!this.tl) return 1;
    const d = this.s.drop;
    return Math.max(0.05, d.calmEffects + (d.afterEffects - d.calmEffects) * this.ambience);
  }

  counterValue(): string {
    const c = this.s.counter;
    switch (c.mode) {
      case 'remaining':
        return String(this.alive.length);
      case 'destroyed':
        return String(this.destroyed);
      case 'bounces':
        return String(this.bounces);
      case 'time':
        return this.t.toFixed(1);
      default:
        return '';
    }
  }

  /** Ouverture d'un anneau : [angle (rad), ouverture (degrés)]. */
  ringGap(R: Ring): [number, number] {
    const base = this.s.rings.custom[R.home]?.gap ?? this.s.rings.gap;
    if (!this.tl) return [R.angle, base];
    if (this.phase === 'calm') {
      if (this.t >= this.crackFrom && this.t < this.crackT) {
        const u = (this.t - this.crackFrom) / (this.crackT - this.crackFrom);
        const style = this.tl.points[this.nextDrop]?.ev.style;
        if (style && this.dropGapFor(style) > 0) return [this.exitAngle, this.dropGapFor(style) * 0.6 * u * u];
      }
      return [R.angle, 0];
    }
    const open = this.lastDrop ? Math.min(1, (this.t - this.lastDrop.t) / 0.6) : 1;
    return [R.angle, Math.max(base * open, this.dropGap)];
  }

  private dropGapFor(style: DropStyle) {
    const g = this.s.rings.gap;
    if (style === 'open') return Math.max(g, 75);
    if (style === 'portal') return Math.max(g, 100);
    if (style === 'pass') return Math.max(g, 44);
    if (style === 'infinity') return Math.max(g, 40);
    return 0;
  }

  rebuildDrops(s: Settings) {
    this.s = s;
    this.tl = buildDropTimeline(s, this.hasMusic);
    if (!this.tl) {
      this.phase = 'free';
      this.ambience = 1;
      return;
    }
    const i = this.tl.points.findIndex((p) => p.T > this.t + 1e-6);
    this.nextDrop = i < 0 ? this.tl.points.length : i;
    this.plan = null;
  }

  advanceTo(target: number) {
    let guard = 0;
    while (this.t + SIM_DT <= target + 1e-9 && guard++ < 100000) this.step();
  }

  // ======================= pas de simulation =======================

  step() {
    const s = this.s;
    const tl = this.tl;
    this.timeScale = timeScaleAt(tl, s.drop, this.t);
    const dt = SIM_DT * this.timeScale * Math.max(0.05, s.balls.timeScale);
    this.dtp = dt;
    this.t += SIM_DT;
    this.updateMusic(SIM_DT);
    if (tl) {
      this.ambience = ambienceAt(tl, this.t);
      const next = tl.points[this.nextDrop];
      this.tension = next && this.phase === 'calm' && s.drop.buildUp > 0 ? Math.max(0, Math.min(1, 1 - (next.T - this.t) / s.drop.buildUp)) : 0;
      void next;
      if (this.phase === 'free' && this.t >= this.rejoinAt) this.rejoin();
    } else this.tension = 0;

    // anneaux : rotation, resserrement, rétrécissement / agrandissement
    const rs = s.rings;
    if (rs.radiusDrift !== 0) {
      const next = this.innerOff + rs.radiusDrift * dt;
      const ir = rs.innerRadius + next;
      if (ir > 60 && ir < Math.min(this.W, this.H) * 0.85) this.innerOff = next;
    }
    const rot = (rs.rotationSpeed * Math.PI) / 180;
    const moving = rs.vibrate > 0 || this.tension > 0 || s.audio.map.bassPulse > 0;
    const n = this.alive.length;
    for (let j = 0; j < n; j++) {
      const R = this.alive[j];
      R.prevR = R.r;
      const custom = rs.custom[R.home]?.rotationSpeed;
      let mul = 1 + rs.speedSpread * (j / Math.max(1, rs.count)) + rs.speedRandom * R.rand;
      if (rs.alternate && R.home % 2 === 1) mul = -mul;
      R.angle += (custom !== undefined ? (custom * Math.PI) / 180 : rot * mul) * dt;
      const target = this.ringTarget(j, R.home);
      const diff = target - R.r;
      if (diff !== 0) {
        const maxMove = (rs.collapseSpeed + Math.abs(diff) * 3) * dt + (moving ? 400 * dt : 0);
        R.r += Math.abs(diff) <= maxMove ? diff : Math.sign(diff) * maxMove;
      }
      if (R.hitFlash > 0) R.hitFlash = Math.max(0, R.hitFlash - dt * 4);
      if (R.dent && this.t - R.dent.t0 > 0.6) R.dent = null;
    }
    while (this.regen.length && this.regen[0].t <= this.t) {
      this.regen.shift();
      this.spawnOuterRing();
    }

    // balles
    const bs = s.balls;
    const hero = this.balls[0];
    for (let i = 0; i < this.balls.length; i++) this.integrate(this.balls[i], dt);

    if (tl && this.phase === 'calm') {
      const next = tl.points[this.nextDrop];
      if (next && this.t >= next.T - 1e-9) this.triggerDrop();
    }
    this.heroBounced = false;
    if (bs.ballCollisions && this.balls.length > 1) this.ballCollisions();
    for (const b of this.balls) {
      if (this.ballProps(b.pi).behavior !== 'programmed' || b.planned) this.ringCollisions(b);
      if (rs.walls || this.alive.length === 0 || (tl && this.phase === 'free')) this.walls(b);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > bs.maxSpeed && !b.planned) {
        b.vx *= bs.maxSpeed / sp;
        b.vy *= bs.maxSpeed / sp;
      }
      b.prevD = Math.hypot(b.x - this.cx, b.y - this.cy);
      b.angle += b.spin * dt;
      b.spin *= Math.exp(-dt * 0.6);
      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
    }
    while (this.chain.length && this.chain[0].t <= this.t) {
      const c = this.chain.shift()!;
      this.breakRing(c.ring, hero ?? null, true, 0.6);
    }
    if (this.dirty) {
      this.alive = this.alive.filter((r) => r.alive);
      this.dirty = false;
    }
    // préparation de la trajectoire de sortie (drop)
    if (tl && this.phase === 'calm' && hero && !this.plan) {
      const next = tl.points[this.nextDrop];
      if (next) {
        const lead = next.T - this.t;
        const leadMax = 1.6 + s.drop.slowMo;
        const leadMin = 0.45 + s.drop.slowMo * 0.5;
        if (lead > 0.1 && lead <= leadMax && (this.heroBounced || lead <= leadMin)) {
          const R = this.alive[0];
          if (R && this.planHit(hero, next.T, R)) {
            this.plan = { T: next.T, ok: true };
            this.crackFrom = next.T - Math.min(0.5, (next.T - this.t) * 0.6);
            this.crackT = next.T;
          } else if (lead <= 0.25) this.plan = { T: next.T, ok: false };
        }
      }
    }

    // traînées
    this.trailAcc += SIM_DT;
    if (this.trailAcc >= 1 / 60) {
      this.trailAcc -= 1 / 60;
      const boost = tl && this.phase === 'free' ? s.drop.trailBoost : 1;
      const maxPts = Math.max(1, Math.round(bs.trailLength * boost)) * 2;
      for (const b of this.balls) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > maxPts) b.trail.splice(0, b.trail.length - maxPts);
      }
      this.emitBallParticles();
    }

    this.updateParticles(dt);
    this.updateShards(dt);
    if (this.ghosts.length && this.t - this.ghosts[0].t0 > 0.7) this.ghosts = this.ghosts.filter((g) => this.t - g.t0 < 0.7);
    if (this.shockwaves.length && this.t - this.shockwaves[0].t0 > 1.4) this.shockwaves.shift();
    if (this.hitWaves.length && this.t - this.hitWaves[0].t0 > 0.6) this.hitWaves.shift();
    if (this.novas.length && this.t - this.novas[0].t0 > 2) this.novas.shift();
    this.shake *= Math.exp(-SIM_DT * 7);
    this.flash *= Math.exp(-SIM_DT * 6);
    this.pulse *= Math.exp(-SIM_DT * 5);
    this.updateCamera();

    const dropPending = !!tl && (this.nextDrop < tl.points.length || Number.isFinite(this.rejoinAt));
    if (!rs.infinite && !rs.regenerate && !dropPending && this.finishedAt === null && this.rings.length > 0 && this.alive.length === 0) {
      this.finishedAt = this.t;
      this.events.push({ type: 'end', t: this.t, strength: 1, n: this.destroyed });
      if (s.effects.flash) this.flash = 1;
      if (musicMode(s) === 'bounce') this.openGate(Infinity);
    }
  }

  /** Mouvement d'une balle selon son comportement. */
  private integrate(b: Ball, dt: number) {
    const bs = this.s.balls;
    const p = this.ballProps(b.pi);
    if (p.behavior === 'programmed' && !b.planned) {
      const R = this.alive[0];
      const rad = (R ? R.r - this.ringTh(R) / 2 - b.r : Math.min(this.W, this.H) * 0.4) * Math.max(0.05, Math.min(0.98, bs.pathSize));
      const T = this.t * bs.pathSpeed * TAU + b.hueSeed * 0.1;
      let x = 0;
      let y = 0;
      switch (bs.path) {
        case 'orbit':
          x = Math.cos(T);
          y = Math.sin(T);
          break;
        case 'figure8':
          x = Math.sin(T);
          y = Math.sin(T) * Math.cos(T);
          break;
        case 'spiral': {
          const k = 0.35 + 0.65 * Math.abs(Math.sin(T * 0.15));
          x = Math.cos(T) * k;
          y = Math.sin(T) * k;
          break;
        }
        default:
          x = Math.sin(T * 3);
          y = Math.sin(T * 2 + 0.6);
      }
      const nx = this.cx + x * rad;
      const ny = this.cy + y * rad;
      b.vx = (nx - b.x) / Math.max(1e-6, dt);
      b.vy = (ny - b.y) / Math.max(1e-6, dt);
      b.x = nx;
      b.y = ny;
      return;
    }
    if (!b.planned) {
      if (bs.friction > 0 && p.behavior !== 'infinite') {
        const k = Math.exp(-bs.friction * dt);
        b.vx *= k;
        b.vy *= k;
      }
      if (bs.acceleration !== 0 && p.behavior !== 'infinite') {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.vx += (b.vx / sp) * bs.acceleration * dt;
        b.vy += (b.vy / sp) * bs.acceleration * dt;
      }
      if (p.behavior === 'chaos' && this.rng() < dt * 2) {
        const a = this.rng() * TAU;
        const k = 300 * bs.chaos;
        b.vx += Math.cos(a) * k;
        b.vy += Math.sin(a) * k;
      }
    }
    b.vy += bs.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // ======================= caméra =======================

  private updateCamera() {
    const c = this.s.camera;
    let kz = 1;
    let kr = 0;
    let kx = 0;
    let ky = 0;
    if (c.keys.length) {
      const t = this.t + musicOffset(this.s, this.hasMusic);
      const sorted = c.keys.slice().sort((a, b) => a.time - b.time);
      let k0 = sorted[0];
      let k1 = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].time <= t) k0 = sorted[i];
        if (sorted[i].time >= t) {
          k1 = sorted[i];
          break;
        }
      }
      if (t >= k1.time) k0 = k1;
      const span = k1.time - k0.time;
      const u = span > 0 ? Math.max(0, Math.min(1, (t - k0.time) / span)) : 0;
      const e = u * u * (3 - 2 * u);
      kz = k0.zoom + (k1.zoom - k0.zoom) * e;
      kr = k0.rotation + (k1.rotation - k0.rotation) * e;
      kx = k0.x + (k1.x - k0.x) * e;
      ky = k0.y + (k1.y - k0.y) * e;
    }
    const hero = this.balls[0];
    const tx = this.cx + kx + (hero && c.follow > 0 ? (hero.x - this.cx) * c.follow : 0);
    const ty = this.cy + ky + (hero && c.follow > 0 ? (hero.y - this.cy) * c.follow : 0);
    let zoom = kz * (1 + c.autoZoom * 0.08 * this.bass);
    if (this.tl) {
      zoom *= 1 + c.buildZoom * this.tension;
      if (this.lastDrop && this.t >= this.lastDrop.t) zoom *= 1 + c.dropZoom * Math.exp(-(this.t - this.lastDrop.t) * 3.2) * INTENSITY[this.lastDrop.intensity].size;
    }
    let rot = kr + c.sway * Math.sin(this.t * 0.35);
    if (this.lastDrop && this.t >= this.lastDrop.t) rot += c.dropZoom * 6 * Math.exp(-(this.t - this.lastDrop.t) * 3) * Math.sin((this.t - this.lastDrop.t) * 9);
    const k = 1 - Math.exp(-SIM_DT * (14 - 12.5 * Math.max(0, Math.min(1, c.smoothing))));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (Math.max(0.3, Math.min(4, zoom)) - this.cam.zoom) * Math.min(1, k * 2.5);
    this.cam.rot += (rot - this.cam.rot) * Math.min(1, k * 2.5);
  }

  // ======================= musique =======================

  private updateMusic(dt: number) {
    const a = this.analysis;
    const mode = musicMode(this.s);
    if (!a || mode === 'none') {
      this.musicActive = false;
      this.bass = this.pulse;
      this.energy = this.pulse;
      this.low = this.pulse;
      this.high = 0;
      // temps synthétiques (sans musique) pour les effets rythmiques
      const beat = Math.floor((this.t * Math.max(30, this.s.balls.bpm)) / 60);
      if (beat !== this.lastMusicFrame) {
        if (this.lastMusicFrame >= 0) this.onBeat();
        this.lastMusicFrame = beat;
      }
      return;
    }
    if (mode === 'continuous') {
      this.musicTime = this.s.audio.startOffset + this.t;
      this.musicActive = this.musicTime < a.duration;
    } else {
      this.musicActive = this.t < this.gateUntil;
      if (this.musicActive) {
        this.cursor += dt;
        if (this.cursor >= a.duration) {
          const last = this.segments[this.segments.length - 1];
          if (last) last.end = this.t;
          this.cursor = 0;
          this.segments.push({ start: this.t, end: this.gateUntil, offset: 0 });
        }
      }
      this.musicTime = this.cursor;
    }
    const f = frameAt(a, this.musicTime);
    const k = this.musicActive ? 1 : 0;
    this.bass = Math.max(this.pulse * 0.6, a.bass[f] * k);
    this.energy = a.energy[f] * k;
    this.low = (a.low?.[f] ?? a.bass[f]) * k;
    this.high = (a.high?.[f] ?? 0) * k;
    if (this.musicActive && f !== this.lastMusicFrame) {
      let beat = false;
      if (f > this.lastMusicFrame && f - this.lastMusicFrame < 30) {
        for (let i = this.lastMusicFrame + 1; i <= f; i++) if (a.beats[i]) beat = true;
      }
      this.lastMusicFrame = f;
      if (beat) this.onBeat();
    }
  }

  private onBeat() {
    const e = this.s.effects;
    if (this.s.audio.map.beatColor) this.beatHue += 47;
    if (!this.hasMusic) return;
    this.events.push({ type: 'beat', t: this.t, strength: 1, n: 0 });
    if (e.musicReactive && e.flash) this.flash = Math.max(this.flash, 0.35 * e.reactivity);
    if (e.beatImpulse) {
      for (const b of this.balls) {
        if (b.planned) continue;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const boost = 260 * e.reactivity;
        b.vx += (b.vx / sp) * boost;
        b.vy += (b.vy / sp) * boost;
      }
    }
  }

  /** Prochains temps (temps simulation) au moins `minGap` secondes après maintenant. */
  private nextBeats(minGap: number): number[] {
    const out: number[] = [];
    const a = this.analysis;
    if (a && a.beatGrid?.length && musicMode(this.s) === 'continuous') {
      const off = musicOffset(this.s, true);
      for (const b of a.beatGrid) {
        const t = b - off;
        if (t >= this.t + minGap) {
          out.push(t);
          if (out.length >= 3) break;
        }
      }
      if (out.length) return out;
    }
    const period = 60 / Math.max(30, this.s.balls.bpm);
    let t = Math.ceil((this.t + minGap) / period) * period;
    for (let i = 0; i < 3; i++, t += period) out.push(t);
    return out;
  }

  private openGate(until: number) {
    if (musicMode(this.s) !== 'bounce' || !this.analysis) return;
    if (this.t >= this.gateUntil) {
      this.segments.push({ start: this.t, end: until, offset: this.cursor });
    } else {
      this.segments[this.segments.length - 1].end = Math.max(this.segments[this.segments.length - 1].end, until);
    }
    this.gateUntil = Math.max(this.gateUntil, until);
  }

  // ======================= collisions =======================

  private inGap(R: Ring, ang: number, d: number, br: number) {
    if (this.tl && this.phase === 'calm') return false; // balle enfermée jusqu'au drop
    const margin = Math.asin(Math.min(1, br / Math.max(d, br, 1))) * 0.35;
    for (const [ha, hw] of R.holes) if (Math.abs(angDiff(ang, ha)) < hw - margin) return true;
    const [gAng, gap] = this.ringGap(R);
    if (gap <= 0) return false;
    const half = (gap * Math.PI) / 360;
    return Math.abs(angDiff(ang, gAng)) < half - margin;
  }

  private upper(d: number) {
    let lo = 0;
    let hi = this.alive.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.alive[m].r < d) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  private ringCollisions(b: Ball) {
    const rs = this.s.rings;
    let dx = b.x - this.cx;
    let dy = b.y - this.cy;
    let d = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    const alive = this.alive;

    let k = this.upper(d);
    let blocked: Ring | null = null;
    const crossed: Ring[] = [];
    for (let j = k - 1; j >= 0; j--) {
      const R = alive[j];
      if (!R.alive) continue;
      if (R.prevR <= b.prevD) break;
      if (this.inGap(R, ang, d, b.r)) crossed.push(R);
      else blocked = R;
    }
    if (blocked) {
      for (const R of crossed) if (R.r < blocked.r && rs.breakable) this.breakRing(R, b);
      this.collideInner(b, blocked);
    } else if (rs.breakable) {
      for (const R of crossed) this.breakRing(R, b);
    }

    dx = b.x - this.cx;
    dy = b.y - this.cy;
    d = Math.hypot(dx, dy) || 1e-6;
    k = this.upper(d);
    for (let j = k; j < alive.length; j++) {
      const R = alive[j];
      if (!R.alive) continue;
      const th2 = this.ringTh(R) / 2;
      if (R.r - th2 - b.r >= d) break;
      if (!this.inGap(R, ang, d, b.r)) {
        this.collideInner(b, R);
        break;
      }
      if (rs.breakable && d + b.r > R.r) this.breakRing(R, b);
    }
    dx = b.x - this.cx;
    dy = b.y - this.cy;
    d = Math.hypot(dx, dy) || 1e-6;
    k = this.upper(d);
    for (let j = k - 1; j >= 0; j--) {
      const R = alive[j];
      if (!R.alive) continue;
      const th2 = this.ringTh(R) / 2;
      if (R.r + th2 + b.r <= d) break;
      if (!this.inGap(R, ang, d, b.r)) {
        this.collideOuter(b, R);
        break;
      }
    }
  }

  private collideInner(b: Ball, R: Ring) {
    const dx = b.x - this.cx;
    const dy = b.y - this.cy;
    const d = Math.hypot(dx, dy) || 1e-6;
    const limit = R.r - this.ringTh(R) / 2 - b.r;
    if (d <= limit) return;
    const nx = dx / d;
    const ny = dy / d;
    const lim = Math.max(0, limit);
    b.x = this.cx + nx * lim;
    b.y = this.cy + ny * lim;
    const wallV = Math.max((R.r - R.prevR) / this.dtp, -this.s.rings.collapseSpeed);
    const vn = b.vx * nx + b.vy * ny;
    if (vn > wallV) {
      const nvn = Math.min(-this.s.balls.bounce * vn, wallV);
      b.vx += (nvn - vn) * nx;
      b.vy += (nvn - vn) * ny;
      this.onBounce(b, R, vn - wallV, nx, ny, -1);
    }
  }

  private collideOuter(b: Ball, R: Ring) {
    const dx = b.x - this.cx;
    const dy = b.y - this.cy;
    const d = Math.hypot(dx, dy) || 1e-6;
    const limit = R.r + this.ringTh(R) / 2 + b.r;
    if (d >= limit) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = this.cx + nx * limit;
    b.y = this.cy + ny * limit;
    const wallV = Math.min((R.r - R.prevR) / this.dtp, this.s.rings.collapseSpeed);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < wallV) {
      const nvn = Math.max(-this.s.balls.bounce * vn, wallV);
      b.vx += (nvn - vn) * nx;
      b.vy += (nvn - vn) * ny;
      this.onBounce(b, R, wallV - vn, nx, ny, 1);
    }
  }

  /** Réaction d'une balle à un choc contre un anneau (comportement + effets). */
  private onBounce(b: Ball, R: Ring | null, strength: number, nx: number, ny: number, side: number) {
    const bs = this.s.balls;
    const p = this.ballProps(b.pi);
    const wasPlanned = b.planned;
    b.planned = false;
    // frottement de surface → rotation de la balle (et perte tangentielle en physique réaliste)
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    const sf = Math.max(0, Math.min(1, bs.surfaceFriction));
    b.spin += (vt / Math.max(4, b.r)) * sf * 0.6;
    if (p.behavior === 'realistic') {
      b.vx -= tx * vt * sf * 0.3;
      b.vy -= ty * vt * sf * 0.3;
    }
    let sp = Math.hypot(b.vx, b.vy);
    if (p.behavior === 'infinite') {
      const v = Math.sqrt(Math.max(0, 2 * (b.E0 + bs.gravity * b.y)));
      if (sp > 1e-3 && v > 0) {
        b.vx *= v / sp;
        b.vy *= v / sp;
      }
    } else if (p.behavior === 'accelerate' && strength >= 90) {
      b.vx *= 1 + bs.accelPerHit;
      b.vy *= 1 + bs.accelPerHit;
    } else if (p.behavior === 'chaos') {
      const a = (this.rng() - 0.5) * 2 * bs.chaos * (Math.PI / 4);
      const c = Math.cos(a);
      const s2 = Math.sin(a);
      const vx = b.vx * c - b.vy * s2;
      const vy = b.vx * s2 + b.vy * c;
      if ((vx * nx + vy * ny) * side >= 0) {
        b.vx = vx;
        b.vy = vy;
      }
    }
    sp = Math.hypot(b.vx, b.vy);
    if (p.behavior !== 'realistic' && p.behavior !== 'infinite') {
      if (sp < bs.minSpeed && sp > 1e-3) {
        b.vx *= bs.minSpeed / sp;
        b.vy *= bs.minSpeed / sp;
      } else if (sp <= 1e-3) {
        b.vx = -nx * bs.minSpeed * side;
        b.vy = -ny * bs.minSpeed * side;
      }
    }
    // montée musicale / montée de tension → accélération progressive
    const accel = Math.max(this.s.audio.map.buildupAccel * this.risingFactor(), this.s.drop.buildAccel * this.tension);
    if (accel > 0 && strength >= 90 && !(this.plan && b === this.balls[0])) {
      b.vx *= 1 + accel * 0.08;
      b.vy *= 1 + accel * 0.08;
    }
    // rebonds synchronisés avec la musique : la balle vise le prochain temps
    if (p.behavior === 'music' && R && !(this.tl && b === this.balls[0] && this.plan)) {
      for (const T of this.nextBeats(0.28)) if (this.planHit(b, T, R, 0.6)) break;
    }
    if (strength < 90 && !wasPlanned) return;
    if (b === this.balls[0]) this.heroBounced = true;
    b.bounces++;
    b.hitFlash = 1;
    this.bounces++;
    if (bs.growOnBounce > 0 && R) {
      const maxR = Math.max(bs.radius, (R.r - this.ringTh(R)) * 0.92);
      b.r = Math.min(maxR, b.r + bs.growOnBounce);
    }
    const e = this.s.effects;
    const h = e.hit;
    const fxm = this.fxMul;
    const k = Math.min(1, strength / 1600);
    this.pulse = Math.min(1, this.pulse + k * 0.8);
    if (e.shake) this.shake = Math.min(1, this.shake + (strength / 6000) * (0.4 + h.shake * 2) * this.s.camera.shake);
    const ix = b.x - nx * b.r * side;
    const iy = b.y - ny * b.r * side;
    if (e.particles && e.sparks && h.particles > 0) {
      const n = Math.round(6 * e.particleAmount * fxm * h.particles);
      const rgb = R ? ringColor(this.s, R.idx, 0, R.hue) : ([255, 255, 255] as RGB);
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(-ny * side, -nx * side) + Math.PI + (this.fx() - 0.5) * 2.2;
        const v = 150 + this.fx() * 450 * (0.6 + h.particles * 0.4);
        this.addParticle(ix, iy, Math.cos(a) * v, Math.sin(a) * v, 0.35 + this.fx() * 0.4, 2 + this.fx() * 3, rgb, 0.9, 300);
      }
    }
    if (h.shockwave > 0 && strength > 150) this.hitWaves.push({ t0: this.t, x: ix, y: iy, strength: h.shockwave * (0.4 + k) });
    if (h.flash > 0) this.flash = Math.max(this.flash, h.flash * k);
    if (R) {
      R.hitFlash = 1;
      const ang = Math.atan2(iy - this.cy, ix - this.cx);
      if (h.deform > 0) R.dent = { a: ang, amp: -side * h.deform * (6 + 28 * k), t0: this.t };
      if (h.colorShift > 0) R.hue += 35 * h.colorShift;
      const calm = this.tl && this.phase === 'calm';
      if (h.holes > 0 && !calm && R.alive) {
        const hw = ((h.holes * 26 * Math.PI) / 180) * (0.5 + k);
        const near = R.holes.find(([a]) => Math.abs(angDiff(a, ang)) < hw);
        if (near) near[1] = Math.min(Math.PI * 0.6, near[1] + hw * 0.4);
        else if (R.holes.length < 4) R.holes.push([ang, hw]);
      }
      const hb = this.s.rings.hitsToBreak;
      if (hb > 0 && R.alive && !calm) {
        R.hits++;
        if (R.hits >= hb) this.breakRing(R, b);
      }
    }
    if (h.multiply > 0 && this.balls.length < h.maxBalls && this.fx() < h.multiply) {
      const a = Math.atan2(b.vy, b.vx) + (this.fx() - 0.5) * 1.2;
      const v = Math.hypot(b.vx, b.vy);
      this.addBall(b.x - nx * 2 * side, b.y - ny * 2 * side, Math.cos(a) * v, Math.sin(a) * v, b.pi, b.r);
    }
    this.events.push({ type: 'bounce', t: this.t, strength, n: this.bounces });
    this.openGate(this.t + this.s.audio.gateMs / 1000);
  }

  /** 0..1 : la musique est dans une montée (section détectée) ou montée avant un drop. */
  private risingFactor() {
    const a = this.analysis;
    if (!a?.sections || !this.musicActive) return this.tension;
    const mt = this.musicTime;
    for (const s of a.sections) if (s.type === 'buildup' && mt >= s.start && mt <= s.end) return Math.min(1, (mt - s.start) / Math.max(1, s.end - s.start));
    return this.tension;
  }

  private ballCollisions() {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const c = bs[j];
        if (a.planned || c.planned) continue; // trajectoires calculées réservées
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + c.r;
        if (dist >= min || dist < 1e-6) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const ma = a.r * a.r * Math.max(0.05, this.ballProps(a.pi).mass);
        const mc = c.r * c.r * Math.max(0.05, this.ballProps(c.pi).mass);
        const over = min - dist;
        a.x -= nx * over * (mc / (ma + mc));
        a.y -= ny * over * (mc / (ma + mc));
        c.x += nx * over * (ma / (ma + mc));
        c.y += ny * over * (ma / (ma + mc));
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        if (rel <= 0) continue;
        const jimp = ((1 + this.s.balls.bounce) * rel) / (1 / ma + 1 / mc);
        a.vx -= (jimp / ma) * nx;
        a.vy -= (jimp / ma) * ny;
        c.vx += (jimp / mc) * nx;
        c.vy += (jimp / mc) * ny;
        if (rel > 200) {
          this.bounces++;
          a.hitFlash = c.hitFlash = 1;
          this.events.push({ type: 'bounce', t: this.t, strength: rel, n: this.bounces });
          this.openGate(this.t + this.s.audio.gateMs / 1000);
        }
      }
    }
  }

  private walls(b: Ball) {
    const e = this.s.balls.bounce;
    let hit = 0;
    if (b.x < b.r) {
      b.x = b.r;
      if (b.vx < 0) (hit = -b.vx), (b.vx = -b.vx * e);
    } else if (b.x > this.W - b.r) {
      b.x = this.W - b.r;
      if (b.vx > 0) (hit = b.vx), (b.vx = -b.vx * e);
    }
    if (b.y < b.r) {
      b.y = b.r;
      if (b.vy < 0) (hit = -b.vy), (b.vy = -b.vy * e);
    } else if (b.y > this.H - b.r) {
      b.y = this.H - b.r;
      if (b.vy > 0) (hit = b.vy), (b.vy = -b.vy * e);
    }
    if (hit > 0) {
      b.planned = false;
      const sp = Math.hypot(b.vx, b.vy);
      const ms = this.s.balls.minSpeed;
      if (this.ballProps(b.pi).behavior !== 'realistic' && sp < ms && sp > 1e-3) {
        b.vx *= ms / sp;
        b.vy *= ms / sp;
      }
      if (hit > 120) {
        this.bounces++;
        b.bounces++;
        this.events.push({ type: 'bounce', t: this.t, strength: hit, n: this.bounces });
        this.openGate(this.t + this.s.audio.gateMs / 1000);
      }
    }
  }

  // ======================= trajectoires calculées =======================

  /**
   * Donne à la balle la vitesse qui la fait toucher le bord intérieur de l'anneau R
   * exactement au pas de l'instant T (intégration discrète identique au moteur,
   * ralenti compris), avec le plus petit changement de vitesse possible.
   */
  planHit(b: Ball, T: number, R: Ring, overshoot = 0): boolean {
    // drop : premier pas ≥ T (le drop se déclenche à ce pas) ; temps musical : pas le plus proche
    const n = overshoot > 0 ? Math.round((T - this.t) / SIM_DT) : Math.ceil((T - this.t) / SIM_DT - 1e-9);
    if (n < 4 || n > 1200) return false;
    const dts: number[] = [];
    const ts = Math.max(0.05, this.s.balls.timeScale);
    for (let k = 0; k < n; k++) dts.push(SIM_DT * timeScaleAt(this.tl, this.s.drop, this.t + k * SIM_DT) * ts);
    let D = 0;
    let S = 0;
    let C = 0;
    for (const dt of dts) {
      C += dt;
      D += dt;
      S += dt * C;
    }
    const g = this.s.balls.gravity;
    const j = this.alive.indexOf(R);
    const tHit = this.t + n * SIM_DT;
    const rT = this.ringTarget(j < 0 ? 0 : j, R.home, tHit);
    const limit = rT - this.ringTh(R) / 2 - b.r - 0.05 + overshoot;
    const d0 = Math.hypot(b.x - this.cx, b.y - this.cy);
    if (limit < 5 || d0 > R.r - this.ringTh(R) / 2 - b.r + 0.5) return false;
    if (Math.abs(R.r - this.ringTarget(j < 0 ? 0 : j, R.home)) > 2) return false; // anneau encore en mouvement
    const vmax = Math.max(this.s.balls.maxSpeed, 2400);
    const cur = Math.hypot(b.vx, b.vy);
    let best: { vx: number; vy: number; a: number; cost: number } | null = null;
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const tx = this.cx + Math.cos(a) * limit;
      const ty = this.cy + Math.sin(a) * limit;
      const vx = (tx - b.x) / D;
      const vy = (ty - b.y - g * S) / D;
      const sp = Math.hypot(vx, vy);
      if (sp > vmax || sp < 150) continue;
      let x = b.x;
      let y = b.y;
      let wy = vy;
      let ok = true;
      for (let k = 0; k < n - 1; k++) {
        wy += g * dts[k];
        x += vx * dts[k];
        y += wy * dts[k];
        if (Math.hypot(x - this.cx, y - this.cy) >= Math.min(limit, rT - this.ringTh(R) / 2 - b.r) - 0.1) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const fy = wy + g * dts[n - 1];
      const radial = vx * Math.cos(a) + fy * Math.sin(a);
      if (radial < 120) continue;
      const cost = Math.hypot(vx - b.vx, vy - b.vy) + 0.25 * Math.abs(sp - cur) - radial * 0.2;
      if (!best || cost < best.cost) best = { vx, vy, a, cost };
    }
    if (!best) return false;
    b.vx = best.vx;
    b.vy = best.vy;
    b.planned = true;
    if (b === this.balls[0]) this.exitAngle = best.a;
    return true;
  }

  // ======================= drop =======================

  private triggerDrop() {
    const tl = this.tl!;
    const p = tl.points[this.nextDrop++];
    const d = this.s.drop;
    const I = INTENSITY[p.ev.intensity];
    const hero = this.balls[0];
    if (!this.plan?.ok && hero) this.exitAngle = Math.atan2(hero.y - this.cy, hero.x - this.cx);
    this.plan = null;
    if (hero) hero.planned = false;
    this.crackFrom = this.crackT = Infinity;
    this.phase = 'free';
    this.rejoinAt = p.R;
    const style = p.ev.style;
    this.lastDrop = { t: this.t, intensity: p.ev.intensity, style };
    this.noBreak = style === 'open' || style === 'portal';
    this.noDrag = style === 'infinity';
    this.dropGap = this.dropGapFor(style);
    const rs = this.s.rings;
    const maxR = Math.hypot(Math.max(this.cx, this.W - this.cx), Math.max(this.cy, this.H - this.cy)) + 40;
    const vis = this.alive.filter((R) => R.r < maxR);
    const explodeAll = (pm: number) => {
      const per = Math.min(1, 40 / Math.max(1, vis.length)) * I.particles * d.particles * pm;
      for (const R of this.alive.slice()) this.breakRing(R, hero ?? null, true, R.r < maxR ? per : 0);
    };
    switch (style) {
      case 'pass':
      case 'open':
      case 'portal':
      case 'infinity': {
        // seuls les anneaux visibles s'alignent (Infinity : tous ceux de l'écran, Traverse : ~25 % de l'écran)
        const jit = style === 'infinity' ? 0 : Math.min(rs.jitter, 8);
        const reach = style === 'infinity' ? maxR : (vis[0]?.r ?? this.innerRadius) + maxR * 0.25;
        for (const R of this.alive) if (R.r <= reach) R.angle = this.exitAngle + ((this.rng() - 0.5) * jit * Math.PI) / 180;
        if (style === 'portal') this.portal = { t0: this.t, angle: this.exitAngle };
        break;
      }
      case 'explode':
      case 'blackout':
        explodeAll(1);
        break;
      case 'supernova':
        explodeAll(0.5);
        this.novas.push({ t0: this.t, strength: I.size * d.explosionSize });
        this.burstRing(vis[0]?.r ?? this.innerRadius, 160, 1300, null);
        break;
      case 'galaxy':
        explodeAll(0.4);
        this.burstGalaxy(hero, I.particles * d.particles);
        break;
      case 'neonburst':
        explodeAll(0.6);
        this.burstRing(vis[0]?.r ?? this.innerRadius, 220, 1600, 'rainbow');
        break;
      case 'shatter': {
        const stepK = Math.max(1, Math.ceil(vis.length / 70));
        vis.forEach((R, k) => {
          if (k % stepK !== 0) return;
          const pieces = 5 + Math.floor(this.fx() * 3);
          for (let q = 0; q < pieces; q++) {
            const a0 = (q / pieces) * TAU + this.fx() * 0.2;
            const a1 = a0 + (TAU / pieces) * (0.6 + this.fx() * 0.3);
            this.shards.push({ r: R.r, a0, a1, vr: 200 + this.fx() * 900 * I.size, va: (this.fx() - 0.5) * 3, t0: this.t, life: 0.9 + this.fx() * 0.8, idx: R.idx, th: this.ringTh(R) * 1.4 });
          }
        });
        for (const R of this.alive.slice()) this.breakRing(R, hero ?? null, true, 0);
        break;
      }
      case 'shockwave': {
        const r0 = vis[0]?.r ?? this.innerRadius;
        const speed = 1500 * I.size * d.explosionSize;
        for (let w = 0; w < 5; w++) this.shockwaves.push({ t0: this.t + w * 0.14, strength: I.size * d.explosionSize * (1 - w * 0.12) });
        for (const R of this.alive) this.chain.push({ t: this.t + Math.max(0, R.r - r0) / speed, ring: R });
        this.chain.sort((a, b) => a.t - b.t);
        while (this.chain.length && this.chain[0].t <= this.t) this.breakRing(this.chain.shift()!.ring, hero ?? null, true, 1);
        break;
      }
      case 'chain': {
        const span = 0.7;
        vis.forEach((R, k) => this.chain.push({ t: this.t + (k / Math.max(1, vis.length)) * span, ring: R }));
        if (vis[0]) this.breakRing(vis[0], hero ?? null, true, 1);
        this.chain = this.chain.filter((c) => c.ring.alive);
        for (const R of this.alive) if (R.r >= maxR) this.chain.push({ t: this.t + span, ring: R });
        this.chain.sort((a, b) => a.t - b.t);
        break;
      }
      default: {
        for (const R of this.alive) {
          if (R.r < maxR) this.ghosts.push({ r: R.r, angle: R.angle, idx: R.idx, t0: this.t, fade: true });
          R.alive = false;
          this.destroyed++;
        }
        this.dirty = true;
      }
    }
    if (hero) {
      const dx = hero.x - this.cx;
      const dy = hero.y - this.cy;
      const dd = Math.hypot(dx, dy) || 1;
      const nx = dx / dd;
      const ny = dy / dd;
      const vt = -hero.vx * ny + hero.vy * nx;
      const sp = d.exitSpeed * (0.85 + 0.15 * I.size);
      hero.vx = nx * sp - ny * vt * 0.3;
      hero.vy = ny * sp + nx * vt * 0.3;
      if (this.s.audio.map.dropExplosion) {
        const count = Math.min(500, Math.round(70 * d.particles * I.particles));
        const pal = [...(d.afterPalette.length ? d.afterPalette : rs.palette).map(hexToRgb), [255, 255, 255] as RGB];
        for (let i = 0; i < count; i++) {
          const a = this.fx() * TAU;
          const v = (250 + this.fx() * 1300) * d.explosionSize * I.size;
          const rgb = style === 'neonburst' ? hslToRgb(this.fx() * 360, 1, 0.6) : pal[i % pal.length];
          this.addParticle(hero.x, hero.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + this.fx() * 1.1, 2 + this.fx() * 4 * I.size, rgb, 0.955, 120);
        }
      }
      for (let i = 0; i < p.ev.extraBalls; i++) {
        const a = this.exitAngle + ((i + 1) / (p.ev.extraBalls + 1) - 0.5) * Math.PI * 1.6;
        this.addBall(hero.x, hero.y, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8, i + 1, this.s.balls.radius);
      }
    }
    if ((d.shockwave && I.shock > 0) || style === 'supernova') {
      this.shockwaves.push({ t0: this.t, strength: I.size * d.explosionSize });
      if (I.shock > 1) this.shockwaves.push({ t0: this.t + 0.12, strength: I.size * d.explosionSize * 0.7 });
    }
    this.flash = Math.max(this.flash, d.flash * I.flash * (style === 'blackout' || style === 'supernova' ? 1.4 : 1));
    this.shake = Math.min(1, this.shake + I.shake * this.s.camera.shake);
    this.pulse = 1;
    this.events.push({ type: 'drop', t: this.t, strength: I.size, n: this.nextDrop });
  }

  private burstRing(r: number, n: number, speed: number, mode: 'rainbow' | null) {
    const d = this.s.drop;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.fx() * 0.05;
      const v = speed * (0.6 + this.fx() * 0.6) * d.explosionSize;
      const rgb: RGB = mode === 'rainbow' ? hslToRgb((i / n) * 360, 1, 0.6) : hslToRgb(40 + this.fx() * 20, 1, 0.75);
      this.addParticle(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, Math.cos(a) * v, Math.sin(a) * v, 0.8 + this.fx() * 0.8, 3 + this.fx() * 3, rgb, 0.96, 0);
    }
  }

  private burstGalaxy(hero: Ball | undefined, amount: number) {
    const n = Math.min(700, Math.round(260 * amount));
    const ox = hero?.x ?? this.cx;
    const oy = hero?.y ?? this.cy;
    for (let i = 0; i < n; i++) {
      const arm = i % 3;
      const tt = this.fx();
      const a = arm * (TAU / 3) + tt * 3.2;
      const v = 200 + tt * 1100;
      const swirl = 380;
      const rgb: RGB = this.fx() < 0.25 ? [255, 255, 255] : hslToRgb(200 + this.fx() * 100, 0.9, 0.65);
      this.addParticle(ox, oy, Math.cos(a) * v - Math.sin(a) * swirl, Math.sin(a) * v + Math.cos(a) * swirl, 1.2 + this.fx() * 1.6, 1.5 + this.fx() * 3, rgb, 0.985, 0);
    }
  }

  private rejoin() {
    const rs = this.s.rings;
    this.rejoinAt = Infinity;
    this.phase = 'calm';
    this.dropGap = 0;
    this.noBreak = false;
    this.noDrag = false;
    this.portal = null;
    this.chain = [];
    for (const R of this.alive) R.alive = false;
    this.rings = [];
    for (let i = 0; i < rs.count; i++) {
      const ring = this.makeRing(this.nextIdx++, i);
      ring.r = ring.prevR = ring.r + 1500;
      this.rings.push(ring);
    }
    this.alive = this.rings.slice();
    this.events.push({ type: 'rejoin', t: this.t, strength: 1, n: 0 });
  }

  // ======================= destruction =======================

  private spawnOuterRing() {
    const rs = this.s.rings;
    const slot = this.alive.filter((r) => r.alive).length;
    const ring = this.makeRing(this.nextIdx++, rs.collapse ? slot : this.freeHome());
    ring.r += rs.spacing * 2;
    ring.prevR = ring.r;
    this.rings.push(ring);
    this.alive.push(ring);
    this.sortAlive();
    if (this.rings.length > rs.count * 3) this.rings = this.rings.filter((r) => r.alive);
  }

  private freeHome() {
    const used = new Set(this.alive.filter((r) => r.alive).map((r) => r.home));
    for (let i = 0; i < this.s.rings.count; i++) if (!used.has(i)) return i;
    return this.s.rings.count;
  }

  private breakRing(R: Ring, b: Ball | null, force = false, pmul = 1) {
    if (!R.alive) return;
    if (!force && this.tl && (this.phase === 'calm' || this.noBreak)) return;
    R.alive = false;
    this.dirty = true;
    this.destroyed++;
    const s = this.s;
    pmul *= this.fxMul;
    const keep = force || this.noDrag ? 1 : 1 - Math.min(0.2, Math.max(0, s.rings.breakDrag));
    if (b && Math.hypot(b.vx, b.vy) * keep > s.balls.minSpeed * 0.6) {
      b.vx *= keep;
      b.vy *= keep;
    }
    const e = s.effects;
    this.ghosts.push({ r: R.r, angle: R.angle, idx: R.idx, t0: this.t });
    if (this.ghosts.length > 40) this.ghosts.shift();
    if (e.shake) this.shake = Math.min(1, this.shake + 0.12 * (0.4 + e.hit.shake * 2) * s.camera.shake);
    this.pulse = Math.min(1, this.pulse + 0.25);
    const rgb = ringColor(s, R.idx, 0, R.hue);
    if (e.particles && pmul > 0) {
      const n = Math.min(70, Math.round((8 + R.r * 0.05) * e.particleAmount * pmul));
      const half = (s.rings.gap * Math.PI) / 360;
      for (let i = 0; i < n; i++) {
        const a = R.angle + half + this.fx() * (TAU - 2 * half);
        const inward = this.fx() < 0.45;
        const px = this.cx + Math.cos(a) * R.r;
        const py = this.cy + Math.sin(a) * R.r;
        const sp = inward ? -(20 + this.fx() * 90) : 40 + this.fx() * 220;
        const ta = (this.fx() - 0.5) * 80;
        this.addParticle(
          px,
          py,
          Math.cos(a) * sp - Math.sin(a) * ta,
          Math.sin(a) * sp + Math.cos(a) * ta,
          inward ? 1.2 + this.fx() * 1.6 : 0.5 + this.fx() * 0.8,
          1.4 + this.fx() * 2.4,
          rgb,
          inward ? 0.995 : 0.97,
          inward ? 0 : 60,
        );
      }
      if (e.explosions && b && !force) {
        const m = Math.round(10 * e.particleAmount * pmul);
        for (let i = 0; i < m; i++) {
          const a = this.fx() * TAU;
          const v = 200 + this.fx() * 600;
          this.addParticle(b.x, b.y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + this.fx() * 0.4, 2 + this.fx() * 3, [255, 240, 200], 0.92, 0);
        }
      }
    }
    this.events.push({ type: 'break', t: this.t, strength: 1, n: this.destroyed });
    this.openGate(this.t + s.audio.gateMs / 1000);
    if (s.rings.infinite && !(force && this.tl)) this.spawnOuterRing();
    else if (s.rings.regenerate > 0 && !(force && this.tl)) {
      this.regen.push({ t: this.t + s.rings.regenerate });
      this.regen.sort((a, c) => a.t - c.t);
    }
  }

  // ======================= particules =======================

  private emitBallParticles() {
    const bs = this.s.balls;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const p = this.ballProps(b.pi);
      const amount = p.style === 'particles' ? Math.max(0.5, bs.emitParticles) : p.style === 'fire' ? Math.max(0.8, bs.emitParticles) : bs.emitParticles;
      if (amount <= 0 || !this.s.effects.particles) continue;
      const n = Math.round(amount * 3 * this.fxMul);
      for (let k = 0; k < n; k++) {
        const a = this.fx() * TAU;
        const v = 20 + this.fx() * 80;
        const rgb: RGB = p.style === 'fire' ? hslToRgb(15 + this.fx() * 35, 1, 0.55) : this.ballRgb(b, i);
        this.addParticle(
          b.x + Math.cos(a) * b.r * 0.6,
          b.y + Math.sin(a) * b.r * 0.6,
          Math.cos(a) * v - b.vx * 0.08,
          Math.sin(a) * v - b.vy * 0.08 - (p.style === 'fire' ? 120 : 0),
          0.3 + this.fx() * 0.4,
          2 + this.fx() * b.r * 0.15,
          rgb,
          0.93,
          0,
        );
      }
    }
  }

  private addParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, rgb: RGB, drag: number, grav: number) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.splice(0, 200);
    this.particles.push({ x, y, vx, vy, life, max: life, size, rgb, drag, grav });
  }

  private updateParticles(dt: number) {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ps[w++] = p;
    }
    ps.length = w;
  }

  private updateShards(dt: number) {
    if (!this.shards.length) return;
    for (const sh of this.shards) {
      sh.r += sh.vr * dt;
      sh.vr *= 0.985;
      sh.a0 += sh.va * dt;
      sh.a1 += sh.va * dt;
    }
    this.shards = this.shards.filter((sh) => this.t - sh.t0 < sh.life);
  }

  ballRgb(b: Ball, i: number): RGB {
    const p = this.ballProps(b.pi);
    if (p.colorMode === 'rainbow' || p.style === 'rainbow') return hslToRgb(this.t * 140 + b.hueSeed + i * 40, 1, 0.6);
    if (p.colorMode === 'perBounce') return hslToRgb(PER_BOUNCE_HUES[(b.bounces + i) % PER_BOUNCE_HUES.length], 1, 0.6);
    return hexToRgb(p.color);
  }
}

const paletteCache = new WeakMap<string[], RGB[]>();
function pal(p: string[]): RGB[] {
  let v = paletteCache.get(p);
  if (!v) {
    v = p.map(hexToRgb);
    paletteCache.set(p, v);
  }
  return v;
}

/** Couleur d'un anneau selon son index absolu et sa position. */
export function ringColor(s: Settings, idx: number, slot: number, hueOffset: number): RGB {
  const rs = s.rings;
  const p = pal(rs.palette.length ? rs.palette : ['#ffffff']);
  let c: RGB;
  switch (rs.colorMode) {
    case 'solid':
      c = p[0];
      break;
    case 'rainbow':
      return hslToRgb((idx * 360) / Math.max(1, rs.bandSize) + hueOffset, 1, 0.58);
    case 'gradient': {
      const x = Math.min(1, Math.max(0, slot / Math.max(1, Math.min(rs.count, 200) - 1)));
      const pos = x * (p.length - 1);
      const i = Math.floor(pos);
      const a = p[i];
      const b = p[Math.min(p.length - 1, i + 1)];
      const t = pos - i;
      c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      break;
    }
    default: {
      const x = idx / Math.max(1, rs.bandSize);
      const n = p.length;
      const q = (((x % 1) + 1) % 1) * n;
      const i = Math.floor(q);
      const a = p[i % n];
      const b = p[(i + 1) % n];
      const t = q - i;
      c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return c;
}
