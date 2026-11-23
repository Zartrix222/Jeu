import { useEffect, useRef, useState } from 'react';
import type { MusicAnalysis } from '../engine/analysis';
import { RESOLUTIONS, computeDuration, exportDims, exportVideo, probeExport, type ExportCaps, type ExportResult } from '../engine/exporter';
import type { Settings } from '../engine/types';
import { IS_ARTIFACT, notify, saveFile } from '../lib/host';
import { Select } from './controls';

interface Props {
  settings: Settings;
  name: string;
  music: { buffer: AudioBuffer; analysis: MusicAnalysis } | null;
  onChange: (path: string, v: unknown) => void;
  onClose: () => void;
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const RES_LABEL: Record<number, string> = { 720: '720p', 1080: '1080p', 1440: '1440p', 2160: '4K' };

export function ExportSheet({ settings, name, music, onChange, onClose }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'auto' | 'realtime'>('auto');
  const [caps, setCaps] = useState<ExportCaps | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ex = settings.export;
  const fileName = `${(name || 'animation').replace(/[^\w\- ]+/g, '').trim() || 'animation'}-${Date.now().toString().slice(-6)}`;
  const duration = computeDuration(settings, music?.analysis ?? null);

  useEffect(() => {
    let alive = true;
    probeExport(settings).then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.aspect, ex.customW, ex.customH]);

  // ne garde que des options réellement utilisables
  const okRes = caps ? RESOLUTIONS.filter((r) => caps.supported[`${r}@${ex.fps}`]) : [];
  const okFps = caps ? ([30, 60] as const).filter((f) => RESOLUTIONS.some((r) => caps.supported[`${r}@${f}`])) : [];
  useEffect(() => {
    if (!caps || !caps.webcodecs) return;
    if (!okFps.includes(ex.fps) && okFps.length) onChange('export.fps', okFps[0]);
    else if (!okRes.includes(ex.resolution) && okRes.length) onChange('export.resolution', okRes.includes(1080) ? 1080 : okRes[okRes.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps, ex.fps]);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const dims = exportDims(settings);
  const estMb = (Math.min(60e6, Math.max(4e6, dims.width * dims.height * ex.fps * 0.18)) * duration) / 8 / 1e6;

  const start = async () => {
    if (settings.audio.mode !== 'none' && settings.audio.musicId && !music) {
      notify('La musique est encore en cours de chargement, réessayez dans un instant.');
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
        method: method === 'realtime' || !caps?.webcodecs ? 'realtime' : 'auto',
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
    if (IS_ARTIFACT) return false;
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
      if ((e as Error).name !== 'AbortError') void saveFile(f, f.name);
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
            {!caps && <p className="hint">Vérification des formats pris en charge par cet appareil…</p>}
            {caps && caps.webcodecs && (
              <>
                <Select label="Définition" value={ex.resolution} options={okRes.map((r) => [r, RES_LABEL[r]] as [typeof r, string])} onChange={(v) => onChange('export.resolution', v)} />
                <Select label="Images par seconde" value={ex.fps} options={okFps.map((f) => [f, `${f} i/s`] as [typeof f, string])} onChange={(v) => onChange('export.fps', v)} />
                <Select
                  label="Méthode"
                  value={method}
                  options={[
                    ['auto', 'Image par image (recommandé)'],
                    ...(caps.realtime ? ([['realtime', 'Temps réel (secours)']] as [typeof method, string][]) : []),
                  ]}
                  onChange={setMethod}
                />
              </>
            )}
            {caps && !caps.webcodecs && (
              <p className="hint warn-text">
                Ce navigateur ne sait pas encoder la vidéo image par image : l’export se fera en temps réel ({caps.realtimeMp4 ? 'MP4' : 'WebM'}), limité au 1080p.
              </p>
            )}
            {caps && (
              <p className="hint">
                {dims.width}×{dims.height} · {Math.round(duration)} s · environ {estMb.toFixed(0)} Mo · son {caps.audio ? caps.audio.toUpperCase() : 'temps réel'}.
                {estMb > 600 && ' Fichier très lourd : réduisez la durée ou la définition si l’export échoue (mémoire du téléphone).'}
              </p>
            )}
            {error && <p className="error">Erreur : {error}. Essayez une définition plus basse ou la méthode « Temps réel ».</p>}
            <button type="button" className="btn primary wide" onClick={start} disabled={!caps}>
              ⬇ Lancer l’export
            </button>
            <p className="hint">Gardez l’écran allumé. Le calcul se fait sur votre téléphone, dans un processus séparé quand c’est possible.</p>
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
              {result.width}×{result.height} · {Math.round(result.duration)} s · {result.ext.toUpperCase()} · {(result.blob.size / 1e6).toFixed(1)} Mo · {result.method}
            </p>
            {canShare && (
              <button type="button" className="btn primary wide" onClick={share}>
                {isIOS ? '📲 Enregistrer dans Photos / Partager' : '📲 Partager / Enregistrer dans la galerie'}
              </button>
            )}
            <button type="button" className={`btn wide ${canShare ? '' : 'primary'}`} onClick={() => saveFile(result.blob, `${fileName}.${result.ext}`)}>
              {IS_ARTIFACT ? '📲 Enregistrer la vidéo' : '⬇ Télécharger le fichier'}
            </button>
            <p className="hint">
              {IS_ARTIFACT
                ? 'Dans l’app Claude, le menu de partage s’ouvre : « Enregistrer la vidéo » (iPhone) ou votre galerie.'
                : isIOS
                  ? 'iPhone : « Enregistrer dans Photos », puis « Enregistrer la vidéo ».'
                  : 'Android : le fichier va dans Téléchargements (visible dans Google Photos › Bibliothèque).'}
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
