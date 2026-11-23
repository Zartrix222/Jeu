// Rendu Canvas 2D (aperçu, export et Web Worker via OffscreenCanvas).
// Coordonnées en unités « monde » (côté court = 1080), mises à l'échelle vers
// la taille réelle du canvas. La caméra s'applique à la scène, pas aux textes.

import { BANDS, frameAt } from './analysis';
import { INTENSITY } from './drop';
import { ringColor, type Ball, type Ring, type Simulation } from './sim';
import { TAU, angDiff, hexToRgb, hslToRgb, hueShift, mixRgb, rgbStr, type RGB } from './util';

type Ctx = CanvasRenderingContext2D;
export type Quality = 'performance' | 'balanced' | 'high';

export interface RenderOptions {
  quality?: Quality;
  prediction?: boolean; // trajectoire prédite (aperçu uniquement)
  selected?: number; // balle sélectionnée dans l'éditeur
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const Q = {
  performance: { rings: 140, particleStep: 2, dust: 60, post: false },
  balanced: { rings: 280, particleStep: 1, dust: 140, post: true },
  high: { rings: 2000, particleStep: 1, dust: 220, post: true },
};

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- canvas auxiliaires (bloom, flou de mouvement) ----------
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const aux = new WeakMap<object, { small: AnyCanvas; tiny: AnyCanvas; prev: AnyCanvas | null }>();
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function auxFor(ctx: Ctx) {
  let a = aux.get(ctx.canvas);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!a || a.small.width !== Math.max(1, Math.round(w / 6))) {
    a = { small: makeCanvas(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 6))), tiny: makeCanvas(Math.max(1, Math.round(w / 20)), Math.max(1, Math.round(h / 20))), prev: null };
    aux.set(ctx.canvas, a);
  }
  return a;
}

// ---------- image de fond ----------
const images = new Map<string, ImageBitmap | null>();
/** Charge l'image de fond (à attendre avant un export pour un rendu identique). */
export async function preloadBackground(url: string) {
  if (!url || images.get(url)) return;
  images.set(url, null);
  try {
    const blob = await (await fetch(url)).blob();
    images.set(url, await createImageBitmap(blob));
  } catch {
    images.delete(url);
  }
}
function bgImage(url: string) {
  if (!url) return null;
  if (!images.has(url)) void preloadBackground(url);
  return images.get(url) ?? null;
}

/** Découpe un cercle en arcs visibles (ouverture + trous). */
function arcsFor(gAng: number, gHalf: number, holes: [number, number][]): [number, number][] {
  const cuts: [number, number][] = [];
  const add = (c: number, h: number) => {
    if (h <= 0) return;
    if (h >= Math.PI) {
      cuts.push([0, TAU]);
      return;
    }
    let a0 = (((c - h) % TAU) + TAU) % TAU;
    const a1 = a0 + 2 * h;
    if (a1 > TAU) {
      cuts.push([a0, TAU]);
      cuts.push([0, a1 - TAU]);
    } else cuts.push([a0, a1]);
    a0 = 0;
  };
  add(gAng, gHalf);
  for (const [c, h] of holes) add(c, h);
  if (!cuts.length) return [[0, TAU]];
  cuts.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let pos = 0;
  for (const [a0, a1] of cuts) {
    if (a0 > pos + 1e-4) out.push([pos, a0]);
    pos = Math.max(pos, a1);
  }
  if (pos < TAU - 1e-4) out.push([pos, TAU]);
  // recolle l'arc qui traverse 0
  if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === TAU) {
    const last = out.pop()!;
    out[0] = [last[0], out[0][1] + TAU];
  }
  return out;
}

