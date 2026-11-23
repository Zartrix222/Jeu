// Analyse hors-ligne d'une musique : énergie, basses, temps forts et spectre
// pré-calculés à 60 images/s. Le même résultat sert à l'aperçu ET à l'export,
// ce qui garantit une animation identique dans les deux cas.

export const ANALYSIS_FPS = 60;
export const BANDS = 48;
const FFT_N = 1024;

export interface MusicAnalysis {
  fps: number;
  frames: number;
  duration: number;
  energy: Float32Array; // 0..1
  bass: Float32Array; // 0..1
  beats: Uint8Array; // 1 = temps fort
  spectrum: Uint8Array; // frames * BANDS, 0..255
  wave: Float32Array; // signal mono sous-échantillonné
  waveRate: number;
  // ---- analyse avancée ----
  low: Float32Array; // graves (0..1)
  mid: Float32Array; // médiums
  high: Float32Array; // aigus
  flux: Float32Array; // transitoires (flux spectral, 0..1)
  bpm: number; // tempo global estimé (0 = inconnu)
  bpmConfidence: number; // 0..1
  beatGrid: number[]; // instants des temps (s), d'après le tempo
  tempo: { start: number; end: number; bpm: number }[]; // tempo par passage
  sections: MusicSection[];
}

export interface MusicSection {
  start: number;
  end: number;
  type: 'calm' | 'buildup' | 'peak' | 'transition' | 'tempo';
  label: string;
}

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export async function analyzeBuffer(buf: AudioBuffer, onProgress?: (p: number) => void): Promise<MusicAnalysis> {
  const sr = buf.sampleRate;
  const factor = Math.max(1, Math.round(sr / 22050));
  const rate = sr / factor;
  const len = Math.floor(buf.length / factor);
  const wave = new Float32Array(len);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) for (const ch of chans) s += ch[i * factor + k];
    wave[i] = s / (factor * chans.length);
  }

  const frames = Math.max(1, Math.ceil((len / rate) * ANALYSIS_FPS));
  const energy = new Float32Array(frames);
  const bass = new Float32Array(frames);
  const beats = new Uint8Array(frames);
  const spectrum = new Uint8Array(frames * BANDS);
  const re = new Float32Array(FFT_N);
  const im = new Float32Array(FFT_N);
  const hann = new Float32Array(FFT_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
  // bandes logarithmiques
  const binHz = rate / FFT_N;
  const edges: number[] = [];
  for (let b = 0; b <= BANDS; b++) {
    const hz = 40 * Math.pow(9000 / 40, b / BANDS);
    edges.push(Math.max(1, Math.min(FFT_N / 2 - 1, Math.round(hz / binHz))));
  }
  const raw = new Float32Array(frames * BANDS);
  const bassRaw = new Float32Array(frames);
  let maxE = 1e-6;

  for (let f = 0; f < frames; f++) {
    const center = Math.floor((f / ANALYSIS_FPS) * rate);
    const start = center - FFT_N / 2;
    let sum = 0;
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i;
      const v = idx >= 0 && idx < len ? wave[idx] : 0;
      re[i] = v * hann[i];
      im[i] = 0;
      sum += v * v;
    }
    energy[f] = Math.sqrt(sum / FFT_N);
    if (energy[f] > maxE) maxE = energy[f];
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let m = 0;
      const lo = edges[b];
      const hi = Math.max(lo + 1, edges[b + 1]);
      for (let k = lo; k < hi; k++) m += Math.hypot(re[k], im[k]);
      raw[f * BANDS + b] = Math.log1p(m / (hi - lo));
    }
    let bs = 0;
    for (let k = 1; k < Math.max(2, Math.round(150 / binHz)); k++) bs += Math.hypot(re[k], im[k]);
    bassRaw[f] = bs;
    if (f % 600 === 0) {
      onProgress?.(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // normalisation
  let maxRaw = 1e-6;
  for (let i = 0; i < raw.length; i++) if (raw[i] > maxRaw) maxRaw = raw[i];
  for (let i = 0; i < raw.length; i++) spectrum[i] = Math.min(255, Math.max(0, ((raw[i] / maxRaw) ** 1.6) * 255));
  let maxB = 1e-6;
  for (let f = 0; f < frames; f++) if (bassRaw[f] > maxB) maxB = bassRaw[f];
  for (let f = 0; f < frames; f++) {
    energy[f] /= maxE;
    bass[f] = bassRaw[f] / maxB;
  }

  // détection des temps forts (flux des basses vs moyenne glissante)
  const win = Math.round(ANALYSIS_FPS * 0.6);
  let lastBeat = -999;
  for (let f = 1; f < frames; f++) {
    let avg = 0;
    let n = 0;
    for (let k = Math.max(0, f - win); k < f; k++) {
      avg += bass[k];
      n++;
    }
    avg /= Math.max(1, n);
    const rising = bass[f] - bass[f - 1] > 0.02;
    if (rising && bass[f] > avg * 1.3 + 0.08 && f - lastBeat > ANALYSIS_FPS * 0.22) {
      beats[f] = 1;
      lastBeat = f;
    }
  }
  onProgress?.(1);
  const base = { fps: ANALYSIS_FPS, frames, duration: len / rate, energy, bass, beats, spectrum, wave, waveRate: rate };
  return enrich(base);
}

export function frameAt(a: MusicAnalysis, t: number) {
  return Math.max(0, Math.min(a.frames - 1, Math.floor(t * a.fps)));
}


// ===================== analyse avancée =====================

type BaseAnalysis = Pick<MusicAnalysis, 'fps' | 'frames' | 'duration' | 'energy' | 'bass' | 'beats' | 'spectrum' | 'wave' | 'waveRate'>;

function smooth(src: Float32Array, win: number): Float32Array {
  const out = new Float32Array(src.length);
  let acc = 0;
  const q: number[] = [];
  for (let i = 0; i < src.length; i++) {
    acc += src[i];
    q.push(src[i]);
    if (q.length > win) acc -= q.shift()!;
    out[i] = acc / q.length;
  }
  // recentrage (compense le retard du filtre)
  const shift = Math.floor(win / 2);
  return out.map((_, i) => out[Math.min(out.length - 1, i + shift)]);
}

function estimateTempo(onset: Float32Array, fps: number, i0: number, i1: number): { bpm: number; conf: number; lag: number } {
  const minLag = Math.floor((fps * 60) / 190);
  const maxLag = Math.ceil((fps * 60) / 60);
  const n = i1 - i0;
  if (n < maxLag * 3) return { bpm: 0, conf: 0, lag: 0 };
  let mean = 0;
  for (let i = i0; i < i1; i++) mean += onset[i];
  mean /= n;
  const ac: number[] = [];
  for (let L = minLag; L <= maxLag; L++) {
    let sum = 0;
    for (let i = i0; i < i1 - L; i++) sum += (onset[i] - mean) * (onset[i + L] - mean);
    ac.push(sum / (n - L));
  }
  // préférence douce pour 90–150 BPM (évite les erreurs d'octave)
  let best = -Infinity;
  let bi = 0;
  ac.forEach((v, k) => {
    const bpm = (fps * 60) / (k + minLag);
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (v * w > best) {
      best = v * w;
      bi = k;
    }
  });
  const y0 = ac[bi - 1] ?? ac[bi];
  const y1 = ac[bi];
  const y2 = ac[bi + 1] ?? ac[bi];
  const den = y0 - 2 * y1 + y2;
  const frac = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
  const lag = bi + minLag + Math.max(-0.5, Math.min(0.5, frac));
  const pos = ac.filter((v) => v > 0);
  const avg = pos.reduce((a, b) => a + b, 0) / Math.max(1, pos.length);
  const conf = y1 > 0 ? Math.max(0, Math.min(1, (y1 / Math.max(1e-9, avg) - 1) / 3)) : 0;
  return { bpm: Math.round(((fps * 60) / lag) * 10) / 10, conf, lag };
}

function enrich(a: BaseAnalysis): MusicAnalysis {
  const { frames, fps, spectrum } = a;
  const low = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const flux = new Float32Array(frames);
  let mx = [1e-6, 1e-6, 1e-6, 1e-6];
  for (let f = 0; f < frames; f++) {
    let l = 0;
    let m = 0;
    let h = 0;
    let fl = 0;
    for (let b = 0; b < BANDS; b++) {
      const v = spectrum[f * BANDS + b];
      if (b < 15) l += v;
      else if (b < 34) m += v;
      else h += v;
      if (f > 0) fl += Math.max(0, v - spectrum[(f - 1) * BANDS + b]);
    }
    low[f] = l;
    mid[f] = m;
    high[f] = h;
    flux[f] = fl;
    mx = [Math.max(mx[0], l), Math.max(mx[1], m), Math.max(mx[2], h), Math.max(mx[3], fl)];
  }
  for (let f = 0; f < frames; f++) {
    low[f] /= mx[0];
    mid[f] /= mx[1];
    high[f] /= mx[2];
    flux[f] /= mx[3];
  }

  // tempo global + grille de temps
  const onset = smooth(flux, 2);
  const g = estimateTempo(onset, fps, 0, frames);
  const beatGrid: number[] = [];
  if (g.bpm > 0) {
    let bestPhase = 0;
    let bestSum = -1;
    for (let ph = 0; ph < g.lag; ph++) {
      let sum = 0;
      for (let k = ph; k < frames; k += g.lag) sum += onset[Math.round(k)] ?? 0;
      if (sum > bestSum) {
        bestSum = sum;
        bestPhase = ph;
      }
    }
    for (let k = bestPhase; k < frames; k += g.lag) beatGrid.push(Math.round((k / fps) * 1000) / 1000);
  }

  // tempo par passages de 10 s → changements de tempo
  const tempo: MusicAnalysis['tempo'] = [];
  const win = fps * 10;
  for (let i0 = 0; i0 + win / 2 < frames; i0 += win / 2) {
    const t = estimateTempo(onset, fps, i0, Math.min(frames, i0 + win));
    if (t.bpm > 0 && t.conf > 0.15) {
      const last = tempo[tempo.length - 1];
      if (last && Math.abs(last.bpm - t.bpm) / last.bpm < 0.04) last.end = Math.min(frames, i0 + win) / fps;
      else tempo.push({ start: i0 / fps, end: Math.min(frames, i0 + win) / fps, bpm: t.bpm });
    }
  }

  // sections : calme, montée, pic, transition
  const e = smooth(a.energy.map((v, i) => v * 0.6 + a.bass[i] * 0.4) as Float32Array, fps);
  const sorted = Array.from(e).sort((x, y) => x - y);
  const p30 = sorted[Math.floor(sorted.length * 0.3)] ?? 0;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 1;
  const sections: MusicSection[] = [];
  const push = (start: number, end: number, type: MusicSection['type'], label: string) => {
    const last = sections[sections.length - 1];
    if (last && last.type === type && start - last.end < 1) last.end = end;
    else sections.push({ start, end, type, label });
  };
  const step = Math.round(fps / 2);
  const slopeWin = fps * 4;
  for (let f = 0; f < frames; f += step) {
    const t = f / fps;
    const t2 = Math.min(frames, f + step) / fps;
    const slope = f >= slopeWin ? (e[f] - e[f - slopeWin]) / Math.max(0.05, p85) : 0;
    const highRise = f >= slopeWin ? high[f] - high[f - slopeWin] : 0;
    if (e[f] < p85 * 0.8 && f + fps < frames && e[f + fps] < p85 && (slope > 0.12 || (slope > 0.04 && highRise > 0.005))) push(t, t2, 'buildup', 'Montée de tension');
    else if (e[f] <= Math.max(p30, p85 * 0.45)) push(t, t2, 'calm', 'Passage calme');
    else if (e[f] >= p85) push(t, t2, 'peak', 'Pic d’énergie');
  }
  for (let i = sections.length - 1; i >= 0; i--) if (sections[i].end - sections[i].start < 1.5) sections.splice(i, 1);
  // transitions : changement brutal de la répartition graves / médiums / aigus
  const lowS = smooth(low, fps * 2);
  const midS = smooth(mid, fps * 2);
  const highS = smooth(high, fps * 2);
  let lastTr = -99;
  for (let f = fps * 2; f < frames - fps * 2; f += step) {
    const d = Math.abs(lowS[f + fps * 2] - lowS[f - fps * 2]) + Math.abs(midS[f + fps * 2] - midS[f - fps * 2]) + Math.abs(highS[f + fps * 2] - highS[f - fps * 2]);
    if (d > 0.55 && f / fps - lastTr > 6) {
      sections.push({ start: f / fps - 0.75, end: f / fps + 0.75, type: 'transition', label: 'Transition' });
      lastTr = f / fps;
    }
  }
  for (let i = 1; i < tempo.length; i++) sections.push({ start: tempo[i].start, end: tempo[i].start + 1.5, type: 'tempo', label: `Tempo ${tempo[i - 1].bpm} → ${tempo[i].bpm} BPM` });
  sections.sort((x, y) => x.start - y.start);

  return { ...a, low, mid, high, flux, bpm: g.bpm, bpmConfidence: g.conf, beatGrid, tempo, sections };
}
