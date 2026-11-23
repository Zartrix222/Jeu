import { useCallback, useEffect, useRef, useState } from 'react';
import { Player, type PlayerStats } from '../engine/player';
import type { Project, Settings } from '../engine/types';
import { loadMusic, type LoadedMusic } from '../lib/storage';
import { makeThumb } from '../lib/thumb';
import { setPath } from './controls';
import { ExportSheet } from './ExportSheet';
import { MusicPanel } from './MusicPanel';
import { DropPanel } from './DropPanel';
import { notify } from '../lib/host';
import { formatTime } from '../engine/drop';
import { BallsPanel, EffectsPanel, RingsPanel, TextPanel } from './panels';

const TABS = [
  ['balls', 'Balles', '●'],
  ['rings', 'Cercles', '◎'],
  ['effects', 'Effets', '✦'],
  ['text', 'Texte', 'Aa'],
  ['music', 'Musique', '♪'],
  ['drop', 'Drop', '⚡'],
] as const;
type Tab = (typeof TABS)[number][0];

interface Props {
  project: Project;
  onSave: (p: Project) => void;
  onBack: () => void;
}

export function Editor({ project, onSave, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [settings, setSettings] = useState<Settings>(project.settings);
  const [name, setName] = useState(project.name);
  const [tab, setTab] = useState<Tab>('balls');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [music, setMusic] = useState<LoadedMusic | null>(null);
  const [musicLoading, setMusicLoading] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [muted, setMuted] = useState(false);
  const latest = useRef({ settings, name });
  latest.current = { settings, name };

  // lecteur
  useEffect(() => {
    const p = new Player(canvasRef.current!, project.settings);
    p.onStats = setStats;
    playerRef.current = p;
    return () => p.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    playerRef.current?.setSettings(settings);
  }, [settings]);

  // musique
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
      .catch((e) => {
        if (cancelled) return;
        setMusicLoading('Erreur : ' + (e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [musicId]);

  // sauvegarde automatique
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

  const set = useCallback((path: string, v: unknown) => setSettings((s) => setPath(s, path, v)), []);

  // enregistre (avec miniature) en quittant l'éditeur, y compris via le bouton retour du téléphone
  useEffect(() => () => save(true), [save]);

  const back = () => {
    playerRef.current?.pause();
    onBack();
  };

  const playing = stats?.playing ?? false;

  return (
    <div className="editor">
      <header className="editor-bar">
        <button type="button" className="icon" onClick={back} aria-label="Retour">
          ‹
        </button>
        <input className="title-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du projet" />
        <button type="button" className="btn primary small" onClick={() => (playerRef.current?.pause(), setShowExport(true))}>
          Exporter
        </button>
      </header>

      <div className="stage">
        <div className="preview-wrap">
          <canvas ref={canvasRef} className="preview" onClick={() => playerRef.current?.toggle()} />
          {!playing && (
            <button type="button" className="play-overlay" onClick={() => playerRef.current?.play()} aria-label="Lecture">
              ▶
            </button>
          )}
        </div>
        <div className="transport">
          <button type="button" className="icon big" onClick={() => playerRef.current?.toggle()} aria-label={playing ? 'Pause' : 'Lecture'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="icon" onClick={() => playerRef.current?.restart()} aria-label="Recommencer">
            ↺
          </button>
          <button
            type="button"
            className="icon"
            onClick={() => {
              setMuted(!muted);
              playerRef.current?.setMuted(!muted);
            }}
            aria-label="Son"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {settings.drop.enabled && playing && stats?.phase === 'calm' && (
            <button
              type="button"
              className="btn small live-btn"
              onClick={() => {
                const ev = playerRef.current?.triggerNow({ style: 'pass', intensity: 'power', freeFor: 0, extraBalls: 0 });
                if (!ev) return;
                set('drop', { ...settings.drop, events: [...settings.drop.events, ev].sort((a, b) => a.time - b.time) });
                notify(`Drop enregistré à ${formatTime(ev.time)}`);
              }}
            >
              ⚡ Drop
            </button>
          )}
          <div className="stats">
            <span>{(stats?.t ?? 0).toFixed(1)} s</span>
            <span>◎ {stats?.remaining ?? 0}</span>
            <span>💥 {stats?.destroyed ?? 0}</span>
            <span>↯ {stats?.bounces ?? 0}</span>
            {settings.drop.enabled && stats && (
              <span className={stats.phase === 'free' ? 'phase free' : 'phase'}>{stats.phase === 'free' ? '⚡ drop' : '◌ calme'}</span>
            )}
            {musicLoading && <span className="warn">♪ {musicLoading}</span>}
          </div>
        </div>
      </div>

      <nav className="tabs">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="panel">
        {tab === 'balls' && <BallsPanel s={settings} set={set} />}
        {tab === 'rings' && <RingsPanel s={settings} set={set} />}
        {tab === 'effects' && <EffectsPanel s={settings} set={set} />}
        {tab === 'text' && <TextPanel s={settings} set={set} />}
        {tab === 'drop' && (
          <DropPanel
            s={settings}
            set={set}
            music={settings.audio.mode !== 'none' ? music : null}
            stats={stats}
            player={playerRef.current}
            onGenerate={() => (playerRef.current?.pause(), setShowExport(true))}
          />
        )}
        {tab === 'music' && <MusicPanel s={settings} set={set} duration={music?.buffer.duration ?? null} loading={musicLoading} />}
      </div>

      {showExport && (
        <ExportSheet settings={settings} name={name} music={music} onChange={set} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
