// Moteur physique 2D déterministe (pas fixe de 1/120 s, aléatoire à graine).
// Conçu spécifiquement pour des balles à l'intérieur d'anneaux concaves
// (cas mal géré par les moteurs génériques type Matter.js) : collisions
// continues contre des parois mobiles, ouvertures rotatives, destruction.

import type { MusicAnalysis } from './analysis';
import { frameAt } from './analysis';
import { INTENSITY, ambienceAt, buildDropTimeline, musicMode, timeScaleAt, type DropTimeline } from './drop';
import type { DropIntensity, DropStyle, Settings } from './types';
import { WORLD_H, WORLD_W } from './types';
import { TAU, angDiff, hexToRgb, hslToRgb, mulberry32, type RGB } from './util';

export const SIM_DT = 1 / 120;
const MAX_PARTICLES = 2600;
const PER_BOUNCE_HUES = [28, 140, 55, 205, 305, 0, 175, 265, 90, 330];

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  prevD: number;
  bounces: number;
  trail: number[]; // x0,y0,x1,y1,... (le plus récent à la fin)
  hueSeed: number;
}

export interface Ring {
  idx: number;
  alive: boolean;
  angle: number; // centre de l'ouverture (rad)
  r: number;
  prevR: number;
  hits: number;
  hitFlash: number;
  home: number; // position d'origine (cercles qui ne se resserrent pas)
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
  fade?: boolean; // disparition (sans expansion)
}

export interface SimEvent {
  type: 'bounce' | 'break' | 'beat' | 'end' | 'drop' | 'rejoin';
  t: number;
  strength: number;
  n: number; // index séquentiel (pour la mélodie)
}

export interface MusicSegment {
  start: number; // temps simulation
  end: number;
  offset: number; // position dans la musique
}

export class Simulation {
  s: Settings;
  readonly analysis: MusicAnalysis | null;
  t = 0;
  rings: Ring[] = [];
  alive: Ring[] = [];
  balls: Ball[] = [];
  particles: Particle[] = [];
  ghosts: Ghost[] = [];
  events: SimEvent[] = [];
  bounces = 0;
  destroyed = 0;
  finishedAt: number | null = null;
  shake = 0;
  flash = 0;
  pulse = 0;
  bass = 0;
  energy = 0;
  musicTime = 0;
  musicActive = false;
  segments: MusicSegment[] = [];
  private gateUntil = -1;
  private cursor = 0;
  private lastMusicFrame = -1;
  private trailAcc = 0;
  private nextIdx = 0;
  private rng: () => number;
  private fx: () => number; // aléatoire séparé pour les effets visuels
  private dirty = false;
  readonly cx: number;
  readonly cy: number;

  // ---- mode Drop parfait ----
  readonly hasMusic: boolean;
  tl: DropTimeline | null = null;
  phase: 'calm' | 'free' = 'free';
  ambience = 1; // 0 = calme (balle enfermée), 1 = puissance maximale
  tension = 0; // montée de tension avant le prochain drop (0..1)
  timeScale = 1; // ralenti
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
  private heroBounced = false;
  private chain: { t: number; ring: Ring }[] = [];

  constructor(settings: Settings, analysis: MusicAnalysis | null) {
    this.s = settings;
    this.analysis = settings.audio.mode !== 'none' ? analysis : null;
    this.hasMusic = !!this.analysis;
    this.tl = buildDropTimeline(settings, this.hasMusic);
    if (this.tl) {
      this.phase = 'calm';
      this.ambience = ambienceAt(this.tl, 0);
    }
    this.rng = mulberry32(settings.seed * 9973 + 17);
    this.fx = mulberry32(settings.seed * 31 + 5);
    this.cx = WORLD_W / 2;
    this.cy = WORLD_H * settings.rings.centerY;
    this.cursor = settings.audio.startOffset;
    const rs = settings.rings;
    for (let i = 0; i < rs.count; i++) this.rings.push(this.makeRing(i, i));
    this.alive = this.rings.slice();
    this.nextIdx = rs.count;

    const bs = settings.balls;
    const inner = rs.count > 0 ? rs.innerRadius - rs.thickness / 2 - bs.radius : 400;
    for (let i = 0; i < bs.count; i++) {
      let px = 0;
      let py = 0;
      if (bs.count === 1) {
        px = 0;
        py = -inner * 0.35;
      } else {
        const a = this.rng() * TAU;
        const rr = Math.sqrt(this.rng()) * Math.max(0, inner * 0.7);
        px = Math.cos(a) * rr;
        py = Math.sin(a) * rr;
      }
      const va = this.rng() * TAU;
      const sp = bs.speed * (0.85 + this.rng() * 0.3);
      this.balls.push({
        x: this.cx + px,
        y: this.cy + py,
        vx: Math.cos(va) * sp,
        vy: Math.sin(va) * sp,
        r: bs.radius,
        prevD: Math.hypot(px, py),
        bounces: 0,
        trail: [],
        hueSeed: i * 47,
      });
    }
  }

