import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDropTimeline, formatTime, musicOffset } from '../engine/drop';
import { captureFrame } from '../engine/exporter';
import { Player, type PlayerStats } from '../engine/player';
import type { Quality } from '../engine/render';
import { templateSettings } from '../engine/templates';
import type { Project, Settings } from '../engine/types';
import { worldSize } from '../engine/types';
import { notify, saveFile } from '../lib/host';
import { loadMusic, type LoadedMusic } from '../lib/storage';
import { makeThumb } from '../lib/thumb';
import { setPath } from './controls';
import { DropPanel } from './DropPanel';
import { ExportSheet } from './ExportSheet';
import { MusicPanel } from './MusicPanel';
import { BallsPanel, CameraPanel, EffectsPanel, ExportPanel, PhysicsPanel, RingsPanel } from './panels';
import { STYLE_COLORS, Timeline, type Marker } from './Timeline';

const TABS = [
  ['balls', 'Balles', '●'],
  ['rings', 'Cercles', '◎'],
  ['physics', 'Physique', '⤳'],
  ['effects', 'Effets', '✦'],
  ['music', 'Musique', '♪'],
  ['drop', 'Drop', '⚡'],
  ['camera', 'Caméra', '◐'],
  ['export', 'Export', '⬇'],
] as const;
type Tab = (typeof TABS)[number][0];
const SECTIONS: Record<Tab, (keyof Settings)[]> = {
  balls: ['balls'],
  physics: ['balls'],
  rings: ['rings'],
  effects: ['effects', 'counter'],
  music: ['audio'],
  drop: ['drop'],
  camera: ['camera'],
  export: ['export'],
};

function loadQuality(): Quality {
  try {
    return (localStorage.getItem('orbit.quality') as Quality) || 'balanced';
  } catch {
    return 'balanced';
  }
}

interface Props {
  project: Project;
  onSave: (p: Project) => void;
  onBack: () => void;
  onSavePreset: (name: string, s: Settings) => void;
}

