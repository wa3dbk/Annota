// ===== Noise Reduction =====
// Spectral subtraction-based noise reduction

import { fft, createWindow } from '../fft';

interface NoiseReductionOpts {
  sensitivity?: number;
}

export class NoiseReduction {
  /**
   * Capture noise profile from a segment.
   * @returns average noise spectrum (magnitude)
   */
  static getNoiseProfile(
    buffer: AudioBuffer,
    startTime?: number,
    endTime?: number,
    fftSize: number = 2048
  ): Float32Array {
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;
    const hopSize: number = fftSize / 4;

    // Get mono data for the noise region
    const numCh: number = buffer.numberOfChannels;
    const len: number = s1 - s0;
    const mono = new Float32Array(len);

    for (let ch = 0; ch < numCh; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);
      for (let i = 0; i < len && (s0 + i) < data.length; i++) {
        mono[i] += data[s0 + i] / numCh;
      }
    }

    const win: Float32Array = createWindow(fftSize, 'hann');
    const numFrames: number = Math.max(1, Math.floor((len - fftSize) / hopSize) + 1);
    const freqBins: number = (fftSize >> 1) + 1;
    const noiseSpectrum = new Float32Array(freqBins);

    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let frame = 0; frame < numFrames; frame++) {
      const offset: number = frame * hopSize;
      for (let i = 0; i < fftSize; i++) {
        real[i] = (offset + i < len) ? mono[offset + i] * win[i] : 0;
        imag[i] = 0;
      }
      fft(real, imag);
      for (let b = 0; b < freqBins; b++) {
        noiseSpectrum[b] += Math.sqrt(real[b] * real[b] + imag[b] * imag[b]) / fftSize;
      }
    }

    // Average
    for (let b = 0; b < freqBins; b++) {
      noiseSpectrum[b] /= numFrames;
    }

    return noiseSpectrum;
  }

  /**
   * Apply spectral subtraction noise reduction.
   */
  static apply(
    buffer: AudioBuffer,
    noiseProfile: Float32Array,
    sensitivityOrOpts: number | NoiseReductionOpts = 2,
    startTime: number | null = null,
    endTime: number | null = null,
    fftSize: number = 2048
  ): void {
    // Accept either a number or { sensitivity: number }
    const sensitivity: number = (typeof sensitivityOrOpts === 'object' && sensitivityOrOpts !== null)
      ? (sensitivityOrOpts.sensitivity || 2)
      : sensitivityOrOpts;
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;
    const hopSize: number = fftSize / 4;
    const win: Float32Array = createWindow(fftSize, 'hann');
    const freqBins: number = (fftSize >> 1) + 1;

    // Process each channel
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);
      const len: number = s1 - s0;
      const output = new Float32Array(len);
      const overlapAdd = new Float32Array(len);

      const numFrames: number = Math.floor((len - fftSize) / hopSize) + 1;
      const real = new Float32Array(fftSize);
      const imag = new Float32Array(fftSize);

      for (let frame = 0; frame < numFrames; frame++) {
        const offset: number = frame * hopSize;

        // Window the input
        for (let i = 0; i < fftSize; i++) {
          const idx: number = s0 + offset + i;
          real[i] = (idx < data.length) ? data[idx] * win[i] : 0;
          imag[i] = 0;
        }

        // Forward FFT
        fft(real, imag);

        // Spectral subtraction
        for (let b = 0; b < freqBins; b++) {
          const mag: number = Math.sqrt(real[b] * real[b] + imag[b] * imag[b]);
          const phase: number = Math.atan2(imag[b], real[b]);

          // Subtract noise floor
          let newMag: number = mag - noiseProfile[b] * sensitivity;
          if (newMag < mag * 0.01) newMag = mag * 0.01; // Noise floor

          real[b] = newMag * Math.cos(phase);
          imag[b] = newMag * Math.sin(phase);

          // Mirror for IFFT (conjugate symmetry)
          if (b > 0 && b < freqBins - 1) {
            real[fftSize - b] = real[b];
            imag[fftSize - b] = -imag[b];
          }
        }

        // Inverse FFT
        NoiseReduction._ifft(real, imag);

        // Overlap-add with window
        for (let i = 0; i < fftSize; i++) {
          const outIdx: number = offset + i;
          if (outIdx < len) {
            output[outIdx] += real[i] * win[i];
            overlapAdd[outIdx] += win[i] * win[i];
          }
        }
      }

      // Normalize overlap-add
      for (let i = 0; i < len; i++) {
        const idx: number = s0 + i;
        if (idx < data.length) {
          if (overlapAdd[i] > 0.001) {
            data[idx] = Math.max(-1, Math.min(1, output[i] / overlapAdd[i]));
          }
        }
      }
    }
  }

  /**
   * Inverse FFT via conjugate trick: ifft(x) = conj(fft(conj(x))) / N
   */
  static _ifft(real: Float32Array, imag: Float32Array): void {
    const N: number = real.length;
    // Conjugate
    for (let i = 0; i < N; i++) imag[i] = -imag[i];
    // Forward FFT
    fft(real, imag);
    // Conjugate and scale
    for (let i = 0; i < N; i++) {
      real[i] /= N;
      imag[i] = -imag[i] / N;
    }
  }
}
