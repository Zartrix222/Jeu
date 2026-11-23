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
    behavior: 'arcade',
    friction: 0,
    surfaceFriction: 0.15,
    acceleration: 0,
    accelPerHit: 0.04,
    chaos: 0.5,
    bpm: 120,
    path: 'lissajous',
    pathSize: 0.6,
    pathSpeed: 0.25,
    timeScale: 1,
    mass: 1,
    prediction: false,
    style: 'glow',
    color2: '#ff4fd8',
    gradient: false,
    opacity: 1,
    outline: 0,
    outlineColor: '#ffffff',
    emitParticles: 0,
    spin: false,
    list: [],
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
    radiusDrift: 0,
    vibrate: 0,
    regenerate: 0,
    colorCycle: 0,
    alternate: false,
    speedRandom: 0,
    custom: [],
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
    hit: { particles: 1, shockwave: 0, flash: 0, deform: 0, shake: 0.3, colorShift: 0, holes: 0, fade: false, multiply: 0, maxBalls: 30 },
    bgMode: 'gradient',
    background2: '#000000',
    bgImage: '',
    bgDim: 0.4,
    bloom: 0,
    motionBlur: 0,
    vignette: 0,
  },
  counter: {
    mode: 'remaining',
    text: '{n}',
    size: 120,
    color: '#ffffff',
    title: '',
    titleSize: 64,
    endText: '',
    bottomText: '',
  },
  audio: {
    mode: 'none',
    startOffset: 0,
    gateMs: 260,
    musicVolume: 1,
    sfx: 'notes',
    sfxVolume: 0.6,
    scale: 'pentatonic',
    map: {
      collisionSound: true,
      breakSound: true,
      dropSound: true,
      endSound: true,
      bassPulse: 0,
      beatColor: false,
      dropExplosion: true,
      buildupAccel: 0,
    },
  },
  export: { duration: 0, fps: 30, resolution: 1080, aspect: '9:16', customW: 9, customH: 16, quality: 'high' },
  drop: {
    enabled: false,
    events: [],
    calmVolume: 0.7,
    calmCutoff: 700,
    calmBass: -10,
    calmTreble: -6,
    afterVolume: 1,
    afterBass: 3,
    buildUp: 4,
    buildLevel: 0.35,
    buildAccel: 0.3,
    buildShake: 0.5,
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
    blackout: 0.35,
  },
  camera: { follow: 0, autoZoom: 0, buildZoom: 0.08, dropZoom: 0.18, sway: 0, shake: 1, smoothing: 0.6, keys: [] },
};

function isPlain(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return patch === undefined ? structuredClone(base) : structuredClone(patch);
  const out: Record<string, unknown> = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

/** Fusion profonde : les sous-objets incomplets gardent les valeurs par défaut. */
export function mergeSettings(base: Settings, patch: DeepPartial<Settings> | undefined): Settings {
  return deepMerge(base, patch ?? {}) as Settings;
}

/** Complète un réglage incomplet (ancien projet, import) avec les valeurs par défaut. */
export function normalizeSettings(s: DeepPartial<Settings> | undefined): Settings {
  return mergeSettings(DEFAULT_SETTINGS, s);
}

export type TemplateCategory = 'balls' | 'rings' | 'music' | 'spectacular' | 'classic';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  balls: 'Balles',
  rings: 'Cercles',
  music: 'Musique',
  spectacular: 'Spectaculaires',
  classic: 'Classiques',
};

export interface Template {
  id: string;
  name: string;
  description: string;
  category?: TemplateCategory;
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
    name: 'Drop parfait (v1)',
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