  private makeRing(idx: number, slot: number): Ring {
    const rs = this.s.rings;
    const base = -Math.PI / 4;
    const angle = base + (rs.twist * idx * Math.PI) / 180 + ((this.rng() - 0.5) * rs.jitter * Math.PI) / 180;
    const r = rs.innerRadius + slot * rs.spacing;
    return { idx, alive: true, angle, r, prevR: r, hits: 0, hitFlash: 0, home: slot };
  }

  /** Remplace les réglages « vivants » (couleurs, gravité…) sans redémarrer. */
  setSettings(s: Settings) {
    this.s = s;
  }

  get total() {
    return this.s.rings.infinite ? Infinity : this.rings.length;
  }

  get remaining() {
    return this.alive.length;
  }

  /** Multiplicateur des effets selon l'ambiance (1 hors mode drop). */
  get fxMul() {
    if (!this.tl) return 1;
    const d = this.s.drop;
    return Math.max(0.05, d.calmEffects + (d.afterEffects - d.calmEffects) * this.ambience);
  }

  /** Ouverture visible et physique d'un anneau : [angle (rad), ouverture (degrés)]. */
  ringGap(R: Ring): [number, number] {
    if (!this.tl) return [R.angle, this.s.rings.gap];
    if (this.phase === 'calm') {
      if (this.t >= this.crackFrom && this.t < this.crackT) {
        const u = (this.t - this.crackFrom) / (this.crackT - this.crackFrom);
        const style = this.tl.points[this.nextDrop]?.ev.style;
        if (style === 'pass' || style === 'open') return [this.exitAngle, this.dropGapFor(style) * 0.6 * u * u];
      }
      return [R.angle, 0];
    }
    const open = this.lastDrop ? Math.min(1, (this.t - this.lastDrop.t) / 0.6) : 1;
    return [R.angle, Math.max(this.s.rings.gap * open, this.dropGap)];
  }

  private dropGapFor(style: DropStyle) {
    return style === 'open' ? Math.max(this.s.rings.gap, 75) : style === 'pass' ? Math.max(this.s.rings.gap, 44) : 0;
  }

  /** Ajoute / modifie des drops pendant la lecture (mode interactif) sans redémarrer. */
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

