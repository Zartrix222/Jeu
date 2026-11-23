// Génération automatique d'une animation à partir d'une musique analysée.
// Le résultat est un projet ordinaire : tout reste modifiable dans l'éditeur.

import type { MusicAnalysis } from '../engine/analysis';
import { DROP_PRESETS, detectDrops } from '../engine/drop';
import { DEFAULT_SETTINGS, TEMPLATES, mergeSettings, templateSettings } from '../engine/templates';
import type { DropEvent, DropIntensity, DropStyle, Settings } from '../engine/types';
import { mulberry32, uid } from '../engine/util';

export type GenStyle = 'calm' | 'energetic' | 'spectacular' | 'random' | 'custom';

export const GEN_STYLES: { id: GenStyle; label: string; desc: string }[] = [
  { id: 'calm', label: 'Calme', desc: 'Anneaux néon, transition douce, effets légers.' },
  { id: 'energetic', label: 'Énergique', desc: 'Tunnel d’anneaux, sortie nette sur le drop.' },
  { id: 'spectacular', label: 'Spectaculaire', desc: 'Supernova, galaxie, portail… effets maximum.' },
  { id: 'random', label: 'Aléatoire', desc: 'Un mélange surprise de modèle, couleurs et style.' },
  { id: 'custom', label: 'Personnalisé', desc: 'Votre modèle ou votre projet actuel.' },
];

const PALETTES = [
  ['#ffae2b', '#f24fd0', '#a24bff', '#f24fd0'],
  ['#e0333f', '#8f1a2a', '#ff5a5f', '#8f1a2a'],
  ['#00e5ff', '#7c4dff', '#ff2bd6', '#7c4dff'],
  ['#00ffa3', '#00b3ff', '#3a4bff', '#00b3ff'],
  ['#ffd000', '#ff7a00', '#ff2a00', '#ff7a00'],
  ['#ffffff', '#9fe8ff', '#4aa8ff', '#9fe8ff'],
];

export interface GenOptions {
  analysis: MusicAnalysis | null;
  musicId?: string;
  musicName?: string;
  style: GenStyle;
  dropTime: number; // temps musique (s)
  duration: number; // durée de la vidéo (s)
  seed?: number;
  base?: Settings; // pour « Personnalisé » : réglages de départ
}

export function pickBestDrop(a: MusicAnalysis | null): number | null {
  if (!a) return null;
  const c = detectDrops(a, 5);
  return c.length ? c[0].time : null;
}

export function generate(o: GenOptions): { settings: Settings; name: string; template: string } {
  const rnd = mulberry32((o.seed ?? 1) * 7919 + Math.round(o.dropTime * 1000));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length) % arr.length];
  let template = 'perfect-drop-2';
  let style: DropStyle = 'pass';
  let intensity: DropIntensity = 'power';
  let extra = 0;
  switch (o.style) {
    case 'calm':
      template = pick(['neon-rings', 'rotating-circles', 'perfect-drop-2']);
      style = pick<DropStyle>(['open', 'vanish', 'pass']);
      intensity = 'soft';
      break;
    case 'energetic':
      template = pick(['perfect-drop-2', 'rainbow-tunnel', 'music-explosion', 'bass-reactor']);
      style = pick<DropStyle>(['pass', 'chain', 'explode', 'infinity', 'shockwave']);
      intensity = 'power';
      extra = pick([0, 0, 3]);
      break;
    case 'spectacular':
      template = pick(['supernova', 'galaxy-drop', 'portal-escape', 'ultimate-drop', 'neon-storm']);
      style = pick<DropStyle>(['supernova', 'galaxy', 'portal', 'shatter', 'neonburst', 'blackout']);
      intensity = 'extreme';
      extra = pick([0, 4, 8]);
      break;
    case 'random':
      template = pick(TEMPLATES.filter((t) => t.category && t.category !== 'classic').map((t) => t.id));
      style = pick<DropStyle>(['pass', 'open', 'explode', 'chain', 'supernova', 'portal', 'shatter', 'shockwave', 'infinity', 'galaxy', 'neonburst', 'blackout']);
      intensity = pick<DropIntensity>(['soft', 'power', 'extreme']);
      extra = pick([0, 0, 2, 5]);
      break;
    default:
      template = 'custom';
  }
  let s: Settings = o.style === 'custom' && o.base ? structuredClone(o.base) : templateSettings(template);
  if (o.style === 'custom' && !o.base) s = templateSettings('perfect-drop-2');
  if (o.style === 'random') {
    s.rings.palette = pick(PALETTES);
    s.seed = 1 + Math.floor(rnd() * 900);
  }
  // les modèles « une balle dans un cercle fermé » ont besoin d'anneaux pour un drop
  if (s.rings.count < 2 && o.style !== 'custom') s.rings = { ...templateSettings('perfect-drop-2').rings, palette: s.rings.palette };

  const lead = Math.max(3, Math.min(12, o.duration * 0.45));
  let startOffset = Math.max(0, o.dropTime - lead);
  if (o.analysis) startOffset = Math.min(startOffset, Math.max(0, o.analysis.duration - o.duration));
  const events: DropEvent[] = [{ id: uid(), time: Math.round(o.dropTime * 1000) / 1000, style, intensity, freeFor: 0, extraBalls: extra }];
  // second drop si la musique en propose un dans la fenêtre
  if (o.analysis && o.style !== 'calm') {
    const second = detectDrops(o.analysis, 5).find((c) => c.certain && c.time > o.dropTime + 6 && c.time < startOffset + o.duration - 4);
    if (second) {
      events[0].freeFor = Math.max(2, (second.time - o.dropTime) * 0.45);
      events.push({ id: uid(), time: second.time, style: o.style === 'spectacular' ? 'shatter' : style, intensity: 'extreme', freeFor: 0, extraBalls: extra + 2 });
    }
  }
  s = mergeSettings(s, {
    audio: { mode: o.analysis ? 'continuous' : 'none', musicId: o.musicId, musicName: o.musicName, startOffset },
    drop: { ...DROP_PRESETS[intensity], enabled: true, events },
    export: { duration: o.duration, aspect: '9:16', resolution: 1080 },
  });
  if (o.style !== 'custom') s.camera = { ...DEFAULT_SETTINGS.camera, ...s.camera, buildZoom: intensity === 'soft' ? 0.05 : 0.12, dropZoom: intensity === 'extreme' ? 0.3 : 0.18 };
  const label = GEN_STYLES.find((g) => g.id === o.style)?.label ?? 'Auto';
  return { settings: s, name: `${o.musicName ?? 'Animation'} · ${label}`, template };
}
