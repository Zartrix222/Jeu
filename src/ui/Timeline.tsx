import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicAnalysis } from '../engine/analysis';
import { ambienceAt, formatTime, type DropCandidate, type DropTimeline } from '../engine/drop';
import type { DropEvent } from '../engine/types';

interface Props {
  analysis: MusicAnalysis | null;
  duration: number; // secondes affichées
  offset: number; // temps musique = temps simulation + offset
  tl: DropTimeline | null;
  events: DropEvent[];
  candidates: DropCandidate[];
  playhead: number; // temps musique
  selected: string | null;
  buildUp: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, t: number) => void;
}

const H = 168;
const LANE = 34; // bande des marqueurs (glisser)
const RULER = 18;
const STRIP = 14; // bande d'ambiance
const ZOOMS = [1, 2, 4, 8, 16, 32];
const STYLE_COLORS: Record<string, string> = {
  pass: '#ff4fd8',
  open: '#4fd1ff',
  explode: '#ff7a2b',
  vanish: '#b6a8ff',
  chain: '#ffd23f',
};

export function Timeline(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(320);
  const [zoomI, setZoomI] = useState(0);
  const [drag, setDrag] = useState<{ id: string; t: number } | null>(null);
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

  // crêtes de la forme d'onde (par colonne de pixels)
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

  const evTimes = p.events.map((e) => (drag && drag.id === e.id ? { ...e, time: drag.t } : e));

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1, 12000 / W);
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(0, 0, W, H);
    const top = LANE;
    const bottom = H - RULER - STRIP;
    const mid = (top + bottom) / 2;
    const amp = (bottom - top) / 2 - 2;

    // ambiance (calme → puissant)
    if (p.tl) {
      for (let x = 0; x < W; x += 2) {
        const f = ambienceAt(p.tl, tOf(x) - p.offset);
        ctx.fillStyle = `rgb(${Math.round(40 + 215 * f)},${Math.round(70 + 60 * f)},${Math.round(160 - 120 * f)})`;
        ctx.fillRect(x, bottom, 2, STRIP);
        if (f > 0.5) {
          ctx.fillStyle = `rgba(255,120,40,${((f - 0.5) * 0.18).toFixed(3)})`;
          ctx.fillRect(x, top, 2, bottom - top);
        }
      }
    } else {
      ctx.fillStyle = '#1a1726';
      ctx.fillRect(0, bottom, W, STRIP);
    }

    // forme d'onde
    if (peaks) {
      ctx.fillStyle = '#8a7fb0';
      for (let x = 0; x < W; x++) {
        const y0 = mid - peaks[x * 2 + 1] * amp * 1.6;
        const y1 = mid - peaks[x * 2] * amp * 1.6;
        ctx.fillRect(x, Math.max(top, y0), 1, Math.max(1, Math.min(bottom, y1) - Math.max(top, y0)));
      }
    } else {
      ctx.fillStyle = '#5c5577';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Sans musique : la timeline suit le temps de l’animation', 10, mid);
    }

    // intensité + temps forts
    const a = p.analysis;
    if (a) {
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(a.frames / W / 1));
      for (let f = 0; f < a.frames; f += step) {
        const x = xOf(f / a.fps);
        if (x > W) break;
        const y = bottom - 2 - (a.energy[f] * 0.6 + a.bass[f] * 0.4) * (bottom - top - 4);
        if (f === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (zoom >= 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (let f = 0; f < a.frames; f++) if (a.beats[f]) ctx.fillRect(xOf(f / a.fps), bottom - 6, 1, 6);
      }
    }

    // montée de tension, phase libre, drops
    if (p.tl) {
      for (const pt of p.tl.points) {
        const x = xOf(pt.T + p.offset);
        const xb = xOf(pt.T + p.offset - p.buildUp);
        const g = ctx.createLinearGradient(xb, 0, x, 0);
        g.addColorStop(0, 'rgba(120,140,255,0)');
        g.addColorStop(1, 'rgba(120,140,255,0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(xb, top, x - xb, bottom - top);
        if (Number.isFinite(pt.R)) {
          const xr = xOf(pt.R + p.offset);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(xr, top, 1, bottom - top);
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillText('↩ retour', xr + 3, top + 10);
        }
      }
    }
    for (const e of evTimes) {
      const x = xOf(e.time);
      const col = STYLE_COLORS[e.style] ?? '#ff4fd8';
      ctx.fillStyle = col;
      ctx.fillRect(x - (e.id === p.selected ? 1.5 : 1), 6, e.id === p.selected ? 3 : 2, bottom - 6);
      ctx.beginPath();
      ctx.arc(x, 15, e.id === p.selected ? 10 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120a14';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', x, 19);
      ctx.textAlign = 'left';
    }
    // drops détectés
    p.candidates.forEach((c, i) => {
      const x = xOf(c.time);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(x, LANE - 2);
      ctx.lineTo(x - 6, LANE - 12);
      ctx.lineTo(x + 6, LANE - 12);
      ctx.fill();
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(String(i + 1), x + 7, LANE - 4);
    });

    // règle
    const secPx = W / dur;
    const stepS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * secPx >= 46) ?? 60;
    ctx.fillStyle = '#9a93ad';
    ctx.font = '10px system-ui, sans-serif';
    for (let t = 0; t <= dur + 1e-6; t += stepS) {
      const x = xOf(t);
      ctx.fillRect(x, H - RULER, 1, 5);
      const label = stepS < 1 ? formatTime(t).slice(1, 9) : formatTime(t).slice(0, 5);
      ctx.fillText(label, x + 2, H - 4);
    }
  }, [W, peaks, p.tl, p.offset, p.candidates, evTimes, p.selected, p.analysis, p.buildUp, dur, zoom]);

  // garde la tête de lecture visible pendant la lecture
  const phX = xOf(p.playhead);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || drag) return;
    if (phX < el.scrollLeft + 20 || phX > el.scrollLeft + el.clientWidth - 20) el.scrollLeft = Math.max(0, phX - el.clientWidth * 0.3);
  }, [phX, drag]);

  const localX = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return e.clientX - r.left;
  };
  const down = useRef<{ x: number; id: string | null } | null>(null);

  const onLaneDown = (e: React.PointerEvent) => {
    const x = localX(e);
    let hit: DropEvent | null = null;
    for (const ev of p.events) if (Math.abs(xOf(ev.time) - x) < 18 && (!hit || Math.abs(xOf(ev.time) - x) < Math.abs(xOf(hit.time) - x))) hit = ev;
    down.current = { x, id: hit?.id ?? null };
    if (hit) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      p.onSelect(hit.id);
      setDrag({ id: hit.id, t: hit.time });
    }
  };
  const onLaneMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ id: drag.id, t: Math.round(tOf(localX(e)) * 1000) / 1000 });
  };
  const onLaneUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (drag) {
      p.onMove(drag.id, drag.t);
      setDrag(null);
    } else if (d && Math.abs(localX(e) - d.x) < 8) p.onSeek(tOf(d.x));
  };

  return (
    <div className="timeline">
      <div className="tl-scroll" ref={wrapRef}>
        <div className="tl-inner" style={{ width: W, height: H }}>
          <canvas
            ref={canvasRef}
            style={{ width: W, height: H }}
            onClick={(e) => p.onSeek(tOf(e.clientX - e.currentTarget.getBoundingClientRect().left))}
          />
          <div className="tl-lane" onPointerDown={onLaneDown} onPointerMove={onLaneMove} onPointerUp={onLaneUp} onPointerCancel={() => setDrag(null)} />
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
        <div className="tl-legend">
          <i style={{ background: '#ffd23f' }} /> détectés <i style={{ background: '#ff4fd8' }} /> sorties <i className="amb" /> calme → drop
        </div>
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
