// ===== Mel Filterbank =====
// Triangular mel-scale filterbank computation

import { fft, createWindow } from '../fft';

export interface FilterbankOptions {
  fftSize?: number;
  hopSize?: number;
  numFilters?: number;
  lowFreq?: number;
  highFreq?: number;
}

export class Filterbank {
  static compute(input: AudioBuffer | Float32Array, sampleRateOrOpts?: number | FilterbankOptions, opts?: FilterbankOptions): Float32Array[] {
    let samples: Float32Array;
    let sampleRate: number;

    if (input instanceof AudioBuffer) {
      sampleRate = input.sampleRate;
      if (input.numberOfChannels === 1) {
        samples = input.getChannelData(0);
      } else {
        const len = input.length;
        samples = new Float32Array(len);
        for (let ch = 0; ch < input.numberOfChannels; ch++) {
          const d = input.getChannelData(ch);
          for (let i = 0; i < len; i++) samples[i] += d[i] / input.numberOfChannels;
        }
      }
      opts = (sampleRateOrOpts as FilterbankOptions) || {};
    } else {
      samples = input;
      sampleRate = sampleRateOrOpts as number;
      opts = opts || {};
    }

    const fftSize = opts.fftSize || 2048;
    const hopSize = opts.hopSize || 512;
    const numFilters = opts.numFilters || 40;
    const lowFreq = opts.lowFreq || 0;
    const highFreq = opts.highFreq || sampleRate / 2;

    const freqBins = (fftSize >> 1) + 1;
    const win = createWindow(fftSize, 'hann');
    const numFrames = Math.max(1, Math.floor((samples.length - fftSize) / hopSize) + 1);

    const filterbank = Filterbank._createMelFilterbank(numFilters, fftSize, sampleRate, lowFreq, highFreq);

    const result: Float32Array[] = [];
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let frame = 0; frame < numFrames; frame++) {
      const offset = frame * hopSize;

      for (let i = 0; i < fftSize; i++) {
        real[i] = (offset + i < samples.length) ? samples[offset + i] * win[i] : 0;
        imag[i] = 0;
      }

      fft(real, imag);

      const power = new Float32Array(freqBins);
      for (let b = 0; b < freqBins; b++) {
        power[b] = (real[b] * real[b] + imag[b] * imag[b]) / (fftSize * fftSize);
      }

      const energies = new Float32Array(numFilters);
      for (let f = 0; f < numFilters; f++) {
        let sum = 0;
        for (let b = 0; b < freqBins; b++) {
          sum += power[b] * filterbank[f][b];
        }
        energies[f] = sum > 0 ? Math.log(sum + 1e-10) : -23;
      }

      result.push(energies);
    }

    return result;
  }

  static _createMelFilterbank(numFilters: number, fftSize: number, sampleRate: number, lowFreq: number, highFreq: number): Float32Array[] {
    const freqBins = (fftSize >> 1) + 1;
    const lowMel = Filterbank._hzToMel(lowFreq);
    const highMel = Filterbank._hzToMel(highFreq);

    const melPoints = new Float32Array(numFilters + 2);
    for (let i = 0; i < numFilters + 2; i++) {
      melPoints[i] = lowMel + (highMel - lowMel) * i / (numFilters + 1);
    }

    const binPoints = new Float32Array(numFilters + 2);
    for (let i = 0; i < numFilters + 2; i++) {
      const freq = Filterbank._melToHz(melPoints[i]);
      binPoints[i] = Math.floor((fftSize + 1) * freq / sampleRate);
    }

    const filterbank: Float32Array[] = [];
    for (let f = 0; f < numFilters; f++) {
      const filter = new Float32Array(freqBins);
      const startBin = binPoints[f];
      const centerBin = binPoints[f + 1];
      const endBin = binPoints[f + 2];

      for (let b = Math.floor(startBin); b < Math.ceil(centerBin) && b < freqBins; b++) {
        if (centerBin - startBin > 0) {
          filter[b] = (b - startBin) / (centerBin - startBin);
        }
      }
      for (let b = Math.floor(centerBin); b < Math.ceil(endBin) && b < freqBins; b++) {
        if (endBin - centerBin > 0) {
          filter[b] = (endBin - b) / (endBin - centerBin);
        }
      }

      filterbank.push(filter);
    }

    return filterbank;
  }

  static _hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
  }

  static _melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }
}
