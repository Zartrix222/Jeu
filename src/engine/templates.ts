import type { DeepPartial, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  seed: 7,
  balls: {
    count: 1,
    radius: 22,
    color: '#ffd23f',
    colorMode: 'solid',
    speed: 900,
    gravity: 1400,
    bounce: 1,
    minSpeed: 700,
    maxSpeed: 2400,
    trail: true,
    trailLength: 14,
    trailStyle: 'comet',
    glow: 0.8,
    growOnBounce: 0,
    ballCollisions: true,
  },
  rings: {
    count: 60,
    innerRadius: 240,
    spacing: 9,
    thickness: 3,
    centerY: 0.5,
    gap: 50,
    rotationSpeed: 40,
    twist: 0,
    speedSpread: 0.15,
    jitter: 6,
    palette: ['#ffae2b', '#f24fd0', '#9b4dff', '#f24fd0'],
    colorMode: 'bands',
    bandSize: 40,
    breakable: true,
    hitsToBreak: 0,
    breakDrag: 0.02,
    collapse: true,
    collapseSpeed: 260,
    infinite: false,
    highlightInner: true,
    innerDisc: true,
    walls: true,
  },
  effects: {
    background: '#000000',
    backgroundGlow: '#1a0b22',
    particles: true,
    particleAmount: 1,
    explosions: true,
    sparks: true,
    neon: 0.7,
    rainbow: false,
    rainbowSpeed: 60,
    shake: false,
    flash: false,
    innerDust: true,
    musicReactive: true,
    reactivity: 1,
    beatImpulse: false,
    endVisualizer: true,
  },
  counter: {
    mode: 'remaining',
    text: '{n}',
    size: 120,
    color: '#ffffff',
    title: '',
    titleSize: 64,
    endText: '',
  },
  audio: {
    mode: 'none',
    startOffset: 0,
    gateMs: 260,
    musicVolume: 1,
    sfx: 'notes',
    sfxVolume: 0.6,
    scale: 'pentatonic',
  },
  export: { duration: 0, fps: 30, resolution: 1080 },
  drop: {
    enabled: false,
    events: [],
    calmVolume: 0.7,
    calmCutoff: 700,
    calmBass: -10,
    afterVolume: 1,
    afterBass: 3,
    buildUp: 4,
    buildLevel: 0.35,
    transitionIn: 0.06,
    transitionOut: 1.2,
    slowMo: 0.5,
    slowMoFactor: 0.35,
    calmEffects: 0.35,
    calmColors: 0.55,
    afterEffects: 1.6,
    particles: 1.2,
    explosionSize: 1.1,
    flash: 0.8,
    shockwave: true,
    exitSpeed: 1600,
    trailBoost: 2,
    afterPalette: [],
  },
};

export function mergeSettings(base: Settings, patch: DeepPartial<Settings> | undefined): Settings {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  if (!patch) return out as unknown as Settings;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(out[k] as object), ...(v as object) };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as unknown as Settings;
}

/** Complète un réglage incomplet (ancien projet, import) avec les valeurs par défaut. */
export function normalizeSettings(s: DeepPartial<Settings> | undefined): Settings {
  return mergeSettings(DEFAULT_SETTINGS, s);
}

export interface Template {
  id: string;
  name: string;
  description: string;
  patch: DeepPartial<Settings>;
}

