// ===== Parametric EQ =====
// Biquad filter implementation for peaking, shelving, and pass filters

import type { EQBand } from '../types';

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

interface FrequencyResponse {
  frequencies: Float32Array;
  magnitudes: Float32Array;
}

export class ParametricEQ {
  /**
   * Apply a chain of biquad filters to an AudioBuffer.
   */
  static apply(
    buffer: AudioBuffer,
    bands: EQBand[],
    startTime: number | null = null,
    endTime: number | null = null
  ): void {
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);

      // Apply each band's filter sequentially
      for (const band of bands) {
        const coeffs: BiquadCoefficients = ParametricEQ._computeCoefficients(band, sr);
        ParametricEQ._applyBiquad(data, s0, s1, coeffs);
      }
    }
  }

  /**
   * Compute biquad filter coefficients.
   * Reference: Audio EQ Cookbook by Robert Bristow-Johnson
   */
  static _computeCoefficients(band: EQBand, sampleRate: number): BiquadCoefficients {
    const { type, frequency, gain, Q } = band;
    const w0: number = 2 * Math.PI * frequency / sampleRate;
    const cosW0: number = Math.cos(w0);
    const sinW0: number = Math.sin(w0);
    const alpha: number = sinW0 / (2 * (Q || 1));

    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

    switch (type) {
      case 'peaking': {
        const A: number = Math.pow(10, (gain || 0) / 40);
        b0 = 1 + alpha * A;
        b1 = -2 * cosW0;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cosW0;
        a2 = 1 - alpha / A;
        break;
      }
      case 'lowshelf': {
        const A: number = Math.pow(10, (gain || 0) / 40);
        const sqrtA: number = Math.sqrt(A);
        b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
        b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha);
        a0 = (A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha;
        a1 = -2 * ((A - 1) + (A + 1) * cosW0);
        a2 = (A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha;
        break;
      }
      case 'highshelf': {
        const A: number = Math.pow(10, (gain || 0) / 40);
        const sqrtA: number = Math.sqrt(A);
        b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
        b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha);
        a0 = (A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha;
        a1 = 2 * ((A - 1) - (A + 1) * cosW0);
        a2 = (A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha;
        break;
      }
      case 'lowpass': {
        b0 = (1 - cosW0) / 2;
        b1 = 1 - cosW0;
        b2 = (1 - cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      }
      case 'highpass': {
        b0 = (1 + cosW0) / 2;
        b1 = -(1 + cosW0);
        b2 = (1 + cosW0) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cosW0;
        a2 = 1 - alpha;
        break;
      }
      default:
        return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    }

    // Normalize
    return {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    };
  }

  /**
   * Apply biquad filter in-place using Direct Form I.
   */
  static _applyBiquad(data: Float32Array, s0: number, s1: number, coeffs: BiquadCoefficients): void {
    const { b0, b1, b2, a1, a2 } = coeffs;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = s0; i < s1 && i < data.length; i++) {
      const x0: number = data[i];
      const y0: number = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      data[i] = Math.max(-1, Math.min(1, y0));
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
    }
  }

  /**
   * Compute frequency response for visualization.
   */
  static frequencyResponse(bands: EQBand[], sampleRate: number, numPoints: number = 256): FrequencyResponse {
    const frequencies = new Float32Array(numPoints);
    const magnitudes = new Float32Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
      // Logarithmic frequency scale: 20 Hz to Nyquist
      const freq: number = 20 * Math.pow(sampleRate / 40, i / (numPoints - 1));
      frequencies[i] = freq;

      let totalMag = 1;
      for (const band of bands) {
        const coeffs: BiquadCoefficients = ParametricEQ._computeCoefficients(band, sampleRate);
        const w: number = 2 * Math.PI * freq / sampleRate;
        const cosW: number = Math.cos(w);
        const cos2W: number = Math.cos(2 * w);
        const sinW: number = Math.sin(w);
        const sin2W: number = Math.sin(2 * w);

        const numReal: number = coeffs.b0 + coeffs.b1 * cosW + coeffs.b2 * cos2W;
        const numImag: number = -(coeffs.b1 * sinW + coeffs.b2 * sin2W);
        const denReal: number = 1 + coeffs.a1 * cosW + coeffs.a2 * cos2W;
        const denImag: number = -(coeffs.a1 * sinW + coeffs.a2 * sin2W);

        const numMag: number = Math.sqrt(numReal * numReal + numImag * numImag);
        const denMag: number = Math.sqrt(denReal * denReal + denImag * denImag);

        totalMag *= (denMag > 0 ? numMag / denMag : 1);
      }

      magnitudes[i] = 20 * Math.log10(totalMag + 1e-10);
    }

    return { frequencies, magnitudes };
  }

  /**
   * Get default 4-band EQ preset.
   */
  static defaultBands(): EQBand[] {
    return [
      { type: 'lowshelf', frequency: 100, gain: 0, Q: 0.7 },
      { type: 'peaking', frequency: 500, gain: 0, Q: 1.0 },
      { type: 'peaking', frequency: 2000, gain: 0, Q: 1.0 },
      { type: 'highshelf', frequency: 8000, gain: 0, Q: 0.7 }
    ];
  }
}
