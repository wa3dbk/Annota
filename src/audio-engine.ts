// ===== Audio Engine: Load, Decode, Play, Edit =====

import { clamp } from './utils';

type AudioEngineEvent = 'loaded' | 'play' | 'pause' | 'stop' | 'ended' | 'bufferChanged';
type AudioEngineListener = (data?: AudioBuffer) => void;

export class AudioEngine {
  audioContext: AudioContext | null = null;
  audioBuffer: AudioBuffer | null = null;
  originalBuffer: AudioBuffer | null = null;
  sourceNode: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;

  isPlaying: boolean = false;
  startTime: number = 0;
  startOffset: number = 0;
  playbackRate: number = 1.0;

  private _onEndedBound: () => void;
  private _listeners: Record<AudioEngineEvent, AudioEngineListener[]> = {
    loaded: [],
    play: [],
    pause: [],
    stop: [],
    ended: [],
    bufferChanged: []
  };

  constructor() {
    this._onEndedBound = this._onEnded.bind(this);
  }

  _ensureContext(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  async loadFile(file: File): Promise<AudioBuffer> {
    this._ensureContext();
    this.stop();
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    this.originalBuffer = this._cloneBuffer(this.audioBuffer);
    this._emit('loaded', this.audioBuffer);
    return this.audioBuffer;
  }

  async loadArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this._ensureContext();
    this.stop();
    this.audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    this.originalBuffer = this._cloneBuffer(this.audioBuffer);
    this._emit('loaded', this.audioBuffer);
    return this.audioBuffer;
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    this._ensureContext();
    const arrayBuffer = await file.arrayBuffer();
    return await this.audioContext!.decodeAudioData(arrayBuffer);
  }

  get sampleRate(): number {
    return this.audioBuffer ? this.audioBuffer.sampleRate : 0;
  }

