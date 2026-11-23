import { useCallback, useEffect, useState } from 'react';
import { TEMPLATES, templateSettings } from './engine/templates';
import type { Preset, Project, Settings } from './engine/types';
import { uid } from './engine/util';
import { notify } from './lib/host';
import { deletePreset, deleteProject, loadPresets, loadProjects, putPreset, putProject, requestPersistence } from './lib/storage';
import { makeThumb } from './lib/thumb';
import { Dialogs } from './ui/Dialogs';
import { Editor } from './ui/Editor';
import { Home } from './ui/Home';
import { QuickCreate } from './ui/QuickCreate';

type View = { kind: 'home' } | { kind: 'editor'; project: Project } | { kind: 'quick'; auto: boolean };

export default function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [view, setView] = useState<View>({ kind: 'home' });

  const reload = useCallback(() => {
    loadProjects()
      .then(setProjects)
      .catch((e) => {
        console.error(e);
        notify('Stockage local indisponible (navigation privée ?) : les projets ne seront pas conservés.');
        setProjects([]);
      });
    loadPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    reload();
    void requestPersistence();
  }, [reload]);

  const saveProject = useCallback((p: Project) => {
    setProjects((list) => [p, ...(list ?? []).filter((x) => x.id !== p.id)].sort((a, b) => b.updatedAt - a.updatedAt));
    putProject(p).catch((e) => notify((e as Error).message));
  }, []);

  const newProject = (settings: Settings, name: string, template: string): Project => {
    const now = Date.now();
    const p: Project = { id: uid(), name, template, createdAt: now, updatedAt: now, settings, thumb: makeThumb(settings) };
    saveProject(p);
    return p;
  };

  // bouton « retour » du téléphone : revient à l'accueil
  useEffect(() => {
    if (view.kind === 'home') return;
    history.pushState({ sub: true }, '');
    const onPop = () => setView({ kind: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view.kind]);
  const goHome = () => {
    if (history.state?.sub) history.back();
    else setView({ kind: 'home' });
  };

  if (!projects) {
    return (
      <div className="splash">
        <span className="logo-mark big" />
        <p>Chargement…</p>
      </div>
    );
  }

  return (
    <>
      <Dialogs />
      {view.kind === 'editor' && (
        <Editor
          key={view.project.id}
          project={view.project}
          onSave={saveProject}
          onBack={goHome}
          onSavePreset={(name, settings) => {
            const ps: Preset = { id: uid(), name, createdAt: Date.now(), settings, thumb: makeThumb(settings) };
            putPreset(ps)
              .then(() => {
                setPresets((l) => [ps, ...l]);
                notify(`Modèle « ${name} » enregistré`);
              })
              .catch((e) => notify((e as Error).message));
          }}
        />
      )}
      {view.kind === 'quick' && (
        <QuickCreate
          auto={view.auto}
          onClose={goHome}
          onOpenEditor={(s, name, template) => {
            const p = newProject(s, name, template);
            setView({ kind: 'editor', project: p });
          }}
        />
      )}
      {view.kind === 'home' && (
        <Home
          projects={projects}
          presets={presets}
          onOpen={(p) => setView({ kind: 'editor', project: p })}
          onCreate={(id) => {
            const t = TEMPLATES.find((x) => x.id === id);
            setView({ kind: 'editor', project: newProject(templateSettings(id), `${t?.name ?? 'Animation'} ${projects.length + 1}`, id) });
          }}
          onCreateFromPreset={(ps) => setView({ kind: 'editor', project: newProject(structuredClone(ps.settings), `${ps.name} ${projects.length + 1}`, 'custom') })}
          onQuick={(auto) => setView({ kind: 'quick', auto })}
          onDelete={(id) => {
            setProjects((l) => (l ?? []).filter((p) => p.id !== id));
            void deleteProject(id);
          }}
          onDuplicate={(p) => {
            const now = Date.now();
            saveProject({ ...structuredClone(p), id: uid(), name: p.name + ' (copie)', createdAt: now, updatedAt: now });
          }}
          onRename={(p, name) => saveProject({ ...p, name, updatedAt: Date.now() })}
          onDeletePreset={(id) => {
            setPresets((l) => l.filter((p) => p.id !== id));
            void deletePreset(id);
          }}
          onReload={reload}
        />
      )}
    </>
  );
}
