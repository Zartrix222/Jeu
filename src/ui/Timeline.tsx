import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicAnalysis } from '../engine/analysis';
import { ambienceAt, formatTime, type DropCandidate, type DropTimeline } from '../engine/drop';

export interface Marker {
  id: string;
  time: number; // temps musique
  kind: 'drop' | 'cam';
  color: string;
}

interface Props {
  analysis: MusicAnalysis | null;
  duration: number;
  offset: number; // temps musique = temps simulation + offset
  tl: DropTimeline | null;
  markers: Marker[];
  candidates: DropCandidate[];
  playhead: number;
  selected: string | null;
  buildUp: number;
  compact?: boolean;
  onSeek: (t: number) => void;
  onSelect: (m: Marker) => void;
  onMove: (m: Marker, t: number) => void;
}

const LANE = 30;
const RULER = 16;
const STRIP = 10;
const SECT = 8;
const ZOOMS = [1, 2, 4, 8, 16, 32];
const SECTION_COLORS: Record<string, string> = {
  calm: 'rgba(90,120,255,0.55)',
  buildup: 'rgba(255,200,60,0.75)',
  peak: 'rgba(255,80,120,0.7)',
  transition: 'rgba(255,255,255,0.6)',
  tempo: 'rgba(80,255,200,0.7)',
};

export const STYLE_COLORS: Record<string, string> = {
  pass: '#ff4fd8',
  open: '#4fd1ff',
  explode: '#ff7a2b',
  vanish: '#b6a8ff',
  chain: '#ffd23f',
  supernova: '#fff07a',
  portal: '#9b6bff',
  shatter: '#ff5a6a',
  shockwave: '#ffffff',
  infinity: '#3dffb0',
  galaxy: '#6ab8ff',
  neonburst: '#ff3df2',
  blackout: '#8a8a99',
};

