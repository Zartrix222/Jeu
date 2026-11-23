// Modèle de données d'une animation. Tout est sérialisable en JSON.
// Les anciens projets restent compatibles : les champs manquants sont complétés
// par les valeurs par défaut (fusion profonde, voir templates.ts).

/** Dimensions du monde au format 9:16 (référence historique). */
export const WORLD_W = 1080;
export const WORLD_H = 1920;

export type BallBehavior = 'arcade' | 'realistic' | 'infinite' | 'accelerate' | 'music' | 'chaos' | 'programmed';
export type BallStyle = 'glow' | 'neon' | 'rainbow' | 'electric' | 'fire' | 'particles' | 'metal' | 'minimal';
export type PathType = 'orbit' | 'lissajous' | 'figure8' | 'spiral';

/** Réglages propres à une balle (remplacent les réglages communs). */
export interface BallOverride {
  behavior?: BallBehavior;
  style?: BallStyle;
  radius?: number;
  color?: string;
  color2?: string;
  colorMode?: BallSettings['colorMode'];
  mass?: number;
  speedMul?: number;
  opacity?: number;
}

export interface BallSettings {
  count: number;
  radius: number;
  color: string;
  colorMode: 'solid' | 'rainbow' | 'perBounce';
  speed: number; // vitesse initiale (px/s, unités monde)
  gravity: number; // px/s²
  bounce: number; // coefficient de restitution
  minSpeed: number; // vitesse minimale conservée après un rebond (mode arcade)
  maxSpeed: number;
  trail: boolean;
  trailLength: number; // nombre de points (à 60 pts/s)
  trailStyle: 'comet' | 'line' | 'ghost';
  glow: number; // 0..1
  growOnBounce: number; // px ajoutés au rayon à chaque rebond
  ballCollisions: boolean;
  // ---- physique avancée ----
  behavior: BallBehavior;
  friction: number; // frottement de l'air (1/s)
  surfaceFriction: number; // perte tangentielle au choc (0..1) → rotation
  acceleration: number; // px/s² dans le sens du mouvement
  accelPerHit: number; // gain de vitesse par collision (mode accélération)
  chaos: number; // 0..1 (mode chaotique)
  bpm: number; // rythme des rebonds sans musique (mode musique)
  path: PathType; // mode trajectoire programmée
  pathSize: number; // 0..1 du rayon intérieur
  pathSpeed: number; // tours par seconde
  timeScale: number; // ralenti global de la physique (0.1..2)
  mass: number;
  prediction: boolean; // trajectoire prédite dans l'aperçu
  // ---- apparence ----
  style: BallStyle;
  color2: string;
  gradient: boolean;
  opacity: number;
  outline: number; // épaisseur du contour (px)
  outlineColor: string;
  emitParticles: number; // particules émises en continu (0..1)
  spin: boolean; // afficher la rotation
  list: BallOverride[]; // réglages individuels (balle 1, 2, …)
}

export interface RingOverride {
  radius?: number; // rayon fixe (cercles qui ne se resserrent pas)
  thickness?: number;
  rotationSpeed?: number;
  gap?: number;
  color?: string;
}

export interface RingSettings {
  count: number;
  innerRadius: number;
  spacing: number;
  thickness: number;
  centerY: number; // 0..1 (position verticale du centre)
  gap: number; // ouverture en degrés (0 = cercle fermé)
  rotationSpeed: number; // degrés / s
  twist: number; // décalage angulaire de l'ouverture d'un cercle au suivant (degrés)
  speedSpread: number; // différence de vitesse de rotation entre cercles intérieurs et extérieurs
  jitter: number; // décalage aléatoire de l'ouverture (degrés)
  palette: string[];
  colorMode: 'bands' | 'gradient' | 'rainbow' | 'solid';
  bandSize: number; // nombre de cercles par cycle de couleurs
  breakable: boolean; // le cercle se casse quand la balle sort par l'ouverture
  hitsToBreak: number; // 0 = jamais ; sinon nombre de chocs avant destruction
  breakDrag: number; // perte de vitesse de la balle à chaque cassure (0..0.1)
  collapse: boolean; // les cercles restants se resserrent vers le centre
  collapseSpeed: number; // px/s
  infinite: boolean; // de nouveaux cercles apparaissent à l'extérieur
  highlightInner: boolean; // cercle intérieur brillant
  innerDisc: boolean; // disque sombre au centre
  walls: boolean; // les bords de l'écran font rebondir les balles
  // ---- comportements avancés ----
  radiusDrift: number; // px/s : <0 rétrécissent, >0 grandissent
  vibrate: number; // amplitude de vibration (px)
  regenerate: number; // secondes avant régénération d'un cercle détruit (0 = jamais)
  colorCycle: number; // rotation des couleurs (degrés / s)
  alternate: boolean; // sens de rotation alterné
  speedRandom: number; // variation aléatoire de vitesse par cercle (0..1)
  custom: RingOverride[]; // réglages individuels des premiers cercles
}

