// ===== MFCC Computation =====
// Mel-Frequency Cepstral Coefficients

import { Filterbank } from './filterbank';
import type { FilterbankOptions } from './filterbank';

export interface MFCCOptions extends FilterbankOptions {
  numCoeffs?: number;
}

export class MFCC {
  static compute(input: AudioBuffer | Float32Array, sampleRateOrOpts?: number | MFCCOptions, opts?: MFCCOptions): Float32Array[] {
    if (input instanceof AudioBuffer) {
      opts = (sampleRateOrOpts as MFCCOptions) || {};
    } else {
      opts = opts || {};
    }

    const numCoeffs = opts.numCoeffs || 13;
    const numFilters = opts.numFilters || 40;

    const fbArgs: FilterbankOptions = { fftSize: opts.fftSize || 2048, hopSize: opts.hopSize || 512, numFilters };
    const fbank = (input instanceof AudioBuffer)
      ? Filterbank.compute(input, fbArgs)
      : Filterbank.compute(input, sampleRateOrOpts as number, fbArgs);

    const result: Float32Array[] = [];
    for (let frame = 0; frame < fbank.length; frame++) {
      const logEnergies = fbank[frame];
      const coeffs = MFCC._dctII(logEnergies, numCoeffs);
      result.push(coeffs);
    }

    return result;
  }

  static _dctII(input: Float32Array, numCoeffs: number): Float32Array {
    const N = input.length;
    const output = new Float32Array(numCoeffs);

    for (let k = 0; k < numCoeffs; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += input[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
      }
      output[k] = sum;
    }

    return output;
  }
}