export function Timeline(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(320);
  const [zoomI, setZoomI] = useState(0);
  const [drag, setDrag] = useState<{ m: Marker; t: number } | null>(null);
  const H = p.compact ? 92 : 150;
  const zoom = ZOOMS[zoomI];
  const W = Math.round(width * zoom);
  const dur = Math.max(1, p.duration);
  const xOf = (t: number) => (t / dur) * W;
  const tOf = (x: number) => Math.max(0, Math.min(dur, (x / W) * dur));

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const peaks = useMemo(() => {
    const a = p.analysis;
    if (!a) return null;
    const out = new Float32Array(W * 2);
    const per = a.wave.length / (a.duration / dur) / W;
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor(x * per);
      const i1 = Math.min(a.wave.length, Math.max(i0 + 1, Math.floor((x + 1) * per)));
      let mn = 0;
      let mx = 0;
      const stride = Math.max(1, Math.floor((i1 - i0) / 200));
      for (let i = i0; i < i1; i += stride) {
        const v = a.wave[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      out[x * 2] = mn;
      out[x * 2 + 1] = mx;
    }
    return out;
  }, [p.analysis, W, dur]);

  const markers = useMemo(
    () => p.markers.map((m) => (drag && drag.m.id === m.id ? { ...m, time: drag.t } : m)),
    [p.markers, drag],
  );
  const markersKey = JSON.stringify(markers);
  const candKey = JSON.stringify(p.candidates.map((c) => [c.time, c.certain]));

  // (re)dessin uniquement quand le contenu change (pas à chaque mise à jour de la tête de lecture)
  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1, 12000 / W);
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0912';
    ctx.fillRect(0, 0, W, H);
    const top = LANE;
    const bottom = H - RULER - STRIP - SECT;
    const mid = (top + bottom) / 2;
    const amp = (bottom - top) / 2 - 2;
    const a = p.analysis;

    // sections détectées
    if (a?.sections) {
      for (const s of a.sections) {
        ctx.fillStyle = SECTION_COLORS[s.type] ?? 'rgba(255,255,255,0.4)';
        ctx.fillRect(xOf(s.start), bottom + STRIP, Math.max(2, xOf(s.end) - xOf(s.start)), SECT - 2);
      }
    }
    // ambiance calme → drop
    if (p.tl) {
      for (let x = 0; x < W; x += 2) {
        const f = ambienceAt(p.tl, tOf(x) - p.offset);
        ctx.fillStyle = `rgb(${Math.round(40 + 215 * f)},${Math.round(70 + 60 * f)},${Math.round(160 - 120 * f)})`;
        ctx.fillRect(x, bottom, 2, STRIP - 1);
        if (f > 0.5) {
          ctx.fillStyle = `rgba(255,120,40,${((f - 0.5) * 0.16).toFixed(3)})`;
          ctx.fillRect(x, top, 2, bottom - top);
        }
      }
    } else {
      ctx.fillStyle = '#16131f';
      ctx.fillRect(0, bottom, W, STRIP - 1);
    }
    // forme d'onde
    if (peaks) {
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, '#b48cff');
      g.addColorStop(1, '#5fd3ff');
      ctx.fillStyle = g;
      for (let x = 0; x < W; x++) {
        const y0 = mid - peaks[x * 2 + 1] * amp * 1.6;
        const y1 = mid - peaks[x * 2] * amp * 1.6;
        ctx.fillRect(x, Math.max(top, y0), 1, Math.max(1, Math.min(bottom, y1) - Math.max(top, y0)));
      }
    } else {
      ctx.fillStyle = '#5c5577';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Sans musique : temps de l’animation', 8, mid + 4);
    }
    if (a) {
      ctx.strokeStyle = 'rgba(255,210,63,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(a.frames / W));
      for (let f = 0; f < a.frames; f += step) {
        const x = xOf(f / a.fps);
        if (x > W) break;
        const y = bottom - 2 - (a.energy[f] * 0.6 + a.bass[f] * 0.4) * (bottom - top - 4);
        if (f === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (zoom >= 4 && a.beatGrid) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (const b of a.beatGrid) ctx.fillRect(xOf(b), bottom - 5, 1, 5);
      }
    }
    // montée et retours
    if (p.tl) {
      for (const pt of p.tl.points) {
        const x = xOf(pt.T + p.offset);
        const xb = xOf(pt.T + p.offset - p.buildUp);
        const g = ctx.createLinearGradient(xb, 0, x, 0);
        g.addColorStop(0, 'rgba(120,140,255,0)');
        g.addColorStop(1, 'rgba(120,140,255,0.3)');
        ctx.fillStyle = g;
        ctx.fillRect(xb, top, x - xb, bottom - top);
        if (Number.isFinite(pt.R)) {
          const xr = xOf(pt.R + p.offset);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(xr, top, 1, bottom - top);
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillText('↩', xr + 3, top + 10);
        }
      }
    }
    // drops détectés (losange plein = fiable, contour = incertain)
    p.candidates.forEach((cd, i) => {
      const x = xOf(cd.time);
      ctx.beginPath();
      ctx.moveTo(x, LANE - 2);
      ctx.lineTo(x - 6, LANE - 12);
      ctx.lineTo(x + 6, LANE - 12);
      ctx.closePath();
      if (cd.certain) {
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(String(i + 1), x + 7, LANE - 4);
    });
    // marqueurs (drops et images clés)
    for (const m of markers) {
      const x = xOf(m.time);
      const sel = m.id === p.selected;
      ctx.fillStyle = m.color;
      if (m.kind === 'drop') {
        ctx.fillRect(x - (sel ? 1.5 : 1), 4, sel ? 3 : 2, bottom - 4);
        ctx.beginPath();
        ctx.arc(x, 13, sel ? 10 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#120a14';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', x, 17);
        ctx.textAlign = 'left';
      } else {
        ctx.save();
        ctx.translate(x, bottom - 8);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5, -5, 10, 10);
        if (sel) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(-6, -6, 12, 12);
        }
        ctx.restore();
      }
    }
    // règle
    const secPx = W / dur;
    const stepS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * secPx >= 46) ?? 60;
    ctx.fillStyle = '#9a93ad';
    ctx.font = '10px system-ui, sans-serif';
    for (let t = 0; t <= dur + 1e-6; t += stepS) {
      const x = xOf(t);
      ctx.fillRect(x, H - RULER, 1, 4);
      ctx.fillText(stepS < 1 ? formatTime(t).slice(1, 9) : formatTime(t).slice(0, 5), x + 2, H - 4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, peaks, p.tl, p.offset, candKey, markersKey, p.selected, p.analysis, p.buildUp, dur, zoom]);

  const phX = xOf(p.playhead);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || drag) return;
    if (phX < el.scrollLeft + 20 || phX > el.scrollLeft + el.clientWidth - 20) el.scrollLeft = Math.max(0, phX - el.clientWidth * 0.3);
  }, [phX, drag]);

  const localX = (e: React.PointerEvent) => e.clientX - canvasRef.current!.getBoundingClientRect().left;
  const down = useRef<{ x: number; m: Marker | null } | null>(null);
  const hitTest = (x: number) => {
    let hit: Marker | null = null;
    for (const m of p.markers) {
      const dx = Math.abs(xOf(m.time) - x);
      if (dx < 18 && (!hit || dx < Math.abs(xOf(hit.time) - x))) hit = m;
    }
    return hit;
  };
  const onDown = (e: React.PointerEvent) => {
    const x = localX(e);
    const m = hitTest(x);
    down.current = { x, m };
    if (m) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      p.onSelect(m);
      setDrag({ m, t: m.time });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ m: drag.m, t: Math.round(tOf(localX(e)) * 1000) / 1000 });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (drag) {
      if (Math.abs(drag.t - drag.m.time) > 0.0005) p.onMove(drag.m, drag.t);
      setDrag(null);
    } else if (d && Math.abs(localX(e) - d.x) < 8) p.onSeek(tOf(d.x));
  };

  return (
    <div className={`timeline ${p.compact ? 'compact' : ''}`}>
      <div className="tl-scroll" ref={wrapRef}>
        <div className="tl-inner" style={{ width: W, height: H }}>
          <canvas ref={canvasRef} style={{ width: W, height: H }} onClick={(e) => p.onSeek(tOf(e.clientX - e.currentTarget.getBoundingClientRect().left))} />
          <div className="tl-lane" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} />
          <div className="tl-lane bottom" style={{ top: H - RULER - STRIP - SECT - 18, height: 20 }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} />
          <div className="tl-playhead" style={{ transform: `translateX(${phX}px)` }} />
          {drag && (
            <div className="tl-bubble" style={{ left: xOf(drag.t) }}>
              {formatTime(drag.t)}
            </div>
          )}
        </div>
      </div>
      <div className="tl-tools">
        <span className="tl-time">{formatTime(p.playhead)}</span>
        {p.analysis && p.analysis.bpm > 0 && <span className="tl-bpm">{Math.round(p.analysis.bpm)} BPM</span>}
        <span className="tl-legend">
          <i style={{ background: '#ffd23f' }} /> détectés <i style={{ background: '#ff4fd8' }} /> drops <i className="amb" />
        </span>
        <button type="button" className="mini" onClick={() => setZoomI(Math.max(0, zoomI - 1))} aria-label="Dézoomer">
          −
        </button>
        <span className="tl-zoom">×{zoom}</span>
        <button type="button" className="mini" onClick={() => setZoomI(Math.min(ZOOMS.length - 1, zoomI + 1))} aria-label="Zoomer">
          +
        </button>
      </div>
    </div>
  );
}
