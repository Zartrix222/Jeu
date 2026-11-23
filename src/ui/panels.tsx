import type { Settings } from '../engine/types';
import { ColorInput, Group, PaletteInput, Select, Slider, TextInput, Toggle, getPath } from './controls';

export interface PanelProps {
  s: Settings;
  set: (path: string, v: unknown) => void;
}

function useBind({ s, set }: PanelProps) {
  const num = (p: string) => ({ value: getPath(s, p) as number, onChange: (v: number) => set(p, v) });
  const bool = (p: string) => ({ value: getPath(s, p) as boolean, onChange: (v: boolean) => set(p, v) });
  const str = (p: string) => ({ value: (getPath(s, p) as string) ?? '', onChange: (v: string) => set(p, v) });
  return { num, bool, str };
}

export function BallsPanel(p: PanelProps) {
  const { num, bool, str } = useBind(p);
  const b = p.s.balls;
  return (
    <>
      <Group title="Balles">
        <Slider label="Nombre de balles" min={1} max={30} step={1} {...num('balls.count')} />
        <Slider label="Taille" min={4} max={80} step={1} unit=" px" {...num('balls.radius')} />
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
        {b.colorMode === 'solid' && <ColorInput label="Couleur de la balle" {...str('balls.color')} />}
        <Slider label="Halo lumineux" min={0} max={1} step={0.05} {...num('balls.glow')} />
      </Group>
      <Group title="Physique">
        <Slider label="Vitesse de départ" min={0} max={2500} step={10} {...num('balls.speed')} />
        <Slider label="Gravité" min={0} max={4000} step={10} {...num('balls.gravity')} />
        <Slider label="Rebond (élasticité)" min={0.3} max={1.15} step={0.01} {...num('balls.bounce')} />
        <Slider label="Vitesse minimale" min={0} max={2000} step={10} {...num('balls.minSpeed')} />
        <Slider label="Vitesse maximale" min={500} max={6000} step={50} {...num('balls.maxSpeed')} />
        <Slider label="Grossit à chaque rebond" min={0} max={10} step={0.5} unit=" px" {...num('balls.growOnBounce')} />
        <Toggle label="Collisions entre balles" {...bool('balls.ballCollisions')} />
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
    </>
  );
}

export function RingsPanel(p: PanelProps) {
  const { num, bool } = useBind(p);
  const r = p.s.rings;
  return (
    <>
      <Group title="Cercles">
        <Slider label="Nombre de cercles" min={0} max={2000} step={1} {...num('rings.count')} />
        <Slider label="Taille (rayon intérieur)" min={60} max={520} step={1} unit=" px" {...num('rings.innerRadius')} />
        <Slider label="Espacement" min={2} max={120} step={0.2} unit=" px" {...num('rings.spacing')} />
        <Slider label="Épaisseur" min={0.5} max={30} step={0.1} unit=" px" {...num('rings.thickness')} />
        <Slider label="Position verticale" min={0.25} max={0.75} step={0.01} {...num('rings.centerY')} />
      </Group>
      <Group title="Ouverture et rotation">
        <Slider label="Taille de l’ouverture" min={0} max={180} step={1} unit="°" {...num('rings.gap')} />
        <Slider label="Vitesse de rotation" min={-240} max={240} step={1} unit="°/s" {...num('rings.rotationSpeed')} />
        <Slider label="Spirale (décalage par cercle)" min={-20} max={20} step={0.01} unit="°" {...num('rings.twist')} />
        <Slider label="Écart de vitesse intérieur/extérieur" min={-1} max={1} step={0.01} {...num('rings.speedSpread')} />
        <Slider label="Irrégularité de l’ouverture" min={0} max={40} step={0.5} unit="°" {...num('rings.jitter')} />
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
        {(r.colorMode === 'bands' || r.colorMode === 'rainbow') && (
          <Slider label="Cercles par cycle de couleur" min={2} max={300} step={1} {...num('rings.bandSize')} />
        )}
        <Toggle label="Cercle intérieur brillant" {...bool('rings.highlightInner')} />
        <Toggle label="Disque sombre au centre" {...bool('rings.innerDisc')} />
      </Group>
      <Group title="Destruction">
        <Toggle label="Se casse quand la balle sort" hint="par l’ouverture" {...bool('rings.breakable')} />
        <Slider label="Freinage de la balle à chaque cassure" min={0} max={0.1} step={0.005} {...num('rings.breakDrag')} />
        <Slider label="Se casse après N chocs (0 = jamais)" min={0} max={30} step={1} {...num('rings.hitsToBreak')} />
        <Toggle label="Les cercles se resserrent" {...bool('rings.collapse')} />
        {r.collapse && <Slider label="Vitesse de resserrement" min={20} max={1200} step={10} {...num('rings.collapseSpeed')} />}
        <Toggle label="Cercles infinis" hint="un nouveau cercle apparaît à chaque destruction" {...bool('rings.infinite')} />
        <Toggle label="Bords de l’écran rebondissants" {...bool('rings.walls')} />
      </Group>
    </>
  );
}

