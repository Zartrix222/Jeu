import { useRef } from 'react';
import type { Quality } from '../engine/render';
import type { BallBehavior, BallOverride, BallStyle, CameraKey, RingOverride, Settings } from '../engine/types';
import { formatTime } from '../engine/drop';
import { uid } from '../engine/util';
import { notify } from '../lib/host';
import { ColorInput, Group, PaletteInput, Select, Slider, TextInput, Toggle, getPath } from './controls';

export interface PanelProps {
  s: Settings;
  set: (path: string, v: unknown) => void;
}

function useBind({ s, set }: PanelProps) {
  const num = (p: string) => ({ value: (getPath(s, p) as number) ?? 0, onChange: (v: number) => set(p, v) });
  const bool = (p: string) => ({ value: !!getPath(s, p), onChange: (v: boolean) => set(p, v) });
  const str = (p: string) => ({ value: (getPath(s, p) as string) ?? '', onChange: (v: string) => set(p, v) });
  return { num, bool, str };
}

export const BALL_STYLES: [BallStyle, string][] = [
  ['glow', 'Lumineuse'],
  ['neon', 'Néon'],
  ['rainbow', 'Arc-en-ciel'],
  ['electric', 'Électrique'],
  ['fire', 'Flammes'],
  ['particles', 'Particules'],
  ['metal', 'Métal'],
  ['minimal', 'Minimaliste'],
];

export const BEHAVIORS: [BallBehavior, string][] = [
  ['realistic', 'Réaliste'],
  ['arcade', 'Arcade'],
  ['infinite', 'Rebonds infinis'],
  ['accelerate', 'Accélère'],
  ['music', 'Sur la musique'],
  ['chaos', 'Chaotique'],
  ['programmed', 'Trajectoire'],
];

const BEHAVIOR_HELP: Record<BallBehavior, string> = {
  realistic: 'Frottements et pertes d’énergie : la balle finit par ralentir.',
  arcade: 'Rebonds nets avec une vitesse minimale garantie.',
  infinite: 'Énergie conservée exactement : la balle ne s’arrête jamais.',
  accelerate: 'La vitesse augmente à chaque collision.',
  music: 'La balle touche le cercle exactement sur chaque temps (BPM détecté, ou réglé ci-dessous sans musique).',
  chaos: 'Rebonds déviés au hasard et impulsions imprévisibles.',
  programmed: 'La balle suit une trajectoire dessinée (orbite, huit, spirale…).',
};