  // ===================== Balles =====================
  {
    id: 'classic-bounce',
    name: 'Classic Bounce',
    category: 'balls',
    description: 'Une balle néon rebondit dans un grand cercle, une note à chaque choc.',
    patch: {
      seed: 31,
      balls: { radius: 30, style: 'neon', color: '#3df2ff', speed: 900, gravity: 1600, trailLength: 14, trailStyle: 'line' },
      rings: { count: 1, innerRadius: 440, thickness: 8, gap: 0, rotationSpeed: 0, breakable: false, collapse: false, palette: ['#3df2ff'], colorMode: 'solid', innerDisc: false },
      effects: { background: '#02040a', backgroundGlow: '#06263a', innerDust: false, endVisualizer: false, hit: { shockwave: 0.4, deform: 0.6 }, bloom: 0.4 },
      counter: { mode: 'bounces', title: 'Combien de rebonds ?' },
      audio: { sfx: 'notes' },
    },
  },
  {
    id: 'double-bounce',
    name: 'Double Bounce',
    category: 'balls',
    description: 'Deux balles aux comportements différents : arcade contre accélération.',
    patch: {
      seed: 8,
      balls: {
        count: 2, radius: 26, speed: 800, gravity: 1400, trailLength: 12, ballCollisions: true,
        list: [
          { behavior: 'arcade', color: '#3df2ff', style: 'glow' },
          { behavior: 'accelerate', color: '#ff3df2', style: 'neon', radius: 22 },
        ],
      },
      rings: { count: 1, innerRadius: 430, thickness: 6, gap: 0, rotationSpeed: 0, breakable: false, collapse: false, palette: ['#ffffff'], colorMode: 'solid', innerDisc: false },
      effects: { background: '#05050a', backgroundGlow: '#14102a', innerDust: false, endVisualizer: false, hit: { shockwave: 0.3, colorShift: 0.5 } },
      counter: { mode: 'bounces', title: 'Cyan ou rose ?' },
    },
  },
  {
    id: 'chaos-balls',
    name: 'Chaos Balls',
    category: 'balls',
    description: 'Douze balles chaotiques qui se multiplient en cassant les cercles.',
    patch: {
      seed: 44,
      balls: { count: 12, radius: 15, behavior: 'chaos', chaos: 0.7, colorMode: 'rainbow', speed: 900, gravity: 600, trailLength: 8, style: 'particles' },
      rings: { count: 10, innerRadius: 220, spacing: 36, thickness: 6, gap: 30, rotationSpeed: 60, alternate: true, speedRandom: 0.4, collapse: false, palette: ['#ff2bd6', '#ffd000', '#00e5ff'], colorMode: 'gradient', innerDisc: false, hitsToBreak: 0, regenerate: 2.5 },
      effects: { background: '#03030a', backgroundGlow: '#1a0a2a', innerDust: false, shake: true, hit: { multiply: 0.08, maxBalls: 40, particles: 1.2 } },
      counter: { mode: 'destroyed', title: 'Le chaos total' },
    },
  },
  {
    id: 'infinite-bounce',
    name: 'Infinite Bounce',
    category: 'balls',
    description: 'Énergie parfaitement conservée : la balle ne s’arrête jamais.',
    patch: {
      seed: 12,
      balls: { radius: 24, behavior: 'infinite', gravity: 1800, speed: 600, style: 'rainbow', colorMode: 'rainbow', trailLength: 30, trailStyle: 'line', spin: true },
      rings: { count: 1, innerRadius: 450, thickness: 5, gap: 0, rotationSpeed: 0, breakable: false, collapse: false, colorMode: 'rainbow', bandSize: 1, innerDisc: false, colorCycle: 60 },
      effects: { background: '#000000', backgroundGlow: '#101018', innerDust: false, endVisualizer: false, motionBlur: 0.3, hit: { deform: 0.5 } },
      counter: { mode: 'bounces' },
    },
  },
  {
    id: 'gravity-ball',
    name: 'Gravity Ball',
    category: 'balls',
    description: 'Physique réaliste : gravité forte, frottements et rotation de la balle.',
    patch: {
      seed: 19,
      balls: { radius: 34, behavior: 'realistic', bounce: 0.96, friction: 0.05, surfaceFriction: 0.35, gravity: 2600, speed: 1400, style: 'metal', spin: true, trailLength: 6, growOnBounce: 0.6 },
      rings: { count: 1, innerRadius: 470, thickness: 10, gap: 0, rotationSpeed: 0, breakable: false, collapse: false, palette: ['#c8d2e0'], colorMode: 'solid', innerDisc: false },
      effects: { background: '#0a0c10', backgroundGlow: '#1c2230', innerDust: false, endVisualizer: false, hit: { deform: 0.8, shake: 0.6 }, shake: true },
      counter: { mode: 'bounces' },
    },
  },
  // ===================== Cercles =====================
  {
    id: 'infinite-rings',
    name: 'Infinite Rings',
    category: 'rings',
    description: 'Les anneaux se régénèrent sans fin et changent de couleur.',
    patch: {
      seed: 52,
      balls: { radius: 18, color: '#ffffff', speed: 1000, gravity: 1300, trailLength: 14 },
      rings: { count: 120, innerRadius: 210, spacing: 9, thickness: 3.5, gap: 70, rotationSpeed: 80, twist: 2.5, infinite: true, collapse: true, collapseSpeed: 200, breakDrag: 0, palette: ['#00e5ff', '#7c4dff', '#ff2bd6', '#7c4dff'], bandSize: 30, colorCycle: 40 },
      effects: { background: '#020208', backgroundGlow: '#0a0a2a', bloom: 0.3 },
      counter: { mode: 'destroyed' },
    },
  },
  {
    id: 'rotating-circles',
    name: 'Rotating Circles',
    category: 'rings',
    description: 'Huit cercles tournant en sens opposés, chacun à sa vitesse.',
    patch: {
      seed: 23,
      balls: { radius: 20, color: '#ffd23f', speed: 900, gravity: 1200, trailLength: 14 },
      rings: {
        count: 8, innerRadius: 190, spacing: 48, thickness: 8, gap: 42, rotationSpeed: 70, alternate: true, speedRandom: 0.5, collapse: false, breakable: true, breakDrag: 0,
        palette: ['#ffd23f', '#ff7a2b', '#ff2b6a', '#b14dff'], colorMode: 'gradient', innerDisc: false,
        custom: [{ rotationSpeed: 140, gap: 34 }, { rotationSpeed: -100 }],
      },
      effects: { background: '#07040a', backgroundGlow: '#24101a', innerDust: false, hit: { shockwave: 0.3 } },
      counter: { mode: 'remaining', title: 'Va-t-elle sortir ?' },
    },
  },
  {
    id: 'circle-destruction',
    name: 'Circle Destruction',
    category: 'rings',
    description: 'Chaque choc troue et fissure le cercle jusqu’à sa disparition.',
    patch: {
      seed: 61,
      balls: { count: 2, radius: 22, colorMode: 'perBounce', speed: 1100, gravity: 1300, trailLength: 10 },
      rings: { count: 6, innerRadius: 260, spacing: 55, thickness: 14, gap: 0, rotationSpeed: 20, collapse: true, collapseSpeed: 160, hitsToBreak: 6, breakable: true, breakDrag: 0, palette: ['#ff5a3d', '#ffb13d'], colorMode: 'gradient', innerDisc: false },
      effects: { background: '#0a0502', backgroundGlow: '#2a120a', innerDust: false, shake: true, hit: { holes: 0.5, fade: true, deform: 0.7, shockwave: 0.5, particles: 1.5, shake: 0.5 } },
      counter: { mode: 'destroyed', title: 'Destruction totale' },
    },
  },
  {
    id: 'rainbow-tunnel',
    name: 'Rainbow Tunnel',
    category: 'rings',
    description: 'Spirale arc-en-ciel dans un tunnel lumineux en mouvement.',
    patch: {
      seed: 71,
      balls: { radius: 18, colorMode: 'rainbow', style: 'rainbow', trailLength: 24, speed: 1000 },
      rings: { count: 400, innerRadius: 220, spacing: 7, thickness: 3.5, gap: 55, rotationSpeed: 70, twist: 1.4, colorMode: 'rainbow', bandSize: 70, collapseSpeed: 240, colorCycle: 90 },
      effects: { bgMode: 'tunnel', background: '#000000', backgroundGlow: '#150a24', rainbow: true, rainbowSpeed: 60 },
      camera: { sway: 4 },
      counter: { mode: 'remaining' },
    },
  },
  {
    id: 'neon-rings',
    name: 'Neon Rings',
    category: 'rings',
    description: 'Anneaux néon espacés qui vibrent, avec halo et bloom.',
    patch: {
      seed: 83,
      balls: { radius: 20, style: 'neon', color: '#ffffff', speed: 950, gravity: 1200, trailLength: 16, trailStyle: 'line' },
      rings: { count: 18, innerRadius: 230, spacing: 30, thickness: 5, gap: 50, rotationSpeed: 50, twist: 12, speedSpread: 0.6, vibrate: 3, palette: ['#00fff0', '#ff00e6', '#7a5cff'], colorMode: 'bands', bandSize: 6, collapseSpeed: 180, breakDrag: 0 },
      effects: { background: '#010106', backgroundGlow: '#0a0420', neon: 1, bloom: 0.7, innerDust: false },
      counter: { mode: 'remaining' },
    },
  },
  // ===================== Musique =====================
  {
    id: 'perfect-drop-2',
    name: 'Perfect Drop',
    category: 'music',
    description: 'Musique étouffée, montée de tension, sortie pile sur le drop.',
    patch: {
      seed: 17,
      balls: { radius: 22, color: '#ffc531', glow: 1, trailLength: 10, speed: 900, gravity: 1300 },
      rings: { count: 900, innerRadius: 250, spacing: 6, thickness: 2.6, gap: 50, rotationSpeed: 45, speedSpread: 0.02, twist: 0.02, jitter: 5, palette: ['#ffae2b', '#f24fd0', '#a24bff', '#f24fd0'], bandSize: 46, collapseSpeed: 300 },
      effects: { background: '#000000', backgroundGlow: '#1b0b1f', bloom: 0.35 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: { enabled: true, events: [{ id: 'd1', time: 8, style: 'pass', intensity: 'power', freeFor: 0, extraBalls: 0 }] },
      camera: { buildZoom: 0.1, dropZoom: 0.2 },
    },
  },
  {
    id: 'bass-reactor',
    name: 'Bass Reactor',
    category: 'music',
    description: 'Les cercles pulsent sur les basses et changent de couleur à chaque temps.',
    patch: {
      seed: 91,
      balls: { radius: 22, style: 'glow', color: '#ffffff', speed: 900, gravity: 1200 },
      rings: { count: 36, innerRadius: 250, spacing: 18, thickness: 7, gap: 55, rotationSpeed: 40, twist: 10, palette: ['#ff004c', '#ff7a00', '#ffd000', '#ff7a00'], bandSize: 12, collapseSpeed: 200, vibrate: 2 },
      effects: { musicReactive: true, reactivity: 1.8, flash: true, background: '#060100', backgroundGlow: '#2a0a00', bloom: 0.4 },
      audio: { mode: 'continuous', sfx: 'none', map: { bassPulse: 1, beatColor: true } },
      camera: { autoZoom: 0.5 },
    },
  },
  {
    id: 'beat-bounce',
    name: 'Beat Bounce',
    category: 'music',
    description: 'La balle touche le cercle exactement sur chaque temps de la musique.',
    patch: {
      seed: 5,
      balls: { radius: 30, behavior: 'music', bpm: 120, style: 'neon', color: '#7cff4f', gravity: 1500, trailLength: 18, trailStyle: 'line' },
      rings: { count: 1, innerRadius: 440, thickness: 8, gap: 0, rotationSpeed: 0, breakable: false, collapse: false, palette: ['#7cff4f'], colorMode: 'solid', innerDisc: false },
      effects: { background: '#020602', backgroundGlow: '#0a2a0a', innerDust: false, endVisualizer: false, hit: { shockwave: 0.6, deform: 0.7, flash: 0.2 }, bloom: 0.4 },
      audio: { mode: 'continuous', sfx: 'none', map: { beatColor: true } },
      counter: { mode: 'bounces' },
    },
  },
  {
    id: 'music-explosion',
    name: 'Music Explosion',
    category: 'music',
    description: 'Au drop, explosion multicolore et balles multipliées.',
    patch: {
      seed: 101,
      balls: { radius: 20, color: '#ffffff', speed: 900, gravity: 1300, trailLength: 12 },
      rings: { count: 600, innerRadius: 240, spacing: 6.5, thickness: 3, gap: 50, rotationSpeed: 50, jitter: 4, palette: ['#00e5ff', '#ff2bd6', '#ffd000', '#ff2bd6'], bandSize: 30, collapseSpeed: 280 },
      effects: { background: '#000000', backgroundGlow: '#140a20', bloom: 0.4 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: { enabled: true, events: [{ id: 'd1', time: 8, style: 'neonburst', intensity: 'extreme', freeFor: 0, extraBalls: 6 }], afterPalette: ['#ff2bd6', '#ffd000', '#00e5ff', '#ffd000'] },
    },
  },
  {
    id: 'rhythm-circle',
    name: 'Rhythm Circle',
    category: 'music',
    description: 'Cercles rythmiques, balle qui accélère sur les temps et visualiseur final.',
    patch: {
      seed: 113,
      balls: { radius: 20, colorMode: 'rainbow', speed: 900, gravity: 1100, trailLength: 14 },
      rings: { count: 50, innerRadius: 250, spacing: 14, thickness: 5, gap: 55, rotationSpeed: 35, twist: 7, speedSpread: 0.3, palette: ['#00ffa3', '#00b3ff', '#b14dff', '#00b3ff'], bandSize: 18, collapseSpeed: 200 },
      effects: { musicReactive: true, reactivity: 1.4, beatImpulse: true, background: '#01060a', backgroundGlow: '#06202a' },
      audio: { mode: 'continuous', sfx: 'none', map: { beatColor: true, bassPulse: 0.5 } },
      camera: { autoZoom: 0.4, sway: 2 },
    },
  },
  // ===================== Spectaculaires =====================
  {
    id: 'galaxy-drop',
    name: 'Galaxy Drop',
    category: 'spectacular',
    description: 'Ciel étoilé, puis explosion de particules spatiales au drop.',
    patch: {
      seed: 127,
      balls: { radius: 20, color: '#bfe3ff', style: 'glow', glow: 1, trailLength: 14 },
      rings: { count: 500, innerRadius: 240, spacing: 6.5, thickness: 2.4, gap: 50, rotationSpeed: 40, jitter: 5, palette: ['#6a5cff', '#2bd6ff', '#ffffff', '#2bd6ff'], bandSize: 40, collapseSpeed: 260 },
      effects: { bgMode: 'stars', background: '#00010a', backgroundGlow: '#0a0a30', bloom: 0.6 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: { enabled: true, events: [{ id: 'd1', time: 8, style: 'galaxy', intensity: 'extreme', freeFor: 0, extraBalls: 0 }] },
      camera: { buildZoom: 0.12, dropZoom: 0.25 },
    },
  },
  {
    id: 'supernova',
    name: 'Supernova',
    category: 'spectacular',
    description: 'Le cercle se transforme en supernova lumineuse au moment du drop.',
    patch: {
      seed: 131,
      balls: { radius: 24, color: '#ffd23f', style: 'fire', glow: 1, trailLength: 16 },
      rings: { count: 400, innerRadius: 250, spacing: 7, thickness: 3, gap: 0, rotationSpeed: 30, palette: ['#ffd000', '#ff7a00', '#ff2b2b', '#ff7a00'], bandSize: 30, collapseSpeed: 260 },
      effects: { background: '#050100', backgroundGlow: '#2a0e00', bloom: 0.7 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: { enabled: true, events: [{ id: 'd1', time: 8, style: 'supernova', intensity: 'extreme', freeFor: 0, extraBalls: 0 }], explosionSize: 1.6 },
      camera: { buildZoom: 0.15, dropZoom: 0.3 },
    },
  },
  {
    id: 'neon-storm',
    name: 'Neon Storm',
    category: 'spectacular',
    description: 'Balles électriques chaotiques, ondes de choc et bloom néon.',
    patch: {
      seed: 137,
      balls: { count: 5, radius: 18, behavior: 'chaos', chaos: 0.5, style: 'electric', colorMode: 'rainbow', speed: 1100, gravity: 800, trailLength: 12 },
      rings: { count: 24, innerRadius: 220, spacing: 22, thickness: 4, gap: 45, rotationSpeed: 90, alternate: true, speedRandom: 0.4, palette: ['#00fff0', '#ff00e6'], colorMode: 'bands', bandSize: 4, collapseSpeed: 200, breakDrag: 0, vibrate: 2 },
      effects: { background: '#010006', backgroundGlow: '#12003a', neon: 1, bloom: 0.7, shake: true, hit: { shockwave: 0.5, flash: 0.15, colorShift: 0.6 } },
      camera: { sway: 3 },
    },
  },
  {
    id: 'portal-escape',
    name: 'Portal Escape',
    category: 'spectacular',
    description: 'Un portail s’ouvre dans le cercle au drop, dans un tunnel infini.',
    patch: {
      seed: 149,
      balls: { radius: 20, color: '#7cf7ff', style: 'neon', trailLength: 14 },
      rings: { count: 300, innerRadius: 240, spacing: 8, thickness: 3, gap: 50, rotationSpeed: 40, twist: 0.5, palette: ['#3d5cff', '#9b3dff', '#3dd6ff', '#9b3dff'], bandSize: 40, collapseSpeed: 260 },
      effects: { bgMode: 'tunnel', background: '#00000a', backgroundGlow: '#0a0a2a', bloom: 0.5 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: { enabled: true, events: [{ id: 'd1', time: 8, style: 'portal', intensity: 'power', freeFor: 0, extraBalls: 0 }] },
      camera: { buildZoom: 0.1, dropZoom: 0.22 },
    },
  },
  {
    id: 'ultimate-drop',
    name: 'Ultimate Drop',
    category: 'spectacular',
    description: 'Deux drops : traversée de tous les anneaux puis explosion finale.',
    patch: {
      seed: 157,
      balls: { radius: 22, color: '#ffffff', style: 'glow', glow: 1, trailLength: 12 },
      rings: { count: 900, innerRadius: 245, spacing: 6, thickness: 2.6, gap: 50, rotationSpeed: 45, jitter: 5, palette: ['#ff2bd6', '#ffae2b', '#00e5ff', '#ffae2b'], bandSize: 40, collapseSpeed: 300 },
      effects: { background: '#000000', backgroundGlow: '#1b0b1f', bloom: 0.6, motionBlur: 0.25 },
      audio: { mode: 'continuous', sfx: 'pop' },
      drop: {
        enabled: true,
        events: [
          { id: 'd1', time: 8, style: 'infinity', intensity: 'power', freeFor: 6, extraBalls: 0 },
          { id: 'd2', time: 22, style: 'shatter', intensity: 'extreme', freeFor: 0, extraBalls: 8 },
        ],
      },
      camera: { buildZoom: 0.15, dropZoom: 0.3, sway: 2 },
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

export function templateCategory(t: Template): TemplateCategory {
  return t.category ?? 'classic';
}
