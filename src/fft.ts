// ===== FFT Implementation =====
// Radix-2 Cooley-Tukey FFT + window functions

import type { WindowType } from './types';
import { clamp } from './utils';

/**
 * Window functions for spectral analysis
 */
export const WindowFunctions: Record<WindowType, (i: number, N: number) => number> = {
  hann(i: number, N: number): number {
    return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  },
  hamming(i: number, N: number): number {
    return 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
  },
  blackman(i: number, N: number): number {
    return 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
           + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
  },
  rectangular(_i: number, _N: number): number {
    return 1;
  }
};

/**
 * Precompute a window of given size and type
 */
export function createWindow(size: number, type: WindowType = 'hann'): Float32Array {
  const fn = WindowFunctions[type] || WindowFunctions.hann;
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = fn(i, size);
  }
  return win;
}

/**
 * In-place radix-2 FFT
 * real and imag are Float32Arrays of length N (must be power of 2)
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const N = real.length;
  if (N <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey butterfly
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size >> 1;
    const angleStep = -2 * Math.PI / size;
    for (let i = 0; i < N; i += size) {
      for (let k = 0; k < halfSize; k++) {
        const angle = angleStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;
        const tr = real[oddIdx] * cos - imag[oddIdx] * sin;
        const ti = real[oddIdx] * sin + imag[oddIdx] * cos;
        real[oddIdx] = real[evenIdx] - tr;
        imag[oddIdx] = imag[evenIdx] - ti;
        real[evenIdx] += tr;
        imag[evenIdx] += ti;
      }
    }
  }
}

/**
 * Compute magnitude spectrum (dB) from FFT output
 * Returns Float32Array of length N/2+1
 */
export function magnitudeSpectrum(real: Float32Array, imag: Float32Array, minDb: number = -90): Float32Array {
  const N = real.length;
  const halfN = (N >> 1) + 1;
  const magnitudes = new Float32Array(halfN);

  for (let i = 0; i < halfN; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / N;
    const db = 20 * Math.log10(mag + 1e-10);
    magnitudes[i] = clamp((db - minDb) / (-minDb), 0, 1);
  }
  return magnitudes;
}

/**
 * Compute Short-Time Fourier Transform
 * Returns 2D array: [timeFrames][frequencyBins]
 */
export function computeSTFT(
  samples: Float32Array,
  fftSize: number = 2048,
  hopSize: number = 512,
  windowType: WindowType = 'hann',
  minDb: number = -90
): Float32Array[] {
  const window = createWindow(fftSize, windowType);
  const numFrames = Math.floor((samples.length - fftSize) / hopSize) + 1;
  const frames: Float32Array[] = [];

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hopSize;

    for (let i = 0; i < fftSize; i++) {
      real[i] = (offset + i < samples.length) ? samples[offset + i] * window[i] : 0;
      imag[i] = 0;
    }

    fft(real, imag);
    frames.push(magnitudeSpectrum(real, imag, minDb));
  }

  return frames;
}