export function Editor({ project, onSave, onBack, onSavePreset }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [settings, setSettingsState] = useState<Settings>(project.settings);
  const settingsRef = useRef(settings);
  const [name, setName] = useState(project.name);
  const [tab, setTab] = useState<Tab | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [music, setMusic] = useState<LoadedMusic | null>(null);
  const [musicLoading, setMusicLoading] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [muted, setMuted] = useState(false);
  const [quality, setQualityState] = useState<Quality>(loadQuality);
  const [selected, setSelected] = useState(-1);
  const [fs, setFs] = useState(false);
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [, setHistV] = useState(0);
  const hist = useRef({ past: [] as Settings[], future: [] as Settings[], last: 0 });
  const latest = useRef({ settings, name });
  latest.current = { settings, name };

  // ---------- historique (annuler / rétablir) ----------
  const commit = useCallback((next: Settings, coalesce = true) => {
    const prev = settingsRef.current;
    if (next === prev) return;
    const h = hist.current;
    const now = Date.now();
    if (!coalesce || now - h.last > 600) {
      h.past.push(prev);
      if (h.past.length > 100) h.past.shift();
    }
    h.last = now;
    h.future = [];
    settingsRef.current = next;
    setSettingsState(next);
    setHistV((v) => v + 1);
  }, []);
  const set = useCallback((path: string, v: unknown) => commit(setPath(settingsRef.current, path, v)), [commit]);
  const apply = useCallback((s: Settings) => commit(s, false), [commit]);
  const undo = () => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(settingsRef.current);
    h.last = 0;
    settingsRef.current = prev;
    setSettingsState(prev);
    setHistV((v) => v + 1);
  };
  const redo = () => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(settingsRef.current);
    h.last = 0;
    settingsRef.current = next;
    setSettingsState(next);
    setHistV((v) => v + 1);
  };

  // ---------- lecteur ----------
  useEffect(() => {
    const p = new Player(canvasRef.current!, project.settings);
    p.quality = loadQuality();
    p.onStats = setStats;
    playerRef.current = p;
    return () => p.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    playerRef.current?.setSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (playerRef.current) playerRef.current.selected = selected;
  }, [selected]);
  const setQuality = (q: Quality) => {
    setQualityState(q);
    playerRef.current?.setQuality(q);
    try {
      localStorage.setItem('orbit.quality', q);
    } catch {
      /* facultatif */
    }
  };

  // ---------- musique ----------
  const musicId = settings.audio.mode !== 'none' ? settings.audio.musicId : undefined;
  useEffect(() => {
    let cancelled = false;
    if (!musicId) {
      setMusic(null);
      playerRef.current?.setMusic(null, null);
      return;
    }
    setMusicLoading('Analyse…');
    loadMusic(musicId, (p) => !cancelled && setMusicLoading(`Analyse ${Math.round(p * 100)} %`))
      .then((m) => {
        if (cancelled) return;
        setMusic(m);
        setMusicLoading(null);
        playerRef.current?.setMusic(m.buffer, m.analysis);
      })
      .catch((e) => !cancelled && setMusicLoading('Erreur : ' + (e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [musicId]);

  // ---------- sauvegarde automatique ----------
  const projRef = useRef(project);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const save = useCallback((withThumb: boolean) => {
    const { settings: s, name: n } = latest.current;
    const p: Project = { ...projRef.current, name: n, settings: s, updatedAt: Date.now() };
    if (withThumb) p.thumb = makeThumb(s);
    projRef.current = p;
    saveRef.current(p);
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => save(false), 700);
    return () => clearTimeout(id);
  }, [settings, name, save]);
  useEffect(() => () => save(true), [save]);

  // ---------- plein écran ----------
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleFs = () => {
    const on = !fs;
    setFs(on);
    try {
      if (on) void rootRef.current?.requestFullscreen?.().catch(() => undefined);
      else if (document.fullscreenElement) void document.exitFullscreen();
    } catch {
      /* plein écran simulé */
    }
  };

  // ---------- gestes tactiles sur l'aperçu ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d0: number; z0: number; mx: number; my: number; x0: number; y0: number; moved: boolean; t0: number; sx: number; sy: number } | null>(null);
  const lastTap = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const d0 = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { d0, z0: view.z, mx, my, x0: view.x, y0: view.y, moved: pts.length > 1, t0: Date.now(), sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.moved = true;
    if (pts.length > 1 && g.d0 > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView({ z: Math.max(1, Math.min(5, (g.z0 * d) / g.d0)), x: g.x0 + (mx - g.mx), y: g.y0 + (my - g.my) });
    } else if (view.z > 1 && g.moved) setView({ z: view.z, x: g.x0 + (mx - g.mx), y: g.y0 + (my - g.my) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size) return;
    gesture.current = null;
    if (!g || g.moved || Date.now() - g.t0 > 350) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setView({ z: 1, x: 0, y: 0 });
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    const i = playerRef.current?.pickBall(e.clientX, e.clientY) ?? -1;
    if (i >= 0) {
      setSelected(i);
      setTab('balls');
    } else playerRef.current?.toggle();
  };

  // ---------- outils ----------
  const copySection = () => {
    if (!tab) return;
    const data: Record<string, unknown> = {};
    for (const k of SECTIONS[tab]) data[k] = settings[k];
    const json = JSON.stringify({ tab, data });
    try {
      localStorage.setItem('orbit.clip', json);
    } catch {
      /* facultatif */
    }
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    notify('Réglages copiés');
  };
  const pasteSection = () => {
    if (!tab) return;
    try {
      const clip = JSON.parse(localStorage.getItem('orbit.clip') || 'null') as { tab: Tab; data: Record<string, unknown> } | null;
      if (!clip) return notify('Rien à coller : copiez d’abord des réglages.');
      const keys = SECTIONS[tab].filter((k) => k in clip.data);
      if (!keys.length) return notify('Les réglages copiés concernent un autre onglet.');
      let next = settingsRef.current;
      for (const k of keys) next = { ...next, [k]: k === 'audio' ? { ...(clip.data[k] as object), musicId: next.audio.musicId, musicName: next.audio.musicName } : clip.data[k] };
      apply(next);
      notify('Réglages collés');
    } catch {
      notify('Collage impossible');
    }
  };
  const resetSection = () => {
    if (!tab) return;
    const base = templateSettings(project.template);
    let next = settingsRef.current;
    for (const k of SECTIONS[tab]) next = { ...next, [k]: k === 'audio' ? { ...base.audio, musicId: next.audio.musicId, musicName: next.audio.musicName, mode: next.audio.mode } : base[k] };
    apply(next);
    notify('Réglages de l’onglet réinitialisés (↶ pour annuler)');
  };
  const capture = async () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const blob = await captureFrame(p.sim, settings);
      await saveFile(blob, `${name || 'capture'}-${Math.round(p.sim.t * 10) / 10}s.png`);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  // ---------- timeline compacte ----------
  const hasMusic = !!music && settings.audio.mode !== 'none';
  const offset = musicOffset(settings, hasMusic);
  const tl = useMemo(() => buildDropTimeline(settings, hasMusic), [settings, hasMusic]);
  const markers: Marker[] = useMemo(
    () => [
      ...(settings.drop.enabled ? settings.drop.events.map((e) => ({ id: e.id, time: e.time, kind: 'drop' as const, color: STYLE_COLORS[e.style] ?? '#ff4fd8' })) : []),
      ...settings.camera.keys.map((k) => ({ id: k.id, time: k.time, kind: 'cam' as const, color: '#5fd3ff' })),
    ],
    [settings.drop, settings.camera.keys],
  );
  const lastMarker = markers.reduce((m, k) => Math.max(m, k.time), 0);
  const tlDuration = hasMusic ? music!.buffer.duration : Math.max(30, lastMarker + 10, settings.export.duration);
  const moveMarker = (m: Marker, t: number) => {
    if (m.kind === 'drop') set('drop.events', settings.drop.events.map((e) => (e.id === m.id ? { ...e, time: Math.max(0.3, t) } : e)).sort((a, b) => a.time - b.time));
    else set('camera.keys', settings.camera.keys.map((k) => (k.id === m.id ? { ...k, time: Math.max(0, t) } : k)));
  };

  const playing = stats?.playing ?? false;
  const { W, H } = worldSize(settings.export);
  const musicT = stats?.musicT ?? offset;

  return (
    <div ref={rootRef} className={`editor ${fs ? 'fs' : ''} ${tab ? 'drawer-open' : ''}`}>
      <header className="editor-bar">
        <button type="button" className="icon" onClick={() => (playerRef.current?.pause(), onBack())} aria-label="Retour">
          ‹
        </button>
        <input className="title-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du projet" />
        <button type="button" className="icon" onClick={undo} disabled={!hist.current.past.length} aria-label="Annuler">
          ↶
        </button>
        <button type="button" className="icon" onClick={redo} disabled={!hist.current.future.length} aria-label="Rétablir">
          ↷
        </button>
        <button type="button" className="icon" onClick={() => setMenu(!menu)} aria-label="Plus">
          ⋯
        </button>
        <button type="button" className="btn primary small" onClick={() => (playerRef.current?.pause(), setShowExport(true))}>
          Exporter
        </button>
        {menu && (
          <div className="menu-pop" onClick={() => setMenu(false)}>
            <button type="button" onClick={() => onSavePreset(name, settings)}>
              ★ Enregistrer comme modèle
            </button>
            <button type="button" onClick={capture}>
              📸 Capture d’image
            </button>
            <button type="button" onClick={toggleFs}>
              ⛶ Plein écran
            </button>
            <button type="button" onClick={() => setMuted((m) => (playerRef.current?.setMuted(!m), !m))}>
              {muted ? '🔊 Réactiver le son' : '🔇 Couper le son'}
            </button>
          </div>
        )}
      </header>

      <div className="stage">
        <div className="preview-wrap" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="preview-zoom" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, aspectRatio: `${W} / ${H}` }}>
            <canvas ref={canvasRef} className="preview" />
          </div>
          {!playing && (
            <div className="play-overlay" aria-hidden>
              ▶
            </div>
          )}
          {view.z > 1 && <div className="zoom-badge">×{view.z.toFixed(1)} · double-tap pour recadrer</div>}
          <button type="button" className="fs-btn" onPointerDown={(e) => e.stopPropagation()} onClick={toggleFs} aria-label="Plein écran">
            {fs ? '✕' : '⛶'}
          </button>
        </div>
        <div className="transport">
          <button type="button" className="icon big" onClick={() => playerRef.current?.toggle()} aria-label={playing ? 'Pause' : 'Lecture'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="icon" onClick={() => playerRef.current?.restart()} aria-label="Retour au début">
            ⏮
          </button>
          {settings.drop.enabled && playing && stats?.phase === 'calm' && (
            <button
              type="button"
              className="btn small live-btn"
              onClick={() => {
                const ev = playerRef.current?.triggerNow({ style: settings.drop.events[0]?.style ?? 'pass', intensity: settings.drop.events[0]?.intensity ?? 'power', freeFor: 0, extraBalls: 0 });
                if (!ev) return;
                set('drop.events', [...settings.drop.events, ev].sort((a, b) => a.time - b.time));
                notify(`Drop enregistré à ${formatTime(ev.time)}`);
              }}
            >
              ⚡ Drop
            </button>
          )}
          <div className="stats">
            <span className="time">{formatTime(musicT)}</span>
            <span>◎ {stats?.remaining ?? 0}</span>
            <span>↯ {stats?.bounces ?? 0}</span>
            {settings.drop.enabled && stats && <span className={stats.phase === 'free' ? 'phase free' : 'phase'}>{stats.phase === 'free' ? '⚡ drop' : '◌ calme'}</span>}
            {musicLoading && <span className="warn">♪ {musicLoading}</span>}
          </div>
        </div>
      </div>

      {!tab && !fs && (
        <div className="tl-dock">
          <Timeline
            compact
            analysis={hasMusic ? music!.analysis : null}
            duration={tlDuration}
            offset={offset}
            tl={tl}
            markers={markers}
            candidates={[]}
            playhead={musicT}
            selected={null}
            buildUp={settings.drop.buildUp}
            onSeek={(t) => playerRef.current?.seek(t - offset)}
            onSelect={(m) => setTab(m.kind === 'drop' ? 'drop' : 'camera')}
            onMove={moveMarker}
          />
        </div>
      )}

      {tab && !fs && (
        <section className="drawer" key={tab}>
          <div className="drawer-head">
            <b>{TABS.find(([id]) => id === tab)?.[1]}</b>
            <button type="button" className="mini" onClick={copySection}>
              Copier
            </button>
            <button type="button" className="mini" onClick={pasteSection}>
              Coller
            </button>
            <button type="button" className="mini" onClick={resetSection}>
              Réinit.
            </button>
            <button type="button" className="icon" onClick={() => setTab(null)} aria-label="Fermer le panneau">
              ⌄
            </button>
          </div>
          <div className="panel">
            {tab === 'balls' && <BallsPanel s={settings} set={set} selected={selected} onSelect={setSelected} />}
            {tab === 'physics' && <PhysicsPanel s={settings} set={set} />}
            {tab === 'rings' && <RingsPanel s={settings} set={set} />}
            {tab === 'effects' && <EffectsPanel s={settings} set={set} quality={quality} setQuality={setQuality} />}
            {tab === 'music' && <MusicPanel s={settings} set={set} duration={music?.buffer.duration ?? null} loading={musicLoading} analysis={music?.analysis ?? null} />}
            {tab === 'drop' && (
              <DropPanel
                s={settings}
                set={set}
                apply={apply}
                music={settings.audio.mode !== 'none' ? music : null}
                stats={stats}
                player={playerRef.current}
                onGenerate={() => (playerRef.current?.pause(), setShowExport(true))}
              />
            )}
            {tab === 'camera' && <CameraPanel s={settings} set={set} musicT={musicT} />}
            {tab === 'export' && <ExportPanel s={settings} set={set} onExport={() => (playerRef.current?.pause(), setShowExport(true))} onCapture={capture} />}
          </div>
        </section>
      )}

      {!fs && (
        <nav className="dock">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(tab === id ? null : id)}>
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}

      {showExport && <ExportSheet settings={settings} name={name} music={music} onChange={set} onClose={() => setShowExport(false)} />}
    </div>
  );
}
