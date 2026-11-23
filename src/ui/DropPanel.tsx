import { useMemo, useState } from 'react';
import { DROP_PRESETS, INTENSITY, buildDropTimeline, detectDrops, formatTime, musicOffset, parseTime } from '../engine/drop';
import type { Player, PlayerStats } from '../engine/player';
import type { DropEvent, DropIntensity, DropStyle, Settings } from '../engine/types';
import { uid } from '../engine/util';
import type { LoadedMusic } from '../lib/storage';
import { notify } from '../lib/host';
import { Group, PaletteInput, Select, Slider, Toggle } from './controls';
import { Timeline } from './Timeline';

interface Props {
  s: Settings;
  set: (path: string, v: unknown) => void;
  music: LoadedMusic | null;
  stats: PlayerStats | null;
  player: Player | null;
  onGenerate: () => void;
}

export const STYLE_OPTIONS: [DropStyle, string][] = [
  ['pass', 'Traverse'],
  ['open', 'S’ouvre'],
  ['explode', 'Explose'],
  ['vanish', 'Disparaît'],
  ['chain', 'En chaîne'],
];
const INTENSITY_OPTIONS: [DropIntensity, string][] = [
  ['soft', 'Doux'],
  ['power', 'Puissant'],
  ['extreme', 'Extrême'],
];

