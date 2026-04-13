// ===== Waveform Renderer (Mipmap Peak Cache) =====

import { setupHiDPICanvas } from './utils';
import { Viewport } from './viewport';
import { AudioEngine } from './audio-engine';
import type { ThemeColors } from './types';

interface PeakData {
  mins: Float32Array;
  maxs: Float32Array;
}

type MipmapLevels = Record<number, PeakData>;

const DEFAULT_COLORS: Pick<ThemeColors, 'waveformFill' | 'waveformStroke' | 'waveformCenter' | 'channelSep' | 'axisBg' | 'axisTick' | 'axisText'> = {
  waveformFill: 'rgba(79, 70, 229, 0.3)',
  waveformStroke: '#4f46e5',
  waveformCenter: 'rgba(79, 70, 229, 0.12)',
  channelSep: 'rgba(0, 0, 0, 0.12)',
  axisBg: 'rgba(240, 240, 244, 0.85)',
  axisTick: 'rgba(0, 0, 0, 0.1)',
  axisText: '#7a7a8e',
};

export class WaveformRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  viewport: Viewport;
  audioEngine: AudioEngine;
  themeColors: ThemeColors = DEFAULT_COLORS as ThemeColors;
  _mipmaps: Record<number, MipmapLevels> = {};
  private _worker: Worker | null = null;
  private _pendingMipmaps: Set<number> = new Set();

  constructor(canvas: HTMLCanvasElement, viewport: Viewport, audioEngine: AudioEngine) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.audioEngine = audioEngine;
  }

  resize(width: number, height: number): void {
    this.ctx = setupHiDPICanvas(this.canvas, width, height);
  }

  clearCache(): void {
    this._mipmaps = {};
  }

  async buildMipmaps(): Promise<void> {
    if (!this.audioEngine.audioBuffer) return;
    const numCh = this.audioEngine.channels;

    for (let ch = 0; ch < numCh; ch++) {
      const data = this.audioEngine.getChannelData(ch);
      this._buildMipmapForChannel(data, ch);
    }
  }

  private _buildMipmapForChannel(channelData: Float32Array, channel: number): void {
    const levels: MipmapLevels = {};
    const minSPP = 2;
    const maxSPP = 65536;

    for (let spp = minSPP; spp <= maxSPP; spp *= 2) {
      const numPeaks = Math.ceil(channelData.length / spp);
      const mins = new Float32Array(numPeaks);
      const maxs = new Float32Array(numPeaks);

      if (spp === minSPP) {
        for (let i = 0; i < numPeaks; i++) {
          const start = i * spp;
          const end = Math.min(start + spp, channelData.length);
          let mn = 1, mx = -1;
          for (let j = start; j < end; j++) {
            if (channelData[j] < mn) mn = channelData[j];
            if (channelData[j] > mx) mx = channelData[j];
          }
          mins[i] = mn; maxs[i] = mx;
        }
      } else {
        const prevSpp = spp / 2;
        const prev = levels[prevSpp];
        for (let i = 0; i < numPeaks; i++) {
          const pi = i * 2;
          let mn = 1, mx = -1;
          if (pi < prev.mins.length) { mn = prev.mins[pi]; mx = prev.maxs[pi]; }
          if (pi + 1 < prev.mins.length) {
            if (prev.mins[pi + 1] < mn) mn = prev.mins[pi + 1];
            if (prev.maxs[pi + 1] > mx) mx = prev.maxs[pi + 1];
          }
          mins[i] = mn; maxs[i] = mx;
        }
      }
      levels[spp] = { mins, maxs };
    }
    this._mipmaps[channel] = levels;
  }

  _getPeaks(channelData: Float32Array, spp: number, channel: number): PeakData {
    const mipmap = this._mipmaps[channel];

    if (mipmap) {
      let level = 2;
      while (level * 2 <= spp && level < 65536) level *= 2;
      if (level > spp) level = Math.max(2, level / 2);

      const bestLevel = mipmap[level] || mipmap[Math.min(level * 2, 65536)];
      if (bestLevel && level === spp) return bestLevel;
      if (bestLevel) {
        const ratio = spp / level;
        if (ratio >= 1 && ratio === Math.round(ratio)) {
          return this._deriveFromLevel(bestLevel, ratio);
        }
      }
    }

    return this._computePeaksDirect(channelData, spp);
  }

  private _deriveFromLevel(level: PeakData, ratio: number): PeakData {
    const numPeaks = Math.ceil(level.mins.length / ratio);
    const mins = new Float32Array(numPeaks);
    const maxs = new Float32Array(numPeaks);
    for (let i = 0; i < numPeaks; i++) {
      let mn = 1, mx = -1;
      const start = i * ratio;
      const end = Math.min(start + ratio, level.mins.length);
      for (let j = start; j < end; j++) {
        if (level.mins[j] < mn) mn = level.mins[j];
        if (level.maxs[j] > mx) mx = level.maxs[j];
      }
      mins[i] = mn; maxs[i] = mx;
    }
    return { mins, maxs };
  }

  private _computePeaksDirect(channelData: Float32Array, spp: number): PeakData {
    const numPeaks = Math.ceil(channelData.length / spp);
    const mins = new Float32Array(numPeaks);
    const maxs = new Float32Array(numPeaks);
    for (let i = 0; i < numPeaks; i++) {
      const start = i * spp;
      const end = Math.min(start + spp, channelData.length);
      let mn = 1, mx = -1;
      for (let j = start; j < end; j++) {
        if (channelData[j] < mn) mn = channelData[j];
        if (channelData[j] > mx) mx = channelData[j];
      }
      mins[i] = mn; maxs[i] = mx;
    }
    return { mins, maxs };
  }

  draw(): void {
    if (!this.ctx) return;
    const { canvasWidth: w, canvasHeight: h, samplesPerPixel: spp, scrollSamples } = this.viewport;
    const numChannels = this.audioEngine.channels;
    if (numChannels === 0) return;

    this.ctx.clearRect(0, 0, w, h);
    const channelHeight = h / numChannels;

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = this.audioEngine.getChannelData(ch);
      const peaks = this._getPeaks(channelData, spp, ch);
      const yOffset = ch * channelHeight;
      const centerY = yOffset + channelHeight / 2;

      const tc = this.themeColors;
      this.ctx.strokeStyle = tc.waveformCenter;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(0, centerY);
      this.ctx.lineTo(w, centerY);
      this.ctx.stroke();

      const startPeak = Math.floor(scrollSamples / spp);
      const endPeak = Math.min(startPeak + w + 2, peaks.mins.length);
      const subPixelOffset = (scrollSamples / spp) - startPeak;

      this.ctx.fillStyle = tc.waveformFill;
      this.ctx.beginPath();
      for (let i = startPeak; i < endPeak; i++) {
        const x = (i - startPeak) - subPixelOffset;
        const y = centerY - peaks.maxs[i] * (channelHeight / 2);
        if (i === startPeak) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      for (let i = endPeak - 1; i >= startPeak; i--) {
        const x = (i - startPeak) - subPixelOffset;
        const y = centerY - peaks.mins[i] * (channelHeight / 2);
        this.ctx.lineTo(x, y);
      }
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.strokeStyle = tc.waveformStroke;
      this.ctx.lineWidth = 0.5;
      this.ctx.beginPath();
      for (let i = startPeak; i < endPeak; i++) {
        const x = (i - startPeak) - subPixelOffset;
        const y = centerY - peaks.maxs[i] * (channelHeight / 2);
        if (i === startPeak) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
      this.ctx.beginPath();
      for (let i = startPeak; i < endPeak; i++) {
        const x = (i - startPeak) - subPixelOffset;
        const y = centerY - peaks.mins[i] * (channelHeight / 2);
        if (i === startPeak) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();

      if (numChannels > 1 && ch < numChannels - 1) {
        this.ctx.strokeStyle = tc.channelSep;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, yOffset + channelHeight);
        this.ctx.lineTo(w, yOffset + channelHeight);
        this.ctx.stroke();
      }
    }
  }

  drawDbScale(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const numChannels = this.audioEngine.channels || 1;
    const chH = height / numChannels;
    const tc = this.themeColors;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = tc.axisBg;
    ctx.fillRect(0, 0, width, height);

    const dbMarks = [0, -6, -12, -24, -48];
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';

    for (let ch = 0; ch < numChannels; ch++) {
      const centerY = ch * chH + chH / 2;
      for (const db of dbMarks) {
        const linear = Math.pow(10, db / 20);
        const yUp = centerY - linear * (chH / 2);
        const yDown = centerY + linear * (chH / 2);

        ctx.strokeStyle = tc.axisTick;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(width - 3, yUp); ctx.lineTo(width, yUp); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(width - 3, yDown); ctx.lineTo(width, yDown); ctx.stroke();

        ctx.fillStyle = tc.axisText;
        if (db === 0) {
          ctx.fillText('0', width - 4, centerY - linear * (chH / 2) + 3);
        } else {
          ctx.fillText(`${db}`, width - 4, yUp + 3);
        }
      }
    }
  }
}