export const TEMPLATES: Template[] = [
  {
    id: 'bounce-circle',
    name: 'Balle dans un cercle',
    description: 'Une balle rebondit dans un cercle et grossit à chaque choc.',
    patch: {
      seed: 3,
      balls: { radius: 26, growOnBounce: 3, color: '#46e0ff', colorMode: 'perBounce', speed: 700, gravity: 1500, trailLength: 10 },
      rings: {
        count: 1, innerRadius: 430, thickness: 10, gap: 0, rotationSpeed: 0, breakable: false, collapse: false,
        palette: ['#ffffff'], colorMode: 'solid', innerDisc: false, highlightInner: true,
      },
      effects: { background: '#05050a', backgroundGlow: '#101030', innerDust: false, endVisualizer: false },
      counter: { mode: 'bounces', size: 110, title: 'Combien de rebonds ?' },
    },
  },
  {
    id: 'ring-breaker',
    name: 'Balle destructrice',
    description: 'Des centaines d’anneaux à casser, compte à rebours au centre.',
    patch: {
      seed: 11,
      balls: { radius: 22, color: '#ffc531', glow: 1, trailLength: 6, speed: 1000, gravity: 1500 },
      rings: {
        count: 1500, innerRadius: 245, spacing: 5.6, thickness: 2.6, gap: 55, rotationSpeed: 45, speedSpread: 0.02,
        twist: 0.02, jitter: 5, palette: ['#ffae2b', '#f24fd0', '#a24bff', '#f24fd0'], colorMode: 'bands', bandSize: 46,
        collapse: true, collapseSpeed: 300,
      },
      effects: { background: '#000000', backgroundGlow: '#1b0b1f' },
      counter: { mode: 'remaining', size: 120 },
    },
  },
  {
    id: 'multi-balls',
    name: 'Plusieurs balles',
    description: 'Huit balles colorées s’entrechoquent et cassent les cercles.',
    patch: {
      seed: 5,
      balls: { count: 8, radius: 20, colorMode: 'rainbow', speed: 800, gravity: 900, trailLength: 10, ballCollisions: true },
      rings: {
        count: 12, innerRadius: 230, spacing: 32, thickness: 7, gap: 34, breakDrag: 0, rotationSpeed: 50, twist: 30, speedSpread: 0.6,
        jitter: 0, colorMode: 'gradient', palette: ['#4df2ff', '#7a5cff', '#ff4fd8'], collapse: false, breakable: true,
        hitsToBreak: 0, innerDisc: false,
      },
      effects: { background: '#04040c', backgroundGlow: '#0d1030', innerDust: false, shake: true },
      counter: { mode: 'destroyed', text: '{n}', title: 'Quelle balle va gagner ?' },
    },
  },
  {
    id: 'infinite',
    name: 'Cercles infinis',
    description: 'Les cercles se régénèrent sans fin, le compteur grimpe.',
    patch: {
      seed: 21,
      balls: { radius: 18, color: '#ffffff', speed: 1000, gravity: 1300, trailLength: 12 },
      rings: {
        count: 90, innerRadius: 200, spacing: 11, thickness: 4, gap: 85, rotationSpeed: 70, twist: 2, breakDrag: 0, speedSpread: 0.1,
        jitter: 0, palette: ['#00e5ff', '#7c4dff', '#ff2bd6', '#7c4dff'], colorMode: 'bands', bandSize: 30, infinite: true,
        collapse: true, collapseSpeed: 180,
      },
      effects: { background: '#020208', backgroundGlow: '#0a0a2a' },
      counter: { mode: 'destroyed' },
    },
  },
  {
    id: 'comet',
    name: 'Traînée lumineuse',
    description: 'Une comète change de couleur à chaque rebond (style rouge).',
    patch: {
      seed: 9,
      balls: { radius: 16, colorMode: 'perBounce', trail: true, trailStyle: 'comet', trailLength: 26, glow: 1, speed: 1100, gravity: 1400 },
      rings: {
        count: 1200, innerRadius: 250, spacing: 6, thickness: 2.4, gap: 60, rotationSpeed: 35, twist: 0.03, jitter: 7,
        palette: ['#e0333f', '#8f1a2a', '#ff5a5f', '#8f1a2a'], colorMode: 'bands', bandSize: 14, collapseSpeed: 280, breakDrag: 0.03,
      },
      effects: { background: '#140507', backgroundGlow: '#2a0a10' },
      counter: { mode: 'remaining', color: '#ffffff' },
    },
  },
  {
    id: 'music-reactive',
    name: 'Cercles musicaux',
    description: 'Les cercles pulsent au rythme de la musique importée.',
    patch: {
      seed: 4,
      balls: { radius: 20, color: '#ffffff', colorMode: 'rainbow', speed: 900, gravity: 1200 },
      rings: {
        count: 40, innerRadius: 260, spacing: 16, thickness: 6, gap: 60, rotationSpeed: 30, twist: 9, speedSpread: 0.3,
        jitter: 0, palette: ['#00ffa3', '#00b3ff', '#b14dff', '#00b3ff'], colorMode: 'bands', bandSize: 20, collapseSpeed: 200,
      },
      effects: { musicReactive: true, reactivity: 1.6, beatImpulse: true, flash: true, background: '#01060a', backgroundGlow: '#06202a' },
      audio: { mode: 'continuous', sfx: 'pop' },
      counter: { mode: 'remaining' },
    },
  },
  {
    id: 'rainbow',
    name: 'Arc-en-ciel',
    description: 'Spirale arc-en-ciel animée et balle multicolore.',
    patch: {
      seed: 13,
      balls: { radius: 20, colorMode: 'rainbow', trailLength: 20, speed: 1000 },
      rings: {
        count: 300, innerRadius: 230, spacing: 8, thickness: 4, gap: 50, rotationSpeed: 60, twist: 1.2, speedSpread: 0,
        jitter: 0, colorMode: 'rainbow', bandSize: 60, collapseSpeed: 240,
      },
      effects: { rainbow: true, rainbowSpeed: 90, background: '#000000', backgroundGlow: '#12081c' },
      counter: { mode: 'remaining' },
    },
  },
  {
    id: 'perfect-drop',
    name: 'Drop parfait',
    description: 'La balle reste enfermée, musique étouffée, puis sort pile sur le drop.',
    patch: {
      seed: 17,
      balls: { radius: 22, color: '#ffc531', glow: 1, trailLength: 10, speed: 900, gravity: 1300 },
      rings: {
        count: 900, innerRadius: 250, spacing: 6, thickness: 2.6, gap: 50, rotationSpeed: 45, speedSpread: 0.02,
        twist: 0.02, jitter: 5, palette: ['#ffae2b', '#f24fd0', '#a24bff', '#f24fd0'], colorMode: 'bands', bandSize: 46,
        collapse: true, collapseSpeed: 300,
      },
      effects: { background: '#000000', backgroundGlow: '#1b0b1f' },
      counter: { mode: 'remaining' },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: {
        enabled: true,
        events: [{ id: 'd1', time: 8, style: 'pass', intensity: 'power', freeFor: 0, extraBalls: 0 }],
      },
    },
  },
  {
    id: 'custom',
    name: 'Personnalisée',
    description: 'Point de départ neutre à régler entièrement.',
    patch: {},
  },
];

export function templateSettings(id: string): Settings {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
  return mergeSettings(DEFAULT_SETTINGS, t.patch);
}