export interface HitEffects {
  particles: number; // 0..2
  shockwave: number; // 0..1
  flash: number; // 0..1
  deform: number; // 0..1
  shake: number; // 0..1
  colorShift: number; // 0..1
  holes: number; // 0..1 : taille des trous laissés par les chocs (destruction partielle)
  fade: boolean; // disparition progressive (avec « se casse après N chocs »)
  multiply: number; // 0..1 : probabilité de créer une balle à chaque choc
  maxBalls: number;
}

export interface EffectSettings {
  background: string;
  backgroundGlow: string;
  particles: boolean;
  particleAmount: number; // 0..2
  explosions: boolean;
  sparks: boolean; // étincelles à chaque rebond
  neon: number; // 0..1
  rainbow: boolean; // cycle de teinte global
  rainbowSpeed: number; // degrés / s
  shake: boolean;
  flash: boolean;
  innerDust: boolean;
  musicReactive: boolean;
  reactivity: number; // 0..2
  beatImpulse: boolean; // la balle accélère sur les temps forts
  endVisualizer: boolean;
  // ---- avancés ----
  hit: HitEffects;
  bgMode: 'solid' | 'gradient' | 'animated' | 'stars' | 'tunnel' | 'image';
  background2: string;
  bgImage: string; // data URL (JPEG réduit)
  bgDim: number; // assombrissement de l'image de fond (0..1)
  bloom: number; // 0..1
  motionBlur: number; // 0..0.85
  vignette: number; // 0..1
}

export interface CounterSettings {
  mode: 'remaining' | 'destroyed' | 'bounces' | 'time' | 'none';
  text: string; // {n} = valeur du compteur
  size: number;
  color: string;
  title: string; // texte en haut de l'écran
  titleSize: number;
  endText: string; // texte affiché à la fin
  bottomText: string; // texte en bas de l'écran
}

/** Associations événement → effet (éditeur « audio interactif »). */
export interface AudioMap {
  collisionSound: boolean;
  breakSound: boolean;
  dropSound: boolean;
  endSound: boolean;
  bassPulse: number; // basse → pulsation des cercles (0..1)
  beatColor: boolean; // battement → changement de couleur
  dropExplosion: boolean; // drop → explosion
  buildupAccel: number; // montée musicale → accélération (0..1)
}

export interface AudioSettings {
  mode: 'none' | 'continuous' | 'bounce';
  musicId?: string;
  musicName?: string;
  startOffset: number; // secondes
  gateMs: number; // durée de musique jouée à chaque rebond (mode « bounce »)
  musicVolume: number;
  sfx: 'none' | 'notes' | 'pop' | 'both';
  sfxVolume: number;
  scale: 'pentatonic' | 'major' | 'minor' | 'chromatic';
  map: AudioMap;
}

export type Aspect = '9:16' | '16:9' | '1:1' | '4:5' | 'custom';

export interface ExportSettings {
  duration: number; // 0 = automatique (jusqu'à la fin)
  fps: 30 | 60;
  resolution: 720 | 1080 | 1440 | 2160; // côté court
  aspect: Aspect;
  customW: number;
  customH: number;
  quality: 'performance' | 'balanced' | 'high';
}

