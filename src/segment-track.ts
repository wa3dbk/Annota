// ===== Segment Track =====
// Region-based annotation segments with speaker assignment, split/merge

import { setupHiDPICanvas, uniqueId } from './utils';
import { Viewport } from './viewport';
import { SpeakerManager } from './speaker-manager';
import type { Segment, ThemeColors, CategoryDefinition } from './types';

interface HitResult {
  segment: Segment | null;
  zone: string | null;
}

export class SegmentTrack {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null = null;
  editorInput: HTMLInputElement;
  viewport: Viewport;
  speakerManager: SpeakerManager;

  segments: Segment[] = [];

  selectedSegmentId: string | null = null;
  selectedSegmentIds: Set<string> = new Set();
  hoveredSegmentId: string | null = null;
  _dragMode: string | null = null;
  _dragSegment: Segment | null = null;
  private _dragOffset: number = 0;
  _isDragging: boolean = false;
  private _mouseDownTime: number = 0;
  private _mouseDownX: number = 0;
  private _createStart: number = 0;

  height: number = 80;
  BADGE_HEIGHT: number = 22;
  BADGE_Y: number = 6;
  HANDLE_WIDTH: number = 6;

  _isEditing: boolean = false;
  _editingSegmentId: string | null = null;

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

  constructor(canvas: HTMLCanvasElement, editorInput: HTMLInputElement, viewport: Viewport, speakerManager: SpeakerManager) {
    this.canvas = canvas;
    this.editorInput = editorInput;
    this.viewport = viewport;
    this.speakerManager = speakerManager;
  }

  setThemeColors(colors: ThemeColors): void {
    this._colors = colors;
  }

  resize(width: number, height: number): void {
    this.height = height;
    this.ctx = setupHiDPICanvas(this.canvas, width, height);
  }

  // ===== Segment CRUD =====

  addSegment(start: number, end: number, text: string = ''): Segment {
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    if (e - s < 0.01) {
      // Minimum 1-second region
      const minDuration = 1.0;
      const totalDuration = this.viewport.duration;
      let adjustedEnd = s + minDuration;
      if (adjustedEnd > totalDuration) adjustedEnd = totalDuration;
      // Avoid overlapping the next segment
      const sorted = this.segments
        .filter(seg => seg.start > s)
        .sort((a, b) => a.start - b.start);
      if (sorted.length > 0 && sorted[0].start < adjustedEnd) {
        adjustedEnd = sorted[0].start;
      }
      if (adjustedEnd - s < 0.01) adjustedEnd = s + 0.01;
      return this._createSegment(s, adjustedEnd, text);
    }
    return this._createSegment(s, e, text);
  }

  private _createSegment(start: number, end: number, text: string): Segment {
    const segment: Segment = {
      id: uniqueId('seg'),
      start,
      end,
      text: text || `Segment ${this.segments.length + 1}`,
      speakerId: null,
      category: 'speech'
    };
    this.segments.push(segment);
    return segment;
  }

  removeSegment(id: string): void {
    this.segments = this.segments.filter(s => s.id !== id);
    if (this.selectedSegmentId === id) this.selectedSegmentId = null;
    this.selectedSegmentIds.delete(id);
    if (this.hoveredSegmentId === id) this.hoveredSegmentId = null;
  }

  removeSelected(): void {
    if (this.selectedSegmentIds.size > 0) {
      for (const id of this.selectedSegmentIds) {
        this.segments = this.segments.filter(s => s.id !== id);
      }
      this.selectedSegmentIds.clear();
      this.selectedSegmentId = null;
    } else if (this.selectedSegmentId) {
      this.removeSegment(this.selectedSegmentId);
    }
  }

  getSegmentById(id: string): Segment | undefined {
    return this.segments.find(s => s.id === id);
  }

  getSelectedSegments(): Segment[] {
    if (this.selectedSegmentIds.size > 0) {
      return [...this.selectedSegmentIds].map(id => this.getSegmentById(id)).filter((s): s is Segment => s !== undefined);
    }
    if (this.selectedSegmentId) {
      const s = this.getSegmentById(this.selectedSegmentId);
      return s ? [s] : [];
    }
    return [];
  }

  // ===== Split & Merge =====

