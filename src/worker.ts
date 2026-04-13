// ===== Web Worker: Heavy Computation =====
// Handles STFT, peak mipmap, and WAV encoding off the main thread.
// Self-contained: duplicates FFT/window code intentionally to avoid import issues in workers.
/* eslint-disable no-restricted-globals */

const _self = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

interface PeakLevel {
  mins: Float32Array;
  maxs: Float32Array;
}

_self.onmessage = function (e: MessageEvent) {
  const { type, id } = e.data;
  try {
    if (type === 'computeSTFT') {
      const { samples, fftSize, hopSize, windowType, minDb } = e.data;
      const result = workerSTFT(samples, fftSize, hopSize, windowType, minDb, id);
      _self.postMessage({ id, type: 'stftResult', ...result }, [result.imageData] as any);
    } else if (type === 'computeSTFTTile') {
      const { samples, fftSize, hopSize, windowType, minDb, tileStart, tileEnd, tileWidth, tileHeight, colorMap } = e.data;
      const result = workerSTFTTile(samples, fftSize, hopSize, windowType, minDb, tileStart, tileEnd, tileWidth, tileHeight, colorMap);
      _self.postMessage({ id, type: 'stftTileResult', imageData: result.imageData, tileStart, tileEnd }, [result.imageData] as any);
    } else if (type === 'computePeakMipmap') {
      const { channelData, channel } = e.data;
      const result = workerPeakMipmap(channelData);
      _self.postMessage({ id, type: 'peakMipmapResult', levels: result, channel });
    } else if (type === 'encodeWAV') {
      const { channels, sampleRate, bitsPerSample } = e.data;
      const blob = workerEncodeWAV(channels, sampleRate, bitsPerSample);
      _self.postMessage({ id, type: 'wavResult', blob });
    }
  } catch (err: any) {
    _self.postMessage({ id, type: 'error', message: err.message });
  }
};

// ===== Window functions =====
function createWindow(size: number, type: string): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    switch (type) {
      case 'hamming':
        win[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1)); break;
      case 'blackman':
        win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (size - 1)); break;
      default: // hann
        win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }
  return win;
}

// ===== FFT (radix-2 Cooley-Tukey) =====
function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }
  for (let size = 2; size <= N; size *= 2) {
    const half = size >> 1;
    const step = -2 * Math.PI / size;
    for (let i = 0; i < N; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = step * k;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ei = i + k, oi = i + k + half;
        const tr = real[oi] * cos - imag[oi] * sin;
        const ti = real[oi] * sin + imag[oi] * cos;
        real[oi] = real[ei] - tr; imag[oi] = imag[ei] - ti;
        real[ei] += tr; imag[ei] += ti;
      }
    }
  }
}

// ===== Color maps =====
function colorMapMagma(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
  if (t < 0.25) { const s = t / 0.25; return [lerp(0,40,s), lerp(0,10,s), lerp(4,60,s)]; }
  if (t < 0.5) { const s = (t-0.25)/0.25; return [lerp(40,150,s), lerp(10,20,s), lerp(60,100,s)]; }
  if (t < 0.75) { const s = (t-0.5)/0.25; return [lerp(150,240,s), lerp(20,100,s), lerp(100,50,s)]; }
  const s = (t-0.75)/0.25; return [lerp(240,252,s), lerp(100,230,s), lerp(50,150,s)];
}

// ===== STFT Tile computation =====
function workerSTFTTile(
  samples: Float32Array, fftSize: number, hopSize: number, windowType: string,
  minDb: number, tileStart: number, tileEnd: number, tileWidth: number, tileHeight: number, _colorMap: string
): { imageData: ArrayBuffer } {
  const win = createWindow(fftSize, windowType);
  const freqBins = (fftSize >> 1) + 1;
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;
  const startFrame = Math.max(0, Math.floor(tileStart));
  const endFrame = Math.min(numFrames, Math.ceil(tileEnd));
  const framesInTile = endFrame - startFrame;

  const w = tileWidth;
  const h = tileHeight;
  const imageData = new Uint8ClampedArray(w * h * 4);

  for (let col = 0; col < w; col++) {
    const frameIdx = startFrame + Math.round((col / w) * framesInTile);
    if (frameIdx < 0 || frameIdx >= numFrames) continue;
    const offset = frameIdx * hopSize;

    for (let i = 0; i < fftSize; i++) {
      real[i] = (offset + i < samples.length) ? samples[offset + i] * win[i] : 0;
      imag[i] = 0;
    }
    fftInPlace(real, imag);

    for (let row = 0; row < h; row++) {
      const freqIdx = Math.round(((h - 1 - row) / (h - 1)) * (freqBins - 1));
      const mag = Math.sqrt(real[freqIdx] * real[freqIdx] + imag[freqIdx] * imag[freqIdx]) / fftSize;
      const db = 20 * Math.log10(mag + 1e-10);
      const val = Math.max(0, Math.min(1, (db - minDb) / (-minDb)));
      const [r, g, b] = colorMapMagma(val);
      const idx = (row * w + col) * 4;
      imageData[idx] = r; imageData[idx+1] = g; imageData[idx+2] = b; imageData[idx+3] = 255;
    }
  }

  return { imageData: imageData.buffer };
}

