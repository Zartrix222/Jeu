// Modèle de données d'une animation. Tout est sérialisable en JSON.

export const WORLD_W = 1080;
export const WORLD_H = 1920;

export interface BallSettings {
  count: number;
  radius: number;
  color: string;
  colorMode: 'solid' | 'rainbow' | 'perBounce';
  speed: number; // vitesse initiale (px/s, unités monde 1080x1920)
  gravity: number; // px/s²
  bounce: number; // coefficient de restitution
  minSpeed: number; // vitesse minimale conservée après un rebond
  maxSpeed: number;
  trail: boolean;
  trailLength: number; // nombre de points (à 60 pts/s)
  trailStyle: 'comet' | 'line' | 'ghost';
  glow: number; // 0..1
  growOnBounce: number; // px ajoutés au rayon à chaque rebond
  ballCollisions: boolean;
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
}

export interface CounterSettings {
  mode: 'remaining' | 'destroyed' | 'bounces' | 'time' | 'none';
  text: string; // {n} = valeur du compteur
  size: number;
  color: string;
  title: string; // texte en haut de l'écran
  titleSize: number;
  endText: string; // texte affiché à la fin
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
}

export interface ExportSettings {
  duration: number; // 0 = automatique (jusqu'à la fin)
  fps: 30 | 60;
  resolution: 1080 | 720;
}

export type DropStyle = 'pass' | 'open' | 'explode' | 'vanish' | 'chain';
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
  afterVolume: number;
  afterBass: number; // dB
  buildUp: number; // durée de la montée de tension (s)
  buildLevel: number; // ouverture du filtre à la fin de la montée (0..1)
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

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
