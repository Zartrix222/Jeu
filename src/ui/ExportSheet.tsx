import { useEffect, useRef, useState } from 'react';
import { exportVideo, type ExportResult } from '../engine/exporter';
import type { MusicAnalysis } from '../engine/analysis';
import type { Settings } from '../engine/types';
import { downloadBlob } from '../lib/storage';
import { Select } from './controls';

interface Props {
  settings: Settings;
  name: string;
  music: { buffer: AudioBuffer; analysis: MusicAnalysis } | null;
  onChange: (path: string, v: unknown) => void;
  onClose: () => void;
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function ExportSheet({ settings, name, music, onChange, onClose }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'auto' | 'realtime'>('auto');
  const abort = useRef<AbortController | null>(null);
  const ex = settings.export;
  const fileName = `${(name || 'animation').replace(/[^\w\- ]+/g, '').trim() || 'animation'}-${Date.now().toString().slice(-6)}`;

  useEffect(() => () => {
    abort.current?.abort();
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const start = async () => {
    if (settings.audio.mode !== 'none' && settings.audio.musicId && !music) {
      alert('La musique est encore en cours de chargement, réessayez dans un instant.');
      return;
    }
    setState('running');
    setError('');
    const ac = new AbortController();
    abort.current = ac;
    let lock: WakeLockSentinel | null = null;
    try {
      lock = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
      const r = await exportVideo({
        settings,
        analysis: music?.analysis ?? null,
        buffer: music?.buffer ?? null,
        signal: ac.signal,
        method,
        onProgress: (p, label) => setProgress({ p, label }),
      });
      setResult(r);
      setUrl(URL.createObjectURL(r.blob));
      setState('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') setState('idle');
      else {
        console.error(e);
        setError((e as Error).message || String(e));
        setState('error');
      }
    } finally {
      void lock?.release().catch(() => undefined);
    }
  };

  const file = () => (result ? new File([result.blob], `${fileName}.${result.ext}`, { type: result.mime }) : null);
  const canShare = (() => {
    const f = file();
    try {
      return !!f && !!navigator.canShare?.({ files: [f] });
    } catch {
      return false;
    }
  })();

  const share = async () => {
    const f = file();
    if (!f) return;
    try {
      await navigator.share({ files: [f], title: name });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') downloadBlob(f, f.name);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={state === 'running' ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Exporter la vidéo</h2>
          {state !== 'running' && (
            <button type="button" className="icon" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          )}
        </div>

        {(state === 'idle' || state === 'error') && (
          <>
            <Select
              label="Durée"
              value={ex.duration}
              options={[
                [0, 'Auto (jusqu’à la fin)'],
                [15, '15 s'],
                [30, '30 s'],
                [45, '45 s'],
                [60, '1 min'],
                [90, '1 min 30'],
                [120, '2 min'],
                [180, '3 min'],
              ]}
              onChange={(v) => onChange('export.duration', v)}
            />
            <Select
              label="Résolution (format vertical 9:16)"
              value={ex.resolution}
              options={[
                [1080, '1080 × 1920'],
                [720, '720 × 1280'],
              ]}
              onChange={(v) => onChange('export.resolution', v)}
            />
            <Select
              label="Images par seconde"
              value={ex.fps}
              options={[
                [30, '30 i/s'],
                [60, '60 i/s'],
              ]}
              onChange={(v) => onChange('export.fps', v)}
            />
            <Select
              label="Méthode"
              value={method}
              options={[
                ['auto', 'Rapide (recommandé)'],
                ['realtime', 'Temps réel (secours)'],
              ]}
              onChange={setMethod}
            />
            <p className="hint">
              La vidéo est calculée image par image sur votre téléphone : résultat fluide en MP4, avec la musique. Gardez l’écran allumé
              pendant l’export.
            </p>
            {error && <p className="error">Erreur : {error}. Essayez la méthode « Temps réel » ou la résolution 720.</p>}
            <button type="button" className="btn primary wide" onClick={start}>
              ⬇ Lancer l’export
            </button>
          </>
        )}

        {state === 'running' && (
          <div className="progress-box">
            <div className="progress">
              <div style={{ width: `${Math.round(progress.p * 100)}%` }} />
            </div>
            <p>
              {Math.round(progress.p * 100)} % — {progress.label}
            </p>
            <button type="button" className="btn wide" onClick={() => abort.current?.abort()}>
              Annuler
            </button>
          </div>
        )}

        {state === 'done' && result && (
          <div className="result">
            <video src={url} controls playsInline loop className="result-video" />
            <p className="hint">
              {result.width}×{result.height} · {Math.round(result.duration)} s · {result.ext.toUpperCase()} · {(result.blob.size / 1e6).toFixed(1)} Mo ·{' '}
              {result.method}
            </p>
            {canShare && (
              <button type="button" className="btn primary wide" onClick={share}>
                {isIOS ? '📲 Enregistrer dans Photos / Partager' : '📲 Partager / Enregistrer dans la galerie'}
              </button>
            )}
            <button type="button" className={`btn wide ${canShare ? '' : 'primary'}`} onClick={() => downloadBlob(result.blob, `${fileName}.${result.ext}`)}>
              ⬇ Télécharger le fichier
            </button>
            <p className="hint">
              {isIOS
                ? 'iPhone : touchez « Enregistrer dans Photos », puis « Enregistrer la vidéo » dans le menu de partage.'
                : 'Android : le fichier téléchargé apparaît dans « Téléchargements » et dans Google Photos › Bibliothèque › Download.'}
            </p>
            <button type="button" className="btn wide ghost" onClick={() => setState('idle')}>
              Nouvel export
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