  get duration(): number {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  get channels(): number {
    return this.audioBuffer ? this.audioBuffer.numberOfChannels : 0;
  }

  get totalSamples(): number {
    return this.audioBuffer ? this.audioBuffer.length : 0;
  }

  getChannelData(channel: number = 0): Float32Array {
    return this.audioBuffer ? this.audioBuffer.getChannelData(channel) : new Float32Array(0);
  }

  getMonoData(): Float32Array {
    if (!this.audioBuffer) return new Float32Array(0);
    if (this.audioBuffer.numberOfChannels === 1) {
      return this.audioBuffer.getChannelData(0);
    }
    const length = this.audioBuffer.length;
    const mono = new Float32Array(length);
    const numCh = this.audioBuffer.numberOfChannels;
    for (let ch = 0; ch < numCh; ch++) {
      const data = this.audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i];
      }
    }
    for (let i = 0; i < length; i++) {
      mono[i] /= numCh;
    }
    return mono;
  }

  get currentTime(): number {
    if (this.isPlaying) {
      return this.startOffset + (this.audioContext!.currentTime - this.startTime) * this.playbackRate;
    }
    return this.startOffset;
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = clamp(volume, 0, 1);
    }
  }

  play(fromTime: number | null = null): void {
    if (!this.audioBuffer) return;
    this._ensureContext();
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
    }
    const offset = fromTime != null ? fromTime : this.startOffset;
    this.sourceNode = this.audioContext!.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    this.sourceNode.connect(this.gainNode!);
    this.sourceNode.onended = this._onEndedBound;
    this.startOffset = clamp(offset, 0, this.duration);
    this.startTime = this.audioContext!.currentTime;
    this.sourceNode.start(0, this.startOffset);
    this.isPlaying = true;
    this._emit('play');
  }

  playRange(startTime: number, endTime: number): void {
    if (!this.audioBuffer) return;
    this._ensureContext();
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
    }
    this.sourceNode = this.audioContext!.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    this.sourceNode.connect(this.gainNode!);
    this.sourceNode.onended = this._onEndedBound;
    const duration = endTime - startTime;
    this.startOffset = startTime;
    this.startTime = this.audioContext!.currentTime;
    this.sourceNode.start(0, startTime, duration);
    this.isPlaying = true;
    this._emit('play');
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = clamp(rate, 0.25, 4);
    if (this.sourceNode && this.isPlaying) {
      this.sourceNode.playbackRate.value = this.playbackRate;
    }
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.startOffset = this.currentTime;
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this._emit('pause');
  }

  stop(resetTo: number = 0): void {
    if (this.sourceNode) {
      this.sourceNode.onended = null;
      this.sourceNode.stop();
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this.startOffset = resetTo;
    this._emit('stop');
  }

  seek(time: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.startOffset = clamp(time, 0, this.duration);
    if (wasPlaying) this.play();
  }

  deleteSegment(startTime: number, endTime: number): number {
    if (!this.audioBuffer) return 0;
    this.stop();

    const sr = this.audioBuffer.sampleRate;
    const numCh = this.audioBuffer.numberOfChannels;
    const startSample = Math.round(startTime * sr);
    const endSample = Math.round(endTime * sr);
    const totalLen = this.audioBuffer.length;

    const beforeLen = clamp(startSample, 0, totalLen);
    const afterStart = clamp(endSample, 0, totalLen);
    const afterLen = totalLen - afterStart;
    const newLen = beforeLen + afterLen;

    if (newLen <= 0) return 0;

    const newBuffer = this.audioContext!.createBuffer(numCh, newLen, sr);

    for (let ch = 0; ch < numCh; ch++) {
      const oldData = this.audioBuffer.getChannelData(ch);
      const newData = newBuffer.getChannelData(ch);
      for (let i = 0; i < beforeLen; i++) {
        newData[i] = oldData[i];
      }
      for (let i = 0; i < afterLen; i++) {
        newData[beforeLen + i] = oldData[afterStart + i];
      }
    }

    this.audioBuffer = newBuffer;
    this.startOffset = clamp(startTime, 0, newBuffer.duration);
    this._emit('bufferChanged', this.audioBuffer);
    return newBuffer.duration;
  }

  extractSegment(startTime: number, endTime: number): AudioBuffer | null {
    if (!this.audioBuffer) return null;
    this._ensureContext();
    const sr = this.audioBuffer.sampleRate;
    const numCh = this.audioBuffer.numberOfChannels;
    const startSample = clamp(Math.round(startTime * sr), 0, this.audioBuffer.length);
    const endSample = clamp(Math.round(endTime * sr), 0, this.audioBuffer.length);
    const len = endSample - startSample;
    if (len <= 0) return null;

    const segment = this.audioContext!.createBuffer(numCh, len, sr);
    for (let ch = 0; ch < numCh; ch++) {
      const src = this.audioBuffer.getChannelData(ch);
      const dst = segment.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        dst[i] = src[startSample + i];
      }
    }
    return segment;
  }

  concatenate(otherBuffer: AudioBuffer): void {
    if (!this.audioBuffer) {
      this.audioBuffer = otherBuffer;
      this._emit('bufferChanged', this.audioBuffer);
      return;
    }
    this.stop();
    this._ensureContext();

    const sr = this.audioBuffer.sampleRate;
    const numCh = Math.max(this.audioBuffer.numberOfChannels, otherBuffer.numberOfChannels);
    const newLen = this.audioBuffer.length + otherBuffer.length;
    const newBuffer = this.audioContext!.createBuffer(numCh, newLen, sr);

    for (let ch = 0; ch < numCh; ch++) {
      const dst = newBuffer.getChannelData(ch);
      if (ch < this.audioBuffer.numberOfChannels) {
        const src = this.audioBuffer.getChannelData(ch);
        dst.set(src, 0);
      }
      if (ch < otherBuffer.numberOfChannels) {
        const src = otherBuffer.getChannelData(ch);
        dst.set(src, this.audioBuffer.length);
      }
    }

    this.audioBuffer = newBuffer;
    this._emit('bufferChanged', this.audioBuffer);
  }

  setBuffer(buffer: AudioBuffer): void {
    this.stop();
    this.audioBuffer = buffer;
    this._emit('bufferChanged', this.audioBuffer);
  }

  static encodeWAV(audioBuffer: AudioBuffer): Blob {
    const numCh = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numCh * bytesPerSample;
    const numSamples = audioBuffer.length;
    const dataSize = numSamples * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(view: DataView, offset: number, str: string): void {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        let sample = channels[ch][i];
        sample = Math.max(-1, Math.min(1, sample));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  resetToOriginal(): boolean {
    if (!this.originalBuffer) return false;
    this.stop();
    this._ensureContext();
    this.audioBuffer = this._cloneBuffer(this.originalBuffer)!;
    this._emit('bufferChanged', this.audioBuffer);
    return true;
  }

  get hasOriginal(): boolean {
    return this.originalBuffer != null;
  }

  insertBuffer(insertBuffer: AudioBuffer, insertTime: number): void {
    if (!this.audioBuffer || !insertBuffer) return;
    this._ensureContext();
    this.stop();

    const sr = this.audioBuffer.sampleRate;
    const numCh = this.audioBuffer.numberOfChannels;
    const insertSample = clamp(Math.round(insertTime * sr), 0, this.audioBuffer.length);
    const newLen = this.audioBuffer.length + insertBuffer.length;

    const newBuffer = this.audioContext!.createBuffer(numCh, newLen, sr);

    for (let ch = 0; ch < numCh; ch++) {
      const dst = newBuffer.getChannelData(ch);
      const src = this.audioBuffer.getChannelData(ch);

      for (let i = 0; i < insertSample; i++) {
        dst[i] = src[i];
      }

      const insCh = ch < insertBuffer.numberOfChannels
        ? insertBuffer.getChannelData(ch)
        : insertBuffer.getChannelData(0);
      for (let i = 0; i < insertBuffer.length; i++) {
        dst[insertSample + i] = insCh[i];
      }

      for (let i = insertSample; i < this.audioBuffer.length; i++) {
        dst[insertBuffer.length + i] = src[i];
      }
    }

    this.audioBuffer = newBuffer;
    this._emit('bufferChanged', newBuffer);
  }

  _cloneBuffer(buf: AudioBuffer | null): AudioBuffer | null {
    if (!buf) return null;
    this._ensureContext();
    const newBuf = this.audioContext!.createBuffer(
      buf.numberOfChannels, buf.length, buf.sampleRate
    );
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      newBuf.getChannelData(ch).set(buf.getChannelData(ch));
    }
    return newBuf;
  }

  private _onEnded(): void {
    this.isPlaying = false;
    this.startOffset = 0;
    this.sourceNode = null;
    this._emit('ended');
  }

  on(event: AudioEngineEvent, callback: AudioEngineListener): void {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  _emit(event: AudioEngineEvent, data?: AudioBuffer): void {
    const cbs = this._listeners[event];
    if (cbs) {
      for (const cb of cbs) cb(data);
    }
  }
}