// ======================= Balles =======================
export function BallsPanel(p: PanelProps & { selected: number; onSelect: (i: number) => void }) {
  const { num, bool, str } = useBind(p);
  const b = p.s.balls;
  const setList = (count: number, list: BallOverride[]) => p.set('balls', { ...b, count, list });
  const upd = (i: number, patch: Partial<BallOverride>) => {
    const list = b.list.slice();
    while (list.length <= i) list.push({});
    list[i] = { ...list[i], ...patch };
    setList(b.count, list);
  };
  return (
    <>
      <Group title="Apparence">
        <Slider label="Nombre de balles" min={1} max={40} step={1} {...num('balls.count')} />
        <Select label="Style" value={b.style} options={BALL_STYLES} onChange={(v) => p.set('balls.style', v)} />
        <Slider label="Taille" min={4} max={90} step={1} unit=" px" {...num('balls.radius')} />
        <Select
          label="Couleur"
          value={b.colorMode}
          options={[
            ['solid', 'Unie'],
            ['perBounce', 'Change au rebond'],
            ['rainbow', 'Arc-en-ciel'],
          ]}
          onChange={(v) => p.set('balls.colorMode', v)}
        />
        {b.colorMode === 'solid' && <ColorInput label="Couleur principale" {...str('balls.color')} />}
        <Toggle label="Dégradé" {...bool('balls.gradient')} />
        {b.gradient && <ColorInput label="Seconde couleur" {...str('balls.color2')} />}
        <Slider label="Transparence (opacité)" min={0.1} max={1} step={0.05} {...num('balls.opacity')} />
        <Slider label="Contour" min={0} max={12} step={0.5} unit=" px" {...num('balls.outline')} />
        {b.outline > 0 && <ColorInput label="Couleur du contour" {...str('balls.outlineColor')} />}
        <Slider label="Halo lumineux" min={0} max={1} step={0.05} {...num('balls.glow')} />
        <Slider label="Particules émises" min={0} max={2} step={0.1} {...num('balls.emitParticles')} />
        <Toggle label="Afficher la rotation" {...bool('balls.spin')} />
      </Group>
      <Group title="Traînée lumineuse">
        <Toggle label="Traînée" {...bool('balls.trail')} />
        {b.trail && (
          <>
            <Slider label="Longueur" min={2} max={60} step={1} {...num('balls.trailLength')} />
            <Select
              label="Style"
              value={b.trailStyle}
              options={[
                ['comet', 'Comète'],
                ['line', 'Ruban'],
                ['ghost', 'Échos'],
              ]}
              onChange={(v) => p.set('balls.trailStyle', v)}
            />
          </>
        )}
      </Group>
      <Group title="Balles individuelles">
        <p className="hint">Touchez une balle dans l’aperçu pour la sélectionner. Chaque balle peut avoir son comportement, son style et sa couleur.</p>
        {Array.from({ length: Math.min(b.count, 40) }, (_, i) => {
          const o = b.list[i] ?? {};
          const open = p.selected === i;
          return (
            <div key={i} className={`ball-card ${open ? 'open' : ''}`}>
              <button type="button" className="ball-head" onClick={() => p.onSelect(open ? -1 : i)}>
                <span className="dot" style={{ background: o.color ?? b.color }} />
                Balle {i + 1}
                <small>
                  {BEHAVIORS.find(([k]) => k === (o.behavior ?? b.behavior))?.[1]} · {BALL_STYLES.find(([k]) => k === (o.style ?? b.style))?.[1]}
                  {Object.keys(o).length ? ' · personnalisée' : ''}
                </small>
              </button>
              {open && (
                <div className="ball-body">
                  <Select label="Comportement" value={o.behavior ?? b.behavior} options={BEHAVIORS} onChange={(v) => upd(i, { behavior: v })} />
                  <Select label="Style" value={o.style ?? b.style} options={BALL_STYLES} onChange={(v) => upd(i, { style: v })} />
                  <ColorInput label="Couleur" value={o.color ?? b.color} onChange={(v) => upd(i, { color: v, colorMode: 'solid' })} />
                  <Slider label="Taille" min={4} max={90} step={1} unit=" px" value={o.radius ?? b.radius} onChange={(v) => upd(i, { radius: v })} />
                  <Slider label="Masse" min={0.1} max={10} step={0.1} value={o.mass ?? b.mass} onChange={(v) => upd(i, { mass: v })} />
                  <Slider label="Vitesse (×)" min={0.2} max={3} step={0.05} value={o.speedMul ?? 1} onChange={(v) => upd(i, { speedMul: v })} />
                  <Slider label="Opacité" min={0.1} max={1} step={0.05} value={o.opacity ?? b.opacity} onChange={(v) => upd(i, { opacity: v })} />
                  <div className="row-btns">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        const list = b.list.slice();
                        while (list.length < b.count) list.push({});
                        list.splice(i + 1, 0, { ...o });
                        setList(b.count + 1, list);
                        p.onSelect(i + 1);
                      }}
                    >
                      Dupliquer
                    </button>
                    <button type="button" className="btn small" onClick={() => setList(b.count, b.list.map((x, k) => (k === i ? {} : x)))}>
                      Réinitialiser
                    </button>
                    {b.count > 1 && (
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => {
                          const list = b.list.slice();
                          list.splice(i, 1);
                          setList(b.count - 1, list);
                          p.onSelect(-1);
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Group>
    </>
  );
}

// ======================= Physique =======================
export function PhysicsPanel(p: PanelProps) {
  const { num, bool } = useBind(p);
  const b = p.s.balls;
  return (
    <>
      <Group title="Comportement (toutes les balles)">
        <Select label="Comportement" value={b.behavior} options={BEHAVIORS} onChange={(v) => p.set('balls.behavior', v)} />
        <p className="hint">{BEHAVIOR_HELP[b.behavior]} Chaque balle peut avoir son propre comportement (onglet Balles).</p>
        {b.behavior === 'accelerate' && <Slider label="Gain par collision" min={0.01} max={0.2} step={0.01} {...num('balls.accelPerHit')} />}
        {b.behavior === 'chaos' && <Slider label="Intensité du chaos" min={0.05} max={1} step={0.05} {...num('balls.chaos')} />}
        {b.behavior === 'music' && <Slider label="Tempo sans musique" min={40} max={200} step={1} unit=" BPM" {...num('balls.bpm')} />}
        {b.behavior === 'programmed' && (
          <>
            <Select
              label="Trajectoire"
              value={b.path}
              options={[
                ['lissajous', 'Lissajous'],
                ['orbit', 'Orbite'],
                ['figure8', 'Huit'],
                ['spiral', 'Spirale'],
              ]}
              onChange={(v) => p.set('balls.path', v)}
            />
            <Slider label="Taille de la trajectoire" min={0.1} max={0.95} step={0.01} {...num('balls.pathSize')} />
            <Slider label="Vitesse (tours/s)" min={0.02} max={1.5} step={0.01} {...num('balls.pathSpeed')} />
          </>
        )}
      </Group>
      <Group title="Forces">
        <Slider label="Gravité" min={-2000} max={5000} step={10} {...num('balls.gravity')} />
        <Slider label="Vitesse initiale" min={0} max={3000} step={10} {...num('balls.speed')} />
        <Slider label="Accélération continue" min={-500} max={1500} step={10} unit=" px/s²" {...num('balls.acceleration')} />
        <Slider label="Frottement de l’air" min={0} max={2} step={0.01} {...num('balls.friction')} />
        <Slider label="Frottement au contact (rotation)" min={0} max={1} step={0.01} {...num('balls.surfaceFriction')} />
        <Slider label="Élasticité des rebonds" min={0.3} max={1.15} step={0.01} {...num('balls.bounce')} />
        <Slider label="Masse (commune)" min={0.1} max={10} step={0.1} {...num('balls.mass')} />
      </Group>
      <Group title="Limites et temps">
        <Slider label="Vitesse minimale (arcade)" min={0} max={2000} step={10} {...num('balls.minSpeed')} />
        <Slider label="Vitesse maximale" min={300} max={6000} step={50} {...num('balls.maxSpeed')} />
        <Slider label="Vitesse de la simulation (ralenti < 1)" min={0.1} max={2} step={0.05} unit="×" {...num('balls.timeScale')} />
        <Slider label="Grossit à chaque rebond" min={0} max={10} step={0.5} unit=" px" {...num('balls.growOnBounce')} />
        <Toggle label="Collisions entre balles" {...bool('balls.ballCollisions')} />
        <Toggle label="Afficher la trajectoire prédite" hint="aperçu uniquement" {...bool('balls.prediction')} />
      </Group>
    </>
  );
}

// ======================= Cercles =======================
export function RingsPanel(p: PanelProps) {
  const { num, bool } = useBind(p);
  const r = p.s.rings;
  const setCustom = (list: RingOverride[]) => p.set('rings.custom', list);
  return (
    <>
      <Group title="Cercles">
        <Slider label="Nombre de cercles" min={0} max={2000} step={1} {...num('rings.count')} />
        <Slider label="Taille (rayon intérieur)" min={60} max={700} step={1} unit=" px" {...num('rings.innerRadius')} />
        <Slider label="Espacement" min={2} max={160} step={0.2} unit=" px" {...num('rings.spacing')} />
        <Slider label="Épaisseur" min={0.5} max={40} step={0.1} unit=" px" {...num('rings.thickness')} />
        <Slider label="Position verticale" min={0.2} max={0.8} step={0.01} {...num('rings.centerY')} />
      </Group>
      <Group title="Ouverture et rotation">
        <Slider label="Taille de l’ouverture (0 = complet)" min={0} max={180} step={1} unit="°" {...num('rings.gap')} />
        <Slider label="Vitesse de rotation" min={-300} max={300} step={1} unit="°/s" {...num('rings.rotationSpeed')} />
        <Toggle label="Sens de rotation alterné" {...bool('rings.alternate')} />
        <Slider label="Vitesse différente par cercle" min={0} max={1} step={0.01} {...num('rings.speedRandom')} />
        <Slider label="Spirale (décalage par cercle)" min={-20} max={20} step={0.01} unit="°" {...num('rings.twist')} />
        <Slider label="Écart intérieur / extérieur" min={-1} max={1} step={0.01} {...num('rings.speedSpread')} />
        <Slider label="Irrégularité de l’ouverture" min={0} max={40} step={0.5} unit="°" {...num('rings.jitter')} />
      </Group>
      <Group title="Comportements">
        <Slider label="Rétrécissent (−) / grandissent (+)" min={-60} max={60} step={1} unit=" px/s" {...num('rings.radiusDrift')} />
        <Slider label="Vibration" min={0} max={20} step={0.5} unit=" px" {...num('rings.vibrate')} />
        <Slider label="Pulsation sur les basses" min={0} max={1} step={0.05} {...num('audio.map.bassPulse')} />
        <Slider label="Changement de couleur" min={0} max={240} step={5} unit="°/s" {...num('rings.colorCycle')} />
        <Toggle label="Se casse quand la balle sort" {...bool('rings.breakable')} />
        <Slider label="Se casse après N chocs (0 = jamais)" min={0} max={30} step={1} {...num('rings.hitsToBreak')} />
        <Slider label="Régénération (s, 0 = jamais)" min={0} max={15} step={0.5} unit=" s" {...num('rings.regenerate')} />
        <Slider label="Freinage de la balle à chaque cassure" min={0} max={0.1} step={0.005} {...num('rings.breakDrag')} />
        <Toggle label="Les cercles se resserrent" {...bool('rings.collapse')} />
        {r.collapse && <Slider label="Vitesse de resserrement" min={20} max={1200} step={10} {...num('rings.collapseSpeed')} />}
        <Toggle label="Cercles infinis" {...bool('rings.infinite')} />
        <Toggle label="Bords de l’écran rebondissants" {...bool('rings.walls')} />
      </Group>
      <Group title="Couleurs">
        <Select
          label="Mode"
          value={r.colorMode}
          options={[
            ['bands', 'Bandes'],
            ['gradient', 'Dégradé'],
            ['rainbow', 'Arc-en-ciel'],
            ['solid', 'Unie'],
          ]}
          onChange={(v) => p.set('rings.colorMode', v)}
        />
        {r.colorMode !== 'rainbow' && <PaletteInput label="Palette" value={r.palette} onChange={(v) => p.set('rings.palette', v)} />}
        {(r.colorMode === 'bands' || r.colorMode === 'rainbow') && <Slider label="Cercles par cycle" min={1} max={300} step={1} {...num('rings.bandSize')} />}
        <Toggle label="Cercle intérieur brillant" {...bool('rings.highlightInner')} />
        <Toggle label="Disque sombre au centre" {...bool('rings.innerDisc')} />
      </Group>
      <Group title="Cercles individuels">
        <p className="hint">Réglages propres aux premiers cercles (du centre vers l’extérieur). Le rayon fixe s’applique quand « se resserrent » est désactivé.</p>
        {r.custom.map((c, i) => (
          <div key={i} className="ball-card open">
            <div className="ball-head static">
              <span className="dot" style={{ background: c.color ?? r.palette[0] }} /> Cercle {i + 1}
              <button type="button" className="mini danger" onClick={() => setCustom(r.custom.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
            <div className="ball-body">
              <Slider label="Rotation" min={-360} max={360} step={1} unit="°/s" value={c.rotationSpeed ?? r.rotationSpeed} onChange={(v) => setCustom(r.custom.map((x, k) => (k === i ? { ...x, rotationSpeed: v } : x)))} />
              <Slider label="Épaisseur" min={0.5} max={40} step={0.5} unit=" px" value={c.thickness ?? r.thickness} onChange={(v) => setCustom(r.custom.map((x, k) => (k === i ? { ...x, thickness: v } : x)))} />
              <Slider label="Ouverture" min={0} max={180} step={1} unit="°" value={c.gap ?? r.gap} onChange={(v) => setCustom(r.custom.map((x, k) => (k === i ? { ...x, gap: v } : x)))} />
              {!r.collapse && (
                <Slider label="Rayon fixe" min={40} max={900} step={1} unit=" px" value={c.radius ?? r.innerRadius + i * r.spacing} onChange={(v) => setCustom(r.custom.map((x, k) => (k === i ? { ...x, radius: v } : x)))} />
              )}
              <ColorInput label="Couleur" value={c.color ?? r.palette[i % r.palette.length] ?? '#ffffff'} onChange={(v) => setCustom(r.custom.map((x, k) => (k === i ? { ...x, color: v } : x)))} />
            </div>
          </div>
        ))}
        {r.custom.length < 12 && (
          <button type="button" className="btn wide" onClick={() => setCustom([...r.custom, {}])}>
            ＋ Personnaliser le cercle {r.custom.length + 1}
          </button>
        )}
      </Group>
    </>
  );
}

// ======================= Effets =======================
async function imageToDataUrl(file: File, max = 1920): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export function EffectsPanel(p: PanelProps & { quality: Quality; setQuality: (q: Quality) => void }) {
  const { num, bool, str } = useBind(p);
  const e = p.s.effects;
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Group title="Qualité de l’aperçu">
        <Select
          label="Qualité (cet appareil)"
          value={p.quality}
          options={[
            ['performance', 'Performance'],
            ['balanced', 'Équilibré'],
            ['high', 'Haute qualité'],
          ]}
          onChange={p.setQuality}
        />
        <p className="hint">Performance : moins de cercles dessinés et pas de bloom. L’export utilise sa propre qualité (onglet Export).</p>
      </Group>
      <Group title="Fond">
        <Select
          label="Type"
          value={e.bgMode}
          options={[
            ['solid', 'Uni'],
            ['gradient', 'Lueur'],
            ['animated', 'Dégradé animé'],
            ['stars', 'Étoiles'],
            ['tunnel', 'Tunnel'],
            ['image', 'Image'],
          ]}
          onChange={(v) => p.set('effects.bgMode', v)}
        />
        <ColorInput label="Couleur de fond" {...str('effects.background')} />
        {e.bgMode !== 'solid' && <ColorInput label="Lueur" {...str('effects.backgroundGlow')} />}
        {e.bgMode === 'animated' && <ColorInput label="Seconde couleur" {...str('effects.background2')} />}
        {e.bgMode === 'image' && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (ev) => {
                const f = ev.target.files?.[0];
                if (!f) return;
                try {
                  p.set('effects.bgImage', await imageToDataUrl(f));
                } catch {
                  notify('Image illisible');
                }
              }}
            />
            <button type="button" className="btn wide" onClick={() => fileRef.current?.click()}>
              🖼 {e.bgImage ? 'Changer l’image' : 'Importer une image de fond'}
            </button>
            <Slider label="Assombrissement" min={0} max={0.95} step={0.05} {...num('effects.bgDim')} />
          </>
        )}
        <Slider label="Vignette (profondeur)" min={0} max={1} step={0.05} {...num('effects.vignette')} />
      </Group>
      <Group title="Lumière">
        <Slider label="Bloom" min={0} max={1} step={0.05} {...num('effects.bloom')} />
        <Slider label="Flou de mouvement" min={0} max={0.85} step={0.05} {...num('effects.motionBlur')} />
        <Slider label="Néon (halo des cercles)" min={0} max={1} step={0.05} {...num('effects.neon')} />
        <Toggle label="Arc-en-ciel global" {...bool('effects.rainbow')} />
        {e.rainbow && <Slider label="Vitesse arc-en-ciel" min={5} max={400} step={5} unit="°/s" {...num('effects.rainbowSpeed')} />}
        <Toggle label="Flash sur les temps forts" {...bool('effects.flash')} />
        <Toggle label="Tremblement aux impacts" {...bool('effects.shake')} />
      </Group>
      <Group title="Collisions spectaculaires">
        <Slider label="Explosion de particules" min={0} max={2} step={0.1} {...num('effects.hit.particles')} />
        <Slider label="Onde de choc" min={0} max={1} step={0.05} {...num('effects.hit.shockwave')} />
        <Slider label="Flash lumineux" min={0} max={1} step={0.05} {...num('effects.hit.flash')} />
        <Slider label="Déformation du cercle" min={0} max={1} step={0.05} {...num('effects.hit.deform')} />
        <Slider label="Vibration de caméra" min={0} max={1} step={0.05} {...num('effects.hit.shake')} />
        <Slider label="Variation de couleur" min={0} max={1} step={0.05} {...num('effects.hit.colorShift')} />
        <Slider label="Destruction partielle (trous)" min={0} max={1} step={0.05} {...num('effects.hit.holes')} />
        <Toggle label="Disparition progressive" hint="avec « se casse après N chocs »" {...bool('effects.hit.fade')} />
        <Slider label="Multiplication des balles" min={0} max={0.5} step={0.01} {...num('effects.hit.multiply')} />
        {e.hit.multiply > 0 && <Slider label="Balles maximum" min={2} max={80} step={1} {...num('effects.hit.maxBalls')} />}
      </Group>
      <Group title="Particules">
        <Toggle label="Particules" {...bool('effects.particles')} />
        <Slider label="Quantité globale" min={0.1} max={2.5} step={0.1} {...num('effects.particleAmount')} />
        <Toggle label="Explosions à la destruction" {...bool('effects.explosions')} />
        <Toggle label="Étincelles aux rebonds" {...bool('effects.sparks')} />
        <Toggle label="Poussière scintillante au centre" {...bool('effects.innerDust')} />
      </Group>
      <Group title="Musique">
        <Toggle label="Réactif à la musique" {...bool('effects.musicReactive')} />
        {e.musicReactive && <Slider label="Intensité" min={0} max={2.5} step={0.1} {...num('effects.reactivity')} />}
        <Toggle label="Accélère sur les temps forts" {...bool('effects.beatImpulse')} />
        <Toggle label="Visualiseur audio à la fin" {...bool('effects.endVisualizer')} />
      </Group>
      <TextGroups {...p} />
    </>
  );
}

function TextGroups(p: PanelProps) {
  const { num, str } = useBind(p);
  const c = p.s.counter;
  return (
    <>
      <Group title="Texte central">
        <Select
          label="Compteur"
          value={c.mode}
          options={[
            ['remaining', 'Restants'],
            ['destroyed', 'Détruits'],
            ['bounces', 'Rebonds'],
            ['time', 'Temps'],
            ['none', 'Aucun'],
          ]}
          onChange={(v) => p.set('counter.mode', v)}
        />
        <TextInput label="Texte ({n} = compteur)" placeholder="{n}" {...str('counter.text')} />
        <Slider label="Taille" min={30} max={300} step={2} {...num('counter.size')} />
        <ColorInput label="Couleur" {...str('counter.color')} />
        <TextInput label="Texte de fin" placeholder="ex. : BRAVO !" {...str('counter.endText')} />
      </Group>
      <Group title="Titres">
        <TextInput label="Titre en haut" multiline placeholder="ex. : Va-t-elle s’échapper ?" {...str('counter.title')} />
        <TextInput label="Texte en bas" multiline placeholder="ex. : Abonne-toi !" {...str('counter.bottomText')} />
        <Slider label="Taille des titres" min={30} max={130} step={2} {...num('counter.titleSize')} />
        <Slider label="Graine aléatoire (variante)" min={1} max={999} step={1} {...num('seed')} />
      </Group>
    </>
  );
}

// ======================= Caméra =======================
export function CameraPanel(p: PanelProps & { musicT: number }) {
  const { num } = useBind(p);
  const c = p.s.camera;
  const keys = c.keys.slice().sort((a, b) => a.time - b.time);
  const setKeys = (k: CameraKey[]) => p.set('camera.keys', k);
  return (
    <>
      <Group title="Caméra automatique">
        <Slider label="Suivi de la balle" min={0} max={1} step={0.05} {...num('camera.follow')} />
        <Slider label="Zoom selon l’énergie" min={0} max={1} step={0.05} {...num('camera.autoZoom')} />
        <Slider label="Rapprochement pendant la montée" min={0} max={0.5} step={0.01} {...num('camera.buildZoom')} />
        <Slider label="Zoom à l’impact du drop" min={0} max={0.6} step={0.01} {...num('camera.dropZoom')} />
        <Slider label="Rotation légère" min={0} max={15} step={0.5} unit="°" {...num('camera.sway')} />
        <Slider label="Tremblements" min={0} max={2} step={0.05} {...num('camera.shake')} />
        <Slider label="Douceur des mouvements" min={0} max={1} step={0.05} {...num('camera.smoothing')} />
        <p className="hint">Les mouvements sont lissés pour rester agréables ; la douceur élevée évite les à-coups.</p>
      </Group>
      <Group title="Images clés">
        <p className="hint">Chaque image clé fixe zoom, rotation et décalage à un instant ; la caméra passe de l’une à l’autre en douceur. Elles apparaissent en losanges sur la timeline.</p>
        {keys.map((k) => (
          <div key={k.id} className="ball-card open">
            <div className="ball-head static">
              ◆ {formatTime(k.time)}
              <button type="button" className="mini danger" onClick={() => setKeys(c.keys.filter((x) => x.id !== k.id))}>
                ✕
              </button>
            </div>
            <div className="ball-body">
              <Slider label="Zoom" min={0.5} max={3} step={0.01} unit="×" value={k.zoom} onChange={(v) => setKeys(c.keys.map((x) => (x.id === k.id ? { ...x, zoom: v } : x)))} />
              <Slider label="Rotation" min={-45} max={45} step={0.5} unit="°" value={k.rotation} onChange={(v) => setKeys(c.keys.map((x) => (x.id === k.id ? { ...x, rotation: v } : x)))} />
              <Slider label="Décalage horizontal" min={-500} max={500} step={5} value={k.x} onChange={(v) => setKeys(c.keys.map((x) => (x.id === k.id ? { ...x, x: v } : x)))} />
              <Slider label="Décalage vertical" min={-800} max={800} step={5} value={k.y} onChange={(v) => setKeys(c.keys.map((x) => (x.id === k.id ? { ...x, y: v } : x)))} />
              <button type="button" className="btn small" onClick={() => setKeys(c.keys.map((x) => (x.id === k.id ? { ...x, time: Math.round(p.musicT * 1000) / 1000 } : x)))}>
                Placer à la tête de lecture
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn wide"
          onClick={() => setKeys([...c.keys, { id: uid(), time: Math.round(p.musicT * 1000) / 1000, zoom: keys.length ? 1.3 : 1, rotation: 0, x: 0, y: 0 }])}
        >
          ＋ Image clé à {formatTime(p.musicT)}
        </button>
      </Group>
    </>
  );
}

// ======================= Export (format) =======================
export function ExportPanel(p: PanelProps & { onExport: () => void; onCapture: () => void }) {
  const { num } = useBind(p);
  const ex = p.s.export;
  return (
    <>
      <Group title="Format">
        <Select
          label="Format"
          value={ex.aspect}
          options={[
            ['9:16', '9:16 TikTok'],
            ['16:9', '16:9 YouTube'],
            ['1:1', '1:1 Instagram'],
            ['4:5', '4:5'],
            ['custom', 'Personnalisé'],
          ]}
          onChange={(v) => p.set('export.aspect', v)}
        />
        {ex.aspect === 'custom' && (
          <div className="two">
            <Slider label="Largeur (proportion)" min={1} max={32} step={1} {...num('export.customW')} />
            <Slider label="Hauteur (proportion)" min={1} max={32} step={1} {...num('export.customH')} />
          </div>
        )}
        <Select
          label="Durée"
          value={ex.duration}
          options={[
            [0, 'Auto'],
            [15, '15 s'],
            [20, '20 s'],
            [30, '30 s'],
            [45, '45 s'],
            [60, '1 min'],
            [90, '1 min 30'],
            [120, '2 min'],
            [180, '3 min'],
          ]}
          onChange={(v) => p.set('export.duration', v)}
        />
        <Select
          label="Qualité du rendu"
          value={ex.quality}
          options={[
            ['performance', 'Performance'],
            ['balanced', 'Équilibré'],
            ['high', 'Haute qualité'],
          ]}
          onChange={(v) => p.set('export.quality', v)}
        />
      </Group>
      <button type="button" className="btn primary wide generate" onClick={p.onExport}>
        🎬 Exporter la vidéo
      </button>
      <button type="button" className="btn wide" onClick={p.onCapture}>
        📸 Capture d’image (PNG)
      </button>
    </>
  );
}
