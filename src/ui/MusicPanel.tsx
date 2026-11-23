import { useEffect, useRef, useState } from 'react';
import { allMusic, deleteMusic, importMusicFile, type StoredMusic } from '../lib/storage';
import { Group, Select, Slider, Toggle } from './controls';
import type { MusicAnalysis } from '../engine/analysis';
import { formatTime } from '../engine/drop';
import { ask, notify } from '../lib/host';
import type { PanelProps } from './panels';

export function MusicPanel(p: PanelProps & { duration: number | null; loading: string | null; analysis: MusicAnalysis | null }) {
  const a = p.s.audio;
  const fileRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<StoredMusic[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () => allMusic().then(setLibrary).catch(() => setLibrary([]));
  useEffect(() => {
    void refresh();
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const m = await importMusicFile(f);
      p.set('audio', { ...a, musicId: m.id, musicName: m.name, mode: a.mode === 'none' ? 'bounce' : a.mode, startOffset: 0 });
      await refresh();
    } catch (e) {
      notify('Import impossible : ' + (e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <Group title="Musique">
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" className="btn wide" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Import…' : '🎵 Importer une musique depuis le téléphone'}
        </button>
        {a.musicId && (
          <div className="music-current">
            <span>
              <b>{a.musicName || 'Musique'}</b>
              <small>{p.loading ?? (p.duration ? `${Math.floor(p.duration / 60)}:${String(Math.floor(p.duration % 60)).padStart(2, '0')}` : '')}</small>
            </span>
            <button type="button" className="mini" onClick={() => p.set('audio', { ...a, musicId: undefined, musicName: undefined, mode: 'none' })}>
              Retirer
            </button>
          </div>
        )}
        <Select
          label="Mode"
          value={a.mode}
          options={[
            ['none', 'Sans musique'],
            ['bounce', 'Joue aux rebonds'],
            ['continuous', 'Continue'],
          ]}
          onChange={(v) => p.set('audio.mode', v)}
        />
        <p className="hint">
          {a.mode === 'bounce' && '« Joue aux rebonds » : la musique avance uniquement quand la balle touche ou casse un cercle (effet TikTok).'}
          {a.mode === 'continuous' && '« Continue » : la musique joue normalement ; cercles, flash et balle réagissent au rythme.'}
          {a.mode === 'none' && 'Animation sans musique (les bruitages restent disponibles).'}
        </p>
        {a.mode !== 'none' && a.musicId && (
          <>
            <Slider
              label="Début de la musique"
              min={0}
              max={Math.max(1, Math.floor(p.duration ?? 60))}
              step={0.5}
              unit=" s"
              value={a.startOffset}
              onChange={(v) => p.set('audio.startOffset', v)}
            />
            {a.mode === 'bounce' && (
              <Slider label="Durée jouée par rebond" min={60} max={1500} step={10} unit=" ms" value={a.gateMs} onChange={(v) => p.set('audio.gateMs', v)} />
            )}
            <Slider label="Volume musique" min={0} max={1.5} step={0.05} value={a.musicVolume} onChange={(v) => p.set('audio.musicVolume', v)} />
          </>
        )}
      </Group>
      <Group title="Bruitages">
        <Select
          label="Sons"
          value={a.sfx}
          options={[
            ['none', 'Aucun'],
            ['notes', 'Notes'],
            ['pop', 'Pop'],
            ['both', 'Les deux'],
          ]}
          onChange={(v) => p.set('audio.sfx', v)}
        />
        {a.sfx !== 'none' && (
          <>
            <Select
              label="Gamme des notes"
              value={a.scale}
              options={[
                ['pentatonic', 'Pentatonique'],
                ['major', 'Majeure'],
                ['minor', 'Mineure'],
                ['chromatic', 'Chromatique'],
              ]}
              onChange={(v) => p.set('audio.scale', v)}
            />
            <Slider label="Volume bruitages" min={0} max={1.5} step={0.05} value={a.sfxVolume} onChange={(v) => p.set('audio.sfxVolume', v)} />
          </>
        )}
      </Group>
      <Group title="Audio interactif">
        <p className="hint">Associez chaque événement à un effet. Les sons se désactivent un par un.</p>
        <div className="map-row">
          <span>Collision</span>→<Toggle label="Effet sonore" value={a.map.collisionSound} onChange={(v) => p.set('audio.map.collisionSound', v)} />
        </div>
        <div className="map-row">
          <span>Cercle cassé</span>→<Toggle label="Effet sonore" value={a.map.breakSound} onChange={(v) => p.set('audio.map.breakSound', v)} />
        </div>
        <div className="map-row">
          <span>Drop</span>→<Toggle label="Explosion" value={a.map.dropExplosion} onChange={(v) => p.set('audio.map.dropExplosion', v)} />
        </div>
        <div className="map-row">
          <span>Drop</span>→<Toggle label="Boum sonore" value={a.map.dropSound} onChange={(v) => p.set('audio.map.dropSound', v)} />
        </div>
        <div className="map-row">
          <span>Fin</span>→<Toggle label="Jingle" value={a.map.endSound} onChange={(v) => p.set('audio.map.endSound', v)} />
        </div>
        <div className="map-row">
          <span>Battement</span>→<Toggle label="Changement de couleur" value={a.map.beatColor} onChange={(v) => p.set('audio.map.beatColor', v)} />
        </div>
        <Slider label="Basse → pulsation du cercle" min={0} max={1} step={0.05} value={a.map.bassPulse} onChange={(v) => p.set('audio.map.bassPulse', v)} />
        <Slider label="Montée musicale → accélération" min={0} max={1} step={0.05} value={a.map.buildupAccel} onChange={(v) => p.set('audio.map.buildupAccel', v)} />
      </Group>
      {p.analysis && (
        <Group title="Analyse de la musique">
          <p className="hint">
            Tempo estimé : <b>{p.analysis.bpm ? `${Math.round(p.analysis.bpm)} BPM` : 'non détecté'}</b>
            {p.analysis.bpm > 0 && ` (fiabilité ${p.analysis.bpmConfidence > 0.5 ? 'bonne' : p.analysis.bpmConfidence > 0.2 ? 'moyenne' : 'faible'})`}
          </p>
          <ul className="sections">
            {p.analysis.sections.slice(0, 30).map((sec, i) => (
              <li key={i} className={sec.type}>
                <span>{formatTime(sec.start).slice(0, 5)}</span> {sec.label}
              </li>
            ))}
            {!p.analysis.sections.length && <li>Aucune section marquée détectée.</li>}
          </ul>
        </Group>
      )}
      {library.length > 0 && (
        <Group title="Mes musiques">
          <ul className="lib">
            {library.map((m) => (
              <li key={m.id} className={m.id === a.musicId ? 'on' : ''}>
                <button type="button" onClick={() => p.set('audio', { ...a, musicId: m.id, musicName: m.name, mode: a.mode === 'none' ? 'bounce' : a.mode })}>
                  {m.name}
                </button>
                <button
                  type="button"
                  className="mini danger"
                  onClick={async () => {
                    if (!(await ask(`Supprimer « ${m.name} » de l’appareil ?`, 'Supprimer'))) return;
                    await deleteMusic(m.id);
                    if (m.id === a.musicId) p.set('audio', { ...a, musicId: undefined, musicName: undefined, mode: 'none' });
                    void refresh();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );
}
