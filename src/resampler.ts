// ===== Resampler =====
// Sample rate conversion using linear interpolation

export class Resampler {
  static resample(buffer: AudioBuffer, audioContext: AudioContext, targetSampleRate: number): AudioBuffer {
    if (buffer.sampleRate === targetSampleRate) return buffer;

    const ratio = buffer.sampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const numCh = buffer.numberOfChannels;

    const newBuffer = audioContext.createBuffer(numCh, newLength, targetSampleRate);

    for (let ch = 0; ch < numCh; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = newBuffer.getChannelData(ch);

      for (let i = 0; i < newLength; i++) {
        const srcPos = i * ratio;
        const idx = Math.floor(srcPos);
        const frac = srcPos - idx;

        if (idx + 1 < src.length) {
          dst[i] = src[idx] * (1 - frac) + src[idx + 1] * frac;
        } else if (idx < src.length) {
          dst[i] = src[idx];
        }
      }
    }

    return newBuffer;
  }

  static resampleData(data: Float32Array, srcRate: number, targetRate: number): Float32Array {
    if (srcRate === targetRate) return new Float32Array(data);
    const ratio = srcRate / targetRate;
    const newLen = Math.round(data.length / ratio);
    const result = new Float32Array(newLen);

    for (let i = 0; i < newLen; i++) {
      const srcPos = i * ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;

      if (idx + 1 < data.length) {
        result[i] = data[idx] * (1 - frac) + data[idx + 1] * frac;
      } else if (idx < data.length) {
        result[i] = data[idx];
      }
    }

    return result;
  }
}
