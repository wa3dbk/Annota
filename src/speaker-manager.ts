// ===== Speaker Manager =====
// CRUD operations for speakers with color palette and merge support

import { uniqueId } from './utils';
import type { Speaker, Segment } from './types';

const SPEAKER_COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
];

export class SpeakerManager {
  speakers: Speaker[] = [];
  enabled: boolean = true;
  private _colorIndex: number = 0;
  private _listeners: (() => void)[] = [];

  addSpeaker(name: string): Speaker {
    const speaker: Speaker = {
      id: uniqueId('spk'),
      name,
      color: SPEAKER_COLORS[this._colorIndex % SPEAKER_COLORS.length]
    };
    this._colorIndex++;
    this.speakers.push(speaker);
    this._notify();
    return speaker;
  }

  removeSpeaker(id: string, segments: Segment[]): void {
    this.speakers = this.speakers.filter(s => s.id !== id);
    for (const seg of segments) {
      if (seg.speakerId === id) seg.speakerId = null;
    }
    this._notify();
  }

  renameSpeaker(id: string, name: string): void {
    const speaker = this.getSpeakerById(id);
    if (speaker) {
      speaker.name = name;
      this._notify();
    }
  }

  mergeSpeakers(sourceId: string, targetId: string, segments: Segment[]): void {
    if (sourceId === targetId) return;
    for (const seg of segments) {
      if (seg.speakerId === sourceId) seg.speakerId = targetId;
    }
    this.speakers = this.speakers.filter(s => s.id !== sourceId);
    this._notify();
  }

  recolorSpeaker(id: string, color: string): void {
    const speaker = this.getSpeakerById(id);
    if (speaker) {
      speaker.color = color;
      this._notify();
    }
  }

  getSpeakerById(id: string): Speaker | undefined {
    return this.speakers.find(s => s.id === id);
  }

  getSpeakerColor(id: string): string {
    const speaker = this.getSpeakerById(id);
    return speaker ? speaker.color : '#6b7280';
  }

  getSpeakerName(id: string): string {
    const speaker = this.getSpeakerById(id);
    return speaker ? speaker.name : 'Unknown';
  }

  getSegmentCount(id: string, segments: Segment[]): number {
    return segments.filter(s => s.speakerId === id).length;
  }

  onChange(callback: () => void): void {
    this._listeners.push(callback);
  }

  private _notify(): void {
    for (const cb of this._listeners) cb();
  }
}
