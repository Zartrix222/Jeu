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
  return { fps: ANALYSIS_FPS, frames, duration: len / rate, energy, bass, beats, spectrum, wave, waveRate: rate };
}

export function frameAt(a: MusicAnalysis, t: number) {
  return Math.max(0, Math.min(a.frames - 1, Math.floor(t * a.fps)));
}
