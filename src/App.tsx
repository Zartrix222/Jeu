import { useCallback, useEffect, useState } from 'react';
import { TEMPLATES, templateSettings } from './engine/templates';
import type { Project } from './engine/types';
import { uid } from './engine/util';
import { loadProjects, requestPersistence, saveProjects } from './lib/storage';
import { makeThumb } from './lib/thumb';
import { Editor } from './ui/Editor';
import { Home } from './ui/Home';
import { Dialogs } from './ui/Dialogs';
import { notify } from './lib/host';

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [editing, setEditing] = useState<Project | null>(null);

  useEffect(() => {
    void requestPersistence();
  }, []);

  const commit = useCallback((fn: (list: Project[]) => Project[]) => {
    setProjects((list) => {
      const next = fn(list).sort((a, b) => b.updatedAt - a.updatedAt);
      try {
        saveProjects(next);
      } catch {
        notify('Stockage du navigateur plein : exportez une sauvegarde et supprimez d’anciens projets.');
      }
      return next;
    });
  }, []);

  const onSave = useCallback((p: Project) => commit((list) => [p, ...list.filter((x) => x.id !== p.id)]), [commit]);

  const create = (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    const settings = templateSettings(templateId);
    const now = Date.now();
    const p: Project = {
      id: uid(),
      name: `${t?.name ?? 'Animation'} ${projects.length + 1}`,
      template: templateId,
      createdAt: now,
      updatedAt: now,
      settings,
      thumb: makeThumb(settings),
    };
    onSave(p);
    setEditing(p);
  };

  // bouton « retour » du téléphone : revient à l'accueil
  useEffect(() => {
    if (!editing) return;
    history.pushState({ editor: true }, '');
    const onPop = () => setEditing(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [editing]);

  if (editing) {
    return (
      <>
      <Dialogs />
      <Editor
        key={editing.id}
        project={editing}
        onSave={onSave}
        onBack={() => {
          if (history.state?.editor) history.back();
          else setEditing(null);
        }}
      />
      </>
    );
  }
  return (
    <>
    <Dialogs />
    <Home
      projects={projects}
      onOpen={setEditing}
      onCreate={create}
      onDelete={(id) => commit((l) => l.filter((p) => p.id !== id))}
      onDuplicate={(p) => {
        const now = Date.now();
        onSave({ ...structuredClone(p), id: uid(), name: p.name + ' (copie)', createdAt: now, updatedAt: now });
      }}
      onReplaceAll={(list) => commit(() => list)}
    />
    </>
  );
}
