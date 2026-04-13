// ===== Compressor / Limiter =====
// Dynamic range compression applied to AudioBuffer sample data

interface CompressorParams {
  threshold?: number;   // dB (-60 to 0, default -20)
  ratio?: number;       // compression ratio (1:1 to 20:1, default 4)
  attack?: number;      // ms (0.1 to 100, default 10)
  release?: number;     // ms (10 to 1000, default 100)
  knee?: number;        // dB (0 to 20, default 6)
  makeupGain?: number;  // dB (0 to 30, default 0)
}

export class Compressor {
  /**
   * Apply compression to an AudioBuffer.
   */
  static apply(
    buffer: AudioBuffer,
    params: CompressorParams = {},
    startTime: number | null = null,
    endTime: number | null = null
  ): void {
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;

    const threshold: number = params.threshold != null ? params.threshold : -20;
    const ratio: number = params.ratio != null ? params.ratio : 4;
    const attackMs: number = params.attack != null ? params.attack : 10;
    const releaseMs: number = params.release != null ? params.release : 100;
    const kneeDb: number = params.knee != null ? params.knee : 6;
    const makeupGainDb: number = params.makeupGain != null ? params.makeupGain : 0;

    const attackCoeff: number = Math.exp(-1 / (attackMs * sr / 1000));
    const releaseCoeff: number = Math.exp(-1 / (releaseMs * sr / 1000));
    const makeupLinear: number = Math.pow(10, makeupGainDb / 20);

    // Process all channels with linked detection
    const numCh: number = buffer.numberOfChannels;

    // First pass: compute gain reduction envelope from max across channels
    const len: number = s1 - s0;
    const gainReduction = new Float32Array(len);
    let envelope = 0;

    for (let i = 0; i < len; i++) {
      // Find max sample across all channels at this position
      let maxSample = 0;
      for (let ch = 0; ch < numCh; ch++) {
        const data: Float32Array = buffer.getChannelData(ch);
        const idx: number = s0 + i;
        if (idx < data.length) {
          const abs: number = Math.abs(data[idx]);
          if (abs > maxSample) maxSample = abs;
        }
      }

      // Convert to dB
      const inputDb: number = maxSample > 0 ? 20 * Math.log10(maxSample) : -120;

      // Compute gain reduction in dB
      let reductionDb = 0;
      if (kneeDb > 0 && inputDb > threshold - kneeDb / 2 && inputDb < threshold + kneeDb / 2) {
        // Soft knee region
        const x: number = inputDb - threshold + kneeDb / 2;
        reductionDb = (1 / ratio - 1) * x * x / (2 * kneeDb);
      } else if (inputDb > threshold) {
        // Above threshold
        reductionDb = (threshold + (inputDb - threshold) / ratio) - inputDb;
      }

      // Envelope follower
      const targetDb: number = -reductionDb;
      if (targetDb > envelope) {
        envelope = attackCoeff * envelope + (1 - attackCoeff) * targetDb;
      } else {
        envelope = releaseCoeff * envelope + (1 - releaseCoeff) * targetDb;
      }

      // Convert envelope back to linear gain
      gainReduction[i] = Math.pow(10, -envelope / 20);
    }

    // Second pass: apply gain reduction to all channels
    for (let ch = 0; ch < numCh; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const idx: number = s0 + i;
        if (idx < data.length) {
          data[idx] = Math.max(-1, Math.min(1, data[idx] * gainReduction[i] * makeupLinear));
        }
      }
    }
  }

  /**
   * Apply brick-wall limiter.
   */
  static limit(
    buffer: AudioBuffer,
    ceilingDb: number = -0.3,
    startTime: number | null = null,
    endTime: number | null = null
  ): void {
    Compressor.apply(buffer, {
      threshold: ceilingDb,
      ratio: 100,
      attack: 0.1,
      release: 50,
      knee: 0,
      makeupGain: 0
    }, startTime, endTime);
  }
}
