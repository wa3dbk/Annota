// ===== Shared Type Definitions =====

// Serialized audio data (for clipboard, undo, project save — no AudioContext needed)
export interface SerializedAudioBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  channels: Float32Array[];
}

// Label data structure
export interface Label {
  id: string;
  start: number;
  end: number;
  text: string;
  type: 'point' | 'region';
  category: string;
  color: string | null;
}

// Undo snapshot
export interface UndoSnapshot {
  audioBuffer: SerializedAudioBuffer | null;
  labels: Label[];
  cursorTime: number;
}

// Selection range
export interface SelectionRange {
  start: number;
  end: number;
}

// Menu item definition
export interface MenuItem {
  label?: string;
  icon?: string;
  action?: () => void;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuItem[];
}

export interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

// EQ band definition
export interface EQBand {
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass';
  frequency: number;
  gain: number;
  Q: number;
}

// Project save data
export interface ProjectSaveData {
  timestamp: number;
  labels: Label[];
  viewport: { samplesPerPixel: number; scrollSamples: number };
  cursorTime: number;
  viewMode: string;
  audio: SerializedAudioBuffer | null;
  extraTracks: SerializedTrack[];
}

export interface SerializedTrack {
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: number;
  audio: SerializedAudioBuffer | null;
}

// Theme colors for canvas rendering
export interface ThemeColors {
  waveformFill: string;
  waveformStroke: string;
  waveformCenter: string;
  selectionFill: string;
  selectionBorder: string;
  cursor: string;
  timelineBg: string;
  timelineText: string;
  timelineTick: string;
  timelineTickMajor: string;
  labelBg: string;
  labelRegionFill: string;
  labelBorder: string;
  labelBadgeBg: string;
  labelBadgeBgSelected: string;
  labelText: string;
  axisBg: string;
  axisTick: string;
  axisText: string;
  canvasBg: string;
  channelSep: string;
}

// Colormap function type
export type ColorMapFn = (t: number) => [number, number, number];

// Window function types
export type WindowType = 'hann' | 'hamming' | 'blackman' | 'rectangular';

// Fade curve types
export type FadeCurve = 'linear' | 'exponential' | 'sCurve';

// View mode
export type ViewMode = 'waveform' | 'spectrogram';

// Video display mode
export type VideoDisplayMode = 'floating' | 'inline' | 'hidden';

// Worker message types (inbound to worker)
export interface WorkerSTFTMessage {
  type: 'computeSTFT';
  id: number;
  samples: Float32Array;
  fftSize: number;
  hopSize: number;
  windowType: string;
  minDb: number;
}

export interface WorkerSTFTTileMessage {
  type: 'computeSTFTTile';
  id: number;
  samples: Float32Array;
  fftSize: number;
  hopSize: number;
  windowType: string;
  minDb: number;
  tileStart: number;
  tileEnd: number;
  tileWidth: number;
  tileHeight: number;
  colorMap: string;
}

export interface WorkerPeakMipmapMessage {
  type: 'computePeakMipmap';
  id: number;
  channelData: Float32Array;
  channel: number;
}

export interface WorkerEncodeWAVMessage {
  type: 'encodeWAV';
  id: number;
  channels: Float32Array[];
  sampleRate: number;
  bitsPerSample: number;
}

export type WorkerInMessage =
  | WorkerSTFTMessage
  | WorkerSTFTTileMessage
  | WorkerPeakMipmapMessage
  | WorkerEncodeWAVMessage;

// Worker result messages (outbound from worker)
export interface WorkerSTFTResult {
  type: 'stftResult';
  id: number;
  imageData: ImageData;
  width: number;
  height: number;
}

export interface WorkerSTFTProgress {
  type: 'stftProgress';
  id: number;
  progress: number;
}

export interface WorkerSTFTTileResult {
  type: 'stftTileResult';
  id: number;
  imageData: ImageData;
  tileStart: number;
  tileEnd: number;
}

export interface WorkerPeakMipmapResult {
  type: 'peakMipmapResult';
  id: number;
  levels: Record<number, { mins: Float32Array; maxs: Float32Array }>;
  channel: number;
}

export interface WorkerWAVResult {
  type: 'wavResult';
  id: number;
  blob: Blob;
}

export interface WorkerError {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerOutMessage =
  | WorkerSTFTResult
  | WorkerSTFTProgress
  | WorkerSTFTTileResult
  | WorkerPeakMipmapResult
  | WorkerWAVResult
  | WorkerError;

// Extra track in multi-track view
export interface ExtraTrack {
  id: number;
  name: string;
  engine: import('./audio-engine').AudioEngine;
  waveform: import('./waveform').WaveformRenderer;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  row: HTMLElement;
  muted: boolean;
  solo: boolean;
  pan: number;
  volume: number;
  panNode: StereoPannerNode | null;
}

// Category definition for labels
export interface CategoryDefinition {
  label: string;
  color: string;
}