  get finished() {
    return this.finishedAt !== null;
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

  /** Avance jusqu'au temps `target` par pas fixes. */
  advanceTo(target: number) {
    let guard = 0;
    while (this.t + SIM_DT <= target + 1e-9 && guard++ < 100000) this.step();
  }

  step() {
    const s = this.s;
    const tl = this.tl;
    this.timeScale = timeScaleAt(tl, s.drop, this.t);
    const dt = SIM_DT * this.timeScale; // temps physique (ralenti possible)
    this.dtp = dt;
    this.t += SIM_DT;
    this.updateMusic(SIM_DT);
    if (tl) {
      this.ambience = ambienceAt(tl, this.t);
      const next = tl.points[this.nextDrop];
      this.tension = next && this.phase === 'calm' && s.drop.buildUp > 0 ? Math.max(0, Math.min(1, 1 - (next.T - this.t) / s.drop.buildUp)) : 0;
      if (this.phase === 'free' && this.t >= this.rejoinAt) this.rejoin();
    }

    // anneaux : rotation et resserrement
    const rs = s.rings;
    const rot = (rs.rotationSpeed * Math.PI) / 180;
    const n = this.alive.length;
    for (let j = 0; j < n; j++) {
      const R = this.alive[j];
      R.prevR = R.r;
      const mul = 1 + rs.speedSpread * (j / Math.max(1, rs.count));
      R.angle += rot * mul * dt;
      const target = rs.collapse ? rs.innerRadius + j * rs.spacing : rs.innerRadius + R.home * rs.spacing;
      const diff = target - R.r;
      if (diff !== 0) {
        const maxMove = (rs.collapseSpeed + Math.abs(diff) * 3) * dt;
        R.r += Math.abs(diff) <= maxMove ? diff : Math.sign(diff) * maxMove;
      }
      if (R.hitFlash > 0) R.hitFlash = Math.max(0, R.hitFlash - dt * 4);
    }

    // balles
    const bs = s.balls;
    for (const b of this.balls) {
      b.vy += bs.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    // déclenchement du drop : après le déplacement, avant les collisions
    if (tl && this.phase === 'calm') {
      const next = tl.points[this.nextDrop];
      if (next && this.t >= next.T - 1e-9) this.triggerDrop();
    }
    this.heroBounced = false;
    if (bs.ballCollisions && this.balls.length > 1) this.ballCollisions();
    const hero = this.balls[0];
    for (const b of this.balls) {
      this.ringCollisions(b);
      if (rs.walls || this.alive.length === 0 || (tl && this.phase === 'free')) this.walls(b);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > bs.maxSpeed && !(this.plan && b === hero)) {
        b.vx *= bs.maxSpeed / sp;
        b.vy *= bs.maxSpeed / sp;
      }
      b.prevD = Math.hypot(b.x - this.cx, b.y - this.cy);
    }
    while (this.chain.length && this.chain[0].t <= this.t) {
      const c = this.chain.shift()!;
      this.breakRing(c.ring, hero ?? null, true, 0.6);
    }
    if (this.dirty) {
      this.alive = this.alive.filter((r) => r.alive);
      this.dirty = false;
    }
    // préparation de la trajectoire de sortie
    if (tl && this.phase === 'calm' && hero && !this.plan) {
      const next = tl.points[this.nextDrop];
      if (next) {
        const lead = next.T - this.t;
        const leadMax = 1.3 + s.drop.slowMo;
        const leadMin = 0.45 + s.drop.slowMo * 0.5;
        if (lead > 0.1 && lead <= leadMax && (this.heroBounced || lead <= leadMin)) this.tryPlan(next.T, lead <= 0.25);
      }
    }

    // traînées (échantillonnées à 60/s quel que soit le pas)
    this.trailAcc += dt;
    if (this.trailAcc >= 1 / 60) {
      this.trailAcc -= 1 / 60;
      const boost = tl && this.phase === 'free' ? s.drop.trailBoost : 1;
      const maxPts = Math.max(1, Math.round(bs.trailLength * boost)) * 2;
      for (const b of this.balls) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > maxPts) b.trail.splice(0, b.trail.length - maxPts);
      }
    }

    this.updateParticles(dt);
    if (this.ghosts.length && this.t - this.ghosts[0].t0 > 0.7) this.ghosts = this.ghosts.filter((g) => this.t - g.t0 < 0.7);
    if (this.shockwaves.length && this.t - this.shockwaves[0].t0 > 1.2) this.shockwaves.shift();
    this.shake *= Math.exp(-dt * 7);
    this.flash *= Math.exp(-dt * 6);
    this.pulse *= Math.exp(-dt * 5);

