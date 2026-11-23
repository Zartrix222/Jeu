import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS, TEMPLATES, templateCategory, templateSettings, type TemplateCategory } from '../engine/templates';
import type { Preset, Project } from '../engine/types';
import { IS_ARTIFACT, ask, notify, saveFile } from '../lib/host';
import { kvGet, kvSet, makeBackup, restoreBackup, storageInfo } from '../lib/storage';
import { makeThumb } from '../lib/thumb';

interface Props {
  projects: Project[];
  presets: Preset[];
  onOpen: (p: Project) => void;
  onCreate: (templateId: string) => void;
  onCreateFromPreset: (p: Preset) => void;
  onQuick: (auto: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (p: Project) => void;
  onRename: (p: Project, name: string) => void;
  onDeletePreset: (id: string) => void;
  onReload: () => void;
}

const THUMB_KEY = 'thumbs.v3';

function useTemplateThumbs() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = ((await kvGet<Record<string, string>>(THUMB_KEY).catch(() => undefined)) ?? {}) as Record<string, string>;
      if (cancelled) return;
      setThumbs(cached);
      const missing = TEMPLATES.filter((t) => !cached[t.id]);
      for (const t of missing) {
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) return;
        cached[t.id] = makeThumb(templateSettings(t.id), t.id.includes('drop') || t.id === 'supernova' || t.id === 'portal-escape' ? 8.6 : 3.2);
        setThumbs({ ...cached });
      }
      if (missing.length) void kvSet(THUMB_KEY, cached).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return thumbs;
}

type BIPEvent = Event & { prompt: () => Promise<void> };
type Cat = TemplateCategory | 'mine';

