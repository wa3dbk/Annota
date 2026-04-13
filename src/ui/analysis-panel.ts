// ===== Analysis Panel =====
// Floating panel for viewing spectrogram, filterbank, or MFCC of a segment

import { ColorMaps, clamp } from '../utils';

export interface AnalysisPanelOptions {
  colorMap?: string;
  yLabels?: string[];
  info?: string;
}

export class AnalysisPanel {
  el: HTMLDivElement;
  _canvas: HTMLCanvasElement;
  _ctx: CanvasRenderingContext2D;
  private _titleEl: HTMLSpanElement;
  private _infoEl: HTMLSpanElement;
  private _visible: boolean = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'analysis-panel';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="analysis-panel-header">
        <span class="analysis-panel-title">Analysis</span>
        <div class="analysis-panel-actions">
          <button class="analysis-panel-save" title="Save as image">&#128190;</button>
          <button class="analysis-panel-close">&times;</button>
        </div>
      </div>
      <div class="analysis-panel-body">
        <canvas class="analysis-panel-canvas"></canvas>
      </div>
      <div class="analysis-panel-footer">
        <span class="analysis-panel-info"></span>
      </div>
    `;
    document.body.appendChild(this.el);

    this._titleEl = this.el.querySelector('.analysis-panel-title')!;
    this._canvas = this.el.querySelector('.analysis-panel-canvas')!;
    this._ctx = this._canvas.getContext('2d')!;
    this._infoEl = this.el.querySelector('.analysis-panel-info')!;

    this.el.querySelector('.analysis-panel-close')!.addEventListener('click', () => this.hide());
    this.el.querySelector('.analysis-panel-save')!.addEventListener('click', () => this.saveAsImage());

    this._makeDraggable();
  }

  private _makeDraggable(): void {
    const header = this.el.querySelector('.analysis-panel-header') as HTMLElement;
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    header.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.el.style.left = (origLeft + dx) + 'px';
      this.el.style.top = (origTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  show(title: string, data: Float32Array[] | number[][], opts: AnalysisPanelOptions = {}): void {
    this._titleEl.textContent = title;

    const numFrames = data.length;
    if (numFrames === 0) return;
    const numBins = data[0].length;

    const width = Math.min(700, numFrames);
    const height = Math.min(300, numBins * 3);
    this._canvas.width = width;
    this._canvas.height = height;
    this._canvas.style.width = width + 'px';
    this._canvas.style.height = height + 'px';

    let minVal = Infinity, maxVal = -Infinity;
    for (let t = 0; t < numFrames; t++) {
      for (let b = 0; b < numBins; b++) {
        const v = data[t][b];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
    const range = maxVal - minVal || 1;

    const colorFn = ColorMaps[opts.colorMap || 'magma'] || ColorMaps.magma;
    const imgData = this._ctx.createImageData(width, height);

    for (let x = 0; x < width; x++) {
      const frameIdx = Math.floor((x / width) * numFrames);
      for (let y = 0; y < height; y++) {
        const binIdx = Math.floor(((height - 1 - y) / (height - 1)) * (numBins - 1));
        const val = (data[frameIdx][binIdx] - minVal) / range;
        const [r, g, b] = colorFn(clamp(val, 0, 1));
        const idx = (y * width + x) * 4;
        imgData.data[idx] = r;
        imgData.data[idx + 1] = g;
        imgData.data[idx + 2] = b;
        imgData.data[idx + 3] = 255;
      }
    }

    this._ctx.putImageData(imgData, 0, 0);

    if (opts.info) {
      this._infoEl.textContent = opts.info;
    } else {
      this._infoEl.textContent = `${numFrames} frames \u00d7 ${numBins} bins`;
    }

    this.el.style.display = 'flex';
    this._visible = true;

    if (!this.el.style.left || this.el.style.left === '0px') {
      this.el.style.left = Math.max(50, (window.innerWidth - width - 40) / 2) + 'px';
      this.el.style.top = Math.max(50, (window.innerHeight - height - 100) / 2) + 'px';
    }
  }

  hide(): void {
    this.el.style.display = 'none';
    this._visible = false;
  }

  get isVisible(): boolean {
    return this._visible;
  }

  saveAsImage(): void {
    if (!this._canvas || !this._visible) return;
    const title = this._titleEl.textContent || 'analysis';
    const filename = title.toLowerCase().replace(/\s+/g, '_') + '.png';

    const dataUrl = this._canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
