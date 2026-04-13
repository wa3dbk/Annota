// ===== Undo/Redo Manager =====
// Snapshots audio buffer + label state before destructive actions

import type { Label, SerializedAudioBuffer } from './types';

interface UndoEntry {
  name: string;
  audioBuffer: SerializedAudioBuffer | null;
  labels: Label[];
  cursorTime: number;
}

interface UndoableState {
  audioBuffer: AudioBuffer | null;
  labels: Label[];
  cursorTime: number;
}

export class UndoManager {
  maxHistory: number;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  private _listeners: (() => void)[];

  constructor(maxHistory: number = 30) {
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
    this._listeners = [];
  }

  push(actionName: string, state: UndoableState): void {
    this.undoStack.push({
      name: actionName,
      audioBuffer: this._cloneBuffer(state.audioBuffer),
      labels: JSON.parse(JSON.stringify(state.labels)),
      cursorTime: state.cursorTime
    });
    while (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this._notify();
  }

  undo(currentState: UndoableState): UndoEntry | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push({
      name: 'redo',
      audioBuffer: this._cloneBuffer(currentState.audioBuffer),
      labels: JSON.parse(JSON.stringify(currentState.labels)),
      cursorTime: currentState.cursorTime
    });
    const snapshot = this.undoStack.pop()!;
    this._notify();
    return snapshot;
  }

  redo(currentState: UndoableState): UndoEntry | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push({
      name: 'redo-reverse',
      audioBuffer: this._cloneBuffer(currentState.audioBuffer),
      labels: JSON.parse(JSON.stringify(currentState.labels)),
      cursorTime: currentState.cursorTime
    });
    const snapshot = this.redoStack.pop()!;
    this._notify();
    return snapshot;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoName(): string { return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].name : ''; }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }

  onChange(cb: () => void): void { this._listeners.push(cb); }
  private _notify(): void { for (const cb of this._listeners) cb(); }

  private _cloneBuffer(buf: AudioBuffer | null): SerializedAudioBuffer | null {
    if (!buf) return null;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      channels.push(new Float32Array(buf.getChannelData(ch)));
    }
    return {
      sampleRate: buf.sampleRate,
      numberOfChannels: buf.numberOfChannels,
      length: buf.length,
      channels: channels
    };
  }
}
