import { renderFrame } from '../engine/render';
import { Simulation } from '../engine/sim';
import type { Settings } from '../engine/types';

/** Miniature JPEG d'une animation (image à l'instant `t`). */
export function makeThumb(s: Settings, t = 2.5, w = 180, h = 320): string {
  try {
    const sim = new Simulation({ ...s, audio: { ...s.audio, mode: 'none' } }, null);
    sim.advanceTo(t);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    renderFrame(c.getContext('2d')!, sim, w, h);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}
