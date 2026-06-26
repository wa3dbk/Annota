// ===== Clipboard Manager =====
// Handles audio and segment copy/cut/paste/duplicate operations

import { clamp } from './utils';
import { AudioEngine } from './audio-engine';
import { SegmentTrack } from './segment-track';
import type { Segment } from './types';

interface ClipboardAudioData {
  channels: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
}

interface ClipboardSegmentData {
  start: number;
  end: number;
  text: string;
  category: string;
  speakerId: string | null;
}

export class Clipboard {
  _audioData: ClipboardAudioData | null = null;
  _segmentData: ClipboardSegmentData[] | null = null;

  get hasAudio(): boolean {
    return this._audioData != null;
  }

  get hasSegments(): boolean {
    return this._segmentData != null && this._segmentData.length > 0;
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

  copySegments(segments: Segment[]): void {
    if (!segments || segments.length === 0) return;
    this._segmentData = segments.map(s => ({
      start: s.start,
      end: s.end,
      text: s.text,
      category: s.category,
      speakerId: s.speakerId
    }));
  }

  cutSegments(segmentTrack: SegmentTrack, segmentIds: string[]): void {
    const segments = segmentIds.map(id => segmentTrack.getSegmentById(id)).filter(Boolean) as Segment[];
    this.copySegments(segments);
    for (const id of segmentIds) {
      segmentTrack.removeSegment(id);
    }
  }

  pasteSegments(segmentTrack: SegmentTrack, insertTime: number): string[] {
    if (!this._segmentData || this._segmentData.length === 0) return [];

    const minStart = Math.min(...this._segmentData.map(s => s.start));
    const offset = insertTime - minStart;

    const newIds: string[] = [];
    for (const s of this._segmentData) {
      const newSegment = segmentTrack.addSegment(s.start + offset, s.end + offset, s.text);
      newSegment.category = s.category;
      newSegment.speakerId = s.speakerId;
      newIds.push(newSegment.id);
    }
    return newIds;
  }
}
