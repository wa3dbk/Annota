// ===== Timeline / Time Ruler =====

import { setupHiDPICanvas } from './utils';
import { Viewport } from './viewport';
import type { ThemeColors } from './types';

export class TimeRuler {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  viewport: Viewport;
  themeColors: Partial<ThemeColors> = {};

  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.canvas = canvas;
    this.viewport = viewport;
  }

  resize(width: number, height: number): void {
    this.ctx = setupHiDPICanvas(this.canvas, width, height);
  }

  draw(): void {
    if (!this.ctx) return;
    const { canvasWidth: w } = this.viewport;
    const h = 30;

    const tc = this.themeColors;
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = tc.timelineBg || '#f0f0f4';
    this.ctx.fillRect(0, 0, w, h);

    if (this.viewport.totalSamples === 0) return;

    const interval = this._computeInterval();
    const minorInterval = interval.minor;
    const majorInterval = interval.major;

    const startTime = this.viewport.scrollTime;
    const endTime = this.viewport.visibleEndTime;

    this.ctx.strokeStyle = tc.timelineTick || 'rgba(0, 0, 0, 0.12)';
    this.ctx.lineWidth = 1;

    const firstMinor = Math.floor(startTime / minorInterval) * minorInterval;
    for (let t = firstMinor; t <= endTime; t += minorInterval) {
      if (t < 0) continue;
      const x = Math.round(this.viewport.timeToPixel(t)) + 0.5;
      if (x < 0 || x > w) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(x, h - 6);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = tc.timelineTickMajor || 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillStyle = tc.timelineText || '#5a5a70';
    this.ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.ctx.textAlign = 'center';

    const firstMajor = Math.floor(startTime / majorInterval) * majorInterval;
    for (let t = firstMajor; t <= endTime; t += majorInterval) {
      if (t < 0) continue;
      const x = Math.round(this.viewport.timeToPixel(t)) + 0.5;
      if (x < -50 || x > w + 50) continue;

      this.ctx.beginPath();
      this.ctx.moveTo(x, h - 14);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();

      const label = this._formatTickLabel(t, majorInterval);
      this.ctx.fillText(label, x, h - 16);
    }

    this.ctx.strokeStyle = tc.timelineTick || 'rgba(0, 0, 0, 0.1)';
    this.ctx.beginPath();
    this.ctx.moveTo(0, h - 0.5);
    this.ctx.lineTo(w, h - 0.5);
    this.ctx.stroke();
  }

  private _computeInterval(): { major: number; minor: number } {
    const pixelsPerSecond = this.viewport.sampleRate / this.viewport.samplesPerPixel;
    const targetMajorPx = 100;
    const targetMajorTime = targetMajorPx / pixelsPerSecond;

    const niceIntervals = [
      0.001, 0.002, 0.005, 0.01, 0.02, 0.05,
      0.1, 0.2, 0.5,
      1, 2, 5, 10, 15, 30,
      60, 120, 300, 600, 1800, 3600
    ];

    let major = 1;
    for (const ni of niceIntervals) {
      if (ni >= targetMajorTime) {
        major = ni;
        break;
      }
    }

    let minor = major / 5;
    if (major >= 60) minor = major / 6;
    else if (major >= 10) minor = major / 5;
    else if (major >= 1) minor = major / 5;

    return { major, minor };
  }

  private _formatTickLabel(time: number, interval: number): string {
    if (interval >= 60) {
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    if (interval >= 1) {
      return time.toFixed(0) + 's';
    }
    if (interval >= 0.1) {
      return time.toFixed(1) + 's';
    }
    return time.toFixed(2) + 's';
  }
}