    const dropPending = !!tl && (this.nextDrop < tl.points.length || Number.isFinite(this.rejoinAt));
    if (!rs.infinite && !dropPending && this.finishedAt === null && this.rings.length > 0 && this.alive.length === 0) {
      this.finishedAt = this.t;
      this.events.push({ type: 'end', t: this.t, strength: 1, n: this.destroyed });
      if (s.effects.flash) this.flash = 1;
      if (s.audio.mode === 'bounce') this.openGate(Infinity);
    }
  }

  // ======================= mode Drop parfait =======================

  /**
   * Calcule une vitesse pour que la balle principale touche le bord du cercle
   * exactement à l'instant T (intégration discrète identique au moteur, ralenti compris).
   */
  private tryPlan(T: number, last: boolean) {
    const b = this.balls[0];
    const R = this.alive[0];
    if (!b || !R) return;
    const rs = this.s.rings;
    const n = Math.ceil((T - this.t) / SIM_DT - 1e-9);
    if (n < 4) return;
    const dts: number[] = [];
    for (let k = 0; k < n; k++) dts.push(SIM_DT * timeScaleAt(this.tl, this.s.drop, this.t + k * SIM_DT));
    let D = 0;
    let S = 0;
    let C = 0;
    for (const dt of dts) {
      C += dt;
      D += dt;
      S += dt * C;
    }
    const g = this.s.balls.gravity;
    const limit = R.r - rs.thickness / 2 - b.r - 0.05;
    const d0 = Math.hypot(b.x - this.cx, b.y - this.cy);
    if (limit < 5 || d0 > limit + 0.5 || Math.abs(R.r - R.prevR) > 0.01) return;
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
      // vérifie que la trajectoire reste dans le cercle jusqu'au dernier pas
      let x = b.x;
      let y = b.y;
      let wy = vy;
      let ok = true;
      for (let k = 0; k < n - 1; k++) {
        wy += g * dts[k];
        x += vx * dts[k];
        y += wy * dts[k];
        if (Math.hypot(x - this.cx, y - this.cy) >= limit - 0.1) {
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
    if (!best) {
      if (last) this.plan = { T, ok: false };
      return;
    }
    b.vx = best.vx;
    b.vy = best.vy;
    this.exitAngle = best.a;
    this.plan = { T, ok: true };
    this.crackFrom = T - Math.min(0.4, (T - this.t) * 0.6);
    this.crackT = T;
  }

  private triggerDrop() {
    const tl = this.tl!;
    const p = tl.points[this.nextDrop++];
    const d = this.s.drop;
    const I = INTENSITY[p.ev.intensity];
    const hero = this.balls[0];
    if (!this.plan?.ok && hero) this.exitAngle = Math.atan2(hero.y - this.cy, hero.x - this.cx);
    this.plan = null;
    this.crackFrom = this.crackT = Infinity;
    this.phase = 'free';
    this.rejoinAt = p.R;
    this.lastDrop = { t: this.t, intensity: p.ev.intensity, style: p.ev.style };
    this.noBreak = p.ev.style === 'open';
    this.dropGap = this.dropGapFor(p.ev.style);
    const rs = this.s.rings;
    const maxR = Math.hypot(Math.max(this.cx, WORLD_W - this.cx), Math.max(this.cy, WORLD_H - this.cy)) + 40;
    const style = p.ev.style;
    if (style === 'pass' || style === 'open') {
      // toutes les ouvertures s'alignent sur la balle : un tunnel s'ouvre
      for (const R of this.alive) R.angle = this.exitAngle + ((this.rng() - 0.5) * Math.min(rs.jitter, 8) * Math.PI) / 180;
    } else if (style === 'explode') {
      const vis = this.alive.filter((R) => R.r < maxR);
      const pm = Math.min(1, 40 / Math.max(1, vis.length)) * I.particles * d.particles;
      for (const R of this.alive.slice()) this.breakRing(R, hero ?? null, true, R.r < maxR ? pm : 0);
    } else if (style === 'chain') {
      const vis = this.alive.filter((R) => R.r < maxR);
      const span = 0.7;
      vis.forEach((R, k) => this.chain.push({ t: this.t + (k / Math.max(1, vis.length)) * span, ring: R }));
      if (vis[0]) this.breakRing(vis[0], hero ?? null, true, 1);
      this.chain = this.chain.filter((c) => c.ring.alive);
      for (const R of this.alive) if (R.r >= maxR) this.chain.push({ t: this.t + span, ring: R });
      this.chain.sort((a, b) => a.t - b.t);
    } else {
      for (const R of this.alive) {
        if (R.r < maxR) this.ghosts.push({ r: R.r, angle: R.angle, idx: R.idx, t0: this.t, fade: true });
        R.alive = false;
        this.destroyed++;
      }
      this.dirty = true;
    }
    // la balle accélère vers l'extérieur
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
      // explosion de particules
      const count = Math.min(500, Math.round(70 * d.particles * I.particles));
      const pal = [...(d.afterPalette.length ? d.afterPalette : rs.palette).map(hexToRgb), [255, 255, 255] as RGB];
      for (let i = 0; i < count; i++) {
        const a = this.fx() * TAU;
        const v = (250 + this.fx() * 1300) * d.explosionSize * I.size;
        this.addParticle(hero.x, hero.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + this.fx() * 1.1, 2 + this.fx() * 4 * I.size, pal[i % pal.length], 0.955, 120);
      }
      for (let i = 0; i < p.ev.extraBalls; i++) {
        const a = this.exitAngle + ((i + 1) / (p.ev.extraBalls + 1) - 0.5) * Math.PI * 1.6;
        this.balls.push({
          x: hero.x,
          y: hero.y,
          vx: Math.cos(a) * sp * 0.8,
          vy: Math.sin(a) * sp * 0.8,
          r: this.s.balls.radius,
          prevD: Math.hypot(hero.x - this.cx, hero.y - this.cy),
          bounces: 0,
          trail: [],
          hueSeed: (this.balls.length * 67) % 360,
        });
      }
    }
    if (d.shockwave && I.shock > 0) {
      this.shockwaves.push({ t0: this.t, strength: I.size * d.explosionSize });
      if (I.shock > 1) this.shockwaves.push({ t0: this.t + 0.12, strength: I.size * d.explosionSize * 0.7 });
    }
    this.flash = Math.max(this.flash, d.flash * I.flash);
    this.shake = Math.min(1, this.shake + I.shake);
    this.pulse = 1;
    this.events.push({ type: 'drop', t: this.t, strength: I.size, n: this.nextDrop });
  }

  /** La balle revient dans un cercle : de nouveaux anneaux arrivent de l'extérieur et l'enferment. */
  private rejoin() {
    const rs = this.s.rings;
    this.rejoinAt = Infinity;
    this.phase = 'calm';
    this.dropGap = 0;
    this.noBreak = false;
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

  private updateMusic(dt: number) {
    const a = this.analysis;
    const mode = musicMode(this.s);
    if (!a || mode === 'none') {
      this.musicActive = false;
      this.bass = this.pulse;
      this.energy = this.pulse;
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
          // on reboucle la musique
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
    this.events.push({ type: 'beat', t: this.t, strength: 1, n: 0 });
    if (e.musicReactive && e.flash) this.flash = Math.max(this.flash, 0.35 * e.reactivity);
    if (e.beatImpulse) {
      for (const b of this.balls) {
        if (this.plan && b === this.balls[0]) continue;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const boost = 260 * e.reactivity;
        b.vx += (b.vx / sp) * boost;
        b.vy += (b.vy / sp) * boost;
      }
    }
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

  private inGap(R: Ring, ang: number, d: number, br: number) {
    if (this.tl && this.phase === 'calm') return false; // balle enfermée jusqu'au drop
    const [gAng, gap] = this.ringGap(R);
    if (gap <= 0) return false;
    const half = (gap * Math.PI) / 360;
    const margin = Math.asin(Math.min(1, br / Math.max(d, br, 1))) * 0.35;
    return Math.abs(angDiff(ang, gAng)) < half - margin;
  }

  /** Premier index d'anneau vivant dont le rayon est >= d. */
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
    const th2 = rs.thickness / 2;
    let dx = b.x - this.cx;
    let dy = b.y - this.cy;
    let d = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    const alive = this.alive;

    // 1. anneaux franchis vers l'extérieur depuis le pas précédent
    let k = this.upper(d);
    let blocked: Ring | null = null;
    const crossed: Ring[] = [];
    for (let j = k - 1; j >= 0; j--) {
      const R = alive[j];
      if (!R.alive) continue;
      if (R.prevR <= b.prevD) break;
      if (this.inGap(R, ang, d, b.r)) crossed.push(R);
      else blocked = R; // le plus intérieur qui bloque
    }
    if (blocked) {
      // tunnel évité : on ne garde que les anneaux franchis avant l'obstacle
      for (const R of crossed) if (R.r < blocked.r && rs.breakable) this.breakRing(R, b);
      this.collideInner(b, blocked, th2);
    } else if (rs.breakable) {
      for (const R of crossed) this.breakRing(R, b);
    }

    // 2. chevauchements avec les parois
    dx = b.x - this.cx;
    dy = b.y - this.cy;
    d = Math.hypot(dx, dy) || 1e-6;
    k = this.upper(d);
    for (let j = k; j < alive.length; j++) {
      const R = alive[j];
      if (!R.alive) continue;
      if (R.r - th2 - b.r >= d) break;
      if (!this.inGap(R, ang, d, b.r)) {
        this.collideInner(b, R, th2);
        break;
      }
      // la balle s'engage dans l'ouverture : l'anneau est franchi
      if (rs.breakable && d + b.r > R.r) this.breakRing(R, b);
    }
    dx = b.x - this.cx;
    dy = b.y - this.cy;
    d = Math.hypot(dx, dy) || 1e-6;
    k = this.upper(d);
    for (let j = k - 1; j >= 0; j--) {
      const R = alive[j];
      if (!R.alive) continue;
      if (R.r + th2 + b.r <= d) break;
      if (!this.inGap(R, ang, d, b.r)) {
        this.collideOuter(b, R, th2);
        break;
      }
    }
  }

  private collideInner(b: Ball, R: Ring, th2: number) {
    const dx = b.x - this.cx;
    const dy = b.y - this.cy;
    const d = Math.hypot(dx, dy) || 1e-6;
    const limit = R.r - th2 - b.r;
    if (d <= limit) return;
    const nx = dx / d;
    const ny = dy / d;
    const lim = Math.max(0, limit);
    b.x = this.cx + nx * lim;
    b.y = this.cy + ny * lim;
    // paroi mobile : la balle suit au plus la vitesse de la paroi (plafonnée),
    // sans lui voler d'énergie (sinon elle accélère à chaque resserrement)
    const wallV = Math.max((R.r - R.prevR) / this.dtp, -this.s.rings.collapseSpeed);
    const vn = b.vx * nx + b.vy * ny;
    if (vn > wallV) {
      const nvn = Math.min(-this.s.balls.bounce * vn, wallV);
      b.vx += (nvn - vn) * nx;
      b.vy += (nvn - vn) * ny;
      this.onBounce(b, R, vn - wallV, nx, ny, -1);
    }
  }

  private collideOuter(b: Ball, R: Ring, th2: number) {
    const dx = b.x - this.cx;
    const dy = b.y - this.cy;
    const d = Math.hypot(dx, dy) || 1e-6;
    const limit = R.r + th2 + b.r;
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

  private onBounce(b: Ball, R: Ring | null, strength: number, nx: number, ny: number, side: number) {
    const bs = this.s.balls;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < bs.minSpeed && sp > 1e-3) {
      b.vx *= bs.minSpeed / sp;
      b.vy *= bs.minSpeed / sp;
    } else if (sp <= 1e-3) {
      b.vx = -nx * bs.minSpeed * side;
      b.vy = -ny * bs.minSpeed * side;
    }
    if (strength < 90) return; // contact au repos : pas d'événement
    if (b === this.balls[0]) this.heroBounced = true;
    b.bounces++;
    this.bounces++;
    if (bs.growOnBounce > 0 && R) {
      const maxR = Math.max(bs.radius, (R.r - this.s.rings.thickness) * 0.92);
      b.r = Math.min(maxR, b.r + bs.growOnBounce);
    }
    const e = this.s.effects;
    this.pulse = Math.min(1, this.pulse + Math.min(1, strength / 1600) * 0.8);
    if (e.shake) this.shake = Math.min(1, this.shake + strength / 6000);
    if (e.particles && e.sparks) {
      const n = Math.round(6 * e.particleAmount * this.fxMul);
      const cx = b.x - nx * b.r * side;
      const cy = b.y - ny * b.r * side;
      const rgb = R ? this.ringRgb(R) : ([255, 255, 255] as RGB);
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(-ny * side, -nx * side) + Math.PI + (this.fx() - 0.5) * 2.2;
        const v = 150 + this.fx() * 450;
        this.addParticle(cx, cy, Math.cos(a) * v, Math.sin(a) * v, 0.35 + this.fx() * 0.4, 2 + this.fx() * 3, rgb, 0.9, 300);
      }
    }
    if (R) {
      R.hitFlash = 1;
      const h = this.s.rings.hitsToBreak;
      if (h > 0 && R.alive) {
        R.hits++;
        if (R.hits >= h) this.breakRing(R, b);
      }
    }
    this.events.push({ type: 'bounce', t: this.t, strength, n: this.bounces });
    this.openGate(this.t + this.s.audio.gateMs / 1000);
  }

  private ballCollisions() {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const c = bs[j];
        if (this.plan && i === 0) continue; // trajectoire de sortie réservée
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + c.r;
        if (dist >= min || dist < 1e-6) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const ma = a.r * a.r;
        const mc = c.r * c.r;
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
    } else if (b.x > WORLD_W - b.r) {
      b.x = WORLD_W - b.r;
      if (b.vx > 0) (hit = b.vx), (b.vx = -b.vx * e);
    }
    if (b.y < b.r) {
      b.y = b.r;
      if (b.vy < 0) (hit = -b.vy), (b.vy = -b.vy * e);
    } else if (b.y > WORLD_H - b.r) {
      b.y = WORLD_H - b.r;
      if (b.vy > 0) (hit = b.vy), (b.vy = -b.vy * e);
    }
    if (hit > 0) {
      const sp = Math.hypot(b.vx, b.vy);
      const ms = this.s.balls.minSpeed;
      if (sp < ms && sp > 1e-3) {
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

  ringRgb(R: Ring): RGB {
    return ringColor(this.s, R.idx, this.alive.indexOf(R), 0);
  }

  private breakRing(R: Ring, b: Ball | null, force = false, pmul = 1) {
    if (!R.alive) return;
    if (!force && this.tl && (this.phase === 'calm' || this.noBreak)) return;
    R.alive = false;
    this.dirty = true;
    this.destroyed++;
    const s = this.s;
    pmul *= this.fxMul;
    const keep = force ? 1 : 1 - Math.min(0.2, Math.max(0, s.rings.breakDrag));
    if (b && Math.hypot(b.vx, b.vy) * keep > s.balls.minSpeed * 0.6) {
      b.vx *= keep;
      b.vy *= keep;
    }
    const e = s.effects;
    this.ghosts.push({ r: R.r, angle: R.angle, idx: R.idx, t0: this.t });
    if (this.ghosts.length > 40) this.ghosts.shift();
    if (e.shake) this.shake = Math.min(1, this.shake + 0.12);
    this.pulse = Math.min(1, this.pulse + 0.25);
    const rgb = ringColor(s, R.idx, 0, 0);
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
    if (s.rings.infinite && !(force && this.tl)) {
      const slot = this.alive.filter((r) => r.alive).length;
      const ring = this.makeRing(this.nextIdx++, slot);
      ring.r += s.rings.spacing * 2;
      ring.prevR = ring.r;
      this.rings.push(ring);
      this.alive.push(ring);
      if (this.rings.length > s.rings.count * 3) this.rings = this.rings.filter((r) => r.alive);
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

  ballRgb(b: Ball, i: number): RGB {
    const bs = this.s.balls;
    if (bs.colorMode === 'rainbow') return hslToRgb(this.t * 140 + b.hueSeed + i * 40, 1, 0.6);
    if (bs.colorMode === 'perBounce') return hslToRgb(PER_BOUNCE_HUES[(b.bounces + i) % PER_BOUNCE_HUES.length], 1, 0.6);
    return hexToRgb(bs.color);
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
