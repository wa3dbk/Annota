// ===== Time Stretch / Pitch Shift =====
// Simple resampling + phase vocoder approach

export class TimeStretch {
  /**
   * Change speed by resampling (changes both tempo and pitch).
   * @returns new buffer with changed speed
   */
  static changeSpeed(
    buffer: AudioBuffer,
    audioContext: AudioContext,
    speedRatio: number,
    startTime: number | null = null,
    endTime: number | null = null
  ): AudioBuffer {
    const sr: number = buffer.sampleRate;
    const numCh: number = buffer.numberOfChannels;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;
    const segLen: number = s1 - s0;
    const newSegLen: number = Math.round(segLen / speedRatio);

    if (newSegLen <= 0) return buffer;

    // If processing entire buffer
    if (s0 === 0 && s1 === buffer.length) {
      const newBuffer: AudioBuffer = audioContext.createBuffer(numCh, newSegLen, sr);
      for (let ch = 0; ch < numCh; ch++) {
        const src: Float32Array = buffer.getChannelData(ch);
        const dst: Float32Array = newBuffer.getChannelData(ch);
        TimeStretch._resample(src, dst, speedRatio);
      }
      return newBuffer;
    }

    // Processing a segment: splice before + processed + after
    const beforeLen: number = s0;
    const afterLen: number = buffer.length - s1;
    const totalLen: number = beforeLen + newSegLen + afterLen;
    const newBuffer: AudioBuffer = audioContext.createBuffer(numCh, totalLen, sr);

    for (let ch = 0; ch < numCh; ch++) {
      const src: Float32Array = buffer.getChannelData(ch);
      const dst: Float32Array = newBuffer.getChannelData(ch);

      // Copy before
      for (let i = 0; i < beforeLen; i++) dst[i] = src[i];

      // Resample segment
      const segSrc = new Float32Array(segLen);
      for (let i = 0; i < segLen; i++) segSrc[i] = src[s0 + i];
      const segDst = new Float32Array(newSegLen);
      TimeStretch._resample(segSrc, segDst, speedRatio);
      for (let i = 0; i < newSegLen; i++) dst[beforeLen + i] = segDst[i];

      // Copy after
      for (let i = 0; i < afterLen; i++) dst[beforeLen + newSegLen + i] = src[s1 + i];
    }

    return newBuffer;
  }

  /**
   * Linear interpolation resampling.
   */
  static _resample(src: Float32Array, dst: Float32Array, speedRatio: number): void {
    const srcLen: number = src.length;
    const dstLen: number = dst.length;

    for (let i = 0; i < dstLen; i++) {
      const srcPos: number = i * speedRatio;
      const idx: number = Math.floor(srcPos);
      const frac: number = srcPos - idx;

      if (idx + 1 < srcLen) {
        dst[i] = src[idx] * (1 - frac) + src[idx + 1] * frac;
      } else if (idx < srcLen) {
        dst[i] = src[idx];
      } else {
        dst[i] = 0;
      }
    }
  }

  /**
   * Apply saturation (tanh waveshaping).
   */
  static saturate(
    buffer: AudioBuffer,
    drive: number = 2,
    startTime: number | null = null,
    endTime: number | null = null
  ): void {
    const sr: number = buffer.sampleRate;
    const s0: number = startTime != null ? Math.round(startTime * sr) : 0;
    const s1: number = endTime != null ? Math.round(endTime * sr) : buffer.length;

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data: Float32Array = buffer.getChannelData(ch);
      for (let i = s0; i < s1 && i < data.length; i++) {
        data[i] = Math.tanh(data[i] * drive) / Math.tanh(drive);
      }
    }
  }
}
