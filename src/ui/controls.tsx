import type { ReactNode } from 'react';
import type { Settings } from '../engine/types';

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

export function setPath(s: Settings, path: string, value: unknown): Settings {
  const keys = path.split('.');
  const out = { ...s } as Record<string, unknown>;
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] as object) };
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return out as unknown as Settings;
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, unit, onChange } = props;
  const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  return (
    <label className="field slider">
      <span className="field-top">
        <span>{label}</span>
        <b>
          {Number(value).toFixed(dec)}
          {unit ?? ''}
        </b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field toggle">
      <span>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-top">
        <span>{props.label}</span>
      </span>
      <div className="seg">
        {props.options.map(([v, l]) => (
          <button key={String(v)} type="button" className={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorInput(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field color">
      <span>{props.label}</span>
      <span className="swatch" style={{ background: props.value }}>
        <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function TextInput(props: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <label className="field text">
      <span className="field-top">
        <span>{props.label}</span>
      </span>
      {props.multiline ? (
        <textarea rows={2} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input type="text" value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      )}
    </label>
  );
}

export const PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Coucher de soleil', colors: ['#ffae2b', '#f24fd0', '#a24bff', '#f24fd0'] },
  { name: 'Rouge', colors: ['#e0333f', '#8f1a2a', '#ff5a5f', '#8f1a2a'] },
  { name: 'Néon', colors: ['#00e5ff', '#7c4dff', '#ff2bd6', '#7c4dff'] },
  { name: 'Océan', colors: ['#00ffa3', '#00b3ff', '#3a4bff', '#00b3ff'] },
  { name: 'Feu', colors: ['#ffd000', '#ff7a00', '#ff2a00', '#ff7a00'] },
  { name: 'Pastel', colors: ['#ffc6e0', '#c6d8ff', '#c9ffe5', '#fff1b8'] },
  { name: 'Or', colors: ['#fff1a8', '#ffc531', '#c97d10', '#ffc531'] },
  { name: 'Glace', colors: ['#ffffff', '#9fe8ff', '#4aa8ff', '#9fe8ff'] },
  { name: 'Mono', colors: ['#ffffff', '#7a7a8c'] },
];

export function PaletteInput(props: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const { value, onChange } = props;
  return (
    <div className="field palette">
      <span className="field-top">
        <span>{props.label}</span>
      </span>
      <div className="pal-row">
        {value.map((c, i) => (
          <span key={i} className="swatch" style={{ background: c }}>
            <input
              type="color"
              value={c}
              onChange={(e) => {
                const n = value.slice();
                n[i] = e.target.value;
                onChange(n);
              }}
            />
          </span>
        ))}
        {value.length < 6 && (
          <button type="button" className="mini" onClick={() => onChange([...value, value[value.length - 1] ?? '#ffffff'])}>
            +
          </button>
        )}
        {value.length > 1 && (
          <button type="button" className="mini" onClick={() => onChange(value.slice(0, -1))}>
            −
          </button>
        )}
      </div>
      <div className="pal-presets">
        {PALETTES.map((p) => (
          <button type="button" key={p.name} title={p.name} onClick={() => onChange(p.colors.slice())}>
            <span style={{ background: `linear-gradient(90deg, ${p.colors.join(',')})` }} />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Group(props: { title: string; children: ReactNode }) {
  return (
    <section className="group">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}
