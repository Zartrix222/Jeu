import type { ArrayBufferTarget, Muxer } from 'mp4-muxer';

/** Encode un signal stéréo et l'ajoute au fichier MP4 (utilisé aussi par le worker). */
export async function encodeAudio(muxer: Muxer<ArrayBufferTarget>, cfg: AudioEncoderConfig, L: Float32Array, R: Float32Array, sr: number, onProgress?: (p: number) => void) {
  let err: unknown = null;
  const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (err = e) });
  aenc.configure(cfg);
  const CH = 2048;
  for (let i = 0; i < L.length; i += CH) {
    const n = Math.min(CH, L.length - i);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(i, i + n), 0);
    data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / sr) * 1e6), data });
    aenc.encode(ad);
    ad.close();
    if ((i / CH) % 50 === 0) {
      while (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 2));
      onProgress?.(i / L.length);
    }
  }
  await aenc.flush();
  aenc.close();
  if (err) throw err;
}

