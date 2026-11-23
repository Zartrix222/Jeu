import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, templateSettings } from '../engine/templates';
import type { Project } from '../engine/types';
import { downloadBlob, makeBackup, restoreBackup } from '../lib/storage';
import { makeThumb } from '../lib/thumb';

interface Props {
  projects: Project[];
  onOpen: (p: Project) => void;
  onCreate: (templateId: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (p: Project) => void;
  onReplaceAll: (list: Project[]) => void;
}

const thumbCache = new Map<string, string>();

function useTemplateThumbs() {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => Object.fromEntries(thumbCache));
  useEffect(() => {
    let i = 0;
    let cancelled = false;
    const next = () => {
      if (cancelled || i >= TEMPLATES.length) return;
      const t = TEMPLATES[i++];
      if (!thumbCache.has(t.id)) {
        thumbCache.set(t.id, makeThumb(templateSettings(t.id), 3.2));
        setThumbs(Object.fromEntries(thumbCache));
      }
      setTimeout(next, 16);
    };
    next();
    return () => {
      cancelled = true;
    };
  }, []);
  return thumbs;
}

type BIPEvent = Event & { prompt: () => Promise<void> };

export function Home({ projects, onOpen, onCreate, onDelete, onDuplicate, onReplaceAll }: Props) {
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const thumbs = useTemplateThumbs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const standalone = useMemo(
    () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true,
    [],
  );

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const backup = async (withMusic: boolean) => {
    const blob = await makeBackup(projects, withMusic);
    downloadBlob(blob, `orbit-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await restoreBackup(f, projects);
      onReplaceAll(r.projects);
      alert(`${r.added} projet(s) importé(s).`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const exportOne = async (p: Project) => {
    const blob = await makeBackup([p], true);
    downloadBlob(blob, `${p.name.replace(/[^\w\- ]+/g, '') || 'projet'}.orbit.json`);
  };

  return (
    <div className="home">
      <header className="home-bar">
        <div className="logo">
          <span className="logo-mark" />
          <div>
            <h1>Orbit Studio</h1>
            <small>Balles · cercles · musique</small>
          </div>
        </div>
        <button type="button" className="icon" onClick={() => setSettingsOpen(true)} aria-label="Sauvegardes">
          ⚙
        </button>
      </header>

      <button type="button" className="create" onClick={() => setPicker(true)}>
        <span>＋</span> Créer une animation
      </button>

      {!standalone && (
        <div className="install">
          {installEvt ? (
            <>
              <span>Installer l’application sur l’écran d’accueil</span>
              <button type="button" className="btn small primary" onClick={() => installEvt.prompt().then(() => setInstallEvt(null))}>
                Installer
              </button>
            </>
          ) : (
            <span>
              Astuce : menu du navigateur ⋮ / partager <b>⎋</b> → « Ajouter à l’écran d’accueil » pour l’utiliser comme une application.
            </span>
          )}
        </div>
      )}

      <h2 className="section">Mes projets</h2>
      {projects.length === 0 ? (
        <p className="empty">Aucun projet pour l’instant. Choisissez un modèle ci-dessous pour commencer.</p>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <div key={p.id} className="card">
              <button type="button" className="card-main" onClick={() => onOpen(p)}>
                {p.thumb ? <img src={p.thumb} alt="" /> : <div className="ph" />}
                <span className="card-name">{p.name}</span>
                <small>{new Date(p.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </button>
              <button type="button" className="card-more" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label="Options">
                ⋯
              </button>
              {menu === p.id && (
                <div className="card-menu" onClick={() => setMenu(null)}>
                  <button type="button" onClick={() => onDuplicate(p)}>
                    Dupliquer
                  </button>
                  <button type="button" onClick={() => exportOne(p)}>
                    Exporter le projet (.json)
                  </button>
                  <button type="button" className="danger" onClick={() => confirm(`Supprimer « ${p.name} » ?`) && onDelete(p.id)}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="section">Modèles</h2>
      <div className="grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="card card-main tpl" onClick={() => onCreate(t.id)}>
            {thumbs[t.id] ? <img src={thumbs[t.id]} alt="" /> : <div className="ph" />}
            <span className="card-name">{t.name}</span>
            <small>{t.description}</small>
          </button>
        ))}
      </div>

      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Choisir un modèle</h2>
              <button type="button" className="icon" onClick={() => setPicker(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="card card-main tpl" onClick={() => onCreate(t.id)}>
                  {thumbs[t.id] ? <img src={thumbs[t.id]} alt="" /> : <div className="ph" />}
                  <span className="card-name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Sauvegardes</h2>
              <button type="button" className="icon" onClick={() => setSettingsOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <p className="hint">
              Vos projets sont enregistrés uniquement dans ce navigateur. Exportez régulièrement une sauvegarde pour ne rien perdre (changement de
              téléphone, nettoyage des données…).
            </p>
            <button type="button" className="btn wide primary" onClick={() => backup(true)}>
              ⬇ Sauvegarder tous les projets + musiques
            </button>
            <button type="button" className="btn wide" onClick={() => backup(false)}>
              ⬇ Sauvegarder les projets (sans musique, plus léger)
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
            <button type="button" className="btn wide" onClick={() => fileRef.current?.click()}>
              ⬆ Restaurer / importer une sauvegarde
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