// ===== Full STFT (fallback) =====
function workerSTFT(
  samples: Float32Array, fftSize: number, hopSize: number, windowType: string, minDb: number, id: number
): { imageData: ArrayBuffer; width: number; height: number } {
  const win = createWindow(fftSize, windowType);
  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;
  const freqBins = (fftSize >> 1) + 1;
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  const w = numFrames;
  const h = freqBins;
  const imageData = new Uint8ClampedArray(w * h * 4);

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize;
    for (let i = 0; i < fftSize; i++) {
      real[i] = (offset + i < samples.length) ? samples[offset + i] * win[i] : 0;
      imag[i] = 0;
    }
    fftInPlace(real, imag);

    for (let row = 0; row < h; row++) {
      const freqIdx = h - 1 - row;
      const mag = Math.sqrt(real[freqIdx] * real[freqIdx] + imag[freqIdx] * imag[freqIdx]) / fftSize;
      const db = 20 * Math.log10(mag + 1e-10);
      const val = Math.max(0, Math.min(1, (db - minDb) / (-minDb)));
      const [r, g, b] = colorMapMagma(val);
      const idx = (row * w + frame) * 4;
      imageData[idx] = r; imageData[idx+1] = g; imageData[idx+2] = b; imageData[idx+3] = 255;
    }

    if (frame % 500 === 0) {
      _self.postMessage({ id, type: 'stftProgress', progress: frame / numFrames });
    }
  }

  return { imageData: imageData.buffer, width: w, height: h };
}

// ===== Peak Mipmap =====
function workerPeakMipmap(channelData: Float32Array): Record<number, PeakLevel> {
  const levels: Record<number, PeakLevel> = {};
  const minSPP = 2;
  const maxSPP = 65536;

  for (let spp = minSPP; spp <= maxSPP; spp *= 2) {
    const numPeaks = Math.ceil(channelData.length / spp);
    const mins = new Float32Array(numPeaks);
    const maxs = new Float32Array(numPeaks);

    if (spp === minSPP) {
      for (let i = 0; i < numPeaks; i++) {
        const start = i * spp;
        const end = Math.min(start + spp, channelData.length);
        let mn = 1, mx = -1;
        for (let j = start; j < end; j++) {
          if (channelData[j] < mn) mn = channelData[j];
          if (channelData[j] > mx) mx = channelData[j];
        }
        mins[i] = mn; maxs[i] = mx;
      }
    } else {
      const prevSpp = spp / 2;
      const prev = levels[prevSpp];
      for (let i = 0; i < numPeaks; i++) {
        const pi = i * 2;
        let mn = 1, mx = -1;
        if (pi < prev.mins.length) { mn = prev.mins[pi]; mx = prev.maxs[pi]; }
        if (pi + 1 < prev.mins.length) {
          if (prev.mins[pi + 1] < mn) mn = prev.mins[pi + 1];
          if (prev.maxs[pi + 1] > mx) mx = prev.maxs[pi + 1];
        }
        mins[i] = mn; maxs[i] = mx;
      }
    }
    levels[spp] = { mins, maxs };
  }

  return levels;
}

// ===== WAV Encoding =====
function workerEncodeWAV(channels: Float32Array[], sampleRate: number, bitsPerSample: number): Blob {
  const numCh = channels.length;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numCh * bytesPerSample;
  const numSamples = channels[0].length;
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, channels[ch][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
