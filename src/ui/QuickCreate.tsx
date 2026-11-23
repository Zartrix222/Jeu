import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveAudio } from '../engine/audio';
import { detectDrops, formatTime, parseTime } from '../engine/drop';
import { Player } from '../engine/player';
import { TEMPLATES, templateSettings } from '../engine/templates';
import { setPath } from './controls';
import type { Settings } from '../engine/types';
import { GEN_STYLES, generate, type GenStyle } from '../lib/autoCreate';
import { notify } from '../lib/host';
import { allMusic, importMusicFile, loadMusic, type LoadedMusic, type StoredMusic } from '../lib/storage';
import { ExportSheet } from './ExportSheet';

interface Props {
  auto: boolean; // création automatique : enchaîne les choix par défaut
  onClose: () => void;
  onOpenEditor: (s: Settings, name: string, template: string) => void;
}

const STEPS = ['Musique', 'Style', 'Drop', 'Durée', 'Aperçu', 'Export'];
const DURATIONS = [15, 20, 30, 45, 60];

export function QuickCreate({ auto, onClose, onOpenEditor }: Props) {
  const [step, setStep] = useState(0);
  const [library, setLibrary] = useState<StoredMusic[]>([]);
  const [musicMeta, setMusicMeta] = useState<StoredMusic | null>(null);
  const [music, setMusic] = useState<LoadedMusic | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [style, setStyle] = useState<GenStyle>('energetic');
  const [template, setTemplate] = useState('perfect-drop-2');
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [duration, setDuration] = useState(20);
  const [seed, setSeed] = useState(1);
  const [showExport, setShowExport] = useState(false);
  const [patches, setPatches] = useState<[string, unknown][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const audioRef = useRef<LiveAudio | null>(null);

  useEffect(() => {
    void allMusic().then(setLibrary).catch(() => undefined);
    return () => audioRef.current?.close();
  }, []);

  const candidates = useMemo(() => (music ? detectDrops(music.analysis, 5) : []), [music]);

  const choose = async (m: StoredMusic) => {
    setMusicMeta(m);
    setLoading('Analyse de la musique…');
    try {
      const lm = await loadMusic(m.id, (p) => setLoading(`Analyse ${Math.round(p * 100)} %`));
      setMusic(lm);
      const best = detectDrops(lm.analysis, 5)[0]?.time ?? Math.min(lm.buffer.duration / 2, 30);
      setDropTime(best);
      setLoading(null);
      setStep(auto ? 4 : 1);
    } catch (e) {
      setLoading(null);
      notify('Musique illisible : ' + (e as Error).message);
    }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const m = await importMusicFile(f);
      setLibrary((l) => [m, ...l]);
      await choose(m);
    } catch (e) {
      notify('Import impossible : ' + (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const result = useMemo(() => {
    if (!music || dropTime === null) return null;
    const base = style === 'custom' ? TEMPLATES.find((t) => t.id === template) : null;
    const r = generate({
      analysis: music.analysis,
      musicId: musicMeta?.id,
      musicName: musicMeta?.name,
      style: style === 'custom' ? 'custom' : style,
      dropTime,
      duration,
      seed,
      base: base ? templateSettings(template) : undefined,
    });
    return r;
  }, [music, dropTime, duration, style, template, seed, musicMeta]);

  // aperçu : le lecteur suit la génération
  useEffect(() => {
    if (step !== 4 || !result || !canvasRef.current || !music) return;
    let p = playerRef.current;
    if (!p) {
      p = new Player(canvasRef.current, result.settings);
      playerRef.current = p;
    } else p.setSettings(result.settings);
    p.setMusic(music.buffer, music.analysis);
    const T = (dropTime ?? 0) - result.settings.audio.startOffset;
    p.previewAround(T, Math.min(5, T), 4);
  }, [step, result, music, dropTime]);
  useEffect(
    () => () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    },
    [],
  );
  useEffect(() => {
    if (step !== 4) {
      playerRef.current?.destroy();
      playerRef.current = null;
    }
  }, [step]);

  const listen = async (t: number) => {
    if (!music) return;
    audioRef.current ??= new LiveAudio();
    audioRef.current.buffer = music.buffer;
    await audioRef.current.resume();
    audioRef.current.listen(Math.max(0, t - 3), 6);
  };

  return (
    <div className="quick">
      <header className="quick-head">
        <button type="button" className="icon" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <div className="steps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={i === step ? 'on' : i < step ? 'done' : ''} disabled={i > step && !(music && i <= 4)} onClick={() => setStep(i)}>
              <i>{i + 1}</i>
              <span>{s}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="quick-body">
        {step === 0 && (
          <section>
            <h2>{auto ? 'Création automatique' : 'Création rapide TikTok'}</h2>
            <p className="hint">{auto ? 'Choisissez une musique : l’application analyse les drops et prépare tout seule une animation synchronisée.' : 'Une vidéo 9:16 en quelques choix. Tout reste modifiable ensuite.'}</p>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" className="btn primary wide big-btn" onClick={() => fileRef.current?.click()} disabled={!!loading}>
              🎵 Importer une musique du téléphone
            </button>
            {loading && <p className="hint">{loading}</p>}
            {library.length > 0 && (
              <>
                <h3>Mes musiques</h3>
                <ul className="lib">
                  {library.map((m) => (
                    <li key={m.id} className={m.id === musicMeta?.id ? 'on' : ''}>
                      <button type="button" onClick={() => choose(m)} disabled={!!loading}>
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {step === 1 && (
          <section>
            <h2>Style</h2>
            <div className="choice-grid">
              {GEN_STYLES.map((g) => (
                <button key={g.id} type="button" className={`choice ${style === g.id ? 'on' : ''}`} onClick={() => setStyle(g.id)}>
                  <b>{g.label}</b>
                  <small>{g.desc}</small>
                </button>
              ))}
            </div>
            {style === 'custom' && (
              <>
                <h3>Modèle</h3>
                <div className="chips">
                  {TEMPLATES.filter((t) => t.id !== 'custom').map((t) => (
                    <button key={t.id} type="button" className={template === t.id ? 'on' : ''} onClick={() => setTemplate(t.id)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" className="btn primary wide" onClick={() => setStep(2)}>
              Continuer
            </button>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2>Le drop</h2>
            <p className="hint">Classés par score de confiance. « Incertain » signifie que l’analyse n’est pas sûre : écoutez avant de choisir.</p>
            {music && music.analysis.bpm > 0 && <p className="hint">Tempo estimé : {Math.round(music.analysis.bpm)} BPM</p>}
            <ul className="cands">
              {candidates.map((c, i) => (
                <li key={i} className={dropTime === c.time ? 'on' : ''}>
                  <span>
                    <b>
                      #{i + 1} · {formatTime(c.time)}
                    </b>
                    <em className={c.certain ? 'conf ok' : 'conf maybe'}>{c.certain ? `fiable ${Math.round(c.confidence * 100)} %` : `incertain ${Math.round(c.confidence * 100)} %`}</em>
                    <small>{c.reasons.join(' · ')}</small>
                  </span>
                  <button type="button" className="mini" onClick={() => listen(c.time)} aria-label="Écouter">
                    🎧
                  </button>
                  <button type="button" className="mini accent" onClick={() => setDropTime(c.time)}>
                    {dropTime === c.time ? '✓' : 'Choisir'}
                  </button>
                </li>
              ))}
              {!candidates.length && <li>Aucun drop net détecté : saisissez le moment ci-dessous.</li>}
            </ul>
            <label className="field text">
              <span className="field-top">
                <span>Ou un moment précis (mm:ss,mmm)</span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={dropTime !== null ? formatTime(dropTime) : '00:32,500'}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onBlur={() => {
                  const t = parseTime(manual);
                  if (t !== null) setDropTime(t);
                  else if (manual) notify('Format attendu : 00:32,500');
                }}
              />
            </label>
            <button type="button" className="btn primary wide" onClick={() => setStep(3)} disabled={dropTime === null}>
              Continuer
            </button>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2>Durée de la vidéo</h2>
            <div className="chips big">
              {DURATIONS.map((d) => (
                <button key={d} type="button" className={duration === d ? 'on' : ''} onClick={() => setDuration(d)}>
                  {d} s
                </button>
              ))}
            </div>
            <p className="hint">Le drop est placé vers 45 % de la vidéo pour laisser monter la tension.</p>
            <button type="button" className="btn primary wide" onClick={() => setStep(4)}>
              Voir l’aperçu
            </button>
          </section>
        )}

        {step === 4 && result && (
          <section className="quick-preview">
            <div className="qp-canvas">
              <canvas ref={canvasRef} className="preview" onClick={() => playerRef.current?.toggle()} />
            </div>
            <div className="row-btns">
              <button type="button" className="btn" onClick={() => playerRef.current?.previewAround((dropTime ?? 0) - result.settings.audio.startOffset, 5, 4)}>
                ↺ Revoir le drop
              </button>
              <button type="button" className="btn" onClick={() => playerRef.current?.seek(0, true)}>
                ▶ Depuis le début
              </button>
              <button type="button" className="btn" onClick={() => setSeed((x) => x + 1)}>
                🎲 Autre variante
              </button>
            </div>
            <p className="hint">
              {result.name} · drop à {formatTime(dropTime ?? 0)} · {duration} s
            </p>
            <button type="button" className="btn primary wide" onClick={() => setStep(5)}>
              Continuer vers l’export
            </button>
            <button type="button" className="btn wide" onClick={() => onOpenEditor(result.settings, result.name, result.template)}>
              ✎ Modifier dans l’éditeur
            </button>
          </section>
        )}

        {step === 5 && result && (
          <section>
            <h2>Exporter</h2>
            <p className="hint">Format vertical 9:16 pour TikTok.</p>
            <button type="button" className="btn primary wide big-btn" onClick={() => setShowExport(true)}>
              🎬 Générer ma vidéo
            </button>
            <button type="button" className="btn wide" onClick={() => onOpenEditor(result.settings, result.name, result.template)}>
              ✎ Ouvrir dans l’éditeur (le projet est enregistré)
            </button>
          </section>
        )}
      </div>

      {showExport && result && (
        <ExportSheet
          settings={patches.reduce((acc, [k, v]) => setPath(acc, k, v), result.settings)}
          name={result.name}
          music={music}
          onChange={(k, v) => setPatches((ps) => [...ps.filter(([x]) => x !== k), [k, v]])}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
