// ===== Spectrum Analyzer =====
// Welch's method FFT for averaged magnitude spectrum, rendered as line plot

import { fft, createWindow } from '../fft';
import { clamp } from '../utils';
import type { ThemeColors } from '../types';

export interface SpectrumData {
  frequencies: Float32Array;
  magnitudes: Float32Array;
  sampleRate: number;
}

export class SpectrumAnalyzer {
  compute(samples: Float32Array, sampleRate: number, fftSize: number = 4096): SpectrumData {
    const win = createWindow(fftSize, 'hann');
    const hopSize = fftSize >> 1;
    const numFrames = Math.max(1, Math.floor((samples.length - fftSize) / hopSize) + 1);
    const freqBins = (fftSize >> 1) + 1;

    const avgMagnitude = new Float32Array(freqBins);
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let frame = 0; frame < numFrames; frame++) {
      const offset = frame * hopSize;
      for (let i = 0; i < fftSize; i++) {
        real[i] = (offset + i < samples.length) ? samples[offset + i] * win[i] : 0;
        imag[i] = 0;
      }
      fft(real, imag);
      for (let b = 0; b < freqBins; b++) {
        const mag = Math.sqrt(real[b] * real[b] + imag[b] * imag[b]) / fftSize;
        avgMagnitude[b] += mag;
      }
    }

    const frequencies = new Float32Array(freqBins);
    const magnitudes = new Float32Array(freqBins);
    const nyquist = sampleRate / 2;

    for (let b = 0; b < freqBins; b++) {
      frequencies[b] = (b / (freqBins - 1)) * nyquist;
      const avgMag = avgMagnitude[b] / numFrames;
      magnitudes[b] = 20 * Math.log10(avgMag + 1e-10);
    }

    return { frequencies, magnitudes, sampleRate };
  }

  render(
    canvas: HTMLCanvasElement,
    data: SpectrumData,
    logScale: boolean,
    themeColors: Partial<ThemeColors>
  ): void {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const { frequencies, magnitudes } = data;

    const minDb = -90;
    const maxDb = 0;
    const nyquist = data.sampleRate / 2;
    const minFreq = logScale ? 20 : 0;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = themeColors.canvasBg || '#1a1a2a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = themeColors.axisTick || 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    const dbSteps = [-10, -20, -30, -40, -50, -60, -70, -80];
    for (const db of dbSteps) {
      const y = h - ((db - minDb) / (maxDb - minDb)) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Frequency-to-X mapping
    const freqToX = (freq: number): number => {
      if (logScale) {
        if (freq <= 0) freq = minFreq;
        return ((Math.log10(freq) - Math.log10(minFreq)) / (Math.log10(nyquist) - Math.log10(minFreq))) * w;
      }
      return (freq / nyquist) * w;
    };

    // Spectrum line
    ctx.beginPath();
    ctx.strokeStyle = themeColors.waveformStroke || '#6366f1';
    ctx.lineWidth = 1.5;

    let started = false;
    for (let i = 0; i < frequencies.length; i++) {
      const freq = frequencies[i];
      if (logScale && freq < minFreq) continue;
      const x = freqToX(freq);
      const y = h - clamp((magnitudes[i] - minDb) / (maxDb - minDb), 0, 1) * h;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    if (started) {
      ctx.lineTo(w, h);
      ctx.lineTo(logScale ? freqToX(minFreq) : 0, h);
      ctx.closePath();
      ctx.fillStyle = (themeColors.waveformFill || 'rgba(99,102,241,0.15)').replace(/[\d.]+\)$/, '0.12)');
      ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = themeColors.axisText || '#888';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';

    // Y-axis (dB)
    ctx.textAlign = 'left';
    for (const db of [0, -30, -60, -90]) {
      const y = h - ((db - minDb) / (maxDb - minDb)) * h;
      ctx.fillText(`${db} dB`, 4, y - 2);
    }

    // X-axis (frequency)
    ctx.textAlign = 'center';
    const freqTicks = logScale
      ? [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f <= nyquist && f >= minFreq)
      : [0, 1000, 2000, 4000, 8000, 12000, 16000, 20000, 24000].filter(f => f <= nyquist);
    for (const freq of freqTicks) {
      const x = freqToX(freq);
      const label = freq >= 1000 ? (freq / 1000) + 'k' : String(freq);
      ctx.fillText(label, x, h - 4);
    }
  }
}
