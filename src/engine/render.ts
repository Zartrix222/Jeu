// Rendu Canvas 2D. Toutes les coordonnées sont en unités « monde » 1080x1920,
// mises à l'échelle vers la taille réelle du canvas (aperçu ou export).

import { BANDS, frameAt } from './analysis';
import { ringColor, type Simulation } from './sim';
import { WORLD_H, WORLD_W } from './types';
import { TAU, hexToRgb, hueShift, mixRgb, rgbStr, type RGB } from './util';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function renderFrame(ctx: CanvasRenderingContext2D, sim: Simulation, cw: number, ch: number) {
  const s = sim.s;
  const e = s.effects;
  const rs = s.rings;
  const t = sim.t;
  const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
  const ox = (cw - WORLD_W * scale) / 2;
  const oy = (ch - WORLD_H * scale) / 2;
  const react = e.musicReactive ? e.reactivity : 0;
  const bass = sim.bass;
  const hueOff = e.rainbow ? t * e.rainbowSpeed : 0;
  const cx = sim.cx;
  const cy = sim.cy;

  // fond
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = e.background;
  ctx.fillRect(0, 0, cw, ch);

  let sx = 0;
  let sy = 0;
  if (sim.shake > 0.01) {
    sx = Math.sin(t * 91.3) * sim.shake * 14;
    sy = Math.cos(t * 77.7) * sim.shake * 14;
  }
  ctx.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);

  const glowRgb = hueShift(hexToRgb(e.backgroundGlow), hueOff);
  const glowR = 1100 * (1 + bass * 0.25 * react);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  g.addColorStop(0, rgbStr(glowRgb, Math.min(1, 0.9 + bass * 0.3 * react)));
  g.addColorStop(1, rgbStr(glowRgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-50, -50, WORLD_W + 100, WORLD_H + 100);

  const alive = sim.alive;
  const th = rs.thickness;
  const maxR = Math.hypot(Math.max(cx, WORLD_W - cx), Math.max(cy, WORLD_H - cy)) + th + 30;
  const half = (rs.gap * Math.PI) / 360;
  const a = sim.analysis;
  const f = a && sim.musicActive ? frameAt(a, sim.musicTime) : -1;

  // disque intérieur
  const live = alive.filter((r) => r.alive);
  if (rs.innerDisc && live.length) {
    const dr = live[0].r - th / 2;
    ctx.fillStyle = rgbStr(mixRgb(hexToRgb(e.background), [0, 0, 0], 0.6), 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, dr), 0, TAU);
    ctx.fill();
  }

  // poussière scintillante dans le disque
  if (e.innerDust && live.length && rs.innerDisc) {
    const dr = live[0].r - th / 2;
    const amount = Math.min(220, 40 + sim.destroyed * 0.6);
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

  // anneaux
  const sparse = rs.spacing >= th * 2.5;
  const ringStyles: { r: number; a0: number; a1: number; rgb: RGB; lum: number }[] = [];
  for (let j = 0; j < live.length; j++) {
    const R = live[j];
    if (R.r - th > maxR) break;
    let rgb = ringColor(s, R.idx, j, hueOff);
    if (e.rainbow && rs.colorMode !== 'rainbow') rgb = hueShift(rgb, hueOff);
    let lum = 0;
    let rr = R.r;
    if (react > 0) {
      if (f >= 0 && a) {
        const visible = Math.max(1, Math.min(live.length, Math.ceil((maxR - rs.innerRadius) / Math.max(0.5, rs.spacing))));
        const band = a.spectrum[f * BANDS + Math.min(BANDS - 1, Math.floor((j / visible) * BANDS))] / 255;
        lum = band * 0.45 * react;
        rr += bass * react * 10 * Math.exp(-j * 0.04);
      } else {
        rr += sim.pulse * react * 4 * Math.exp(-j * 0.08);
        lum = sim.pulse * 0.25 * react * Math.exp(-j * 0.05);
      }
    }
    if (R.hitFlash > 0) lum = Math.max(lum, R.hitFlash * 0.8);
    if (lum > 0) rgb = mixRgb(rgb, [255, 255, 255], Math.min(0.85, lum));
    const a0 = half > 0 ? R.angle + half : 0;
    const a1 = half > 0 ? R.angle - half + TAU : TAU;
    ringStyles.push({ r: Math.max(1, rr), a0, a1, rgb, lum });
  }

  // halo néon (seulement pour des anneaux espacés, sinon c'est déjà plein)
  if (e.neon > 0 && sparse && ringStyles.length) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const st of ringStyles.slice(0, 120)) {
      ctx.strokeStyle = rgbStr(st.rgb, 0.12 * e.neon);
      ctx.lineWidth = th * 5;
      ctx.beginPath();
      ctx.arc(cx, cy, st.r, st.a0, st.a1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.lineWidth = th;
  ctx.lineCap = sparse ? 'round' : 'butt';
  for (const st of ringStyles) {
    ctx.strokeStyle = rgbStr(st.rgb);
    ctx.beginPath();
    ctx.arc(cx, cy, st.r, st.a0, st.a1);
    ctx.stroke();
  }

  // cercle intérieur brillant
  if (rs.highlightInner && ringStyles.length) {
    const st = ringStyles[0];
    const white = mixRgb(st.rgb, [255, 255, 255], 0.75);
    ctx.globalCompositeOperation = 'lighter';
    if (e.neon > 0) {
      ctx.strokeStyle = rgbStr(st.rgb, 0.18 * e.neon);
      ctx.lineWidth = th * 8 + 10;
      ctx.beginPath();
      ctx.arc(cx, cy, st.r, st.a0, st.a1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgbStr(white);
    ctx.lineWidth = Math.max(th * 1.6, 4);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, st.r, st.a0, st.a1);
    ctx.stroke();
  }

  // anneaux qui viennent de casser
  if (sim.ghosts.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const gh of sim.ghosts) {
      const p = (t - gh.t0) / 0.5;
      if (p < 0 || p > 1) continue;
      const rgb = mixRgb(ringColor(s, gh.idx, 0, hueOff), [255, 255, 255], 0.5 * (1 - p));
      ctx.strokeStyle = rgbStr(rgb, (1 - p) * 0.8);
      ctx.lineWidth = th * (1 + p * 3);
      ctx.beginPath();
      ctx.arc(cx, cy, gh.r + p * 40, half > 0 ? gh.angle + half : 0, half > 0 ? gh.angle - half + TAU : TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // visualiseur de fin
  if (sim.finished && e.endVisualizer) drawEndVisualizer(ctx, sim, hueOff);

  // particules
  if (sim.particles.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of sim.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      p.css ??= rgbStr(mixRgb(p.rgb, [255, 255, 255], 0.25));
      ctx.fillStyle = p.css;
      const sz = p.size * (0.5 + 0.5 * k);
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // balles
  const bs = s.balls;
  sim.balls.forEach((b, i) => {
    let rgb = sim.ballRgb(b, i);
    if (e.rainbow && bs.colorMode === 'solid') rgb = hueShift(rgb, hueOff);
    ctx.globalCompositeOperation = 'lighter';
    if (bs.trail && b.trail.length >= 4) {
      const n = b.trail.length / 2;
      if (bs.trailStyle === 'line') {
        ctx.lineCap = 'round';
        for (let k = 1; k < n; k++) {
          const fr = k / n;
          ctx.strokeStyle = rgbStr(rgb, fr * 0.7);
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
          ctx.fillStyle = rgbStr(rgb, fr * fr * 0.55);
          ctx.beginPath();
          ctx.arc(b.trail[k * 2], b.trail[k * 2 + 1], b.r * (0.2 + 0.8 * fr), 0, TAU);
          ctx.fill();
        }
      }
    }
    if (bs.glow > 0) {
      const gr = b.r * (2 + bs.glow * 2.6 + bass * react);
      const gg = ctx.createRadialGradient(b.x, b.y, b.r * 0.4, b.x, b.y, gr);
      gg.addColorStop(0, rgbStr(rgb, 0.6 * bs.glow));
      gg.addColorStop(1, rgbStr(rgb, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, gr, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1, b.x, b.y, b.r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.45, rgbStr(mixRgb(rgb, [255, 255, 255], 0.2)));
    body.addColorStop(1, rgbStr(mixRgb(rgb, [0, 0, 0], 0.35)));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  });

  // textes
  const c = s.counter;
  let label = c.mode === 'none' ? '' : c.text.replace(/\{n\}/g, sim.counterValue());
  if (sim.finished && c.endText) label = c.endText;
  if (label) {
    const pop = 1 + Math.min(0.12, sim.pulse * 0.06);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
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
  if (c.title) {
    ctx.font = `800 ${c.titleSize}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrap(ctx, c.title, WORLD_W - 140);
    lines.forEach((ln, i) => {
      const y = 230 + i * c.titleSize * 1.15;
      ctx.lineJoin = 'round';
      ctx.lineWidth = c.titleSize * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(ln, cx, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ln, cx, y);
    });
  }

  if (sim.flash > 0.01) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${(sim.flash * 0.3).toFixed(3)})`;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
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

function drawEndVisualizer(ctx: CanvasRenderingContext2D, sim: Simulation, hueOff: number) {
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
    const m = Math.abs(((i + N / 4) % N) - N / 2) / (N / 2); // symétrie gauche/droite
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
  // forme d'onde circulaire
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
