// ===== Label Track =====
// Point and region labels with interactive editing, multi-select, categories

import { setupHiDPICanvas, uniqueId } from './utils';
import { Viewport } from './viewport';
import type { Label, ThemeColors, CategoryDefinition } from './types';

interface HitResult {
  label: Label | null;
  zone: string | null;
}

export class LabelTrack {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  editorInput: HTMLInputElement;
  viewport: Viewport;

  labels: Label[] = [];

  selectedLabelId: string | null = null;
  selectedLabelIds: Set<string> = new Set();
  hoveredLabelId: string | null = null;
  _dragMode: string | null = null;
  _dragLabel: Label | null = null;
  private _dragOffset: number = 0;
  _isDragging: boolean = false;
  private _mouseDownTime: number = 0;
  private _mouseDownX: number = 0;
  private _createStart: number = 0;

  height: number = 80;
  BADGE_HEIGHT: number = 20;
  BADGE_Y: number = 10;
  POINT_RADIUS: number = 5;
  HANDLE_WIDTH: number = 6;

  _isEditing: boolean = false;
  _editingLabelId: string | null = null;

  categories: Record<string, CategoryDefinition> = {
    speech:  { label: 'Speech',  color: '#4f46e5' },
    noise:   { label: 'Noise',   color: '#ef4444' },
    music:   { label: 'Music',   color: '#10b981' },
    silence: { label: 'Silence', color: '#6b7280' },
    other:   { label: 'Other',   color: '#f59e0b' }
  };

  filterText: string = '';
  filterCategory: string = '';
  private _colors: ThemeColors | null = null;

  constructor(canvas: HTMLCanvasElement, editorInput: HTMLInputElement, viewport: Viewport) {
    this.canvas = canvas;
    this.editorInput = editorInput;
    this.viewport = viewport;
  }

  setThemeColors(colors: ThemeColors): void {
    this._colors = colors;
  }

  resize(width: number, height: number): void {
    this.height = height;
    this.ctx = setupHiDPICanvas(this.canvas, width, height);
  }

  addPointLabel(time: number, text: string = ''): Label {
    const label: Label = {
      id: uniqueId('lbl'),
      start: time,
      end: time,
      text: text || `Label ${this.labels.length + 1}`,
      type: 'point',
      category: 'other',
      color: null
    };
    this.labels.push(label);
    return label;
  }

  addRegionLabel(start: number, end: number, text: string = ''): Label {
    if (Math.abs(end - start) < 0.01) {
      return this.addPointLabel(start, text);
    }
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    const label: Label = {
      id: uniqueId('lbl'),
      start: s,
      end: e,
      text: text || `Region ${this.labels.length + 1}`,
      type: 'region',
      category: 'other',
      color: null
    };
    this.labels.push(label);
    return label;
  }

  removeLabel(id: string): void {
    this.labels = this.labels.filter(l => l.id !== id);
    if (this.selectedLabelId === id) this.selectedLabelId = null;
    this.selectedLabelIds.delete(id);
    if (this.hoveredLabelId === id) this.hoveredLabelId = null;
  }

  removeSelected(): void {
    if (this.selectedLabelIds.size > 0) {
      for (const id of this.selectedLabelIds) {
        this.labels = this.labels.filter(l => l.id !== id);
      }
      this.selectedLabelIds.clear();
      this.selectedLabelId = null;
    } else if (this.selectedLabelId) {
      this.removeLabel(this.selectedLabelId);
    }
  }

  getLabelById(id: string): Label | undefined {
    return this.labels.find(l => l.id === id);
  }

  getSelectedLabels(): Label[] {
    if (this.selectedLabelIds.size > 0) {
      return [...this.selectedLabelIds].map(id => this.getLabelById(id)).filter((l): l is Label => l !== undefined);
    }
    if (this.selectedLabelId) {
      const l = this.getLabelById(this.selectedLabelId);
      return l ? [l] : [];
    }
    return [];
  }

