// ===== Spectrogram Renderer (Tiled, Worker-accelerated) =====

import { setupHiDPICanvas, ColorMaps, clamp } from './utils';
import { fft, createWindow } from './fft';
import { Viewport } from './viewport';
import { AudioEngine } from './audio-engine';
import type { WindowType, ThemeColors } from './types';

interface TileEntry {
  canvas: HTMLCanvasElement;
  startFrame: number;
  endFrame: number;
}

export class SpectrogramRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  viewport: Viewport;
  audioEngine: AudioEngine;

  fftSize: number = 2048;
  hopSize: number = 512;
  windowType: WindowType = 'hann';
  colorMap: string = 'magma';
  minDb: number = -90;

  private _tileCache: Map<string, TileEntry> = new Map();
  private _maxTiles: number = 40;

  offscreenCanvas: HTMLCanvasElement | null = null;
  isComputed: boolean = false;
  isComputing: boolean = false;

  themeColors: Partial<ThemeColors> = {};

  private _worker: Worker | null = null;
  private _pendingTiles: Map<string, number> = new Map();
  private _workerIdCounter: number = 0;
  private _progressCallback: ((progress: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, viewport: Viewport, audioEngine: AudioEngine) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.audioEngine = audioEngine;
  }

  resize(width: number, height: number): void {
    this.ctx = setupHiDPICanvas(this.canvas, width, height);
  }

  private _getWorker(): Worker | null {
    if (!this._worker) {
      try {
        this._worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this._worker.onmessage = (e: MessageEvent) => this._onWorkerMessage(e);
        this._worker.onerror = (e) => { console.warn('Worker error:', e); this._worker = null; };
      } catch (err) {
        console.warn('Worker not available, using main thread:', err);
        return null;
      }
    }
    return this._worker;
  }

  private _onWorkerMessage(e: MessageEvent): void {
    const { type } = e.data;
    if (type === 'stftResult') {
      const { width, height } = e.data;
      const imageData = new Uint8ClampedArray(e.data.imageData);
      this._buildOffscreenFromRaw(imageData, width, height);
      this.isComputed = true;
      this.isComputing = false;
      this.draw();
    } else if (type === 'stftProgress') {
      if (this._progressCallback) this._progressCallback(e.data.progress);
    } else if (type === 'stftTileResult') {
      const { tileStart, tileEnd, imageData } = e.data;
      const key = `${tileStart}_${tileEnd}`;
      const raw = new Uint8ClampedArray(imageData);
      this._pendingTiles.delete(key);
      const tileW = Math.round(raw.length / 4 / 256);
      if (tileW <= 0) return;
      const tileH = 256;
      const tc = document.createElement('canvas');
      tc.width = tileW; tc.height = tileH;
      const tctx = tc.getContext('2d')!;
      const id2 = tctx.createImageData(tileW, tileH);
      id2.data.set(raw);
      tctx.putImageData(id2, 0, 0);
      this._tileCache.set(key, { canvas: tc, startFrame: tileStart, endFrame: tileEnd });
      this._evictTiles();
      this.draw();
    }
  }

  private _buildOffscreenFromRaw(imageData: Uint8ClampedArray, width: number, height: number): void {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
    const ctx = this.offscreenCanvas.getContext('2d')!;
    const id = ctx.createImageData(width, height);
    id.data.set(imageData);
    ctx.putImageData(id, 0, 0);
  }

  private _evictTiles(): void {
    while (this._tileCache.size > this._maxTiles) {
      const oldest = this._tileCache.keys().next().value;
      if (oldest !== undefined) this._tileCache.delete(oldest);
    }
  }

  async compute(onProgress: ((progress: number) => void) | null = null): Promise<void> {
    if (!this.audioEngine.audioBuffer || this.isComputing) return;
    this.isComputing = true;
    this.isComputed = false;
    this._progressCallback = onProgress;

    const monoData = this.audioEngine.getMonoData();
    const worker = this._getWorker();

    if (worker) {
      this._workerIdCounter++;
      const copy = new Float32Array(monoData);
      worker.postMessage({
        type: 'computeSTFT',
        id: this._workerIdCounter,
        samples: copy,
        fftSize: this.fftSize,
        hopSize: this.hopSize,
        windowType: this.windowType,
        minDb: this.minDb
      }, [copy.buffer]);
      return new Promise<void>((resolve) => {
        const check = () => {
          if (this.isComputed || !this.isComputing) { resolve(); return; }
          setTimeout(check, 100);
        };
        check();
      });
    }

    // Main-thread fallback
    const fftSize = this.fftSize;
    const hopSize = this.hopSize;
    const win = createWindow(fftSize, this.windowType);
    const numFrames = Math.floor((monoData.length - fftSize) / hopSize) + 1;
    const freqBins = (fftSize >> 1) + 1;
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    const w = numFrames;
    const h = freqBins;
    const raw = new Uint8ClampedArray(w * h * 4);
    const colorFn = ColorMaps[this.colorMap] || ColorMaps.magma;

    const chunkSize = 200;
    for (let start = 0; start < numFrames; start += chunkSize) {
      const end = Math.min(start + chunkSize, numFrames);
      for (let frame = start; frame < end; frame++) {
        const offset = frame * hopSize;
        for (let i = 0; i < fftSize; i++) {
          real[i] = (offset + i < monoData.length) ? monoData[offset + i] * win[i] : 0;
          imag[i] = 0;
        }
        fft(real, imag);
        for (let row = 0; row < h; row++) {
          const freqIdx = h - 1 - row;
          const mag = Math.sqrt(real[freqIdx] * real[freqIdx] + imag[freqIdx] * imag[freqIdx]) / fftSize;
          const db = 20 * Math.log10(mag + 1e-10);
          const val = clamp((db - this.minDb) / (-this.minDb), 0, 1);
          const [r, g, b] = colorFn(val);
          const idx = (row * w + frame) * 4;
          raw[idx] = r; raw[idx+1] = g; raw[idx+2] = b; raw[idx+3] = 255;
        }
      }
      if (onProgress) onProgress(end / numFrames);
      await new Promise<void>(r => setTimeout(r, 0));
    }

    this._buildOffscreenFromRaw(raw, w, h);
    this.isComputed = true;
    this.isComputing = false;
  }

  draw(): void {
    if (!this.ctx || !this.isComputed || !this.offscreenCanvas) return;
    const { canvasWidth: w, canvasHeight: h, scrollSamples, samplesPerPixel } = this.viewport;
    const totalSamples = this.audioEngine.totalSamples;

    this.ctx.clearRect(0, 0, w, h);

    const totalFrames = this.offscreenCanvas.width;
    const srcXStart = (scrollSamples / totalSamples) * totalFrames;
    const visibleSamples = w * samplesPerPixel;
    const srcWidth = (visibleSamples / totalSamples) * totalFrames;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'medium';
    this.ctx.drawImage(
      this.offscreenCanvas,
      srcXStart, 0, srcWidth, this.offscreenCanvas.height,
      0, 0, w, h
    );
  }

  clear(): void {
    this.offscreenCanvas = null;
    this.isComputed = false;
    this._tileCache.clear();
  }

  drawFreqScale(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const sampleRate = this.audioEngine.sampleRate || 44100;
    const nyquist = sampleRate / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.themeColors.axisBg || 'rgba(240,240,244,0.85)';
    ctx.fillRect(0, 0, width, height);

    const allMarks = [100, 200, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000];
    const freqMarks = allMarks.filter(f => f < nyquist);

    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';

    for (const freq of freqMarks) {
      const ratio = freq / nyquist;
      const y = height - ratio * height;

      ctx.strokeStyle = this.themeColors.axisTick || 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(width - 3, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = this.themeColors.axisText || '#7a7a8e';
      let label: string;
      if (freq >= 1000) {
        label = (freq / 1000) + 'k';
      } else {
        label = freq + '';
      }
      ctx.fillText(label, width - 4, y + 3);
    }
  }

  destroy(): void {
    if (this._worker) { this._worker.terminate(); this._worker = null; }
  }
}
