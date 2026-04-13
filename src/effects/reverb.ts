// ===== Reverb =====
// Schroeder reverb: comb filters + allpass filters

interface ReverbParams {
  roomSize?: number;  // 0 to 1 (default 0.5)
  damping?: number;   // 0 to 1 (default 0.5)
  wetDry?: number;    // 0 to 1 (0=dry, 1=wet, default 0.3)
}

export class Reverb {
  /**
   * Apply reverb to an AudioBuffer.
   */
  static apply(
    buffer: AudioBuffer,
    params: ReverbParams = {},
    startTime: number | null = null,
    endTime: number | null = null
  ): void {
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;
    const len: number = s1 - s0;

    const roomSize: number = params.roomSize != null ? params.roomSize : 0.5;
    const damping: number = params.damping != null ? params.damping : 0.5;
    const wetDry: number = params.wetDry != null ? params.wetDry : 0.3;

    // Scale delay lengths based on sample rate (reference: 44100)
    const srFactor: number = sr / 44100;

    // Schroeder comb filter delays (in samples) - tuned for natural reverb
    const combDelays: number[] = [
      Math.round(1557 * srFactor),
      Math.round(1617 * srFactor),
      Math.round(1491 * srFactor),
      Math.round(1422 * srFactor),
      Math.round(1277 * srFactor),
      Math.round(1356 * srFactor),
      Math.round(1188 * srFactor),
      Math.round(1116 * srFactor)
    ];

    // Allpass filter delays
    const allpassDelays: number[] = [
      Math.round(556 * srFactor),
      Math.round(441 * srFactor),
      Math.round(341 * srFactor),
      Math.round(225 * srFactor)
    ];

    const feedback: number = 0.5 + roomSize * 0.48;  // 0.5 to 0.98
    const dampCoeff: number = damping * 0.4;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);

      // Extract dry signal
      const dry = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        dry[i] = data[s0 + i];
      }

      // Process through parallel comb filters
      const combOutput = new Float32Array(len);

      for (const delay of combDelays) {
        const combBuf = new Float32Array(delay);
        let filterState = 0;
        let writePos = 0;

        for (let i = 0; i < len; i++) {
          const readVal: number = combBuf[writePos];
          // Low-pass filter on feedback (damping)
          filterState = readVal * (1 - dampCoeff) + filterState * dampCoeff;
          combBuf[writePos] = dry[i] + filterState * feedback;
          combOutput[i] += readVal;
          writePos = (writePos + 1) % delay;
        }
      }

      // Normalize comb output
      const combScale: number = 1 / combDelays.length;
      for (let i = 0; i < len; i++) {
        combOutput[i] *= combScale;
      }

      // Process through series allpass filters
      let current: Float32Array = combOutput;
      for (const delay of allpassDelays) {
        const apBuf = new Float32Array(delay);
        const output = new Float32Array(len);
        let writePos = 0;
        const apGain = 0.5;

        for (let i = 0; i < len; i++) {
          const readVal: number = apBuf[writePos];
          const input: number = current[i];
          output[i] = -input * apGain + readVal;
          apBuf[writePos] = input + readVal * apGain;
          writePos = (writePos + 1) % delay;
        }
        current = output;
      }

      // Mix wet/dry
      for (let i = 0; i < len; i++) {
        const idx: number = s0 + i;
        if (idx < data.length) {
          data[idx] = Math.max(-1, Math.min(1,
            dry[i] * (1 - wetDry) + current[i] * wetDry
          ));
        }
      }
    }
  }
}