export function EffectsPanel(p: PanelProps) {
  const { num, bool, str } = useBind(p);
  const e = p.s.effects;
  return (
    <>
      <Group title="Fond">
        <ColorInput label="Couleur de fond" {...str('effects.background')} />
        <ColorInput label="Lueur centrale" {...str('effects.backgroundGlow')} />
      </Group>
      <Group title="Particules">
        <Toggle label="Particules" {...bool('effects.particles')} />
        {e.particles && (
          <>
            <Slider label="Quantité" min={0.1} max={2.5} step={0.1} {...num('effects.particleAmount')} />
            <Toggle label="Explosions à la destruction" {...bool('effects.explosions')} />
            <Toggle label="Étincelles aux rebonds" {...bool('effects.sparks')} />
          </>
        )}
        <Toggle label="Poussière scintillante au centre" {...bool('effects.innerDust')} />
      </Group>
      <Group title="Lumière">
        <Slider label="Néon (halo des cercles)" min={0} max={1} step={0.05} {...num('effects.neon')} />
        <Toggle label="Effet arc-en-ciel global" {...bool('effects.rainbow')} />
        {e.rainbow && <Slider label="Vitesse arc-en-ciel" min={5} max={400} step={5} unit="°/s" {...num('effects.rainbowSpeed')} />}
        <Toggle label="Flash" {...bool('effects.flash')} />
        <Toggle label="Tremblement de l’écran" {...bool('effects.shake')} />
      </Group>
      <Group title="Musique">
        <Toggle label="Réactif à la musique / aux rebonds" {...bool('effects.musicReactive')} />
        {e.musicReactive && <Slider label="Intensité" min={0} max={2.5} step={0.1} {...num('effects.reactivity')} />}
        <Toggle label="La balle accélère sur les temps forts" {...bool('effects.beatImpulse')} />
        <Toggle label="Visualiseur audio à la fin" {...bool('effects.endVisualizer')} />
      </Group>
    </>
  );
}

export function TextPanel(p: PanelProps) {
  const { num, str } = useBind(p);
  const c = p.s.counter;
  return (
    <>
      <Group title="Compteur central">
        <Select
          label="Afficher"
          value={c.mode}
          options={[
            ['remaining', 'Cercles restants'],
            ['destroyed', 'Cercles détruits'],
            ['bounces', 'Rebonds'],
            ['time', 'Temps'],
            ['none', 'Rien'],
          ]}
          onChange={(v) => p.set('counter.mode', v)}
        />
        <TextInput label="Texte central ({n} = compteur)" placeholder="{n}" {...str('counter.text')} />
        <Slider label="Taille" min={30} max={300} step={2} {...num('counter.size')} />
        <ColorInput label="Couleur" {...str('counter.color')} />
        <TextInput label="Texte de fin (remplace le compteur)" placeholder="ex. : BRAVO !" {...str('counter.endText')} />
      </Group>
      <Group title="Titre en haut">
        <TextInput label="Titre" multiline placeholder="ex. : La balle va-t-elle s’échapper ?" {...str('counter.title')} />
        <Slider label="Taille du titre" min={30} max={130} step={2} {...num('counter.titleSize')} />
      </Group>
      <Group title="Variante">
        <Slider label="Graine aléatoire (change la trajectoire)" min={1} max={999} step={1} {...num('seed')} />
      </Group>
    </>
  );
}
