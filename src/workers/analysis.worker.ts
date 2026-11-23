// Analyse musicale hors du fil principal (l'interface reste fluide).
import { analyzeBuffer } from '../engine/analysis';

self.onmessage = async (e: MessageEvent<{ sampleRate: number; length: number; chans: Float32Array[] }>) => {
  const { sampleRate, length, chans } = e.data;
  const buf = { sampleRate, length, numberOfChannels: chans.length, duration: length / sampleRate, getChannelData: (c: number) => chans[c] } as unknown as AudioBuffer;
  try {
    const analysis = await analyzeBuffer(buf, (p) => postMessage({ progress: p }));
    postMessage({ analysis });
  } catch (err) {
    postMessage({ error: String(err) });
  }
};