  _getLabelColor(label: Label): string {
    if (label.color) return label.color;
    const cat = this.categories[label.category];
    return cat ? cat.color : '#ea580c';
  }

  getFilteredLabels(): Label[] {
    let result = this.labels;
    if (this.filterCategory) {
      result = result.filter(l => l.category === this.filterCategory);
    }
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      result = result.filter(l => l.text.toLowerCase().includes(q));
    }
    return result;
  }

  hitTest(px: number, py: number): HitResult {
    const visibleLabels = this.getFilteredLabels();
    for (let i = visibleLabels.length - 1; i >= 0; i--) {
      const label = visibleLabels[i];

      if (label.type === 'point') {
        const x = this.viewport.timeToPixel(label.start);
        const dist = Math.abs(px - x);
        if (dist < this.POINT_RADIUS + 4 && py < this.BADGE_Y + this.BADGE_HEIGHT + 10) {
          return { label, zone: 'body' };
        }
        if (dist < 40 && py >= this.BADGE_Y && py <= this.BADGE_Y + this.BADGE_HEIGHT) {
          return { label, zone: 'body' };
        }
      } else {
        const x1 = this.viewport.timeToPixel(label.start);
        const x2 = this.viewport.timeToPixel(label.end);
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        if (px < minX - 5 || px > maxX + 5) continue;
        if (py > this.height) continue;

        if (Math.abs(px - minX) <= this.HANDLE_WIDTH) {
          return { label, zone: 'start-handle' };
        }
        if (Math.abs(px - maxX) <= this.HANDLE_WIDTH) {
          return { label, zone: 'end-handle' };
        }
        if (px >= minX && px <= maxX) {
          return { label, zone: 'body' };
        }
      }
    }
    return { label: null, zone: null };
  }

  onMouseDown(e: MouseEvent, canvasRect: DOMRect): void {
    if (this._isEditing) return;
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const time = this.viewport.pixelToTime(px);

    this._mouseDownTime = Date.now();
    this._mouseDownX = px;

    const hit = this.hitTest(px, py);

    if (hit.label) {
      if (e.shiftKey) {
        this.selectedLabelIds.add(hit.label.id);
        this.selectedLabelId = hit.label.id;
      } else if (e.ctrlKey || e.metaKey) {
        if (this.selectedLabelIds.has(hit.label.id)) {
          this.selectedLabelIds.delete(hit.label.id);
          this.selectedLabelId = this.selectedLabelIds.size > 0
            ? [...this.selectedLabelIds][this.selectedLabelIds.size - 1]
            : null;
        } else {
          this.selectedLabelIds.add(hit.label.id);
          this.selectedLabelId = hit.label.id;
        }
      } else {
        if (!this.selectedLabelIds.has(hit.label.id)) {
          this.selectedLabelIds.clear();
        }
        this.selectedLabelIds.add(hit.label.id);
        this.selectedLabelId = hit.label.id;
      }

      if (hit.zone === 'start-handle') {
        this._dragMode = 'resize-start';
        this._dragLabel = hit.label;
      } else if (hit.zone === 'end-handle') {
        this._dragMode = 'resize-end';
        this._dragLabel = hit.label;
      } else {
        this._dragMode = 'move';
        this._dragLabel = hit.label;
        this._dragOffset = time - hit.label.start;
      }
      this._isDragging = true;
    } else {
      this.selectedLabelId = null;
      this.selectedLabelIds.clear();
      this._dragMode = 'create-region';
      this._isDragging = true;
      this._createStart = time;
    }
  }

  onMouseMove(e: MouseEvent, canvasRect: DOMRect): void {
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const time = this.viewport.pixelToTime(px);

    if (this._isDragging && this._dragMode) {
      if (this._dragMode === 'move' && this._dragLabel) {
        const duration = this._dragLabel.end - this._dragLabel.start;
        this._dragLabel.start = Math.max(0, time - this._dragOffset);
        this._dragLabel.end = this._dragLabel.start + duration;
      } else if (this._dragMode === 'resize-start' && this._dragLabel) {
        this._dragLabel.start = Math.max(0, Math.min(time, this._dragLabel.end - 0.01));
      } else if (this._dragMode === 'resize-end' && this._dragLabel) {
        this._dragLabel.end = Math.max(this._dragLabel.start + 0.01, time);
      }
      return;
    }

    const hit = this.hitTest(px, py);
    this.hoveredLabelId = hit.label ? hit.label.id : null;

    if (hit.zone === 'start-handle' || hit.zone === 'end-handle') {
      this.canvas.style.cursor = 'ew-resize';
    } else if (hit.label) {
      this.canvas.style.cursor = 'pointer';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  onMouseUp(e: MouseEvent, canvasRect: DOMRect): void {
    if (!this._isDragging) return;
    const px = e.clientX - canvasRect.left;
    const time = this.viewport.pixelToTime(px);
    const movedPx = Math.abs(px - this._mouseDownX);

    if (this._dragMode === 'create-region') {
      if (movedPx > 5) {
        const label = this.addRegionLabel(this._createStart, time);
        this.selectedLabelId = label.id;
        this.selectedLabelIds.clear();
        this.selectedLabelIds.add(label.id);
      } else {
        const label = this.addPointLabel(time);
        this.selectedLabelId = label.id;
        this.selectedLabelIds.clear();
        this.selectedLabelIds.add(label.id);
      }
    }

    this._isDragging = false;
    this._dragMode = null;
    this._dragLabel = null;
  }

  onDoubleClick(e: MouseEvent, canvasRect: DOMRect): void {
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const hit = this.hitTest(px, py);

    if (hit.label) {
      this._startEditing(hit.label, px, py);
    }
  }

  private _startEditing(label: Label, px: number, _py: number): void {
    this._isEditing = true;
    this._editingLabelId = label.id;
    this.selectedLabelId = label.id;

    const input = this.editorInput;
    input.value = label.text;
    input.style.display = 'block';

    let left: number;
    if (label.type === 'point') {
      left = this.viewport.timeToPixel(label.start) - 30;
    } else {
      const x1 = this.viewport.timeToPixel(label.start);
      const x2 = this.viewport.timeToPixel(label.end);
      left = (x1 + x2) / 2 - 30;
    }
    input.style.left = Math.max(2, left) + 'px';
    input.style.top = (this.BADGE_Y + this.BADGE_HEIGHT + 4) + 'px';
    input.style.width = '120px';

    input.focus();
    input.select();

    const finish = () => {
      const newText = input.value.trim();
      if (newText) label.text = newText;
      input.style.display = 'none';
      this._isEditing = false;
      this._editingLabelId = null;
      input.removeEventListener('blur', finish);
      input.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = label.text;
        finish();
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', onKey);
  }

  draw(): void {
    if (!this.ctx) return;
    const { canvasWidth: w } = this.viewport;
    const h = this.height;

    this.ctx.clearRect(0, 0, w, h);

    const bgColor = this._colors ? this._colors.labelBg : '#fafafa';
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, w, h);

    const visibleLabels = this.getFilteredLabels();
    const filteredIds = new Set(visibleLabels.map(l => l.id));

    for (const label of this.labels) {
      const isVisible = filteredIds.has(label.id);
      const isSelected = this.selectedLabelIds.has(label.id) || label.id === this.selectedLabelId;
      const isHovered = label.id === this.hoveredLabelId;
      const isEditing = label.id === this._editingLabelId;

      if (!isVisible && (this.filterText || this.filterCategory)) {
        this.ctx.globalAlpha = 0.15;
      }

      if (label.type === 'point') {
        this._drawPointLabel(label, isSelected, isHovered, isEditing);
      } else {
        this._drawRegionLabel(label, isSelected, isHovered, isEditing);
      }

      this.ctx.globalAlpha = 1;
    }
  }

  private _drawPointLabel(label: Label, isSelected: boolean, isHovered: boolean, isEditing: boolean): void {
    const x = this.viewport.timeToPixel(label.start);
    const { canvasWidth: w } = this.viewport;
    if (x < -50 || x > w + 50) return;

    const h = this.height;
    const color = this._getLabelColor(label);
    const alpha = isHovered ? 1 : 0.85;

    this.ctx!.strokeStyle = color;
    this.ctx!.globalAlpha = this.ctx!.globalAlpha * alpha * 0.5;
    this.ctx!.lineWidth = 1;
    this.ctx!.setLineDash([3, 3]);
    this.ctx!.beginPath();
    this.ctx!.moveTo(Math.round(x) + 0.5, this.BADGE_Y + this.BADGE_HEIGHT);
    this.ctx!.lineTo(Math.round(x) + 0.5, h);
    this.ctx!.stroke();
    this.ctx!.setLineDash([]);

    this.ctx!.globalAlpha = this.ctx!.globalAlpha > 0.5 ? alpha : this.ctx!.globalAlpha;
    this.ctx!.fillStyle = color;
    this.ctx!.beginPath();
    this.ctx!.arc(x, this.BADGE_Y + this.BADGE_HEIGHT + 5, this.POINT_RADIUS, 0, Math.PI * 2);
    this.ctx!.fill();

    if (isSelected) {
      this.ctx!.strokeStyle = this._colors ? '#ffffff' : '#1a1a28';
      this.ctx!.lineWidth = 1.5;
      this.ctx!.stroke();
    }

    if (!isEditing) {
      this._drawBadge(label.text, x, this.BADGE_Y, color, isSelected, label.category);
    }
  }

  private _drawRegionLabel(label: Label, isSelected: boolean, isHovered: boolean, isEditing: boolean): void {
    const x1 = this.viewport.timeToPixel(label.start);
    const x2 = this.viewport.timeToPixel(label.end);
    const { canvasWidth: w } = this.viewport;
    if (x2 < -10 || x1 > w + 10) return;

    const h = this.height;
    const color = this._getLabelColor(label);
    const baseAlpha = this.ctx!.globalAlpha;
    const alpha = isHovered ? 0.9 : 0.7;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    this.ctx!.globalAlpha = baseAlpha * alpha * 0.2;
    this.ctx!.fillStyle = color;
    this.ctx!.fillRect(minX, this.BADGE_Y + this.BADGE_HEIGHT, maxX - minX, h - this.BADGE_Y - this.BADGE_HEIGHT);

    this.ctx!.globalAlpha = baseAlpha * alpha * 0.8;
    this.ctx!.strokeStyle = color;
    this.ctx!.lineWidth = isSelected ? 2 : 1;
    this.ctx!.strokeRect(minX, this.BADGE_Y + this.BADGE_HEIGHT, maxX - minX, h - this.BADGE_Y - this.BADGE_HEIGHT);

    if (isSelected || isHovered) {
      this.ctx!.globalAlpha = baseAlpha * 0.9;
      this.ctx!.fillStyle = color;
      this.ctx!.fillRect(minX - 2, this.BADGE_Y + this.BADGE_HEIGHT, 4, h - this.BADGE_Y - this.BADGE_HEIGHT);
      this.ctx!.fillRect(maxX - 2, this.BADGE_Y + this.BADGE_HEIGHT, 4, h - this.BADGE_Y - this.BADGE_HEIGHT);
    }

    this.ctx!.globalAlpha = baseAlpha;
    if (!isEditing) {
      const centerX = (minX + maxX) / 2;
      this._drawBadge(label.text, centerX, this.BADGE_Y, color, isSelected, label.category);
    }
  }

  private _drawBadge(text: string, x: number, y: number, color: string, isSelected: boolean, category: string): void {
    this.ctx!.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    const textWidth = this.ctx!.measureText(text).width;

    const hasCat = category && category !== 'other';
    const dotWidth = hasCat ? 12 : 0;

    const padX = 6;
    const bw = textWidth + padX * 2 + dotWidth;
    const bh = this.BADGE_HEIGHT;
    const bx = x - bw / 2;

    const prevAlpha = this.ctx!.globalAlpha;
    this.ctx!.globalAlpha = Math.min(prevAlpha, 0.9);
    const bgColor = this._colors
      ? (isSelected ? this._colors.labelBadgeBgSelected : this._colors.labelBadgeBg)
      : (isSelected ? '#fff7ed' : '#ffffff');
    this.ctx!.fillStyle = bgColor;
    this.ctx!.strokeStyle = color;
    this.ctx!.lineWidth = 1;

    const r = 4;
    this.ctx!.beginPath();
    this.ctx!.moveTo(bx + r, y);
    this.ctx!.lineTo(bx + bw - r, y);
    this.ctx!.arcTo(bx + bw, y, bx + bw, y + r, r);
    this.ctx!.lineTo(bx + bw, y + bh - r);
    this.ctx!.arcTo(bx + bw, y + bh, bx + bw - r, y + bh, r);
    this.ctx!.lineTo(bx + r, y + bh);
    this.ctx!.arcTo(bx, y + bh, bx, y + bh - r, r);
    this.ctx!.lineTo(bx, y + r);
    this.ctx!.arcTo(bx, y, bx + r, y, r);
    this.ctx!.closePath();
    this.ctx!.fill();
    this.ctx!.stroke();

    if (hasCat) {
      const catColor = this.categories[category] ? this.categories[category].color : color;
      this.ctx!.fillStyle = catColor;
      this.ctx!.beginPath();
      this.ctx!.arc(bx + padX + 4, y + bh / 2, 3, 0, Math.PI * 2);
      this.ctx!.fill();
    }

    this.ctx!.fillStyle = color;
    this.ctx!.textAlign = 'center';
    this.ctx!.textBaseline = 'middle';
    this.ctx!.fillText(text, x + dotWidth / 2, y + bh / 2);
    this.ctx!.textBaseline = 'alphabetic';
    this.ctx!.globalAlpha = prevAlpha;
  }

  // ===== Import / Export =====

  exportAudacity(): string {
    const lines = this.labels.map(l => {
      const start = l.start.toFixed(6);
      const end = l.end.toFixed(6);
      return `${start}\t${end}\t${l.text}`;
    });
    return lines.join('\n');
  }

  exportJSON(): string {
    return JSON.stringify(this.labels.map(l => ({
      start: l.start,
      end: l.end,
      text: l.text,
      type: l.type,
      category: l.category || 'other'
    })), null, 2);
  }

  importAudacity(text: string): void {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const imported: Label[] = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const start = parseFloat(parts[0]);
        const end = parseFloat(parts[1]);
        const labelText = parts[2] || '';
        if (!isNaN(start) && !isNaN(end)) {
          const type: 'point' | 'region' = Math.abs(end - start) < 0.001 ? 'point' : 'region';
          imported.push({
            id: uniqueId('lbl'),
            start,
            end: type === 'point' ? start : end,
            text: labelText,
            type,
            category: 'other',
            color: null
          });
        }
      }
    }
    this.labels = imported;
    this.selectedLabelId = null;
    this.selectedLabelIds.clear();
  }

  importJSON(text: string): void {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('Expected array');
      this.labels = arr.map((l: Record<string, unknown>) => ({
        id: uniqueId('lbl'),
        start: (l.start as number) || 0,
        end: (l.end as number) || (l.start as number) || 0,
        text: (l.text as string) || '',
        type: (l.type as 'point' | 'region') || (Math.abs(((l.end as number) || 0) - ((l.start as number) || 0)) < 0.001 ? 'point' : 'region'),
        category: (l.category as string) || 'other',
        color: (l.color as string) || null
      }));
      this.selectedLabelId = null;
      this.selectedLabelIds.clear();
    } catch (e) {
      console.error('Failed to parse JSON labels:', e);
      throw e;
    }
  }

  exportSRT(): string {
    const sorted = [...this.labels].sort((a, b) => a.start - b.start);
    return sorted.map((l, i) => {
      const startStr = this._formatSRTTime(l.start);
      const endStr = this._formatSRTTime(l.type === 'point' ? l.start + 2 : l.end);
      return `${i + 1}\n${startStr} --> ${endStr}\n${l.text}\n`;
    }).join('\n');
  }

  exportVTT(): string {
    const sorted = [...this.labels].sort((a, b) => a.start - b.start);
    const cues = sorted.map((l) => {
      const startStr = this._formatVTTTime(l.start);
      const endStr = this._formatVTTTime(l.type === 'point' ? l.start + 2 : l.end);
      return `${startStr} --> ${endStr}\n${l.text}`;
    });
    return 'WEBVTT\n\n' + cues.join('\n\n');
  }

  exportELAN(): string {
    const sorted = [...this.labels].sort((a, b) => a.start - b.start);
    const annotations = sorted.map((l, i) => {
      return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${i + 1}" TIME_SLOT_REF1="ts${i * 2 + 1}" TIME_SLOT_REF2="ts${i * 2 + 2}">
                <ANNOTATION_VALUE>${this._escapeXml(l.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
    });

    const timeSlots = sorted.map((l, i) => {
      const startMs = Math.round(l.start * 1000);
      const endMs = Math.round((l.type === 'point' ? l.start + 0.5 : l.end) * 1000);
      return `        <TIME_SLOT TIME_SLOT_ID="ts${i * 2 + 1}" TIME_VALUE="${startMs}"/>\n        <TIME_SLOT TIME_SLOT_ID="ts${i * 2 + 2}" TIME_VALUE="${endMs}"/>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds"/>
    <TIME_ORDER>
${timeSlots.join('\n')}
    </TIME_ORDER>
    <TIER LINGUISTIC_TYPE_REF="default-lt" TIER_ID="Labels">
${annotations.join('\n')}
    </TIER>
    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>`;
  }

  private _formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  }

  private _formatVTTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }

  private _escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  importAuto(text: string): void {
    text = text.trim();
    if (text.startsWith('[') || text.startsWith('{')) {
      this.importJSON(text);
    } else if (text.startsWith('WEBVTT')) {
      this._importVTT(text);
    } else if (text.includes('-->') && /^\d+\s*\n/.test(text)) {
      this._importSRT(text);
    } else {
      this.importAudacity(text);
    }
  }

  private _importSRT(text: string): void {
    const blocks = text.trim().split(/\n\n+/);
    this.labels = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (match) {
          const start = parseInt(match[1])*3600 + parseInt(match[2])*60 + parseInt(match[3]) + parseInt(match[4])/1000;
          const end = parseInt(match[5])*3600 + parseInt(match[6])*60 + parseInt(match[7]) + parseInt(match[8])/1000;
          const labelText = lines.slice(2).join(' ');
          this.labels.push({ id: uniqueId('lbl'), start, end, text: labelText, type: 'region', category: 'other', color: null });
        }
      }
    }
    this.selectedLabelId = null;
    this.selectedLabelIds.clear();
  }

  private _importVTT(text: string): void {
    const lines = text.split('\n');
    this.labels = [];
    let i = 0;
    while (i < lines.length && !lines[i].includes('-->')) i++;
    while (i < lines.length) {
      if (lines[i].includes('-->')) {
        const match = lines[i].match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (match) {
          const start = parseInt(match[1])*3600 + parseInt(match[2])*60 + parseInt(match[3]) + parseInt(match[4])/1000;
          const end = parseInt(match[5])*3600 + parseInt(match[6])*60 + parseInt(match[7]) + parseInt(match[8])/1000;
          i++;
          let labelText = '';
          while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
            labelText += (labelText ? ' ' : '') + lines[i].trim();
            i++;
          }
          this.labels.push({ id: uniqueId('lbl'), start, end, text: labelText, type: 'region', category: 'other', color: null });
        } else { i++; }
      } else { i++; }
    }
    this.selectedLabelId = null;
    this.selectedLabelIds.clear();
  }
}
