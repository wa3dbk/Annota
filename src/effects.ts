// ===== Audio Effects =====
// Operates directly on AudioBuffer sample data.

import type { FadeCurve } from './types';

export interface AnalysisResult {
  peakLinear: number;
  peakDb: number;
  rmsLinear: number;
  rmsDb: number;
}

export class AudioEffects {
  static fadeIn(audioBuffer: AudioBuffer, startTime: number, endTime: number, curve: FadeCurve = 'linear'): void {
    const sr = audioBuffer.sampleRate;
    const s0 = Math.round(startTime * sr);
    const s1 = Math.round(endTime * sr);
    const len = s1 - s0;
    if (len <= 0) return;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len && (s0 + i) < data.length; i++) {
        const t = i / len;
        let gain: number;
        if (curve === 'exponential') gain = t * t;
        else if (curve === 'sCurve') gain = t * t * (3 - 2 * t);
        else gain = t;
        data[s0 + i] *= gain;
      }
    }
  }

  static fadeOut(audioBuffer: AudioBuffer, startTime: number, endTime: number, curve: FadeCurve = 'linear'): void {
    const sr = audioBuffer.sampleRate;
    const s0 = Math.round(startTime * sr);
    const s1 = Math.round(endTime * sr);
    const len = s1 - s0;
    if (len <= 0) return;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len && (s0 + i) < data.length; i++) {
        const t = 1 - (i / len);
        let gain: number;
        if (curve === 'exponential') gain = t * t;
        else if (curve === 'sCurve') gain = t * t * (3 - 2 * t);
        else gain = t;
        data[s0 + i] *= gain;
      }
    }
  }

  static fadeInLog(audioBuffer: AudioBuffer, startTime: number, endTime: number): void {
    const sr = audioBuffer.sampleRate;
    const s0 = Math.round(startTime * sr);
    const s1 = Math.round(endTime * sr);
    const len = s1 - s0;
    if (len <= 0) return;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len && (s0 + i) < data.length; i++) {
        const t = i / len;
        data[s0 + i] *= t * t;
      }
    }
  }

  static fadeOutLog(audioBuffer: AudioBuffer, startTime: number, endTime: number): void {
    const sr = audioBuffer.sampleRate;
    const s0 = Math.round(startTime * sr);
    const s1 = Math.round(endTime * sr);
    const len = s1 - s0;
    if (len <= 0) return;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len && (s0 + i) < data.length; i++) {
        const t = 1 - (i / len);
        data[s0 + i] *= t * t;
      }
    }
  }

  static normalize(audioBuffer: AudioBuffer, targetDb: number = -1, startTime: number | null = null, endTime: number | null = null): void {
    const sr = audioBuffer.sampleRate;
    const s0 = startTime != null ? Math.round(startTime * sr) : 0;
    const s1 = endTime != null ? Math.round(endTime * sr) : audioBuffer.length;

    let peak = 0;
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = s0; i < s1 && i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }

    if (peak === 0) return;

    const targetLinear = Math.pow(10, targetDb / 20);
    const gain = targetLinear / peak;

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = s0; i < s1 && i < data.length; i++) {
        data[i] = Math.max(-1, Math.min(1, data[i] * gain));
      }
    }
  }

  static adjustGain(audioBuffer: AudioBuffer, gainDb: number, startTime: number | null = null, endTime: number | null = null): void {
    const sr = audioBuffer.sampleRate;
    const s0 = startTime != null ? Math.round(startTime * sr) : 0;
    const s1 = endTime != null ? Math.round(endTime * sr) : audioBuffer.length;
    const multiplier = Math.pow(10, gainDb / 20);

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = s0; i < s1 && i < data.length; i++) {
        data[i] = Math.max(-1, Math.min(1, data[i] * multiplier));
      }
    }
  }

  static analyze(audioBuffer: AudioBuffer, startTime: number | null = null, endTime: number | null = null): AnalysisResult {
    const sr = audioBuffer.sampleRate;
    const s0 = startTime != null ? Math.round(startTime * sr) : 0;
    const s1 = endTime != null ? Math.round(endTime * sr) : audioBuffer.length;
    let peak = 0, sumSq = 0, count = 0;

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = s0; i < s1 && i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
        sumSq += data[i] * data[i];
        count++;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    return {
      peakLinear: peak,
      peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      rmsLinear: rms,
      rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity
    };
  }
}
