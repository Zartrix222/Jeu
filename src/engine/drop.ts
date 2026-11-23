// Mode « Drop parfait » : chronologie des drops, courbe d'ambiance (calme ↔ puissante),
// ralenti, intensités et détection automatique des drops dans la musique.
// Tout est fonction du temps uniquement : l'aperçu et l'export calculent exactement
// les mêmes valeurs aux mêmes instants.

import type { MusicAnalysis } from './analysis';
import type { DropEvent, DropIntensity, DropSettings, Settings } from './types';

export interface DropPoint {
  ev: DropEvent;
  T: number; // instant du drop (temps simulation)
  R: number; // retour dans un cercle (temps simulation, Infinity = jamais)
}

export interface DropTimeline {
  points: DropPoint[];
  keys: [number, number][]; // courbe d'ambiance (t, f) linéaire par morceaux, f: 0 calme → 1 puissant
}

export const INTENSITY: Record<DropIntensity, { particles: number; size: number; flash: number; shock: number; shake: number; boost: number; label: string }> = {
  soft: { particles: 0.6, size: 0.7, flash: 0.35, shock: 0, shake: 0.15, boost: 0.5, label: 'Doux' },
  power: { particles: 1.5, size: 1.15, flash: 0.75, shock: 1, shake: 0.5, boost: 1, label: 'Puissant' },
  extreme: { particles: 2.6, size: 1.6, flash: 1, shock: 2, shake: 1, boost: 1.5, label: 'Extrême' },
};

/** Le mode drop impose une musique continue (le temps musical doit être celui de la vidéo). */
export function musicMode(s: Settings): Settings['audio']['mode'] {
  if (s.drop.enabled && s.audio.mode === 'bounce') return 'continuous';
  return s.audio.mode;
}

/** Décalage entre le temps de la musique et le temps de la simulation. */
export function musicOffset(s: Settings, hasMusic: boolean) {
  return hasMusic && musicMode(s) === 'continuous' ? s.audio.startOffset : 0;
}

export function buildDropTimeline(s: Settings, hasMusic: boolean): DropTimeline | null {
  const d = s.drop;
  if (!d.enabled) return null;
  const off = musicOffset(s, hasMusic);
  const evs = d.events
    .map((ev) => ({ ev, T: ev.time - off }))
    .filter((p) => p.T > 0.3)
    .sort((a, b) => a.T - b.T);
  const points: DropPoint[] = [];
  for (let i = 0; i < evs.length; i++) {
    const { ev, T } = evs[i];
    const next = evs[i + 1];
    const latest = next ? next.T - Math.max(1, d.buildUp * 0.5) - d.transitionOut - 1 : Infinity;
    let R = ev.freeFor > 0 ? T + ev.freeFor : next ? latest : Infinity;
    if (R > latest) R = latest;
    if (R < T + 0.8) R = Math.min(T + 0.8, next ? next.T - 0.5 : Infinity);
    points.push({ ev, T, R });
  }
  const keys: [number, number][] = [[0, 0]];
  const push = (t: number, f: number) => {
    const last = keys[keys.length - 1];
    if (t <= last[0]) {
      if (t === last[0]) last[1] = f;
      return;
    }
    keys.push([t, f]);
  };
  for (const p of points) {
    const bStart = Math.max(keys[keys.length - 1][0], p.T - d.buildUp);
    push(bStart, 0);
    push(p.T, d.buildUp > 0 ? d.buildLevel : 0);
    push(p.T + Math.max(0.005, d.transitionIn), 1);
    if (Number.isFinite(p.R)) {
      push(p.R, 1);
      push(p.R + Math.max(0.05, d.transitionOut), 0);
    }
  }
  return { points, keys };
}

export function ambienceAt(tl: DropTimeline, t: number): number {
  const k = tl.keys;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, f0] = k[i - 1];
      const [t1, f1] = k[i];
      return f0 + ((f1 - f0) * (t - t0)) / (t1 - t0);
    }
  }
  return k[k.length - 1][1];
}

/** Facteur de ralenti (1 = vitesse normale) juste avant chaque drop. */
export function timeScaleAt(tl: DropTimeline | null, d: DropSettings, t: number): number {
  if (!tl || d.slowMo <= 0 || d.slowMoFactor >= 1) return 1;
  for (const p of tl.points) {
    const a = p.T - d.slowMo;
    if (t >= a && t < p.T) {
      const u = Math.min(1, (t - a) / (d.slowMo * 0.4));
      const sm = u * u * (3 - 2 * u);
      return 1 + (d.slowMoFactor - 1) * sm;
    }
  }
  return 1;
}

// ---- correspondance ambiance → paramètres audio ----
export function cutoffAt(d: DropSettings, f: number) {
  const lo = Math.max(80, Math.min(20000, d.calmCutoff));
  return lo * Math.pow(20000 / lo, f);
}
export const bassAt = (d: DropSettings, f: number) => d.calmBass + (d.afterBass - d.calmBass) * f;
export const volumeAt = (d: DropSettings, f: number) => d.calmVolume + (d.afterVolume - d.calmVolume) * f;

