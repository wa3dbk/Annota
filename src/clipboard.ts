// ===== Clipboard Manager =====
// Handles audio and label copy/cut/paste/duplicate operations

import { clamp } from './utils';
import { AudioEngine } from './audio-engine';
import { LabelTrack } from './label-track';
import type { Label } from './types';

interface ClipboardAudioData {
  channels: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
}

interface ClipboardLabelData {
  start: number;
  end: number;
  text: string;
  type: string;
  category: string;
  color: string | null;
}

export class Clipboard {
  _audioData: ClipboardAudioData | null = null;
  _labelData: ClipboardLabelData[] | null = null;

  get hasAudio(): boolean {
    return this._audioData != null;
  }

  get hasLabels(): boolean {
    return this._labelData != null && this._labelData.length > 0;
  }

  copyAudio(audioBuffer: AudioBuffer, startTime: number, endTime: number): void {
    if (!audioBuffer) return;
    const sr = audioBuffer.sampleRate;
    const numCh = audioBuffer.numberOfChannels;
    const s0 = clamp(Math.round(startTime * sr), 0, audioBuffer.length);
    const s1 = clamp(Math.round(endTime * sr), 0, audioBuffer.length);
    const len = s1 - s0;
    if (len <= 0) return;

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const src = audioBuffer.getChannelData(ch);
      const dst = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        dst[i] = src[s0 + i];
      }
      channels.push(dst);
    }

    this._audioData = {
      channels,
      sampleRate: sr,
      numberOfChannels: numCh,
      length: len
    };
  }

  cutAudio(audioEngine: AudioEngine, startTime: number, endTime: number): number {
    this.copyAudio(audioEngine.audioBuffer!, startTime, endTime);
    return audioEngine.deleteSegment(startTime, endTime);
  }

  pasteAudio(audioEngine: AudioEngine, insertTime: number): number {
    if (!this._audioData || !audioEngine.audioBuffer) return 0;
    const clip = this._audioData;
    const sr = audioEngine.sampleRate;
    const buf = audioEngine.audioBuffer;
    const numCh = buf.numberOfChannels;
    const insertSample = clamp(Math.round(insertTime * sr), 0, buf.length);
    const newLen = buf.length + clip.length;

    audioEngine._ensureContext();
    const newBuffer = audioEngine.audioContext!.createBuffer(numCh, newLen, sr);

    for (let ch = 0; ch < numCh; ch++) {
      const dst = newBuffer.getChannelData(ch);
      const src = buf.getChannelData(ch);

      for (let i = 0; i < insertSample; i++) {
        dst[i] = src[i];
      }

      const clipCh = ch < clip.numberOfChannels ? clip.channels[ch] : clip.channels[0];
      for (let i = 0; i < clip.length; i++) {
        dst[insertSample + i] = clipCh[i];
      }

      for (let i = insertSample; i < buf.length; i++) {
        dst[clip.length + i] = src[i];
      }
    }

    audioEngine.audioBuffer = newBuffer;
    audioEngine._emit('bufferChanged', newBuffer);
    return clip.length / sr;
  }

  duplicateAudio(audioEngine: AudioEngine, startTime: number, endTime: number): number {
    this.copyAudio(audioEngine.audioBuffer!, startTime, endTime);
    return this.pasteAudio(audioEngine, endTime);
  }

  copyLabels(labels: Label[]): void {
    if (!labels || labels.length === 0) return;
    this._labelData = labels.map(l => ({
      start: l.start,
      end: l.end,
      text: l.text,
      type: l.type,
      category: l.category || 'other',
      color: l.color || null
    }));
  }

  cutLabels(labelTrack: LabelTrack, labelIds: string[]): void {
    const labels = labelIds.map(id => labelTrack.getLabelById(id)).filter(Boolean) as Label[];
    this.copyLabels(labels);
    for (const id of labelIds) {
      labelTrack.removeLabel(id);
    }
  }

  pasteLabels(labelTrack: LabelTrack, insertTime: number): string[] {
    if (!this._labelData || this._labelData.length === 0) return [];

    const minStart = Math.min(...this._labelData.map(l => l.start));
    const offset = insertTime - minStart;

    const newIds: string[] = [];
    for (const l of this._labelData) {
      const newLabel = l.type === 'point'
        ? labelTrack.addPointLabel(l.start + offset, l.text)
        : labelTrack.addRegionLabel(l.start + offset, l.end + offset, l.text);
      if (newLabel.category !== undefined) {
        newLabel.category = l.category;
        newLabel.color = l.color;
      }
      newIds.push(newLabel.id);
    }
    return newIds;
  }
}