  splitAtCursor(segmentId: string, cursorTime: number): [Segment, Segment] | null {
    const seg = this.getSegmentById(segmentId);
    if (!seg) return null;
    if (cursorTime <= seg.start || cursorTime >= seg.end) return null;

    const leftSeg: Segment = {
      id: uniqueId('seg'),
      start: seg.start,
      end: cursorTime,
      text: seg.text,
      speakerId: seg.speakerId,
      category: seg.category
    };
    const rightSeg: Segment = {
      id: uniqueId('seg'),
      start: cursorTime,
      end: seg.end,
      text: '',
      speakerId: seg.speakerId,
      category: seg.category
    };

    const idx = this.segments.indexOf(seg);
    this.segments.splice(idx, 1, leftSeg, rightSeg);
    this.selectedSegmentId = leftSeg.id;
    this.selectedSegmentIds.clear();
    this.selectedSegmentIds.add(leftSeg.id);
    return [leftSeg, rightSeg];
  }

  mergeSegments(id1: string, id2: string): Segment | null {
    const seg1 = this.getSegmentById(id1);
    const seg2 = this.getSegmentById(id2);
    if (!seg1 || !seg2) return null;

    const merged: Segment = {
      id: uniqueId('seg'),
      start: Math.min(seg1.start, seg2.start),
      end: Math.max(seg1.end, seg2.end),
      text: [seg1.text, seg2.text].filter(t => t).join(' '),
      speakerId: seg1.speakerId,
      category: seg1.category
    };

    this.segments = this.segments.filter(s => s.id !== id1 && s.id !== id2);
    this.segments.push(merged);
    this.segments.sort((a, b) => a.start - b.start);
    this.selectedSegmentId = merged.id;
    this.selectedSegmentIds.clear();
    this.selectedSegmentIds.add(merged.id);
    return merged;
  }

  // ===== Color =====

  _getSegmentColor(segment: Segment): string {
    if (this.speakerManager.enabled && segment.speakerId) {
      return this.speakerManager.getSpeakerColor(segment.speakerId);
    }
    const cat = this.categories[segment.category];
    return cat ? cat.color : '#ea580c';
  }

  // ===== Filtering =====

