// Intégration à l'hôte : notifications, confirmations et enregistrement de fichiers.
// Fonctionne dans un navigateur normal (PWA) comme dans une page claude.ai,
// où alert()/confirm() et les liens de téléchargement sont désactivés.

export const IS_ARTIFACT = import.meta.env.VITE_ARTIFACT === '1';

interface Downloads {
  save(r: { filename: string; data: Blob }): Promise<{ status: string }>;
}
let dl: Promise<Downloads | null> | null = null;
export function getDownloads(): Promise<Downloads | null> {
  if (!dl) {
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    dl = c?.use ? (c.use('downloads') as Promise<Downloads | null>).catch(() => null) : Promise.resolve(null);
  }
  return dl;
}

export function notify(message: string) {
  window.dispatchEvent(new CustomEvent('orbit:toast', { detail: message }));
}

export function ask(message: string, okLabel = 'Confirmer'): Promise<boolean> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent('orbit:ask', { detail: { message, okLabel, resolve } })));
}

/** Propose un fichier à l'utilisateur (galerie / téléchargements). */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const d = await getDownloads();
  if (d) {
    try {
      await d.save({ filename, data: blob });
      notify('Fichier enregistré');
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'declined') notify('Enregistrement impossible (' + (code ?? 'erreur') + ')');
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