// ---- préréglages globaux ----
export const DROP_PRESETS: Record<DropIntensity, Partial<DropSettings>> = {
  soft: {
    calmVolume: 0.8, calmCutoff: 1400, calmBass: -6, afterVolume: 1, afterBass: 1, buildUp: 3, buildLevel: 0.3,
    transitionIn: 0.25, transitionOut: 1.5, slowMo: 0.3, slowMoFactor: 0.6, calmEffects: 0.55, calmColors: 0.35,
    afterEffects: 1.2, particles: 0.8, explosionSize: 0.8, flash: 0.4, shockwave: false, exitSpeed: 1200, trailBoost: 1.4,
  },
  power: {
    calmVolume: 0.7, calmCutoff: 700, calmBass: -10, afterVolume: 1, afterBass: 3, buildUp: 4, buildLevel: 0.35,
    transitionIn: 0.06, transitionOut: 1.2, slowMo: 0.5, slowMoFactor: 0.35, calmEffects: 0.35, calmColors: 0.55,
    afterEffects: 1.6, particles: 1.2, explosionSize: 1.1, flash: 0.8, shockwave: true, exitSpeed: 1600, trailBoost: 2,
  },
  extreme: {
    calmVolume: 0.6, calmCutoff: 450, calmBass: -14, afterVolume: 1.1, afterBass: 5, buildUp: 5, buildLevel: 0.4,
    transitionIn: 0.02, transitionOut: 0.8, slowMo: 0.7, slowMoFactor: 0.2, calmEffects: 0.25, calmColors: 0.7,
    afterEffects: 2.2, particles: 1.8, explosionSize: 1.5, flash: 1, shockwave: true, exitSpeed: 2100, trailBoost: 2.6,
  },
};

// ---- détection automatique ----
export interface DropCandidate {
  time: number; // secondes dans la musique (précision ~1 ms)
  score: number; // 0..1
}

export function detectDrops(a: MusicAnalysis, max = 3): DropCandidate[] {
  const fps = a.fps;
  const n = a.frames;
  if (n < fps * 6) return [];
  // énergie combinée lissée
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = a.energy[i] * 0.6 + a.bass[i] * 0.4;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + e[i];
  const mean = (i0: number, i1: number) => {
    i0 = Math.max(0, i0);
    i1 = Math.min(n, i1);
    return i1 > i0 ? (pre[i1] - pre[i0]) / (i1 - i0) : 0;
  };
  const before = Math.round(fps * 4);
  const after = Math.round(fps * 2);
  const scores = new Float32Array(n);
  for (let f = Math.round(fps * 3); f < n - fps; f++) {
    const p = mean(f - before, f - 3);
    const q = mean(f, f + after);
    if (q < 0.25) continue;
    scores[f] = q - p + (q > p ? 0.25 * (q - p) / Math.max(0.05, p) : 0);
  }
  // meilleurs maxima séparés d'au moins 8 s
  const order = Array.from(scores.keys()).filter((f) => scores[f] > 0.05).sort((x, y) => scores[y] - scores[x]);
  const picked: number[] = [];
  for (const f of order) {
    if (picked.every((g) => Math.abs(g - f) > fps * 8)) picked.push(f);
    if (picked.length >= max) break;
  }
  if (!picked.length) return [];
  const best = scores[picked[0]];
  return picked
    .map((f) => ({ time: refineOnset(a, f), score: Math.min(1, scores[f] / best) }))
    .sort((x, y) => x.time - y.time);
}

/** Affine l'instant à la montée d'amplitude la plus forte (±250 ms, fenêtres de 5 ms). */
function refineOnset(a: MusicAnalysis, frame: number): number {
  const rate = a.waveRate;
  const center = Math.round((frame / a.fps) * rate);
  const win = Math.max(8, Math.round(rate * 0.005));
  const span = Math.round(rate * 0.25);
  let bestI = center;
  let bestRise = -Infinity;
  const rms = (i: number) => {
    let s = 0;
    for (let k = 0; k < win; k++) {
      const v = a.wave[i + k] ?? 0;
      s += v * v;
    }
    return Math.sqrt(s / win);
  };
  for (let i = Math.max(win * 4, center - span); i < Math.min(a.wave.length - win, center + span); i += win) {
    const rise = rms(i) - (rms(i - win * 4) + rms(i - win * 3)) / 2;
    if (rise > bestRise) {
      bestRise = rise;
      bestI = i;
    }
  }
  return Math.round((bestI / rate) * 1000) / 1000;
}

export function formatTime(t: number) {
  const neg = t < 0;
  t = Math.abs(t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000) % 1000;
  return `${neg ? '-' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function parseTime(str: string): number | null {
  const m = str.trim().replace('.', ',').match(/^(?:(\d+):)?(\d+)(?:,(\d{1,3}))?$/);
  if (!m) return null;
  const ms = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
  return Number(m[1] ?? 0) * 60 + Number(m[2]) + ms / 1000;
}
