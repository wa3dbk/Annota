// ===== Selection Manager =====
// Handles time selection (click+drag) and playback cursor

import { setupHiDPICanvas, clamp } from './utils';
import { Viewport } from './viewport';
import type { SelectionRange, ThemeColors } from './types';

export class SelectionManager {
  selectionCanvas: HTMLCanvasElement;
  cursorCanvas: HTMLCanvasElement;
  selCtx: CanvasRenderingContext2D | null = null;
  curCtx: CanvasRenderingContext2D | null = null;
  viewport: Viewport;
  themeColors: Partial<ThemeColors> = {};

  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  cursorTime: number = 0;

  _isDragging: boolean = false;
  private _dragOriginTime: number = 0;

  constructor(selectionCanvas: HTMLCanvasElement, cursorCanvas: HTMLCanvasElement, viewport: Viewport) {
    this.selectionCanvas = selectionCanvas;
    this.cursorCanvas = cursorCanvas;
    this.viewport = viewport;
  }

  resize(width: number, height: number): void {
    this.selCtx = setupHiDPICanvas(this.selectionCanvas, width, height);
    this.curCtx = setupHiDPICanvas(this.cursorCanvas, width, height);
  }

  get hasSelection(): boolean {
    return this.selectionStart != null && this.selectionEnd != null
      && Math.abs(this.selectionEnd - this.selectionStart) > 0.001;
  }

  get selectionRange(): SelectionRange | null {
    if (!this.hasSelection) return null;
    const s = Math.min(this.selectionStart!, this.selectionEnd!);
    const e = Math.max(this.selectionStart!, this.selectionEnd!);
    return { start: s, end: e };
  }

  clearSelection(): void {
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  setCursor(time: number): void {
    this.cursorTime = time;
  }

  onMouseDown(e: MouseEvent, canvasRect: DOMRect): void {
    const px = e.clientX - canvasRect.left;
    const time = this.viewport.pixelToTime(px);
    this._isDragging = true;
    this._dragOriginTime = time;
    this.selectionStart = time;
    this.selectionEnd = time;
    this.cursorTime = time;
  }

  onMouseMove(e: MouseEvent, canvasRect: DOMRect): void {
    if (!this._isDragging) return;
    const px = e.clientX - canvasRect.left;
    const time = this.viewport.pixelToTime(px);
    this.selectionEnd = time;
  }

  onMouseUp(e: MouseEvent, canvasRect: DOMRect): void {
    if (!this._isDragging) return;
    this._isDragging = false;
    const px = e.clientX - canvasRect.left;
    const time = this.viewport.pixelToTime(px);
    this.selectionEnd = time;

    if (Math.abs(this.selectionEnd - this.selectionStart!) < 0.005) {
      this.cursorTime = this.selectionStart!;
      this.clearSelection();
    }
  }

  drawSelection(): void {
    if (!this.selCtx) return;
    const { canvasWidth: w, canvasHeight: h } = this.viewport;
    this.selCtx.clearRect(0, 0, w, h);

    if (!this.hasSelection) return;

    const range = this.selectionRange!;
    const x1 = this.viewport.timeToPixel(range.start);
    const x2 = this.viewport.timeToPixel(range.end);

    if (x2 < 0 || x1 > w) return;

    const sx = clamp(x1, 0, w);
    const ex = clamp(x2, 0, w);

    this.selCtx.fillStyle = this.themeColors.selectionFill || 'rgba(79, 70, 229, 0.15)';
    this.selCtx.fillRect(sx, 0, ex - sx, h);

    this.selCtx.strokeStyle = this.themeColors.selectionBorder || 'rgba(79, 70, 229, 0.5)';
    this.selCtx.lineWidth = 1;

    if (x1 >= 0 && x1 <= w) {
      this.selCtx.beginPath();
      this.selCtx.moveTo(Math.round(x1) + 0.5, 0);
      this.selCtx.lineTo(Math.round(x1) + 0.5, h);
      this.selCtx.stroke();
    }

    if (x2 >= 0 && x2 <= w) {
      this.selCtx.beginPath();
      this.selCtx.moveTo(Math.round(x2) + 0.5, 0);
      this.selCtx.lineTo(Math.round(x2) + 0.5, h);
      this.selCtx.stroke();
    }
  }

  drawCursor(): void {
    if (!this.curCtx) return;
    const { canvasWidth: w, canvasHeight: h } = this.viewport;
    this.curCtx.clearRect(0, 0, w, h);

    const x = this.viewport.timeToPixel(this.cursorTime);
    if (x < -1 || x > w + 1) return;

    const px = Math.round(x) + 0.5;
    const cursorColor = this.themeColors.cursor || '#e53e3e';
    this.curCtx.strokeStyle = cursorColor;
    this.curCtx.lineWidth = 1.5;
    this.curCtx.beginPath();
    this.curCtx.moveTo(px, 0);
    this.curCtx.lineTo(px, h);
    this.curCtx.stroke();

    this.curCtx.fillStyle = cursorColor;
    this.curCtx.beginPath();
    this.curCtx.moveTo(px - 4, 0);
    this.curCtx.lineTo(px + 4, 0);
    this.curCtx.lineTo(px, 6);
    this.curCtx.closePath();
    this.curCtx.fill();
  }
}