export function renderFrame(ctx: Ctx, sim: Simulation, cw: number, ch: number, opts: RenderOptions = {}) {
  const s = sim.s;
  const e = s.effects;
  const rs = s.rings;
  const t = sim.t;
  const q = Q[opts.quality ?? 'high'];
  const W = sim.W;
  const H = sim.H;
  const scale = Math.min(cw / W, ch / H);
  const ox = (cw - W * scale) / 2;
  const oy = (ch - H * scale) / 2;
  const react = e.musicReactive ? e.reactivity : 0;
  const bass = sim.bass;
  const drop = sim.tl ? s.drop : null;
  const amb = drop ? sim.ambience : 1;
  const fx = sim.fxMul;
  const ld = sim.lastDrop;
  const sinceDrop = ld ? t - ld.t : Infinity;
  const dynHue = drop && ld && ld.intensity === 'extreme' && sim.phase === 'free' ? sinceDrop * 140 : 0;
  const hueOff = (e.rainbow ? t * e.rainbowSpeed : 0) + dynHue + sim.beatHue + rs.colorCycle * t;
  const calmK = drop ? drop.calmColors * (1 - amb) : 0;
  const boostK = drop && ld ? Math.max(0, 1 - sinceDrop / 1.5) * INTENSITY[ld.intensity].boost : 0;
  const afterPal = drop && drop.afterPalette.length ? drop.afterPalette : null;
  const grade = (c: RGB): RGB => {
    if (calmK > 0) {
      const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      c = mixRgb(c, [l, l, l], calmK * 0.85);
      c = mixRgb(c, [0, 0, 0], calmK * 0.35);
    }
    if (boostK > 0) c = mixRgb(c, [255, 255, 255], Math.min(0.6, boostK * 0.35));
    return c;
  };
  const cx = sim.cx;
  const cy = sim.cy;

  // ---------------- fond (espace écran) ----------------
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = e.background;
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  drawBackground(ctx, sim, hueOff, react, q.post);

  // ---------------- caméra ----------------
  let sx = 0;
  let sy = 0;
  const shakeAmt = (sim.shake + (sim.tension > 0.6 ? (sim.tension - 0.6) * 0.15 : 0)) * s.camera.shake;
  if (shakeAmt > 0.01) {
    sx = Math.sin(t * 91.3) * shakeAmt * 14;
    sy = Math.cos(t * 77.7) * shakeAmt * 14;
  }
  const cam = sim.cam;
  const applyCamera = () => {
    ctx.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
    ctx.translate(cx, cy);
    if (cam.rot) ctx.rotate((cam.rot * Math.PI) / 180);
    if (cam.zoom !== 1) ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  };
  applyCamera();

  const alive = sim.alive;
  const th = rs.thickness;
  const maxR = (Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + th + 30) / Math.min(1, cam.zoom) + Math.hypot(cam.x - cx, cam.y - cy);
  const half = (rs.gap * Math.PI) / 360;
  const a = sim.analysis;
  const f = a && sim.musicActive ? frameAt(a, sim.musicTime) : -1;
  const live = alive.filter((r) => r.alive);

  // disque intérieur
  if (rs.innerDisc && live.length) {
    const dr = live[0].r - sim.ringTh(live[0]) / 2;
    ctx.fillStyle = rgbStr(mixRgb(hexToRgb(e.background), [0, 0, 0], 0.6), 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, dr), 0, TAU);
    ctx.fill();
  }

  // poussière scintillante
  if (e.innerDust && live.length && rs.innerDisc) {
    const dr = live[0].r - th / 2;
    const amount = Math.min(q.dust, (40 + sim.destroyed * 0.6) * Math.min(1.5, fx));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < amount; i++) {
      const h1 = hash(i);
      const h2 = hash(i + 1000);
      const ang = h1 * TAU + t * (0.05 + h2 * 0.1);
      const rr = dr * (0.55 + 0.42 * Math.sqrt(h2));
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (1.5 + h1 * 3) + i));
      const c = ringColor(s, Math.floor(h1 * 200), 0, hueOff);
      ctx.fillStyle = rgbStr(mixRgb(c, [255, 255, 255], 0.3), tw * 0.8);
      const sz = 1.5 + h2 * 2.5;
      ctx.fillRect(cx + Math.cos(ang) * rr - sz / 2, cy + Math.sin(ang) * rr - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------- anneaux ----------------
  const sparse = rs.spacing >= th * 2.5;
  const fade = e.hit.fade && rs.hitsToBreak > 0;
  const styles: { R: Ring; r: number; arcs: [number, number][]; rgb: RGB; th: number; alpha: number }[] = [];
  const visibleCount = Math.max(1, Math.min(live.length, Math.ceil((maxR - sim.innerRadius) / Math.max(0.5, rs.spacing))));
  for (let j = 0; j < live.length && styles.length < q.rings; j++) {
    const R = live[j];
    if (R.r - th > maxR) break;
    const custom = rs.custom[R.home]?.color;
    let rgb = custom ? hexToRgb(custom) : ringColor(s, R.idx, j, hueOff + R.hue);
    if (afterPal && amb > 0) rgb = mixRgb(rgb, ringColor({ ...s, rings: { ...rs, palette: afterPal } }, R.idx, j, hueOff), amb);
    const shift = (e.rainbow || dynHue ? hueOff : 0) + sim.beatHue + rs.colorCycle * t + R.hue;
    if (shift && (rs.colorMode !== 'rainbow' || custom)) rgb = hueShift(rgb, shift);
    rgb = grade(rgb);
    let lum = 0;
    let rr = R.r;
    if (react > 0) {
      if (f >= 0 && a) {
        const band = a.spectrum[f * BANDS + Math.min(BANDS - 1, Math.floor((j / visibleCount) * BANDS))] / 255;
        lum = band * 0.45 * react;
        rr += bass * react * 10 * Math.exp(-j * 0.04);
      } else {
        rr += sim.pulse * react * 4 * Math.exp(-j * 0.08);
        lum = sim.pulse * 0.25 * react * Math.exp(-j * 0.05);
      }
    }
    if (R.hitFlash > 0) lum = Math.max(lum, R.hitFlash * 0.8);
    if (lum > 0) rgb = mixRgb(rgb, [255, 255, 255], Math.min(0.85, lum));
    const [gAng, gDeg] = sim.ringGap(R);
    const arcs = arcsFor(gAng, (gDeg * Math.PI) / 360, R.holes);
    const alpha = fade ? Math.max(0.15, 1 - (R.hits / rs.hitsToBreak) * 0.85) : 1;
    styles.push({ R, r: Math.max(1, rr), arcs, rgb, th: sim.ringTh(R), alpha });
  }
  const strokeRing = (st: (typeof styles)[number], lw: number) => {
    ctx.lineWidth = lw;
    for (const [a0, a1] of st.arcs) {
      ctx.beginPath();
      const dent = st.R.dent;
      if (dent) {
        const age = t - dent.t0;
        const env = Math.exp(-age * 6) * Math.cos(age * 30);
        const steps = Math.max(8, Math.ceil(((a1 - a0) / TAU) * 120));
        for (let k = 0; k <= steps; k++) {
          const ang = a0 + ((a1 - a0) * k) / steps;
          const dd = angDiff(ang, dent.a) / 0.32;
          const r = st.r + dent.amp * env * Math.exp(-dd * dd);
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else ctx.arc(cx, cy, st.r, a0, a1);
      ctx.stroke();
    }
  };
  if (e.neon > 0 && sparse && styles.length) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const st of styles.slice(0, 120)) {
      ctx.strokeStyle = rgbStr(st.rgb, Math.min(0.4, 0.12 * e.neon * fx * st.alpha));
      strokeRing(st, st.th * 5);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.lineCap = sparse ? 'round' : 'butt';
  for (const st of styles) {
    ctx.strokeStyle = rgbStr(st.rgb, st.alpha);
    strokeRing(st, st.th);
  }
  if (rs.highlightInner && styles.length) {
    const st = styles[0];
    const white = mixRgb(st.rgb, [255, 255, 255], 0.75);
    if (e.neon > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(st.rgb, Math.min(0.6, 0.18 * e.neon * Math.max(fx, 0.4) + sim.tension * 0.35));
      strokeRing(st, st.th * 8 + 10 + sim.tension * 22);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = rgbStr(white, st.alpha);
    ctx.lineCap = 'round';
    strokeRing(st, Math.max(st.th * 1.6, 4));
  }

  // anneaux qui viennent de casser
  if (sim.ghosts.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const gh of sim.ghosts) {
      const p = (t - gh.t0) / (gh.fade ? 0.65 : 0.5);
      if (p < 0 || p > 1) continue;
      const rgb = mixRgb(ringColor(s, gh.idx, 0, hueOff), [255, 255, 255], 0.5 * (1 - p));
      ctx.strokeStyle = rgbStr(rgb, (1 - p) * (gh.fade ? 0.9 : 0.8));
      ctx.lineWidth = gh.fade ? th : th * (1 + p * 3);
      const gHalf = gh.fade ? 0 : half;
      ctx.beginPath();
      ctx.arc(cx, cy, gh.r + (gh.fade ? 0 : p * 40), gHalf > 0 ? gh.angle + gHalf : 0, gHalf > 0 ? gh.angle - gHalf + TAU : TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // fragments (style Shatter)
  if (sim.shards.length) {
    ctx.lineCap = 'round';
    for (const sh of sim.shards) {
      const p = (t - sh.t0) / sh.life;
      ctx.strokeStyle = rgbStr(grade(mixRgb(ringColor(s, sh.idx, 0, hueOff), [255, 255, 255], 0.3 * (1 - p))), Math.max(0, 1 - p));
      ctx.lineWidth = sh.th * (1 - p * 0.5);
      ctx.beginPath();
      ctx.arc(cx, cy, sh.r, sh.a0, sh.a1);
      ctx.stroke();
    }
  }

  // montée : fissures lumineuses qui grandissent
  const up = sim.upcoming;
  if (drop && sim.phase === 'calm' && styles.length && up) {
    const crackU = t >= sim.crackFrom && t < sim.crackT ? (t - sim.crackFrom) / (sim.crackT - sim.crackFrom) : 0;
    const u = Math.max(crackU, sim.tension > 0.5 ? (sim.tension - 0.5) * 0.8 : 0);
    if (u > 0) drawCracks(ctx, cx, cy, styles[0].r, crackU > 0 ? sim.exitAngle : sim.exitAngle + t * 0.2, u, crackU > 0 ? 7 : 4);
  }

  // portail
  if (sim.portal && styles.length) {
    const p = t - sim.portal.t0;
    const R0 = sim.innerRadius;
    const px = cx + Math.cos(sim.portal.angle) * R0;
    const py = cy + Math.sin(sim.portal.angle) * R0;
    const grow = Math.min(1, p / 0.35);
    const alpha = Math.max(0, 1 - Math.max(0, p - 2) / 1.5);
    if (alpha > 0) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(sim.portal.angle);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = rgbStr(hslToRgb(260 + k * 25 + t * 120, 1, 0.6), alpha * (0.8 - k * 0.12));
        ctx.lineWidth = 10 - k * 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, (40 + k * 10) * grow, (120 + k * 18) * grow, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ondes locales des collisions
  if (sim.hitWaves.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const w of sim.hitWaves) {
      const p = (t - w.t0) / 0.5;
      if (p < 0 || p > 1) continue;
      ctx.strokeStyle = `rgba(255,255,255,${((1 - p) * 0.7 * Math.min(1, w.strength)).toFixed(3)})`;
      ctx.lineWidth = 3 + (1 - p) * 8 * w.strength;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 10 + p * 170 * w.strength, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ondes de choc du drop
  if (sim.shockwaves.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const sw of sim.shockwaves) {
      const p = (t - sw.t0) / 1.1;
      if (p < 0 || p > 1) continue;
      const ease = 1 - (1 - p) * (1 - p);
      const rr = sim.innerRadius + ease * 1500 * sw.strength;
      ctx.strokeStyle = `rgba(255,255,255,${((1 - p) * 0.85).toFixed(3)})`;
      ctx.lineWidth = (1 - p) * 34 * sw.strength + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgbStr(grade(ringColor(s, 0, 0, hueOff)), (1 - p) * 0.5);
      ctx.lineWidth = (1 - p) * 90 * sw.strength + 4;
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 0.94, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // supernova
  for (const nv of sim.novas) {
    const p = (t - nv.t0) / 1.6;
    if (p < 0 || p > 1) continue;
    const rr = 80 + (1 - Math.pow(1 - p, 3)) * 1700 * nv.strength;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, `rgba(255,255,255,${(0.95 * (1 - p)).toFixed(3)})`);
    g.addColorStop(0.35, `rgba(255,220,120,${(0.6 * (1 - p)).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(255,90,40,${(0.25 * (1 - p)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (sim.finished && e.endVisualizer) drawEndVisualizer(ctx, sim, hueOff);

  // particules
  if (sim.particles.length) {
    ctx.globalCompositeOperation = 'lighter';
    const ps = sim.particles;
    for (let i = 0; i < ps.length; i += q.particleStep) {
      const p = ps[i];
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.4 * Math.min(1.2, fx));
      p.css ??= rgbStr(mixRgb(p.rgb, [255, 255, 255], 0.25));
      ctx.fillStyle = p.css;
      const sz = p.size * (0.5 + 0.5 * k) * (q.particleStep > 1 ? 1.3 : 1);
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // trajectoire prédite (aperçu)
  if (opts.prediction || s.balls.prediction) drawPrediction(ctx, sim);

  // balles
  sim.balls.forEach((b, i) => drawBall(ctx, sim, b, i, { hueOff, dynHue, calmK, react, bass, fx, selected: opts.selected === i }));

  // ---------------- textes (sans caméra) ----------------
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  const c = s.counter;
  let label = c.mode === 'none' ? '' : c.text.replace(/\{n\}/g, sim.counterValue());
  if (sim.finished && c.endText) label = c.endText;
  if (label) {
    const pop = 1 + Math.min(0.12, sim.pulse * 0.06);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop * Math.min(1.3, cam.zoom), pop * Math.min(1.3, cam.zoom));
    ctx.font = `800 ${c.size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = c.size * 0.08;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeText(label, 0, 4);
    ctx.fillStyle = c.color;
    ctx.fillText(label, 0, 4);
    ctx.restore();
  }
  const caption = (text: string, size: number, y: number) => {
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wrap(ctx, text, W - 140).forEach((ln, i) => {
      const yy = y + i * size * 1.15;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(ln, W / 2, yy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ln, W / 2, yy);
    });
  };
  if (c.title) caption(c.title, c.titleSize, Math.min(230, H * 0.12));
  if (c.bottomText) caption(c.bottomText, c.titleSize * 0.8, H - Math.min(260, H * 0.14));

  // passage au noir (style Blackout)
  if (drop && up && up.ev.style === 'blackout' && sim.phase === 'calm') {
    const k = Math.max(0, Math.min(1, 1 - (up.T - t) / Math.max(0.05, drop.blackout)));
    if (k > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(0,0,0,${(0.94 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (e.vignette > 0) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(0.85 * e.vignette).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  // ---------------- post-traitements ----------------
  if (q.post && (e.bloom > 0 || e.motionBlur > 0)) {
    const A = auxFor(ctx);
    if (e.bloom > 0) {
      const sc = A.small.getContext('2d') as Ctx;
      const tc = A.tiny.getContext('2d') as Ctx;
      sc.globalCompositeOperation = 'copy';
      sc.drawImage(ctx.canvas, 0, 0, A.small.width, A.small.height);
      tc.globalCompositeOperation = 'copy';
      tc.drawImage(A.small, 0, 0, A.tiny.width, A.tiny.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = Math.min(1, e.bloom * 0.55 * (opts.quality === 'balanced' ? 0.8 : 1));
      ctx.drawImage(A.small, 0, 0, cw, ch);
      ctx.globalAlpha = Math.min(1, e.bloom * 0.45);
      ctx.drawImage(A.tiny, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.motionBlur > 0) {
      if (!A.prev || A.prev.width !== cw || A.prev.height !== ch) A.prev = makeCanvas(cw, ch);
      else {
        ctx.globalAlpha = Math.min(0.85, e.motionBlur);
        ctx.drawImage(A.prev, 0, 0);
        ctx.globalAlpha = 1;
      }
      const pc = A.prev.getContext('2d') as Ctx;
      pc.globalCompositeOperation = 'copy';
      pc.drawImage(ctx.canvas, 0, 0);
    }
  }

  if (sim.flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${(sim.flash * 0.3).toFixed(3)})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// =================== fonds ===================

function drawBackground(ctx: Ctx, sim: Simulation, hueOff: number, react: number, rich: boolean) {
  const s = sim.s;
  const e = s.effects;
  const W = sim.W;
  const H = sim.H;
  const t = sim.t;
  const cx = sim.cx;
  const cy = sim.cy;
  const bass = sim.bass;
  const mode = e.bgMode;
  if (mode === 'image') {
    const img = bgImage(e.bgImage);
    if (img) {
      const k = Math.max(W / img.width, H / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      ctx.fillStyle = `rgba(0,0,0,${e.bgDim.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (mode === 'animated') {
    const c2 = hueShift(hexToRgb(e.background2), hueOff * 0.3);
    for (let k = 0; k < 2; k++) {
      const x = W / 2 + Math.cos(t * 0.3 + k * 3) * W * 0.35;
      const y = H / 2 + Math.sin(t * 0.23 + k * 2) * H * 0.3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.7);
      g.addColorStop(0, rgbStr(k ? c2 : hueShift(hexToRgb(e.backgroundGlow), hueOff), 0.8));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (mode !== 'solid' && mode !== 'image') {
    const glowRgb = hueShift(hexToRgb(e.backgroundGlow), hueOff);
    const glowR = 1100 * (1 + bass * 0.25 * react);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    g.addColorStop(0, rgbStr(glowRgb, Math.min(1, 0.9 + bass * 0.3 * react)));
    g.addColorStop(1, rgbStr(glowRgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-50, -50, W + 100, H + 100);
  }
  if (mode === 'stars') {
    const n = rich ? 260 : 130;
    const boost = sim.lastDrop?.style === 'galaxy' ? 1 + Math.max(0, 1.5 - (t - sim.lastDrop.t)) : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const depth = 0.2 + hash(i + 50) * 0.8;
      const x = ((hash(i) * W * 1.2 - (sim.cam.x - cx) * depth * 0.3 + t * 6 * depth) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
      const y = hash(i + 99) * H * 1.1 - (sim.cam.y - cy) * depth * 0.3 - H * 0.05;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.7 + hash(i + 7) * 2) + i));
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, tw * depth * boost).toFixed(3)})`;
      const sz = (1 + depth * 2.6) * (1 + bass * 0.4 * react);
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (mode === 'tunnel') {
    ctx.globalCompositeOperation = 'lighter';
    const speed = 0.6 + bass * react * 0.8 + (sim.phase === 'free' && sim.tl ? 0.8 : 0);
    const n = rich ? 28 : 16;
    for (let k = 0; k < n; k++) {
      const z = (k + ((t * speed) % 1)) / n;
      const r = 30 * Math.pow(70, z);
      const rgb = ringColor(s, k * 7, k, hueOff + t * 30);
      ctx.strokeStyle = rgbStr(rgb, Math.min(0.35, z * 0.5) * (1 - z * 0.6));
      ctx.lineWidth = 1 + z * 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// =================== balles ===================

interface BallCtx {
  hueOff: number;
  dynHue: number;
  calmK: number;
  react: number;
  bass: number;
  fx: number;
  selected: boolean;
}

function drawBall(ctx: Ctx, sim: Simulation, b: Ball, i: number, o: BallCtx) {
  const s = sim.s;
  const bs = s.balls;
  const p = sim.ballProps(b.pi);
  const drop = sim.tl ? s.drop : null;
  let rgb = sim.ballRgb(b, i);
  if ((s.effects.rainbow || o.dynHue) && p.colorMode === 'solid') rgb = hueShift(rgb, o.hueOff);
  if (sim.beatHue && p.colorMode === 'solid' && s.audio.map.beatColor) rgb = hueShift(rgb, sim.beatHue);
  if (o.calmK > 0) rgb = mixRgb(rgb, [200, 200, 200], o.calmK * 0.3);
  if (b.hitFlash > 0 && s.effects.hit.colorShift > 0) rgb = mixRgb(rgb, [255, 255, 255], b.hitFlash * 0.5 * s.effects.hit.colorShift);
  const t = sim.t;
  ctx.globalAlpha = Math.max(0.05, Math.min(1, p.opacity));

  // traînée
  ctx.globalCompositeOperation = 'lighter';
  if ((bs.trail || (drop && sim.phase === 'free')) && b.trail.length >= 4) {
    const n = b.trail.length / 2;
    if (bs.trailStyle === 'line') {
      ctx.lineCap = 'round';
      for (let k = 1; k < n; k++) {
        const fr = k / n;
        ctx.strokeStyle = rgbStr(p.style === 'fire' ? hslToRgb(10 + fr * 40, 1, 0.55) : rgb, fr * 0.7);
        ctx.lineWidth = b.r * 1.4 * fr;
        ctx.beginPath();
        ctx.moveTo(b.trail[(k - 1) * 2], b.trail[(k - 1) * 2 + 1]);
        ctx.lineTo(b.trail[k * 2], b.trail[k * 2 + 1]);
        ctx.stroke();
      }
    } else if (bs.trailStyle === 'ghost') {
      for (let k = 0; k < n; k += 2) {
        const fr = k / n;
        ctx.strokeStyle = rgbStr(rgb, fr * 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(b.trail[k * 2], b.trail[k * 2 + 1], b.r, 0, TAU);
        ctx.stroke();
      }
    } else {
      for (let k = 0; k < n; k++) {
        const fr = (k + 1) / n;
        const c = p.style === 'fire' ? hslToRgb(5 + fr * 45, 1, 0.5 + fr * 0.15) : p.style === 'rainbow' ? hslToRgb(t * 140 + k * 12, 1, 0.6) : rgb;
        ctx.fillStyle = rgbStr(c, fr * fr * 0.55);
        ctx.beginPath();
        ctx.arc(b.trail[k * 2], b.trail[k * 2 + 1], b.r * (0.2 + 0.8 * fr), 0, TAU);
        ctx.fill();
      }
    }
  }
  // halo
  const glow = p.style === 'minimal' || p.style === 'metal' ? 0 : p.style === 'neon' ? Math.max(0.8, bs.glow) : bs.glow;
  if (glow > 0) {
    const gr = b.r * (2 + glow * 2.6 + o.bass * o.react + (drop ? (o.fx - 1) * 1.2 + sim.tension * 1.5 : 0));
    const gg = ctx.createRadialGradient(b.x, b.y, b.r * 0.4, b.x, b.y, Math.max(b.r, gr));
    gg.addColorStop(0, rgbStr(rgb, Math.min(0.9, 0.6 * glow * (drop ? Math.max(0.5, o.fx) : 1))));
    gg.addColorStop(1, rgbStr(rgb, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(b.x, b.y, gr, 0, TAU);
    ctx.fill();
  }
  // flammes stylisées (derrière la balle)
  if (p.style === 'fire') {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const dx = -b.vx / sp;
    const dy = -b.vy / sp;
    for (let k = 0; k < 3; k++) {
      const flick = 0.7 + 0.3 * Math.sin(t * 40 + k * 2.1 + i);
      const len = b.r * (1.8 + k * 0.5) * flick;
      const wob = Math.sin(t * 23 + k) * 0.35;
      const nx = -dy;
      const ny = dx;
      ctx.fillStyle = rgbStr(hslToRgb(10 + k * 18, 1, 0.55), 0.55 - k * 0.12);
      ctx.beginPath();
      ctx.moveTo(b.x + nx * b.r * 0.9, b.y + ny * b.r * 0.9);
      ctx.quadraticCurveTo(b.x + dx * len * 0.6 + nx * b.r * wob, b.y + dy * len * 0.6 + ny * b.r * wob, b.x + dx * len, b.y + dy * len);
      ctx.quadraticCurveTo(b.x + dx * len * 0.6 - nx * b.r * wob, b.y + dy * len * 0.6 - ny * b.r * wob, b.x - nx * b.r * 0.9, b.y - ny * b.r * 0.9);
      ctx.fill();
    }
  }
  // arcs électriques
  if (p.style === 'electric') {
    ctx.strokeStyle = rgbStr(mixRgb(rgb, [255, 255, 255], 0.6), 0.9);
    ctx.lineWidth = 2;
    const seed = Math.floor(t * 24);
    for (let k = 0; k < 4; k++) {
      let a = hash(seed * 7 + k + i * 13) * TAU;
      let r = b.r * 1.05;
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      for (let q = 0; q < 5; q++) {
        r += b.r * 0.22;
        a += (hash(seed + k * 5 + q) - 0.5) * 0.9;
        ctx.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // corps
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, TAU);
  switch (p.style) {
    case 'minimal':
      ctx.fillStyle = rgbStr(rgb);
      ctx.fill();
      break;
    case 'neon':
      ctx.fillStyle = rgbStr(mixRgb(rgb, [0, 0, 0], 0.75));
      ctx.fill();
      ctx.strokeStyle = rgbStr(mixRgb(rgb, [255, 255, 255], 0.35));
      ctx.lineWidth = Math.max(3, b.r * 0.32);
      ctx.stroke();
      break;
    case 'metal': {
      const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.05, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, rgbStr(mixRgb(rgb, [210, 215, 225], 0.7)));
      g.addColorStop(0.75, rgbStr(mixRgb(rgb, [70, 75, 90], 0.7)));
      g.addColorStop(1, '#15171c');
      ctx.fillStyle = g;
      ctx.fill();
      break;
    }
    case 'rainbow': {
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, b.angle + (k / 6) * TAU, b.angle + ((k + 1) / 6) * TAU);
        ctx.closePath();
        ctx.fillStyle = rgbStr(hslToRgb(k * 60 + t * 90, 1, 0.6));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
      break;
    }
    default: {
      const inner = bs.gradient ? hexToRgb(p.color2) : mixRgb(rgb, [255, 255, 255], 0.2);
      const body = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
      body.addColorStop(0, p.style === 'fire' ? '#fff6c0' : '#ffffff');
      body.addColorStop(0.45, rgbStr(bs.gradient ? rgb : inner));
      body.addColorStop(1, rgbStr(bs.gradient ? inner : mixRgb(rgb, [0, 0, 0], 0.35)));
      ctx.fillStyle = body;
      ctx.fill();
    }
  }
  if (bs.outline > 0) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.strokeStyle = bs.outlineColor;
    ctx.lineWidth = bs.outline;
    ctx.stroke();
  }
  if (bs.spin || p.style === 'metal') {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, b.r * 0.12);
    ctx.beginPath();
    ctx.moveTo(b.x + Math.cos(b.angle) * b.r * 0.85, b.y + Math.sin(b.angle) * b.r * 0.85);
    ctx.lineTo(b.x - Math.cos(b.angle) * b.r * 0.85, b.y - Math.sin(b.angle) * b.r * 0.85);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (o.selected) {
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 14, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// =================== trajectoire prédite ===================

function drawPrediction(ctx: Ctx, sim: Simulation) {
  const s = sim.s;
  const g = s.balls.gravity;
  const R = sim.alive[0];
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const b of sim.balls.slice(0, 3)) {
    let x = b.x;
    let y = b.y;
    let vx = b.vx;
    let vy = b.vy;
    const dt = 1 / 60;
    for (let k = 0; k < 72; k++) {
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      if (R) {
        const dx = x - sim.cx;
        const dy = y - sim.cy;
        const d = Math.hypot(dx, dy);
        const lim = R.r - sim.ringTh(R) / 2 - b.r;
        if (d > lim && Math.hypot(b.x - sim.cx, b.y - sim.cy) < lim + 1) {
          const nx = dx / d;
          const ny = dy / d;
          x = sim.cx + nx * lim;
          y = sim.cy + ny * lim;
          const vn = vx * nx + vy * ny;
          if (vn > 0) {
            vx -= (1 + s.balls.bounce) * vn * nx;
            vy -= (1 + s.balls.bounce) * vn * ny;
          }
        }
      }
      if (k % 3 === 0) {
        ctx.globalAlpha = 1 - k / 72;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawCracks(ctx: Ctx, cx: number, cy: number, R0: number, angle: number, u: number, count: number) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.65 * u).toFixed(3)})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let k = 0; k < count; k++) {
    let a = angle + (hash(k + 7) - 0.5) * (count > 4 ? 0.25 : 2.5);
    let rr = R0 - 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    const len = (30 + hash(k) * 90) * u;
    for (let q = 1; q <= 4; q++) {
      rr += ((k % 2 ? 1 : -1) * len) / 4;
      a += (hash(k * 13 + q) - 0.5) * 0.12;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.stroke();
  }
  if (count > 4) {
    const px = cx + Math.cos(angle) * R0;
    const py = cy + Math.sin(angle) * R0;
    const g2 = ctx.createRadialGradient(px, py, 0, px, py, 90);
    g2.addColorStop(0, `rgba(255,255,255,${(0.5 * u).toFixed(3)})`);
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(px - 90, py - 90, 180, 180);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function wrap(ctx: Ctx, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawEndVisualizer(ctx: Ctx, sim: Simulation, hueOff: number) {
  const s = sim.s;
  const a = sim.analysis;
  const t = sim.t;
  const p = Math.min(1, (t - (sim.finishedAt ?? t)) / 0.8);
  const cx = sim.cx;
  const cy = sim.cy;
  const N = 120;
  const r0 = 230;
  const f = a && sim.musicActive ? frameAt(a, sim.musicTime) : -1;
  ctx.globalAlpha = p;
  ctx.lineCap = 'butt';
  ctx.lineWidth = 7;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i++) {
    const m = Math.abs(((i + N / 4) % N) - N / 2) / (N / 2);
    let v: number;
    if (f >= 0 && a) {
      const band = Math.min(BANDS - 1, Math.floor(m * (BANDS - 1)));
      v = a.spectrum[f * BANDS + band] / 255;
    } else {
      v = 0.25 + 0.6 * Math.abs(Math.sin(t * 2.3 + i * 0.37) * Math.sin(t * 1.3 + i * 0.11)) * (0.5 + sim.pulse);
    }
    const ang = (i / N) * TAU - Math.PI / 2;
    const len = 20 + v * 330 * p;
    const rgb = ringColor(s, Math.floor((i / N) * Math.max(1, s.rings.bandSize) * 2), i, hueOff);
    ctx.strokeStyle = rgbStr(mixRgb(rgb, [255, 255, 255], 0.15), 0.9);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const M = 160;
  for (let i = 0; i <= M; i++) {
    const ang = (i / M) * TAU;
    let w = 0;
    if (a && sim.musicActive) {
      const idx = Math.floor(sim.musicTime * a.waveRate) + (i % M) * 6;
      w = a.wave[Math.min(a.wave.length - 1, Math.max(0, idx))] * 2.2;
    } else {
      w = Math.sin(i * 0.9 + t * 9) * 0.08 * (0.4 + sim.pulse) + Math.sin(i * 2.3 - t * 5) * 0.05;
    }
    const rr = r0 - 40 + Math.max(-1, Math.min(1, w)) * 50;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