export function DropPanel({ s, set, music, stats, player, onGenerate }: Props) {
  const d = s.drop;
  const hasMusic = !!music && s.audio.mode !== 'none';
  const offset = musicOffset(s, hasMusic);
  const [mode, setMode] = useState<'manual' | 'auto' | 'live'>('auto');
  const [selected, setSelected] = useState<string | null>(d.events[0]?.id ?? null);
  const [timeText, setTimeText] = useState<string | null>(null);
  const candidates = useMemo(() => (music ? detectDrops(music.analysis, 3) : []), [music]);
  const tl = useMemo(() => buildDropTimeline(s, hasMusic), [s, hasMusic]);
  const lastT = d.events.reduce((m, e) => Math.max(m, e.time), 0);
  const duration = hasMusic ? music!.buffer.duration : Math.max(40, lastT + 15);
  const playhead = stats?.musicT ?? offset;
  const sel = d.events.find((e) => e.id === selected) ?? null;

  const setEvents = (evs: DropEvent[]) => set('drop', { ...d, events: evs.slice().sort((a, b) => a.time - b.time) });
  const updateEv = (id: string, patch: Partial<DropEvent>) => setEvents(d.events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addEvent = (time: number, patch: Partial<DropEvent> = {}) => {
    const t = Math.max(0.5, Math.round(time * 1000) / 1000);
    const ev: DropEvent = {
      id: uid(),
      time: t,
      style: sel?.style ?? 'pass',
      intensity: sel?.intensity ?? 'power',
      freeFor: 0,
      extraBalls: 0,
      ...patch,
    };
    setEvents([...d.events, ev]);
    setSelected(ev.id);
    return ev;
  };

  const enable = (on: boolean) => {
    const next = { ...d, enabled: on };
    if (on && !d.events.length) {
      const best = [...candidates].sort((a, b) => b.score - a.score)[0];
      const ev: DropEvent = { id: uid(), time: best ? best.time : 8, style: 'pass', intensity: 'power', freeFor: 0, extraBalls: 0 };
      next.events = [ev];
      setSelected(ev.id);
    }
    set('drop', next);
    if (on && s.audio.mode === 'bounce') set('audio.mode', 'continuous');
  };

  const applyPreset = (k: DropIntensity) => {
    set('drop', { ...d, ...DROP_PRESETS[k], events: d.events.map((e) => ({ ...e, intensity: k })) });
    notify(`Préréglage « ${INTENSITY[k].label} » appliqué`);
  };

  const preview = (musicT: number) => player?.previewAround(musicT - offset, 5, 5);
  const listen = (musicT: number) => {
    if (!hasMusic) return notify('Importez une musique pour écouter un extrait.');
    player?.listen(musicT, 3, 3);
  };

  const triggerLive = () => {
    const ev = player?.triggerNow({ style: sel?.style ?? 'pass', intensity: sel?.intensity ?? 'power', freeFor: 0, extraBalls: 0 });
    if (!ev) return notify('Lancez la lecture : la balle doit être dans le cercle.');
    setEvents([...d.events, ev]);
    setSelected(ev.id);
    notify(`Drop enregistré à ${formatTime(ev.time)}`);
  };

  const nudge = (ms: number) => sel && updateEv(sel.id, { time: Math.max(0.3, Math.round((sel.time + ms / 1000) * 1000) / 1000) });

  if (!d.enabled) {
    return (
      <>
        <Group title="Drop parfait">
          <p className="hint">
            La balle reste enfermée dans le cercle, musique étouffée, puis sort <b>exactement</b> au moment du drop : la musique retrouve sa puissance et
            les effets explosent. Le moment est identique dans l’aperçu et dans la vidéo exportée.
          </p>
          {!hasMusic && <p className="hint warn-text">Conseil : importez d’abord une musique (onglet Musique) pour détecter les drops automatiquement.</p>}
          {music && <p className="hint">{candidates.length} drop(s) détecté(s) dans votre musique.</p>}
          <button type="button" className="btn primary wide" onClick={() => enable(true)}>
            ⚡ Activer le mode Drop parfait
          </button>
        </Group>
      </>
    );
  }

  return (
    <>
      <Group title="Drop parfait">
        <Toggle label="Mode Drop parfait" value={d.enabled} onChange={enable} />
        <div className="preset-row">
          {INTENSITY_OPTIONS.map(([k, l]) => (
            <button key={k} type="button" className={`preset ${k}`} onClick={() => applyPreset(k)}>
              {l}
            </button>
          ))}
        </div>
      </Group>

      <Timeline
        analysis={hasMusic ? music!.analysis : null}
        duration={duration}
        offset={offset}
        tl={tl}
        events={d.events}
        candidates={candidates}
        playhead={playhead}
        selected={selected}
        buildUp={d.buildUp}
        onSeek={(t) => player?.seek(t - offset)}
        onSelect={setSelected}
        onMove={(id, t) => updateEv(id, { time: Math.max(0.3, t) })}
      />

      <Group title="Moment de sortie de la balle">
        <Select
          label="Mode"
          value={mode}
          options={[
            ['auto', 'Automatique'],
            ['manual', 'Manuel'],
            ['live', 'Interactif'],
          ]}
          onChange={setMode}
        />
        {mode === 'auto' &&
          (candidates.length ? (
            <ul className="cands">
              {candidates.map((c, i) => (
                <li key={i}>
                  <span>
                    <b>Drop {i + 1}</b> · {formatTime(c.time)}
                    <small>{'★'.repeat(Math.max(1, Math.round(c.score * 3)))}</small>
                  </span>
                  <button type="button" className="mini" onClick={() => listen(c.time)} aria-label="Écouter">
                    🎧
                  </button>
                  <button
                    type="button"
                    className="mini accent"
                    onClick={() => {
                      if (sel) updateEv(sel.id, { time: c.time });
                      else addEvent(c.time);
                      preview(c.time);
                    }}
                  >
                    Choisir
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{hasMusic ? 'Aucun drop net détecté : placez le moment à la main.' : 'Importez une musique pour la détection automatique.'}</p>
          ))}
        {mode === 'manual' && (
          <p className="hint">Glissez le marqueur ⚡ sur la timeline, ou saisissez le temps exact ci-dessous (mm:ss,mmm). Touchez la timeline pour vous y placer.</p>
        )}
        {mode === 'live' && (
          <>
            <p className="hint">Lancez la lecture puis touchez le bouton au moment voulu : la balle sort, et le drop est enregistré dans la timeline pour l’export.</p>
            <button type="button" className="btn wide live-btn" onClick={triggerLive}>
              ⚡ Déclencher le drop
            </button>
          </>
        )}
        <button type="button" className="btn wide" onClick={() => addEvent(playhead + 0.5)}>
          ＋ Ajouter un drop à {formatTime(playhead + 0.5)}
        </button>
      </Group>

      {d.events.length > 0 && (
        <Group title={`Drops (${d.events.length})`}>
          <div className="ev-tabs">
            {d.events.map((e, i) => (
              <button key={e.id} type="button" className={e.id === selected ? 'on' : ''} onClick={() => setSelected(e.id)}>
                {i + 1} · {formatTime(e.time)}
              </button>
            ))}
          </div>
          {sel && (
            <div className="ev-card">
              <label className="field text">
                <span className="field-top">
                  <span>Moment exact (musique)</span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={timeText ?? formatTime(sel.time)}
                  onChange={(e) => setTimeText(e.target.value)}
                  onBlur={() => {
                    const t = timeText === null ? null : parseTime(timeText);
                    if (t !== null) updateEv(sel.id, { time: Math.max(0.3, t) });
                    else if (timeText !== null) notify('Format attendu : 00:32,500');
                    setTimeText(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </label>
              <div className="nudge">
                {[-100, -10, -1, 1, 10, 100].map((ms) => (
                  <button key={ms} type="button" className="mini" onClick={() => nudge(ms)}>
                    {ms > 0 ? '+' : ''}
                    {ms} ms
                  </button>
                ))}
              </div>
              <button type="button" className="btn wide" onClick={() => updateEv(sel.id, { time: Math.max(0.3, Math.round(playhead * 1000) / 1000) })}>
                ⤓ Placer à la tête de lecture ({formatTime(playhead)})
              </button>
              <Select label="Style de sortie" value={sel.style} options={STYLE_OPTIONS} onChange={(v) => updateEv(sel.id, { style: v })} />
              <Select label="Intensité" value={sel.intensity} options={INTENSITY_OPTIONS} onChange={(v) => updateEv(sel.id, { intensity: v })} />
              <Slider
                label="Retour dans un cercle après (0 = auto)"
                min={0}
                max={30}
                step={0.5}
                unit=" s"
                value={sel.freeFor}
                onChange={(v) => updateEv(sel.id, { freeFor: v })}
              />
              <Slider label="Balles supplémentaires libérées" min={0} max={12} step={1} value={sel.extraBalls} onChange={(v) => updateEv(sel.id, { extraBalls: v })} />
              <div className="ev-actions">
                <button type="button" className="btn primary" onClick={() => preview(sel.time)}>
                  ▶ Prévisualiser (±5 s)
                </button>
                <button type="button" className="btn" onClick={() => listen(sel.time)}>
                  🎧 Écouter
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setEvents(d.events.filter((e) => e.id !== sel.id));
                    setSelected(null);
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          )}
        </Group>
      )}

      <Group title="Avant le drop (balle dans le cercle)">
        <Slider label="Volume" min={0.1} max={1} step={0.05} value={d.calmVolume} onChange={(v) => set('drop.calmVolume', v)} />
        <Slider label="Filtre « étouffé » (fréquence)" min={150} max={8000} step={50} unit=" Hz" value={d.calmCutoff} onChange={(v) => set('drop.calmCutoff', v)} />
        <Slider label="Basses" min={-24} max={0} step={1} unit=" dB" value={d.calmBass} onChange={(v) => set('drop.calmBass', v)} />
        <Slider label="Effets visuels" min={0.05} max={1} step={0.05} value={d.calmEffects} onChange={(v) => set('drop.calmEffects', v)} />
        <Slider label="Couleurs atténuées" min={0} max={1} step={0.05} value={d.calmColors} onChange={(v) => set('drop.calmColors', v)} />
        <Slider label="Durée de la montée de tension" min={0} max={12} step={0.5} unit=" s" value={d.buildUp} onChange={(v) => set('drop.buildUp', v)} />
        <Slider label="Ouverture du filtre pendant la montée" min={0} max={0.8} step={0.05} value={d.buildLevel} onChange={(v) => set('drop.buildLevel', v)} />
        <Slider label="Durée du ralenti avant la sortie" min={0} max={2} step={0.05} unit=" s" value={d.slowMo} onChange={(v) => set('drop.slowMo', v)} />
        <Slider label="Force du ralenti (vitesse)" min={0.1} max={1} step={0.05} value={d.slowMoFactor} onChange={(v) => set('drop.slowMoFactor', v)} />
      </Group>

      <Group title="Après le drop (balle libérée)">
        <Slider label="Volume" min={0.5} max={1.4} step={0.05} value={d.afterVolume} onChange={(v) => set('drop.afterVolume', v)} />
        <Slider label="Basses" min={-6} max={12} step={1} unit=" dB" value={d.afterBass} onChange={(v) => set('drop.afterBass', v)} />
        <Slider label="Intensité des effets" min={1} max={3} step={0.1} value={d.afterEffects} onChange={(v) => set('drop.afterEffects', v)} />
        <Slider label="Quantité de particules" min={0.2} max={3} step={0.1} value={d.particles} onChange={(v) => set('drop.particles', v)} />
        <Slider label="Taille de l’explosion" min={0.3} max={2.5} step={0.1} value={d.explosionSize} onChange={(v) => set('drop.explosionSize', v)} />
        <Slider label="Intensité du flash" min={0} max={1} step={0.05} value={d.flash} onChange={(v) => set('drop.flash', v)} />
        <Toggle label="Onde de choc" value={d.shockwave} onChange={(v) => set('drop.shockwave', v)} />
        <Slider label="Vitesse de la balle à la sortie" min={400} max={3000} step={50} unit=" px/s" value={d.exitSpeed} onChange={(v) => set('drop.exitSpeed', v)} />
        <Slider label="Longueur de la traînée" min={1} max={4} step={0.1} unit="×" value={d.trailBoost} onChange={(v) => set('drop.trailBoost', v)} />
        <Toggle label="Couleurs différentes après le drop" value={d.afterPalette.length > 0} onChange={(v) => set('drop.afterPalette', v ? ['#ff2bd6', '#ffd000', '#00e5ff', '#ffd000'] : [])} />
        {d.afterPalette.length > 0 && <PaletteInput label="Couleurs après le drop" value={d.afterPalette} onChange={(v) => set('drop.afterPalette', v)} />}
      </Group>

      <Group title="Transitions audio">
        <Slider label="Durée de la transition au drop" min={0.01} max={1.5} step={0.01} unit=" s" value={d.transitionIn} onChange={(v) => set('drop.transitionIn', v)} />
        <Slider label="Durée du retour au calme" min={0.1} max={4} step={0.1} unit=" s" value={d.transitionOut} onChange={(v) => set('drop.transitionOut', v)} />
      </Group>

      <button type="button" className="btn primary wide generate" onClick={onGenerate}>
        🎬 Générer ma vidéo (9:16, TikTok)
      </button>
    </>
  );
}