  getFilteredSegments(): Segment[] {
    let result = this.segments;
    if (this.filterCategory) {
      result = result.filter(s => s.category === this.filterCategory);
    }
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      result = result.filter(s => s.text.toLowerCase().includes(q));
    }
    return result;
  }

  // ===== Hit Testing =====

  hitTest(px: number, py: number): HitResult {
    const visible = this.getFilteredSegments();
    for (let i = visible.length - 1; i >= 0; i--) {
      const seg = visible[i];
      const x1 = this.viewport.timeToPixel(seg.start);
      const x2 = this.viewport.timeToPixel(seg.end);
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);

      if (px < minX - 5 || px > maxX + 5) continue;
      if (py > this.height) continue;

      if (Math.abs(px - minX) <= this.HANDLE_WIDTH) {
        return { segment: seg, zone: 'start-handle' };
      }
      if (Math.abs(px - maxX) <= this.HANDLE_WIDTH) {
        return { segment: seg, zone: 'end-handle' };
      }
      if (px >= minX && px <= maxX) {
        return { segment: seg, zone: 'body' };
      }
    }
    return { segment: null, zone: null };
  }

  // ===== Mouse Interaction =====

  onMouseDown(e: MouseEvent, canvasRect: DOMRect): void {
    if (this._isEditing) return;
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const time = this.viewport.pixelToTime(px);

    this._mouseDownTime = Date.now();
    this._mouseDownX = px;

    const hit = this.hitTest(px, py);

    if (hit.segment) {
      if (e.shiftKey) {
        this.selectedSegmentIds.add(hit.segment.id);
        this.selectedSegmentId = hit.segment.id;
      } else if (e.ctrlKey || e.metaKey) {
        if (this.selectedSegmentIds.has(hit.segment.id)) {
          this.selectedSegmentIds.delete(hit.segment.id);
          this.selectedSegmentId = this.selectedSegmentIds.size > 0
            ? [...this.selectedSegmentIds][this.selectedSegmentIds.size - 1]
            : null;
        } else {
          this.selectedSegmentIds.add(hit.segment.id);
          this.selectedSegmentId = hit.segment.id;
        }
      } else {
        if (!this.selectedSegmentIds.has(hit.segment.id)) {
          this.selectedSegmentIds.clear();
        }
        this.selectedSegmentIds.add(hit.segment.id);
        this.selectedSegmentId = hit.segment.id;
      }

      if (hit.zone === 'start-handle') {
        this._dragMode = 'resize-start';
        this._dragSegment = hit.segment;
      } else if (hit.zone === 'end-handle') {
        this._dragMode = 'resize-end';
        this._dragSegment = hit.segment;
      } else {
        this._dragMode = 'move';
        this._dragSegment = hit.segment;
        this._dragOffset = time - hit.segment.start;
      }
      this._isDragging = true;
    } else {
      this.selectedSegmentId = null;
      this.selectedSegmentIds.clear();
      this._dragMode = 'create-region';
      this._isDragging = true;
      this._createStart = time;
    }
  }

  onMouseMove(e: MouseEvent, canvasRect: DOMRect): void {
    const px = e.clientX - canvasRect.left;
    const time = this.viewport.pixelToTime(px);

    if (this._isDragging && this._dragMode) {
      if (this._dragMode === 'move' && this._dragSegment) {
        const duration = this._dragSegment.end - this._dragSegment.start;
        this._dragSegment.start = Math.max(0, time - this._dragOffset);
        this._dragSegment.end = this._dragSegment.start + duration;
      } else if (this._dragMode === 'resize-start' && this._dragSegment) {
        this._dragSegment.start = Math.max(0, Math.min(time, this._dragSegment.end - 0.01));
      } else if (this._dragMode === 'resize-end' && this._dragSegment) {
        this._dragSegment.end = Math.max(this._dragSegment.start + 0.01, time);
      }
      return;
    }

    const hit = this.hitTest(px, e.clientY - canvasRect.top);
    this.hoveredSegmentId = hit.segment ? hit.segment.id : null;

    if (hit.zone === 'start-handle' || hit.zone === 'end-handle') {
      this.canvas.style.cursor = 'ew-resize';
    } else if (hit.segment) {
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
        const seg = this.addSegment(this._createStart, time);
        this.selectedSegmentId = seg.id;
        this.selectedSegmentIds.clear();
        this.selectedSegmentIds.add(seg.id);
      } else {
        const seg = this.addSegment(time, time);
        this.selectedSegmentId = seg.id;
        this.selectedSegmentIds.clear();
        this.selectedSegmentIds.add(seg.id);
      }
    }

    this._isDragging = false;
    this._dragMode = null;
    this._dragSegment = null;
  }

  onDoubleClick(e: MouseEvent, canvasRect: DOMRect): void {
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    const hit = this.hitTest(px, py);
    if (hit.segment) {
      this._startEditing(hit.segment, px);
    }
  }

  private _startEditing(segment: Segment, px: number): void {
    this._isEditing = true;
    this._editingSegmentId = segment.id;
    this.selectedSegmentId = segment.id;

    const input = this.editorInput;
    input.value = segment.text;
    input.style.display = 'block';

    const x1 = this.viewport.timeToPixel(segment.start);
    const x2 = this.viewport.timeToPixel(segment.end);
    const left = (x1 + x2) / 2 - 60;
    input.style.left = Math.max(2, left) + 'px';
    input.style.top = (this.BADGE_Y + this.BADGE_HEIGHT + 4) + 'px';
    input.style.width = Math.min(200, Math.max(120, x2 - x1 - 20)) + 'px';

    input.focus();
    input.select();

    const finish = () => {
      const newText = input.value.trim();
      if (newText) segment.text = newText;
      input.style.display = 'none';
      this._isEditing = false;
      this._editingSegmentId = null;
      input.removeEventListener('blur', finish);
      input.removeEventListener('keydown', onKey);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      else if (e.key === 'Escape') { e.preventDefault(); input.value = segment.text; finish(); }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', onKey);
  }

  // ===== Drawing =====

  draw(): void {
    if (!this.ctx) return;
    const { canvasWidth: w } = this.viewport;
    const h = this.height;

    this.ctx.clearRect(0, 0, w, h);

    const bgColor = this._colors ? this._colors.labelBg : '#fafafa';
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, w, h);

    const filteredIds = new Set(this.getFilteredSegments().map(s => s.id));

    for (const seg of this.segments) {
      const isVisible = filteredIds.has(seg.id);
      const isSelected = this.selectedSegmentIds.has(seg.id) || seg.id === this.selectedSegmentId;
      const isHovered = seg.id === this.hoveredSegmentId;
      const isEditing = seg.id === this._editingSegmentId;

      if (!isVisible && (this.filterText || this.filterCategory)) {
        this.ctx.globalAlpha = 0.15;
      }

      this._drawSegment(seg, isSelected, isHovered, isEditing);
      this.ctx.globalAlpha = 1;
    }
  }

  private _drawSegment(seg: Segment, isSelected: boolean, isHovered: boolean, isEditing: boolean): void {
    const x1 = this.viewport.timeToPixel(seg.start);
    const x2 = this.viewport.timeToPixel(seg.end);
    const { canvasWidth: w } = this.viewport;
    if (x2 < -10 || x1 > w + 10) return;

    const h = this.height;
    const color = this._getSegmentColor(seg);
    const baseAlpha = this.ctx!.globalAlpha;
    const alpha = isHovered ? 0.9 : 0.7;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const regionTop = this.BADGE_Y + this.BADGE_HEIGHT + 2;

    // Region fill
    this.ctx!.globalAlpha = baseAlpha * alpha * 0.15;
    this.ctx!.fillStyle = color;
    this.ctx!.fillRect(minX, regionTop, maxX - minX, h - regionTop);

    // Region border
    this.ctx!.globalAlpha = baseAlpha * alpha * 0.8;
    this.ctx!.strokeStyle = color;
    this.ctx!.lineWidth = isSelected ? 2 : 1;
    this.ctx!.strokeRect(minX, regionTop, maxX - minX, h - regionTop);

    // Resize handles
    if (isSelected || isHovered) {
      this.ctx!.globalAlpha = baseAlpha * 0.9;
      this.ctx!.fillStyle = color;
      this.ctx!.fillRect(minX - 2, regionTop, 4, h - regionTop);
      this.ctx!.fillRect(maxX - 2, regionTop, 4, h - regionTop);
    }

    this.ctx!.globalAlpha = baseAlpha;

    // Badge with speaker name and text
    if (!isEditing) {
      this._drawSegmentBadge(seg, minX, maxX, color, isSelected);
    }
  }

  private _drawSegmentBadge(seg: Segment, minX: number, maxX: number, color: string, isSelected: boolean): void {
    const ctx = this.ctx!;
    const badgeWidth = maxX - minX;
    if (badgeWidth < 8) return;

    const y = this.BADGE_Y;
    const bh = this.BADGE_HEIGHT;
    const padX = 6;

    // Badge background
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.min(prevAlpha, 0.95);
    const bgColor = this._colors
      ? (isSelected ? this._colors.labelBadgeBgSelected : this._colors.labelBadgeBg)
      : (isSelected ? '#fff7ed' : '#ffffff');
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    const r = 4;
    ctx.beginPath();
    ctx.moveTo(minX + r, y);
    ctx.lineTo(maxX - r, y);
    ctx.arcTo(maxX, y, maxX, y + r, r);
    ctx.lineTo(maxX, y + bh - r);
    ctx.arcTo(maxX, y + bh, maxX - r, y + bh, r);
    ctx.lineTo(minX + r, y + bh);
    ctx.arcTo(minX, y + bh, minX, y + bh - r, r);
    ctx.lineTo(minX, y + r);
    ctx.arcTo(minX, y, minX + r, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Speaker pill
    let textStart = minX + padX;
    if (this.speakerManager.enabled && seg.speakerId) {
      const speakerName = this.speakerManager.getSpeakerName(seg.speakerId);
      const speakerColor = this.speakerManager.getSpeakerColor(seg.speakerId);

      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      const pillTextWidth = ctx.measureText(speakerName).width;
      const pillWidth = pillTextWidth + 8;
      const pillX = minX + padX;
      const pillY = y + (bh - 14) / 2;

      ctx.fillStyle = speakerColor;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillWidth, 14, 7);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(speakerName, pillX + 4, pillY + 7);

      textStart = pillX + pillWidth + 4;
    } else if (!this.speakerManager.enabled) {
      // Category dot when speakers disabled
      const cat = this.categories[seg.category];
      if (cat && seg.category !== 'other') {
        ctx.fillStyle = cat.color;
        ctx.beginPath();
        ctx.arc(minX + padX + 4, y + bh / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        textStart = minX + padX + 12;
      }
    }

    // Segment text (clipped to badge width)
    const availWidth = maxX - textStart - padX;
    if (availWidth > 10) {
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = this._colors ? this._colors.labelText : color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      ctx.save();
      ctx.beginPath();
      ctx.rect(textStart, y, availWidth, bh);
      ctx.clip();
      ctx.fillText(seg.text, textStart, y + bh / 2);
      ctx.restore();
    }

    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = prevAlpha;
  }

  // ===== Import / Export =====

  exportAudacity(): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    return sorted.map(s => `${s.start.toFixed(6)}\t${s.end.toFixed(6)}\t${s.text}`).join('\n');
  }

  exportJSON(): string {
    return JSON.stringify(this.segments.map(s => ({
      start: s.start, end: s.end, text: s.text,
      speakerId: s.speakerId, category: s.category
    })), null, 2);
  }

  exportSRT(): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    return sorted.map((s, i) => {
      const startStr = this._formatSRTTime(s.start);
      const endStr = this._formatSRTTime(s.end);
      return `${i + 1}\n${startStr} --> ${endStr}\n${s.text}\n`;
    }).join('\n');
  }

  exportVTT(): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    const cues = sorted.map(s => {
      const startStr = this._formatVTTTime(s.start);
      const endStr = this._formatVTTTime(s.end);
      return `${startStr} --> ${endStr}\n${s.text}`;
    });
    return 'WEBVTT\n\n' + cues.join('\n\n');
  }

  exportSTM(filename: string = 'audio'): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    return sorted.map(s => {
      const speaker = s.speakerId
        ? this.speakerManager.getSpeakerName(s.speakerId)
        : 'unknown';
      return `${filename} 1 ${speaker} ${s.start.toFixed(2)} ${s.end.toFixed(2)} ${s.text}`;
    }).join('\n');
  }

  exportTSV(columns: string[]): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    const header = columns.join('\t');
    const rows = sorted.map(s => {
      return columns.map(col => {
        switch (col) {
          case 'start': return s.start.toFixed(6);
          case 'end': return s.end.toFixed(6);
          case 'speaker': return s.speakerId ? this.speakerManager.getSpeakerName(s.speakerId) : '';
          case 'text': return s.text;
          case 'category': return s.category;
          case 'duration': return (s.end - s.start).toFixed(6);
          default: return '';
        }
      }).join('\t');
    });
    return header + '\n' + rows.join('\n');
  }

  exportELAN(): string {
    const sorted = [...this.segments].sort((a, b) => a.start - b.start);
    const annotations = sorted.map((s, i) =>
      `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${i + 1}" TIME_SLOT_REF1="ts${i * 2 + 1}" TIME_SLOT_REF2="ts${i * 2 + 2}">
                <ANNOTATION_VALUE>${this._escapeXml(s.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`
    );
    const timeSlots = sorted.map((s, i) => {
      const startMs = Math.round(s.start * 1000);
      const endMs = Math.round(s.end * 1000);
      return `        <TIME_SLOT TIME_SLOT_ID="ts${i * 2 + 1}" TIME_VALUE="${startMs}"/>\n        <TIME_SLOT TIME_SLOT_ID="ts${i * 2 + 2}" TIME_VALUE="${endMs}"/>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds"/>
    <TIME_ORDER>
${timeSlots.join('\n')}
    </TIME_ORDER>
    <TIER LINGUISTIC_TYPE_REF="default-lt" TIER_ID="Segments">
${annotations.join('\n')}
    </TIER>
    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>`;
  }

  // ===== Import =====

  importAudacity(text: string): void {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const imported: Segment[] = [];
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const start = parseFloat(parts[0]);
        const end = parseFloat(parts[1]);
        const segText = parts[2] || '';
        if (!isNaN(start) && !isNaN(end)) {
          imported.push({
            id: uniqueId('seg'), start, end: Math.max(start + 0.01, end),
            text: segText, speakerId: null, category: 'speech'
          });
        }
      }
    }
    this.segments = imported;
    this.selectedSegmentId = null;
    this.selectedSegmentIds.clear();
  }

  importJSON(text: string): void {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('Expected array');
    this.segments = arr.map((item: Record<string, unknown>) => ({
      id: uniqueId('seg'),
      start: (item.start as number) || 0,
      end: (item.end as number) || (item.start as number) || 0,
      text: (item.text as string) || '',
      speakerId: (item.speakerId as string) || null,
      category: (item.category as string) || 'speech'
    }));
    this.selectedSegmentId = null;
    this.selectedSegmentIds.clear();
  }

  importSRT(text: string): void {
    const blocks = text.trim().split(/\n\n+/);
    const imported: Segment[] = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (match) {
          const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
          const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
          const segText = lines.slice(2).join('\n');
          imported.push({
            id: uniqueId('seg'), start, end,
            text: segText, speakerId: null, category: 'speech'
          });
        }
      }
    }
    this.segments = imported;
    this.selectedSegmentId = null;
    this.selectedSegmentIds.clear();
  }

  importVTT(text: string): void {
    const lines = text.replace(/^WEBVTT.*\n?/, '').trim().split(/\n\n+/);
    const imported: Segment[] = [];
    for (const block of lines) {
      const blockLines = block.split('\n');
      for (let i = 0; i < blockLines.length; i++) {
        const match = blockLines[i].match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (match) {
          const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
          const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
          const segText = blockLines.slice(i + 1).join('\n');
          imported.push({
            id: uniqueId('seg'), start, end,
            text: segText, speakerId: null, category: 'speech'
          });
          break;
        }
      }
    }
    this.segments = imported;
    this.selectedSegmentId = null;
    this.selectedSegmentIds.clear();
  }

  // ===== Time Format Helpers =====

  private _formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private _formatVTTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  private _escapeXml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