export type DropStyle =
  | 'pass'
  | 'open'
  | 'explode'
  | 'vanish'
  | 'chain'
  | 'supernova'
  | 'portal'
  | 'shatter'
  | 'shockwave'
  | 'infinity'
  | 'galaxy'
  | 'neonburst'
  | 'blackout';
export type DropIntensity = 'soft' | 'power' | 'extreme';

export interface DropEvent {
  id: string;
  time: number; // secondes dans la musique (ou dans l'animation sans musique)
  style: DropStyle;
  intensity: DropIntensity;
  freeFor: number; // secondes hors du cercle avant d'y revenir (0 = automatique / jusqu'à la fin)
  extraBalls: number; // balles supplémentaires libérées au drop
}

export interface DropSettings {
  enabled: boolean;
  events: DropEvent[];
  calmVolume: number; // volume avant le drop (0..1)
  calmCutoff: number; // filtre passe-bas avant le drop (Hz)
  calmBass: number; // basses avant le drop (dB)
  calmTreble: number; // aigus avant le drop (dB)
  afterVolume: number;
  afterBass: number; // dB
  buildUp: number; // durée de la montée de tension (s)
  buildLevel: number; // ouverture du filtre à la fin de la montée (0..1)
  buildAccel: number; // accélération de la balle pendant la montée (0..1)
  buildShake: number; // vibration du cercle pendant la montée (0..1)
  transitionIn: number; // durée de la transition au drop (s)
  transitionOut: number; // durée du retour au calme (s)
  slowMo: number; // durée du ralenti avant la sortie (s)
  slowMoFactor: number; // vitesse pendant le ralenti (0.1..1)
  calmEffects: number; // intensité des effets avant le drop (0..1)
  calmColors: number; // atténuation des couleurs avant le drop (0..1)
  afterEffects: number; // intensité des effets après le drop (1..3)
  particles: number; // quantité de particules de l'explosion
  explosionSize: number;
  flash: number; // 0..1
  shockwave: boolean;
  exitSpeed: number; // vitesse de la balle à la sortie (px/s)
  trailBoost: number; // allongement de la traînée après le drop
  afterPalette: string[]; // couleurs des cercles après le drop ([] = identiques)
  blackout: number; // durée du noir avant le drop (s, style Blackout)
}

export interface CameraKey {
  id: string;
  time: number; // temps musique (ou animation)
  zoom: number;
  rotation: number; // degrés
  x: number; // décalage (px monde)
  y: number;
}

export interface CameraSettings {
  follow: number; // suivi de la balle (0..1)
  autoZoom: number; // zoom selon l'énergie musicale (0..1)
  buildZoom: number; // rapprochement pendant la montée (0..0.5)
  dropZoom: number; // impulsion de zoom au drop (0..0.6)
  sway: number; // rotation légère (degrés)
  shake: number; // intensité des tremblements (0..2)
  smoothing: number; // douceur (0..1)
  keys: CameraKey[];
}

export interface Settings {
  seed: number;
  balls: BallSettings;
  rings: RingSettings;
  effects: EffectSettings;
  counter: CounterSettings;
  audio: AudioSettings;
  export: ExportSettings;
  drop: DropSettings;
  camera: CameraSettings;
}

export interface Project {
  id: string;
  name: string;
  template: string;
  createdAt: number;
  updatedAt: number;
  settings: Settings;
  thumb?: string;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  settings: Settings;
  thumb?: string;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/** Dimensions du monde selon le format (le côté court vaut toujours 1080). */
export function worldSize(e: Pick<ExportSettings, 'aspect' | 'customW' | 'customH'>): { W: number; H: number } {
  switch (e.aspect) {
    case '16:9':
      return { W: 1920, H: 1080 };
    case '1:1':
      return { W: 1080, H: 1080 };
    case '4:5':
      return { W: 1080, H: 1350 };
    case 'custom': {
      const w = Math.max(1, e.customW || 9);
      const h = Math.max(1, e.customH || 16);
      return w <= h ? { W: 1080, H: Math.round((1080 * h) / w) } : { W: Math.round((1080 * w) / h), H: 1080 };
    }
    default:
      return { W: 1080, H: 1920 };
  }
}
