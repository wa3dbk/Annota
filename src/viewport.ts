// ===== Viewport: Zoom & Scroll State =====

import { clamp } from './utils';

export class Viewport {
  sampleRate: number = 44100;
  totalSamples: number = 0;
  canvasWidth: number = 800;
  canvasHeight: number = 400;
  samplesPerPixel: number = 256;
  minSamplesPerPixel: number = 4;
  maxSamplesPerPixel: number = 65536;
  scrollSamples: number = 0;
  private _listeners: (() => void)[] = [];

  setAudioParams(sampleRate: number, totalSamples: number): void {
    this.sampleRate = sampleRate;
    this.totalSamples = totalSamples;
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  get duration(): number {
    return this.totalSamples / this.sampleRate;
  }

  get visibleDuration(): number {
    return (this.canvasWidth * this.samplesPerPixel) / this.sampleRate;
  }

  get scrollTime(): number {
    return this.scrollSamples / this.sampleRate;
  }

  get visibleEndTime(): number {
    return this.scrollTime + this.visibleDuration;
  }

  get maxScroll(): number {
    const visibleSamples = this.canvasWidth * this.samplesPerPixel;
    return Math.max(0, this.totalSamples - visibleSamples);
  }

  timeToPixel(time: number): number {
    const samplePos = time * this.sampleRate;
    return (samplePos - this.scrollSamples) / this.samplesPerPixel;
  }

  pixelToTime(px: number): number {
    const sample = this.scrollSamples + px * this.samplesPerPixel;
    return sample / this.sampleRate;
  }

  sampleToPixel(sample: number): number {
    return (sample - this.scrollSamples) / this.samplesPerPixel;
  }

  pixelToSample(px: number): number {
    return Math.round(this.scrollSamples + px * this.samplesPerPixel);
  }

  zoomIn(anchorPixel: number | null = null): void {
    this._zoom(this.samplesPerPixel / 2, anchorPixel);
  }

  zoomOut(anchorPixel: number | null = null): void {
    this._zoom(this.samplesPerPixel * 2, anchorPixel);
  }

  zoomFit(): void {
    if (this.totalSamples === 0) return;
    this.samplesPerPixel = Math.max(
      this.minSamplesPerPixel,
      Math.ceil(this.totalSamples / this.canvasWidth)
    );
    this.scrollSamples = 0;
    this._notify();
  }

  private _zoom(newSPP: number, anchorPixel: number | null): void {
    if (anchorPixel == null) anchorPixel = this.canvasWidth / 2;

    newSPP = clamp(newSPP, this.minSamplesPerPixel, this.maxSamplesPerPixel);
    if (newSPP === this.samplesPerPixel) return;

    const anchorSample = this.scrollSamples + anchorPixel * this.samplesPerPixel;
    this.samplesPerPixel = newSPP;
    this.scrollSamples = anchorSample - anchorPixel * newSPP;
    this._clampScroll();
    this._notify();
  }

  scrollByPixels(deltaPx: number): void {
    this.scrollSamples += deltaPx * this.samplesPerPixel;
    this._clampScroll();
    this._notify();
  }

  scrollToTime(time: number): void {
    const sample = time * this.sampleRate;
    const visibleSamples = this.canvasWidth * this.samplesPerPixel;
    const margin = visibleSamples * 0.1;

    if (sample < this.scrollSamples + margin) {
      this.scrollSamples = sample - margin;
    } else if (sample > this.scrollSamples + visibleSamples - margin) {
      this.scrollSamples = sample - visibleSamples + margin;
    }
    this._clampScroll();
    this._notify();
  }

  setScrollFraction(frac: number): void {
    this.scrollSamples = frac * this.maxScroll;
    this._clampScroll();
    this._notify();
  }

  get scrollFraction(): number {
    return this.maxScroll > 0 ? this.scrollSamples / this.maxScroll : 0;
  }

  get visibleFraction(): number {
    if (this.totalSamples === 0) return 1;
    const visibleSamples = this.canvasWidth * this.samplesPerPixel;
    return Math.min(1, visibleSamples / this.totalSamples);
  }

  private _clampScroll(): void {
    this.scrollSamples = clamp(this.scrollSamples, 0, this.maxScroll);
  }

  onChange(callback: () => void): void {
    this._listeners.push(callback);
  }

  private _notify(): void {
    for (const cb of this._listeners) cb();
  }
}