export function Home(p: Props) {
  const [menu, setMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [cat, setCat] = useState<Cat>('music');
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [newName, setNewName] = useState('');
  const [storage, setStorage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null);
  const thumbs = useTemplateThumbs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const standalone = useMemo(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true, []);

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  useEffect(() => {
    if (settingsOpen) void storageInfo().then(setStorage);
  }, [settingsOpen]);

  const recent = p.projects.slice(0, 6);
  const cats: Cat[] = ['music', 'spectacular', 'balls', 'rings', 'classic', 'mine'];
  const catLabel = (c: Cat) => (c === 'mine' ? 'Mes modèles' : CATEGORY_LABELS[c]);
  const tpls = cat === 'mine' ? [] : TEMPLATES.filter((t) => templateCategory(t) === cat);

  const backup = async (withMusic: boolean) => {
    const blob = await makeBackup(p.projects, withMusic, p.presets);
    await saveFile(blob, `orbit-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const restore = async (f?: File) => {
    if (!f) return;
    try {
      const r = await restoreBackup(f);
      p.onReload();
      notify(`${r.projects} projet(s) et ${r.presets} modèle(s) importé(s)`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const templateGrid = (onPick: (id: string) => void) => (
    <>
      <div className="cat-tabs">
        {cats.map((c) => (
          <button key={c} type="button" className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>
            {catLabel(c)}
          </button>
        ))}
      </div>
      <div className="grid">
        {cat === 'mine' &&
          (p.presets.length ? (
            p.presets.map((ps) => (
              <div key={ps.id} className="card">
                <button type="button" className="card-main" onClick={() => p.onCreateFromPreset(ps)}>
                  {ps.thumb ? <img src={ps.thumb} alt="" /> : <div className="ph" />}
                  <span className="card-name">{ps.name}</span>
                  <small>Mon modèle</small>
                </button>
                <button type="button" className="card-more" onClick={async () => (await ask(`Supprimer le modèle « ${ps.name} » ?`, 'Supprimer')) && p.onDeletePreset(ps.id)} aria-label="Supprimer">
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="empty">Dans l’éditeur, menu ⋯ › « Enregistrer comme modèle » pour créer vos propres modèles.</p>
          ))}
        {tpls.map((t) => (
          <button key={t.id} type="button" className="card card-main tpl" onClick={() => onPick(t.id)}>
            {thumbs[t.id] ? <img src={thumbs[t.id]} alt="" /> : <div className="ph shimmer" />}
            <span className="card-name">{t.name}</span>
            <small>{t.description}</small>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="home">
      <header className="home-bar">
        <div className="logo">
          <span className="logo-mark" />
          <div>
            <h1>Orbit Studio</h1>
            <small>Studio d’animations musicales</small>
          </div>
        </div>
        <button type="button" className="icon" onClick={() => setSettingsOpen(true)} aria-label="Paramètres">
          ⚙
        </button>
      </header>

      <div className="hero-actions">
        <button type="button" className="hero-btn hb-auto" onClick={() => p.onQuick(true)}>
          <span className="hb-icon">✨</span>
          <b>Création automatique</b>
          <small>Importez une musique, l’app fait le reste</small>
        </button>
        <button type="button" className="hero-btn hb-quick" onClick={() => p.onQuick(false)}>
          <span className="hb-icon">⚡</span>
          <b>Création rapide TikTok</b>
          <small>6 étapes guidées, format 9:16</small>
        </button>
        <button type="button" className="hero-btn hb-new" onClick={() => setPicker(true)}>
          <span className="hb-icon">＋</span>
          <b>Nouveau projet</b>
          <small>Partir d’un modèle</small>
        </button>
      </div>

      {!standalone && !IS_ARTIFACT && (
        <div className="install">
          {installEvt ? (
            <>
              <span>Installer l’application sur l’écran d’accueil</span>
              <button type="button" className="btn small primary" onClick={() => installEvt.prompt().then(() => setInstallEvt(null))}>
                Installer
              </button>
            </>
          ) : (
            <span>Astuce : menu du navigateur › « Ajouter à l’écran d’accueil » pour l’utiliser comme une application.</span>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="section">Projets récents</h2>
          <div className="recent-row">
            {recent.map((pr) => (
              <button key={pr.id} type="button" className="recent" onClick={() => p.onOpen(pr)}>
                {pr.thumb ? <img src={pr.thumb} alt="" /> : <div className="ph" />}
                <span>{pr.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="section">Mes projets {p.projects.length ? <small>({p.projects.length})</small> : null}</h2>
      {p.projects.length === 0 ? (
        <p className="empty">Aucun projet pour l’instant : essayez la création automatique ou un modèle ci-dessous.</p>
      ) : (
        <div className="grid">
          {p.projects.map((pr) => (
            <div key={pr.id} className="card">
              <button type="button" className="card-main" onClick={() => p.onOpen(pr)}>
                {pr.thumb ? <img src={pr.thumb} alt="" /> : <div className="ph" />}
                <span className="card-name">{pr.name}</span>
                <small>{new Date(pr.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </button>
              <button type="button" className="card-more" onClick={() => setMenu(menu === pr.id ? null : pr.id)} aria-label="Options">
                ⋯
              </button>
              {menu === pr.id && (
                <div className="card-menu" onClick={() => setMenu(null)}>
                  <button type="button" onClick={() => (setRenaming(pr), setNewName(pr.name))}>
                    Renommer
                  </button>
                  <button type="button" onClick={() => p.onDuplicate(pr)}>
                    Dupliquer
                  </button>
                  <button type="button" onClick={async () => saveFile(await makeBackup([pr], true), `${pr.name.replace(/[^\w\- ]+/g, '') || 'projet'}.orbit.json`)}>
                    Exporter le projet
                  </button>
                  <button type="button" className="danger" onClick={async () => (await ask(`Supprimer « ${pr.name} » ?`, 'Supprimer')) && p.onDelete(pr.id)}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="section">Modèles</h2>
      {templateGrid(p.onCreate)}

      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Choisir un modèle</h2>
              <button type="button" className="icon" onClick={() => setPicker(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            {templateGrid((id) => (setPicker(false), p.onCreate(id)))}
          </div>
        </div>
      )}

      {renaming && (
        <div className="sheet-backdrop" onClick={() => setRenaming(null)}>
          <div className="sheet ask" onClick={(e) => e.stopPropagation()}>
            <label className="field text">
              <span className="field-top">
                <span>Nouveau nom</span>
              </span>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (p.onRename(renaming, newName.trim() || renaming.name), setRenaming(null))} />
            </label>
            <div className="ask-row">
              <button type="button" className="btn" onClick={() => setRenaming(null)}>
                Annuler
              </button>
              <button type="button" className="btn primary" onClick={() => (p.onRename(renaming, newName.trim() || renaming.name), setRenaming(null))}>
                Renommer
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Paramètres</h2>
              <button type="button" className="icon" onClick={() => setSettingsOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <h3 className="sub">Stockage</h3>
            <p className="hint">
              Projets, modèles et musiques sont enregistrés uniquement dans ce navigateur (IndexedDB).
              {storage && storage.quota > 0 && (
                <>
                  {' '}
                  Utilisé : <b>{(storage.used / 1e6).toFixed(1)} Mo</b> sur {(storage.quota / 1e9).toFixed(1)} Go disponibles
                  {storage.persisted ? ' · protégé contre l’effacement automatique' : ' · peut être effacé par le système si l’espace manque'}.
                </>
              )}
            </p>
            {storage && storage.quota > 0 && (
              <div className="progress">
                <div style={{ width: `${Math.min(100, (storage.used / storage.quota) * 100)}%` }} />
              </div>
            )}
            <h3 className="sub">Sauvegardes</h3>
            <button type="button" className="btn wide primary" onClick={() => backup(true)}>
              ⬇ Tout sauvegarder (projets, modèles, musiques)
            </button>
            <button type="button" className="btn wide" onClick={() => backup(false)}>
              ⬇ Sauvegarder sans les musiques (plus léger)
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
            <button type="button" className="btn wide" onClick={() => fileRef.current?.click()}>
              ⬆ Importer une sauvegarde ou un projet
            </button>
            <h3 className="sub">Aide</h3>
            <p className="hint">
              Dans l’éditeur : pincez l’aperçu pour zoomer, touchez une balle pour la régler, double-touchez pour recadrer. ↶ ↷ annulent et rétablissent.
              La qualité de l’aperçu se règle dans Effets ; celle de l’export dans Export.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
