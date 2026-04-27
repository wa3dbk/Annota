// ===== App: Entry Point =====

import { setupHiDPICanvas, clamp, formatTime, getElementSize, debounce, uniqueId, ColorMaps } from '../utils';
import { fft, createWindow, WindowFunctions } from '../fft';
import { Viewport } from '../viewport';
import { AudioEngine } from '../audio-engine';
import { WaveformRenderer } from '../waveform';
import { SpectrogramRenderer } from '../spectrogram';
import { TimeRuler } from '../timeline';
import { SelectionManager } from '../selection';
import { LabelTrack } from '../label-track';
import { UndoManager } from '../undo';
import { ProjectManager } from '../project';
import { Clipboard } from '../clipboard';
import { AudioEffects } from '../effects';
import { ParametricEQ } from '../effects/eq';
import { Compressor } from '../effects/compressor';
import { Reverb } from '../effects/reverb';
import { NoiseReduction } from '../effects/noise-reduction';
import { TimeStretch } from '../effects/time-stretch';
import { Resampler } from '../resampler';
import { Filterbank } from '../analysis/filterbank';
import { MFCC } from '../analysis/mfcc';
import { Icons } from '../ui/icons';
import { ContextMenu } from '../ui/context-menu';
import { MenuBar } from '../ui/menu-bar';
import { ThemeManager } from '../ui/theme';
import { AnalysisPanel } from '../ui/analysis-panel';
import { getDOMRefs } from './dom-refs';
import type { DOMRefs } from './dom-refs';
import type { EQBand, ViewMode, Label, MenuItem, VideoDisplayMode } from '../types';

// ===== DOM Elements =====
const dom = getDOMRefs();

// ===== Core Systems =====
const viewport = new Viewport();
const audioEngine = new AudioEngine();
const waveformRenderer = new WaveformRenderer(dom.waveformCanvas, viewport, audioEngine);
const spectrogramRenderer = new SpectrogramRenderer(dom.spectrogramCanvas, viewport, audioEngine);
const timeRuler = new TimeRuler(dom.timelineCanvas, viewport);
const selectionManager = new SelectionManager(dom.selectionCanvas, dom.cursorCanvas, viewport);
const labelTrack = new LabelTrack(dom.labelCanvas, dom.labelEditor, viewport);
const undoManager = new UndoManager();
const projectManager = new ProjectManager();
const clipboard = new Clipboard();
const contextMenu = new ContextMenu();
const themeManager = new ThemeManager();
const menuBar = new MenuBar(dom.menuBarContainer);
const analysisPanel = new AnalysisPanel();

// ===== Additional tracks =====
interface ExtraTrack {
  id: number;
  name: string;
  engine: AudioEngine;
  waveform: WaveformRenderer;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  row: HTMLElement;
  muted: boolean;
  solo: boolean;
  pan: number;
  volume: number;
  panNode: StereoPannerNode | null;
}

const extraTracks: ExtraTrack[] = [];
let trackIdCounter = 0;

// ===== State =====
let viewMode: ViewMode = 'waveform';
let isLoaded = false;
let animFrameId: number | null = null;
let snapEnabled = false;
let mainTrackMuted = false;
let mainTrackSolo = false;
let _fadeType: string = 'in';
let _noiseProfile: Float32Array | null = null;
let _eqBands: EQBand[] = ParametricEQ.defaultBands();

// Video state
let videoDisplayMode: VideoDisplayMode = 'floating';
let hasVideoSource: boolean = false;
let isYouTubeMode: boolean = false;
let youtubePlayer: any = null;
let youtubeApiLoaded: boolean = false;

// ===== Theme Integration =====
function applyThemeColors(): void {
  const colors = themeManager.colors;
  labelTrack.setThemeColors(colors);
  waveformRenderer.themeColors = colors;
  spectrogramRenderer.themeColors = colors;
  timeRuler.themeColors = colors;
  selectionManager.themeColors = colors;
  for (const t of extraTracks) {
    t.waveform.themeColors = colors;
  }
}
applyThemeColors();
themeManager.onChange(() => {
  applyThemeColors();
  redrawAll();
});

// ===== Snap to grid =====
function getSnapInterval(): number {
  const visDur = viewport.visibleDuration;
  if (visDur < 1) return 0.01;
  if (visDur < 5) return 0.05;
  if (visDur < 15) return 0.1;
  if (visDur < 60) return 0.5;
  if (visDur < 300) return 1;
  return 5;
}

function snapTime(time: number): number {
  if (!snapEnabled) return time;
  const interval = getSnapInterval();
  return Math.round(time / interval) * interval;
}

// ===== Track Resize Handles =====
function addResizeHandle(row: HTMLElement): void {
  const handle = document.createElement('div');
  handle.className = 'track-resize-handle';
  row.appendChild(handle);

  let startY = 0;
  let startHeight = 0;

  const onMouseMove = (e: MouseEvent) => {
    const newHeight = Math.max(80, startHeight + (e.clientY - startY));
    row.style.flex = 'none';
    row.style.height = newHeight + 'px';
    updateSizes();
  };

  const onMouseUp = () => {
    handle.classList.remove('active');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = row.getBoundingClientRect().height;
    handle.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// Add resize handles to the main track and label rows
addResizeHandle(document.getElementById('track-row')!);
addResizeHandle(document.getElementById('label-row')!);

// ===== Sizing =====
function updateSizes(): void {
  const trackSize = getElementSize(dom.trackContainer);
  const timelineSize = getElementSize(dom.timelineContainer);
  const labelSize = getElementSize(dom.labelContainer);

  viewport.setCanvasSize(trackSize.width, trackSize.height);

  timeRuler.resize(timelineSize.width, timelineSize.height);
  waveformRenderer.resize(trackSize.width, trackSize.height);
  spectrogramRenderer.resize(trackSize.width, trackSize.height);
  selectionManager.resize(trackSize.width, trackSize.height);
  labelTrack.resize(labelSize.width, labelSize.height);

  if (dom.dbScaleCanvas) {
    setupHiDPICanvas(dom.dbScaleCanvas, 40, trackSize.height);
  }
  if (dom.freqScaleCanvas) {
    setupHiDPICanvas(dom.freqScaleCanvas, 40, trackSize.height);
  }

  for (const t of extraTracks) {
    const sz = getElementSize(t.container);
    t.waveform.resize(sz.width, sz.height);
  }

  redrawAll();
}

// ===== Rendering =====
function redrawAll(): void {
  timeRuler.draw();

  if (viewMode === 'waveform') {
    dom.waveformCanvas.style.display = '';
    dom.spectrogramCanvas.style.display = 'none';
    waveformRenderer.draw();
  } else {
    dom.waveformCanvas.style.display = 'none';
    dom.spectrogramCanvas.style.display = '';
    spectrogramRenderer.draw();
  }

  drawAxisOverlays();
  selectionManager.drawSelection();
  selectionManager.drawCursor();
  labelTrack.draw();

  for (const t of extraTracks) {
    t.waveform.draw();
  }

  updateScrollbar();
  updateStatusBar();
  updateEditButtons();
  updateUndoButtons();
}

function drawAxisOverlays(): void {
  if (!isLoaded) return;

  if (viewMode === 'waveform') {
    dom.dbScaleCanvas.style.display = '';
    dom.freqScaleCanvas.style.display = 'none';
    const dbCtx = dom.dbScaleCanvas.getContext('2d')!;
    const trackSize = getElementSize(dom.trackContainer);
    waveformRenderer.drawDbScale(dbCtx, 40, trackSize.height);
  } else {
    dom.dbScaleCanvas.style.display = 'none';
    dom.freqScaleCanvas.style.display = '';
    const freqCtx = dom.freqScaleCanvas.getContext('2d')!;
    const trackSize = getElementSize(dom.trackContainer);
    spectrogramRenderer.drawFreqScale(freqCtx, 40, trackSize.height);
  }
}

// ===== Animation Loop =====
function startAnimLoop(): void {
  if (animFrameId) return;
  const tick = () => {
    if (isYouTubeMode) {
      // YouTube mode: YouTube player is the source of truth for time
      ytAnimTick();
      return;
    }
    if (audioEngine.isPlaying) {
      const t = audioEngine.currentTime;
      // Sync video playback
      if (hasVideoSource && dom.videoElement.readyState >= 2) {
        const drift = Math.abs(dom.videoElement.currentTime - t);
        if (drift > 0.15) dom.videoElement.currentTime = t;
        if (dom.videoElement.paused) dom.videoElement.play().catch(() => {});
      }
      selectionManager.setCursor(t);
      selectionManager.drawCursor();
      updateToolbarTime(t);
      viewport.scrollToTime(t);
      timeRuler.draw();
      if (viewMode === 'waveform') waveformRenderer.draw();
      else spectrogramRenderer.draw();
      selectionManager.drawSelection();
      labelTrack.draw();
      for (const t2 of extraTracks) t2.waveform.draw();
      updateScrollbar();
      updateStatusBar();
      animFrameId = requestAnimationFrame(tick);
    } else {
      animFrameId = null;
      selectionManager.drawCursor();
      updateToolbarTime(selectionManager.cursorTime);
      updatePlayPauseButtons();
    }
  };
  animFrameId = requestAnimationFrame(tick);
}

// YouTube-specific animation loop: polls the YT player for current time
let ytAnimId: number | null = null;

function startYouTubeAnimLoop(): void {
  if (ytAnimId) return;
  ytAnimTick();
}

function stopYouTubeAnimLoop(): void {
  if (ytAnimId) {
    cancelAnimationFrame(ytAnimId);
    ytAnimId = null;
  }
}

function ytAnimTick(): void {
  if (!isYouTubeMode || !youtubePlayer || !youtubePlayer.getPlayerState) {
    ytAnimId = null;
    return;
  }
  const state = youtubePlayer.getPlayerState();
  // YT.PlayerState: PLAYING=1, PAUSED=2, BUFFERING=3, ENDED=0
  const isPlaying = state === 1 || state === 3;

  const t = youtubePlayer.getCurrentTime() || 0;
  selectionManager.setCursor(t);
  selectionManager.drawCursor();
  updateToolbarTime(t);

  if (isPlaying) {
    viewport.scrollToTime(t);
  }

  timeRuler.draw();
  if (viewMode === 'waveform') waveformRenderer.draw();
  else spectrogramRenderer.draw();
  selectionManager.drawSelection();
  labelTrack.draw();
  updateScrollbar();
  updateStatusBar();

  // Update play/pause button state to reflect YT player
  if (isPlaying) {
    dom.btnPlay.style.display = 'none';
    dom.btnPause.style.display = '';
    dom.btnPause.disabled = false;
  } else {
    dom.btnPlay.style.display = '';
    dom.btnPause.style.display = 'none';
    dom.btnPlay.disabled = false;
  }

  // Keep looping as long as we're in YouTube mode
  ytAnimId = requestAnimationFrame(ytAnimTick);
}

function stopAnimLoop(): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  stopYouTubeAnimLoop();
}

// ===== UI Updates =====
function enableControls(): void {
  dom.btnPlay.disabled = false;
  dom.btnStop.disabled = false;
  dom.btnZoomIn.disabled = false;
  dom.btnZoomOut.disabled = false;
  dom.btnZoomFit.disabled = false;
  dom.viewModeSelect.disabled = false;
}

function updateEditButtons(): void {
  const hasSel = selectionManager.hasSelection;
  dom.btnDeleteSegment.disabled = !hasSel || !isLoaded;
  dom.btnCut.disabled = !hasSel || !isLoaded;
  dom.btnCopy.disabled = !hasSel || !isLoaded;
  dom.btnPaste.disabled = !clipboard.hasAudio || !isLoaded;
}

function updateUndoButtons(): void {
  dom.btnUndo.disabled = !undoManager.canUndo;
  dom.btnRedo.disabled = !undoManager.canRedo;
}

function updatePlayPauseButtons(): void {
  if (audioEngine.isPlaying) {
    dom.btnPlay.style.display = 'none';
    dom.btnPause.style.display = '';
    dom.btnPause.disabled = false;
  } else {
    dom.btnPlay.style.display = '';
    dom.btnPause.style.display = 'none';
    dom.btnPlay.disabled = false;
  }
}

function updateToolbarTime(t: number): void {
  dom.toolbarTime.textContent = formatTime(t, 2);
}

function updateStatusBar(): void {
  if (!isLoaded) return;
  dom.statusRate.textContent = `Rate: ${audioEngine.sampleRate} Hz`;
  dom.statusChannels.textContent = `Ch: ${audioEngine.channels}`;
  dom.statusDuration.textContent = `Dur: ${formatTime(audioEngine.duration, 1)}`;

  const sel = selectionManager.selectionRange;
  if (sel) {
    const dur = sel.end - sel.start;
    dom.statusSelection.textContent = `Sel: ${formatTime(sel.start, 2)} \u2192 ${formatTime(sel.end, 2)} (${formatTime(dur, 2)})`;
  } else {
    dom.statusSelection.textContent = 'Sel: --';
  }

  dom.statusCursor.textContent = `Cur: ${formatTime(selectionManager.cursorTime, 3)}`;
  const zoomLevel = (viewport.sampleRate / viewport.samplesPerPixel).toFixed(0);
  dom.statusZoom.textContent = `Zoom: ${zoomLevel} px/s`;
}

function updateScrollbar(): void {
  const frac = viewport.scrollFraction;
  const visFrac = viewport.visibleFraction;
  const thumbWidth = Math.max(30, visFrac * dom.scrollbarTrack.offsetWidth);
  const maxLeft = dom.scrollbarTrack.offsetWidth - thumbWidth;
  dom.scrollbarThumb.style.width = thumbWidth + 'px';
  dom.scrollbarThumb.style.left = (frac * maxLeft) + 'px';
}

function updateTrackMeta(): void {
  dom.trackMeta.innerHTML = `
    <span>${audioEngine.sampleRate} Hz</span>
    <span>${audioEngine.channels}ch \u00b7 ${formatTime(audioEngine.duration, 1)}</span>
  `;
}

function showLoading(text: string): void {
  let overlay = dom.trackContainer.querySelector('.loading-overlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `<div class="loading-spinner"></div><span class="loading-text">${text}</span>`;
    dom.trackContainer.appendChild(overlay);
  } else {
    overlay.querySelector('.loading-text')!.textContent = text;
    overlay.style.display = 'flex';
  }
}

function hideLoading(): void {
  const overlay = dom.trackContainer.querySelector('.loading-overlay') as HTMLElement | null;
  if (overlay) overlay.style.display = 'none';
}

// ===== Undo/Redo Helpers =====
function captureUndoState(actionName: string): void {
  undoManager.push(actionName, {
    audioBuffer: audioEngine.audioBuffer,
    labels: labelTrack.labels,
    cursorTime: selectionManager.cursorTime
  });
}

function restoreFromSnapshot(snapshot: any): void {
  if (!snapshot) return;
  const buf = ProjectManager.reconstructBuffer(audioEngine.audioContext!, snapshot.audioBuffer);
  if (buf) {
    audioEngine.audioBuffer = buf;
  }
  labelTrack.labels = snapshot.labels.map((l: Label) => ({ ...l }));
  selectionManager.setCursor(snapshot.cursorTime);
  selectionManager.clearSelection();
  onBufferChanged(true);
}

undoManager.onChange(() => updateUndoButtons());

// ===== File Loading =====
async function loadAudioFile(file: File): Promise<void> {
  showLoading('Decoding audio...');
  dom.dropZone.classList.add('hidden');
  cleanupYouTubePlayer();
  cleanupVideoSource();

  try {
    await audioEngine.loadFile(file);
    onBufferReady();
    hideLoading();
    await computeSpectrogram();
  } catch (err: any) {
    hideLoading();
    dom.dropZone.classList.remove('hidden');
    console.error('Failed to load audio:', err);
    alert('Failed to load audio file: ' + err.message);
  }
}

function onBufferReady(): void {
  viewport.setAudioParams(audioEngine.sampleRate, audioEngine.totalSamples);
  viewport.zoomFit();
  waveformRenderer.clearCache();
  waveformRenderer.buildMipmaps();
  spectrogramRenderer.clear();
  updateTrackMeta();
  isLoaded = true;
  undoManager.clear();
  enableControls();
  redrawAll();
  projectManager.startAutoSave(() => getProjectState(), 30000);
}

async function computeSpectrogram(): Promise<void> {
  showLoading('Computing spectrogram...');
  await spectrogramRenderer.compute((progress: number) => {
    const pct = Math.round(progress * 100);
    const el = dom.trackContainer.querySelector('.loading-text');
    if (el) el.textContent = `Computing spectrogram... ${pct}%`;
  });
  hideLoading();
  if (viewMode === 'spectrogram') {
    spectrogramRenderer.draw();
  }
}

// ===== Video / URL / YouTube Loading =====

function cleanupVideoSource(): void {
  dom.videoElement.src = '';
  dom.videoElement.load();
  hasVideoSource = false;
  hideVideoPanel();
}

function cleanupYouTubePlayer(): void {
  stopYouTubeAnimLoop();
  if (youtubePlayer) {
    try { youtubePlayer.destroy(); } catch (_) { /* ignore */ }
    youtubePlayer = null;
  }
  isYouTubeMode = false;
  const ytDiv = document.getElementById('yt-player-div');
  if (ytDiv) ytDiv.remove();
  dom.videoElement.style.display = '';
}

async function loadVideoFile(file: File): Promise<void> {
  showLoading('Loading video...');
  dom.dropZone.classList.add('hidden');
  cleanupYouTubePlayer();

  try {
    const objectUrl = URL.createObjectURL(file);
    dom.videoElement.src = objectUrl;

    const arrayBuffer = await file.arrayBuffer();
    await audioEngine.loadArrayBuffer(arrayBuffer);

    hasVideoSource = true;
    isYouTubeMode = false;
    onBufferReady();
    hideLoading();
    showVideoPanel();
    await computeSpectrogram();
  } catch (err: any) {
    hideLoading();
    dom.dropZone.classList.remove('hidden');
    console.error('Failed to load video:', err);
    alert('Failed to load video file: ' + err.message);
  }
}

async function loadFromURL(url: string): Promise<void> {
  showLoading('Fetching from URL...');
  dom.dropZone.classList.add('hidden');
  cleanupYouTubePlayer();
  cleanupVideoSource();

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const isVideo = contentType.startsWith('video/') || /\.(mp4|webm|ogv|mov)(\?|$)/i.test(url);

    // Stream download with progress reporting
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    let arrayBuffer: ArrayBuffer;

    if (contentLength > 0 && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const pct = Math.round((received / contentLength) * 100);
        const sizeMB = (received / 1048576).toFixed(1);
        const totalMB = (contentLength / 1048576).toFixed(1);
        const el = dom.trackContainer.querySelector('.loading-text');
        if (el) el.textContent = `Downloading... ${pct}% (${sizeMB} / ${totalMB} MB)`;
      }

      const combined = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      arrayBuffer = combined.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    showLoading('Decoding audio...');

    if (isVideo) {
      const blob = new Blob([arrayBuffer], { type: contentType || 'video/mp4' });
      dom.videoElement.src = URL.createObjectURL(blob);
      hasVideoSource = true;
    }

    await audioEngine.loadArrayBuffer(arrayBuffer);
    onBufferReady();
    hideLoading();

    if (isVideo) showVideoPanel();
    await computeSpectrogram();
  } catch (err: any) {
    hideLoading();
    dom.dropZone.classList.remove('hidden');
    console.error('Failed to load from URL:', err);

    if (err.message.includes('Failed to fetch') || err.name === 'TypeError') {
      alert('Failed to load from URL. This may be due to CORS restrictions on the remote server.');
    } else {
      alert('Failed to load from URL: ' + err.message);
    }
  }
}

// ===== Video Panel Management =====

function showVideoPanel(): void {
  if (videoDisplayMode === 'floating' || videoDisplayMode === 'hidden') {
    videoDisplayMode = 'floating';
    dom.videoPanel.style.display = 'flex';
    removeVideoInline();
  } else if (videoDisplayMode === 'inline') {
    dom.videoPanel.style.display = 'none';
    showVideoInline();
  }
}

function hideVideoPanel(): void {
  dom.videoPanel.style.display = 'none';
  removeVideoInline();
}

function toggleVideoDisplayMode(): void {
  if (videoDisplayMode === 'floating') {
    videoDisplayMode = 'inline';
    dom.videoPanel.style.display = 'none';
    showVideoInline();
  } else if (videoDisplayMode === 'inline') {
    videoDisplayMode = 'hidden';
    removeVideoInline();
  } else {
    videoDisplayMode = 'floating';
    if (hasVideoSource || isYouTubeMode) {
      dom.videoPanel.style.display = 'flex';
    }
  }
}

function showVideoInline(): void {
  removeVideoInline();
  const inlineContainer = document.createElement('div');
  inlineContainer.className = 'video-inline-container';
  inlineContainer.id = 'video-inline';
  if (isYouTubeMode) {
    const ytDiv = document.getElementById('yt-player-div');
    if (ytDiv) inlineContainer.appendChild(ytDiv);
  } else {
    inlineContainer.appendChild(dom.videoElement);
  }
  const trackRow = document.getElementById('track-row')!;
  trackRow.parentElement!.insertBefore(inlineContainer, trackRow);
}

function removeVideoInline(): void {
  const inline = document.getElementById('video-inline');
  if (inline) {
    const panelBody = dom.videoPanel.querySelector('.video-panel-body')!;
    if (isYouTubeMode) {
      const ytDiv = document.getElementById('yt-player-div');
      if (ytDiv) panelBody.appendChild(ytDiv);
    } else {
      panelBody.appendChild(dom.videoElement);
    }
    inline.remove();
  }
}

function makeVideoPanelDraggable(): void {
  const header = dom.videoPanel.querySelector('.video-panel-header') as HTMLElement;
  let dragging = false;
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;

  header.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = dom.videoPanel.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    dom.videoPanel.style.left = (origLeft + (e.clientX - startX)) + 'px';
    dom.videoPanel.style.top = (origTop + (e.clientY - startY)) + 'px';
    dom.videoPanel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => { dragging = false; });
}

// ===== YouTube Integration =====

function loadYouTubeApi(): Promise<void> {
  if (youtubeApiLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => {
      youtubeApiLoaded = true;
      resolve();
    };
  });
}

function extractYouTubeId(input: string): string | null {
  input = input.trim();
  const patterns = [
    // https://www.youtube.com/watch?v=ID  or  ?v=ID&list=...&...
    /(?:youtube\.com\/watch\?.*?v=)([a-zA-Z0-9_-]{11})/,
    // https://www.youtube.com/shorts/ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    // https://youtu.be/ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    // https://www.youtube.com/embed/ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    // bare 11-char ID
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) return m[1];
  }
  return null;
}

async function loadYouTubeVideo(videoId: string): Promise<void> {
  showLoading('Loading YouTube video...');
  dom.dropZone.classList.add('hidden');
  cleanupYouTubePlayer();
  cleanupVideoSource();

  try {
    await loadYouTubeApi();

    const panelBody = dom.videoPanel.querySelector('.video-panel-body')!;
    dom.videoElement.style.display = 'none';

    let playerDiv = document.getElementById('yt-player-div');
    if (!playerDiv) {
      playerDiv = document.createElement('div');
      playerDiv.id = 'yt-player-div';
      panelBody.appendChild(playerDiv);
    }

    youtubePlayer = new (window as any).YT.Player('yt-player-div', {
      videoId: videoId,
      width: '100%',
      height: 270,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          isYouTubeMode = true;
          hasVideoSource = false;
          hideLoading();
          showVideoPanel();

          let duration = youtubePlayer.getDuration();
          if (duration > 0) {
            setupYouTubeTimeline(duration);
          } else {
            // Duration not available yet — poll until it is
            const pollDur = setInterval(() => {
              duration = youtubePlayer.getDuration();
              if (duration > 0) {
                clearInterval(pollDur);
                setupYouTubeTimeline(duration);
              }
            }, 500);
          }
          // Start the YouTube animation loop immediately so cursor tracks
          startYouTubeAnimLoop();
        },
        onStateChange: (event: any) => {
          // Keep our UI in sync when user interacts with YT player directly
          // YT.PlayerState: PLAYING=1, PAUSED=2, BUFFERING=3, ENDED=0, UNSTARTED=-1
          const state = event.data;
          if (state === 1) {
            // User started playing via YT controls
            startYouTubeAnimLoop();
          }
          if (state === 0) {
            // Video ended
            selectionManager.setCursor(youtubePlayer.getDuration() || 0);
            redrawAll();
          }
        },
        onError: (event: any) => {
          hideLoading();
          dom.dropZone.classList.remove('hidden');
          alert('Failed to load YouTube video. Error code: ' + event.data);
        }
      }
    });
  } catch (err: any) {
    hideLoading();
    dom.dropZone.classList.remove('hidden');
    alert('Failed to load YouTube API: ' + err.message);
  }
}

function setupYouTubeTimeline(duration: number): void {
  audioEngine._ensureContext();
  const sr = 44100;
  const length = Math.ceil(duration * sr);
  const silentBuffer = audioEngine.audioContext!.createBuffer(1, length, sr);
  audioEngine.audioBuffer = silentBuffer;
  audioEngine.originalBuffer = audioEngine._cloneBuffer(silentBuffer);

  viewport.setAudioParams(sr, length);
  viewport.zoomFit();
  waveformRenderer.clearCache();
  waveformRenderer.buildMipmaps();
  isLoaded = true;
  undoManager.clear();
  enableControls();
  updateTrackMeta();
  redrawAll();
}

// ===== Buffer Changed (after edit/effects) =====
function onBufferChanged(skipSpectrogram?: boolean): void {
  viewport.setAudioParams(audioEngine.sampleRate, audioEngine.totalSamples);
  waveformRenderer.clearCache();
  waveformRenderer.buildMipmaps();
  spectrogramRenderer.clear();
  updateTrackMeta();
  redrawAll();
  if (!skipSpectrogram) {
    computeSpectrogram();
  }
}

audioEngine.on('bufferChanged', () => {
  onBufferChanged(false);
});

function refreshAfterEffect(): void {
  waveformRenderer.clearCache();
  waveformRenderer.buildMipmaps();
  spectrogramRenderer.clear();
  redrawAll();
  computeSpectrogram();
}

// ===== Undo/Redo =====
dom.btnUndo.addEventListener('click', () => {
  const snapshot = undoManager.undo({
    audioBuffer: audioEngine.audioBuffer,
    labels: labelTrack.labels,
    cursorTime: selectionManager.cursorTime
  });
  restoreFromSnapshot(snapshot);
});

dom.btnRedo.addEventListener('click', () => {
  const snapshot = undoManager.redo({
    audioBuffer: audioEngine.audioBuffer,
    labels: labelTrack.labels,
    cursorTime: selectionManager.cursorTime
  });
  restoreFromSnapshot(snapshot);
});

// ===== Clipboard Actions =====
function doCut(): void {
  if (!isLoaded || !selectionManager.hasSelection) return;
  const sel = selectionManager.selectionRange!;
  captureUndoState('Cut');
  audioEngine.stop();
  clipboard.cutAudio(audioEngine, sel.start, sel.end);
  selectionManager.clearSelection();
  selectionManager.setCursor(sel.start);
  updateEditButtons();
}

function doCopy(): void {
  if (!isLoaded || !selectionManager.hasSelection) return;
  const sel = selectionManager.selectionRange!;
  clipboard.copyAudio(audioEngine.audioBuffer!, sel.start, sel.end);
  updateEditButtons();
}

function doPaste(): void {
  if (!isLoaded || !clipboard.hasAudio) return;
  captureUndoState('Paste');
  audioEngine.stop();
  const dur = clipboard.pasteAudio(audioEngine, selectionManager.cursorTime);
  selectionManager.setCursor(selectionManager.cursorTime + dur);
  updateEditButtons();
}

function doDuplicate(): void {
  if (!isLoaded || !selectionManager.hasSelection) return;
  const sel = selectionManager.selectionRange!;
  captureUndoState('Duplicate');
  audioEngine.stop();
  clipboard.duplicateAudio(audioEngine, sel.start, sel.end);
}

function doDelete(): void {
  if (!isLoaded || !selectionManager.hasSelection) return;
  const sel = selectionManager.selectionRange!;
  captureUndoState('Delete segment');
  audioEngine.stop();
  audioEngine.deleteSegment(sel.start, sel.end);
  selectionManager.clearSelection();
  selectionManager.setCursor(sel.start);
}

function doSelectAll(): void {
  if (!isLoaded) return;
  selectionManager.selectionStart = 0;
  selectionManager.selectionEnd = audioEngine.duration;
  redrawAll();
}

dom.btnCut.addEventListener('click', doCut);
dom.btnCopy.addEventListener('click', doCopy);
dom.btnPaste.addEventListener('click', doPaste);
dom.btnDeleteSegment.addEventListener('click', doDelete);

// ===== Export Audio =====
function openExportAudioDialog(): void {
  if (!isLoaded) return;
  const sel = selectionManager.selectionRange;
  if (sel) {
    dom.exportAudioRange.textContent = `Selection: ${formatTime(sel.start, 2)} \u2192 ${formatTime(sel.end, 2)} (${formatTime(sel.end - sel.start, 2)})`;
  } else {
    dom.exportAudioRange.textContent = 'Full audio';
  }
  dom.exportAudioDialog.style.display = 'flex';
}

dom.exportAudioCancel.addEventListener('click', () => {
  dom.exportAudioDialog.style.display = 'none';
});

dom.exportAudioConfirm.addEventListener('click', async () => {
  const fmt = (document.querySelector('input[name="export-audio-fmt"]:checked') as HTMLInputElement).value;
  const sel = selectionManager.selectionRange;

  let segment: AudioBuffer | null;
  if (sel) {
    segment = audioEngine.extractSegment(sel.start, sel.end);
  } else {
    segment = audioEngine.audioBuffer;
  }
  if (!segment) return;

  const targetSR = parseInt(dom.exportSampleRate.value);
  if (targetSR > 0 && targetSR !== segment.sampleRate) {
    segment = Resampler.resample(segment, audioEngine.audioContext!, targetSR);
  }

  if (dom.exportMono.checked && segment.numberOfChannels > 1) {
    const monoLen = segment.length;
    const numCh = segment.numberOfChannels;
    const monoBuf = audioEngine.audioContext!.createBuffer(1, monoLen, segment.sampleRate);
    const dst = monoBuf.getChannelData(0);
    for (let ch = 0; ch < numCh; ch++) {
      const src = segment.getChannelData(ch);
      for (let i = 0; i < monoLen; i++) {
        dst[i] += src[i] / numCh;
      }
    }
    segment = monoBuf;
  }

  if (fmt === 'wav') {
    const blob = AudioEngine.encodeWAV(segment);
    downloadBlob(blob, 'audio.wav');
  } else {
    const encoded = await encodeMP3ViaMediaRecorder(segment);
    if (encoded) {
      downloadBlob(encoded, 'audio.mp3');
    } else {
      const blob = AudioEngine.encodeWAV(segment);
      downloadBlob(blob, 'audio.wav');
      alert('MP3 encoding is not supported in this browser. Exported as WAV instead.');
    }
  }

  dom.exportAudioDialog.style.display = 'none';
});

async function encodeMP3ViaMediaRecorder(audioBuffer: AudioBuffer): Promise<Blob | null> {
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const src2 = ctx.createBufferSource();
    src2.buffer = audioBuffer;
    src2.connect(dest);

    const mimeType = MediaRecorder.isTypeSupported('audio/mpeg') ? 'audio/mpeg'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : null;

    if (!mimeType) {
      ctx.close();
      return null;
    }

    return new Promise((resolve) => {
      const recorder = new MediaRecorder(dest.stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        ctx.close();
        resolve(new Blob(chunks, { type: mimeType! }));
      };

      recorder.start();
      src2.start(0);

      setTimeout(() => {
        recorder.stop();
        src2.stop();
      }, audioBuffer.duration * 1000 + 200);
    });
  } catch (e) {
    console.warn('MediaRecorder MP3 encoding failed:', e);
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Fade Dialog =====
function openFadeDialog(type: string): void {
  if (!isLoaded || !selectionManager.hasSelection) {
    alert('Select a region for fade.');
    return;
  }
  _fadeType = type;
  dom.fadeDialogTitle.textContent = type === 'in' ? 'Fade In' : 'Fade Out';
  (document.querySelector('input[name="fade-curve"][value="linear"]') as HTMLInputElement).checked = true;
  dom.fadeDialog.style.display = 'flex';
}

dom.fadeCancel.addEventListener('click', () => { dom.fadeDialog.style.display = 'none'; });

dom.fadeConfirm.addEventListener('click', () => {
  const curve = (document.querySelector('input[name="fade-curve"]:checked') as HTMLInputElement).value;
  const sel = selectionManager.selectionRange;
  if (!sel) return;
  captureUndoState('Fade ' + _fadeType);
  if (_fadeType === 'in') {
    AudioEffects.fadeIn(audioEngine.audioBuffer!, sel.start, sel.end, curve as any);
  } else {
    AudioEffects.fadeOut(audioEngine.audioBuffer!, sel.start, sel.end, curve as any);
  }
  refreshAfterEffect();
  dom.fadeDialog.style.display = 'none';
});

// ===== Gain Dialog =====
dom.gainCancel.addEventListener('click', () => { dom.gainDialog.style.display = 'none'; });

dom.gainConfirm.addEventListener('click', () => {
  const db = parseFloat(dom.gainDbInput.value);
  if (isNaN(db)) return;
  const sel = selectionManager.selectionRange;
  captureUndoState('Adjust gain');
  AudioEffects.adjustGain(audioEngine.audioBuffer!, db, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.gainDialog.style.display = 'none';
});

// ===== EQ Dialog =====
function openEQDialog(): void {
  if (!isLoaded) return;
  _eqBands = ParametricEQ.defaultBands();
  renderEQBands();
  drawEQCurve();
  dom.eqDialog.style.display = 'flex';
}

function renderEQBands(): void {
  dom.eqBandsContainer.innerHTML = '';
  _eqBands.forEach((band, i) => {
    const row = document.createElement('div');
    row.className = 'dialog-slider-row';
    row.style.marginBottom = '4px';
    row.innerHTML = `
      <label style="font-size:11px;width:80px">${band.type === 'lowshelf' ? 'Low Shelf' : band.type === 'highshelf' ? 'High Shelf' : 'Peak ' + (i)}</label>
      <label style="font-size:10px">Freq:<input type="number" value="${band.frequency}" min="20" max="20000" step="10" style="width:60px;padding:2px 4px;font-size:11px;border:1px solid var(--border);border-radius:3px" data-band="${i}" data-param="frequency"></label>
      <label style="font-size:10px">Gain:<input type="number" value="${band.gain}" min="-24" max="24" step="0.5" style="width:50px;padding:2px 4px;font-size:11px;border:1px solid var(--border);border-radius:3px" data-band="${i}" data-param="gain"></label>
      <label style="font-size:10px">Q:<input type="number" value="${band.Q}" min="0.1" max="10" step="0.1" style="width:50px;padding:2px 4px;font-size:11px;border:1px solid var(--border);border-radius:3px" data-band="${i}" data-param="Q"></label>
    `;
    dom.eqBandsContainer.appendChild(row);
  });

  dom.eqBandsContainer.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.band == null) return;
    const bandIdx = parseInt(input.dataset.band);
    const param = input.dataset.param as keyof EQBand;
    (_eqBands[bandIdx] as any)[param] = parseFloat(input.value);
    drawEQCurve();
  });
}

function drawEQCurve(): void {
  const canvas = dom.eqCanvas;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = themeManager.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  const zeroY = h / 2;
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(w, zeroY);
  ctx.stroke();
  for (const db of [-12, -6, 6, 12]) {
    const y = zeroY - (db / 24) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const sr = audioEngine.sampleRate || 44100;
  const { frequencies, magnitudes } = ParametricEQ.frequencyResponse(_eqBands, sr, w);

  ctx.strokeStyle = themeManager.isDark ? '#8178ff' : '#4f46e5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < w; i++) {
    const db = magnitudes[i];
    const y = zeroY - (db / 24) * (h / 2);
    if (i === 0) ctx.moveTo(i, clamp(y, 0, h));
    else ctx.lineTo(i, clamp(y, 0, h));
  }
  ctx.stroke();
}

dom.eqCancel.addEventListener('click', () => { dom.eqDialog.style.display = 'none'; });

dom.eqConfirm.addEventListener('click', () => {
  const sel = selectionManager.selectionRange;
  captureUndoState('Parametric EQ');
  ParametricEQ.apply(audioEngine.audioBuffer!, _eqBands, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.eqDialog.style.display = 'none';
});

// ===== Compressor Dialog =====
function openCompressorDialog(): void {
  if (!isLoaded) return;
  dom.compressorDialog.style.display = 'flex';
}

function wireSliderDisplay(sliderId: string, displayId: string): void {
  const slider = document.getElementById(sliderId) as HTMLInputElement | null;
  const display = document.getElementById(displayId);
  if (slider && display) {
    slider.addEventListener('input', () => {
      display.textContent = slider.value;
    });
  }
}
wireSliderDisplay('comp-threshold', 'comp-threshold-val');
wireSliderDisplay('comp-ratio', 'comp-ratio-val');
wireSliderDisplay('comp-attack', 'comp-attack-val');
wireSliderDisplay('comp-release', 'comp-release-val');
wireSliderDisplay('comp-knee', 'comp-knee-val');
wireSliderDisplay('comp-makeup', 'comp-makeup-val');
wireSliderDisplay('reverb-room', 'reverb-room-val');
wireSliderDisplay('reverb-damp', 'reverb-damp-val');
wireSliderDisplay('reverb-mix', 'reverb-mix-val');
wireSliderDisplay('noise-sensitivity', 'noise-sens-val');
wireSliderDisplay('speed-ratio', 'speed-ratio-val');
wireSliderDisplay('sat-drive', 'sat-drive-val');

dom.compressorCancel.addEventListener('click', () => { dom.compressorDialog.style.display = 'none'; });

dom.compressorConfirm.addEventListener('click', () => {
  const sel = selectionManager.selectionRange;
  captureUndoState('Compressor');
  Compressor.apply(audioEngine.audioBuffer!, {
    threshold: parseFloat((document.getElementById('comp-threshold') as HTMLInputElement).value),
    ratio: parseFloat((document.getElementById('comp-ratio') as HTMLInputElement).value),
    attack: parseFloat((document.getElementById('comp-attack') as HTMLInputElement).value) / 1000,
    release: parseFloat((document.getElementById('comp-release') as HTMLInputElement).value) / 1000,
    knee: parseFloat((document.getElementById('comp-knee') as HTMLInputElement).value),
    makeupGain: parseFloat((document.getElementById('comp-makeup') as HTMLInputElement).value)
  }, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.compressorDialog.style.display = 'none';
});

// ===== Reverb Dialog =====
dom.reverbCancel.addEventListener('click', () => { dom.reverbDialog.style.display = 'none'; });

dom.reverbConfirm.addEventListener('click', () => {
  const sel = selectionManager.selectionRange;
  captureUndoState('Reverb');
  Reverb.apply(audioEngine.audioBuffer!, {
    roomSize: parseFloat((document.getElementById('reverb-room') as HTMLInputElement).value),
    damping: parseFloat((document.getElementById('reverb-damp') as HTMLInputElement).value),
    wetDry: parseFloat((document.getElementById('reverb-mix') as HTMLInputElement).value)
  }, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.reverbDialog.style.display = 'none';
});

// ===== Noise Reduction Dialog =====
dom.noiseProfileBtn.addEventListener('click', () => {
  if (!isLoaded || !selectionManager.hasSelection) {
    alert('Select a noise-only region first.');
    return;
  }
  const sel = selectionManager.selectionRange!;
  _noiseProfile = NoiseReduction.getNoiseProfile(audioEngine.audioBuffer!, sel.start, sel.end);
  dom.noiseProfileStatus.textContent = 'Profile captured (' + formatTime(sel.end - sel.start, 2) + ')';
});

dom.noiseCancel.addEventListener('click', () => { dom.noiseDialog.style.display = 'none'; });

dom.noiseConfirm.addEventListener('click', () => {
  if (!_noiseProfile) {
    alert('Get a noise profile first.');
    return;
  }
  const sel = selectionManager.selectionRange;
  const sensitivity = parseFloat((document.getElementById('noise-sensitivity') as HTMLInputElement).value);
  captureUndoState('Noise Reduction');
  NoiseReduction.apply(audioEngine.audioBuffer!, _noiseProfile, sensitivity, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.noiseDialog.style.display = 'none';
});

// ===== Speed/Pitch Dialog =====
dom.speedCancel.addEventListener('click', () => { dom.speedDialog.style.display = 'none'; });

dom.speedConfirm.addEventListener('click', () => {
  const ratio = parseFloat((document.getElementById('speed-ratio') as HTMLInputElement).value);
  if (ratio === 1) { dom.speedDialog.style.display = 'none'; return; }
  const sel = selectionManager.selectionRange;
  captureUndoState('Speed change');
  audioEngine._ensureContext();
  const newBuf = TimeStretch.changeSpeed(audioEngine.audioBuffer!, audioEngine.audioContext!, ratio, sel ? sel.start : null, sel ? sel.end : null);
  audioEngine.setBuffer(newBuf);
  dom.speedDialog.style.display = 'none';
});

// ===== Saturation Dialog =====
dom.saturationCancel.addEventListener('click', () => { dom.saturationDialog.style.display = 'none'; });

dom.saturationConfirm.addEventListener('click', () => {
  const drive = parseFloat((document.getElementById('sat-drive') as HTMLInputElement).value);
  const sel = selectionManager.selectionRange;
  captureUndoState('Saturation');
  TimeStretch.saturate(audioEngine.audioBuffer!, drive, sel ? sel.start : null, sel ? sel.end : null);
  refreshAfterEffect();
  dom.saturationDialog.style.display = 'none';
});

// ===== Resample Dialog =====
dom.resampleCancel.addEventListener('click', () => { dom.resampleDialog.style.display = 'none'; });

dom.resampleConfirm.addEventListener('click', () => {
  const newRate = parseInt((document.getElementById('resample-rate') as HTMLInputElement).value);
  if (!isLoaded || newRate === audioEngine.sampleRate) {
    dom.resampleDialog.style.display = 'none';
    return;
  }
  captureUndoState('Resample');
  audioEngine._ensureContext();
  const newBuf = Resampler.resample(audioEngine.audioBuffer!, audioEngine.audioContext!, newRate);
  audioEngine.setBuffer(newBuf);
  dom.resampleDialog.style.display = 'none';
});

// ===== Shortcuts & About Dialogs =====
dom.shortcutsClose.addEventListener('click', () => { dom.shortcutsDialog.style.display = 'none'; });
dom.aboutClose.addEventListener('click', () => { dom.aboutDialog.style.display = 'none'; });

// ===== Concatenate File =====
dom.concatInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  if (!file || !isLoaded) return;
  try {
    showLoading('Decoding & appending...');
    captureUndoState('Concatenate');
    const buf = await audioEngine.decodeFile(file);
    if (buf.sampleRate !== audioEngine.sampleRate) {
      hideLoading();
      alert(`Sample rate mismatch: current is ${audioEngine.sampleRate} Hz, appended file is ${buf.sampleRate} Hz.`);
      return;
    }
    audioEngine.concatenate(buf);
    hideLoading();
  } catch (err: any) {
    hideLoading();
    alert('Failed to append audio: ' + err.message);
  }
  dom.concatInput.value = '';
});

// ===== Add Parallel Track =====
dom.addTrackInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  if (!file) return;
  try {
    await addExtraTrack(file);
  } catch (err: any) {
    alert('Failed to add track: ' + err.message);
  }
  dom.addTrackInput.value = '';
});

async function addExtraTrack(file: File): Promise<void> {
  const engine = new AudioEngine();
  engine._ensureContext = audioEngine._ensureContext.bind(audioEngine);
  engine.audioContext = audioEngine.audioContext;
  engine.gainNode = audioEngine.audioContext!.createGain();
  engine.gainNode.connect(audioEngine.audioContext!.destination);

  const arrayBuffer = await file.arrayBuffer();
  engine.audioBuffer = await engine.audioContext!.decodeAudioData(arrayBuffer);

  const id = ++trackIdCounter;

  const row = document.createElement('div');
  row.className = 'track-row-item';
  row.dataset.trackId = String(id);

  const header = document.createElement('div');
  header.className = 'track-header';
  header.innerHTML = `
    <button class="track-close-btn" title="Remove track">&times;</button>
    <div class="track-name">${file.name.replace(/\.[^.]+$/, '').slice(0, 16)}</div>
    <div class="track-meta" style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">
      ${engine.audioBuffer!.sampleRate} Hz &middot; ${engine.audioBuffer!.numberOfChannels}ch
    </div>
    <div class="track-controls">
      <div class="track-buttons">
        <button class="track-btn track-mute-btn" title="Mute">M</button>
        <button class="track-btn track-solo-btn" title="Solo">S</button>
      </div>
      <label class="track-slider-label">Vol<input type="range" class="track-vol" min="0" max="1" step="0.01" value="1"></label>
      <label class="track-slider-label">Pan<input type="range" class="track-pan" min="-1" max="1" step="0.01" value="0"></label>
    </div>
  `;

  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'track-canvas-container';
  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);

  row.appendChild(header);
  row.appendChild(canvasContainer);
  addResizeHandle(row);
  dom.tracksArea.appendChild(row);

  const wf = new WaveformRenderer(canvas, viewport, engine);
  // Force a layout reflow so getElementSize returns correct dimensions
  const sz = getElementSize(canvasContainer);
  wf.resize(sz.width, Math.max(sz.height, 80));
  wf.buildMipmaps();

  let panNode: StereoPannerNode | null = null;
  if (typeof audioEngine.audioContext!.createStereoPanner === 'function') {
    panNode = audioEngine.audioContext!.createStereoPanner();
    engine.gainNode!.disconnect();
    engine.gainNode!.connect(panNode);
    panNode.connect(audioEngine.audioContext!.destination);
  }

  const track: ExtraTrack = {
    id, name: file.name, engine, waveform: wf, canvas, container: canvasContainer, row,
    muted: false, solo: false, pan: 0, volume: 1, panNode
  };
  extraTracks.push(track);

  const vol = header.querySelector('.track-vol') as HTMLInputElement;
  vol.addEventListener('input', () => {
    track.volume = parseFloat(vol.value);
    engine.setVolume(track.muted ? 0 : track.volume);
  });

  const pan = header.querySelector('.track-pan') as HTMLInputElement;
  pan.addEventListener('input', () => {
    track.pan = parseFloat(pan.value);
    if (track.panNode) track.panNode.pan.value = track.pan;
  });

  const muteBtn = header.querySelector('.track-mute-btn') as HTMLButtonElement;
  muteBtn.addEventListener('click', () => {
    track.muted = !track.muted;
    muteBtn.classList.toggle('muted', track.muted);
    engine.setVolume(track.muted ? 0 : track.volume);
  });

  const soloBtn = header.querySelector('.track-solo-btn') as HTMLButtonElement;
  soloBtn.addEventListener('click', () => {
    track.solo = !track.solo;
    soloBtn.classList.toggle('active', track.solo);
    applySoloState();
  });

  header.querySelector('.track-close-btn')!.addEventListener('click', () => {
    engine.stop();
    if (panNode) panNode.disconnect();
    row.remove();
    const idx = extraTracks.findIndex(t => t.id === id);
    if (idx !== -1) extraTracks.splice(idx, 1);
    applySoloState();
    updateSizes();
  });

  const longestDuration = Math.max(audioEngine.duration, ...extraTracks.map(t => t.engine.duration));
  const longestSamples = Math.round(longestDuration * audioEngine.sampleRate);
  if (longestSamples > viewport.totalSamples) {
    viewport.setAudioParams(audioEngine.sampleRate, longestSamples);
  }

  updateSizes();
}

// ===== Main Track Mute/Solo =====
dom.btnMute.addEventListener('click', () => {
  mainTrackMuted = !mainTrackMuted;
  dom.btnMute.classList.toggle('muted', mainTrackMuted);
  audioEngine.setVolume(mainTrackMuted ? 0 : parseFloat(dom.volumeSlider.value));
});

dom.btnSolo.addEventListener('click', () => {
  mainTrackSolo = !mainTrackSolo;
  dom.btnSolo.classList.toggle('active', mainTrackSolo);
  applySoloState();
});

function applySoloState(): void {
  const anySolo = mainTrackSolo || extraTracks.some(t => t.solo);
  if (!anySolo) {
    audioEngine.setVolume(mainTrackMuted ? 0 : parseFloat(dom.volumeSlider.value));
    for (const t of extraTracks) {
      t.engine.setVolume(t.muted ? 0 : t.volume);
    }
  } else {
    audioEngine.setVolume(mainTrackSolo ? parseFloat(dom.volumeSlider.value) : 0);
    for (const t of extraTracks) {
      t.engine.setVolume(t.solo ? t.volume : 0);
    }
  }
}

dom.volumeSlider.addEventListener('input', (e) => {
  const vol = parseFloat((e.target as HTMLInputElement).value);
  if (!mainTrackMuted) audioEngine.setVolume(vol);
});

dom.panSlider.addEventListener('input', (e) => {
  if (!(audioEngine as any)._panNode && audioEngine.audioContext && audioEngine.audioContext.createStereoPanner) {
    (audioEngine as any)._panNode = audioEngine.audioContext.createStereoPanner();
    audioEngine.gainNode!.disconnect();
    audioEngine.gainNode!.connect((audioEngine as any)._panNode);
    (audioEngine as any)._panNode.connect(audioEngine.audioContext.destination);
  }
  if ((audioEngine as any)._panNode) {
    (audioEngine as any)._panNode.pan.value = parseFloat((e.target as HTMLInputElement).value);
  }
});

// ===== Mixdown Export =====
if (dom.mixdownCancel) {
  dom.mixdownCancel.addEventListener('click', () => { dom.mixdownDialog.style.display = 'none'; });
}

if (dom.mixdownConfirm) {
  dom.mixdownConfirm.addEventListener('click', () => {
    if (!isLoaded) return;
    const sr = audioEngine.sampleRate;
    const maxLen = Math.max(
      audioEngine.totalSamples,
      ...extraTracks.map(t => t.engine.totalSamples)
    );
    const numCh = audioEngine.channels;
    const mixBuf = audioEngine.audioContext!.createBuffer(numCh, maxLen, sr);

    const anySolo = mainTrackSolo || extraTracks.some(t => t.solo);
    const includeMain = anySolo ? mainTrackSolo : !mainTrackMuted;
    if (includeMain && audioEngine.audioBuffer) {
      const vol = parseFloat(dom.volumeSlider.value);
      for (let ch = 0; ch < numCh; ch++) {
        const dst = mixBuf.getChannelData(ch);
        if (ch < audioEngine.channels) {
          const src = audioEngine.getChannelData(ch);
          for (let i = 0; i < src.length; i++) {
            dst[i] += src[i] * vol;
          }
        }
      }
    }

    for (const t of extraTracks) {
      const include = anySolo ? t.solo : !t.muted;
      if (!include || !t.engine.audioBuffer) continue;
      const vol = t.volume;
      for (let ch = 0; ch < numCh; ch++) {
        const dst = mixBuf.getChannelData(ch);
        if (ch < t.engine.channels) {
          const src = t.engine.getChannelData(ch);
          for (let i = 0; i < src.length; i++) {
            dst[i] += src[i] * vol;
          }
        }
      }
    }

    for (let ch = 0; ch < numCh; ch++) {
      const data = mixBuf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.max(-1, Math.min(1, data[i]));
      }
    }

    const blob = AudioEngine.encodeWAV(mixBuf);
    downloadBlob(blob, 'mixdown.wav');
    dom.mixdownDialog.style.display = 'none';
  });
}

// ===== Project Save/Load =====
function getProjectState(): any {
  if (!audioEngine.audioBuffer) return null;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < audioEngine.channels; ch++) {
    channels.push(new Float32Array(audioEngine.getChannelData(ch)));
  }
  return {
    audioBufferData: {
      sampleRate: audioEngine.sampleRate,
      numberOfChannels: audioEngine.channels,
      length: audioEngine.totalSamples,
      channels
    },
    labels: labelTrack.labels,
    viewport: {
      samplesPerPixel: viewport.samplesPerPixel,
      scrollSamples: viewport.scrollSamples
    },
    cursorTime: selectionManager.cursorTime,
    viewMode: viewMode,
    extraTracks: extraTracks.map(t => {
      const chs: Float32Array[] = [];
      for (let ch = 0; ch < t.engine.channels; ch++) {
        chs.push(new Float32Array(t.engine.getChannelData(ch)));
      }
      return {
        name: t.name,
        volume: t.volume,
        muted: t.muted,
        solo: t.solo,
        pan: t.pan,
        audioBufferData: {
          sampleRate: t.engine.sampleRate,
          numberOfChannels: t.engine.channels,
          length: t.engine.totalSamples,
          channels: chs
        }
      };
    })
  };
}

async function saveProject(): Promise<void> {
  const state = getProjectState();
  if (!state) { alert('No audio loaded to save.'); return; }
  const name = prompt('Project name:', 'My Project');
  if (!name) return;
  try {
    showLoading('Saving project...');
    await projectManager.save(name, state);
    hideLoading();
    alert('Project saved.');
  } catch (err: any) {
    hideLoading();
    alert('Failed to save project: ' + err.message);
  }
}

dom.btnSaveProject.addEventListener('click', saveProject);

async function loadProject(): Promise<void> {
  try {
    const keys = await projectManager.listKeys();
    const hasAuto = await projectManager.hasAutoSave();
    const options = hasAuto ? ['[Auto-save]', ...keys] : keys;
    if (options.length === 0) { alert('No saved projects.'); return; }

    const choice = prompt('Load project:\n' + options.map((k: string, i: number) => `${i + 1}. ${k}`).join('\n') + '\n\nEnter number:');
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= options.length) return;

    const key = options[idx] === '[Auto-save]' ? projectManager.AUTOSAVE_KEY : options[idx];
    showLoading('Loading project...');
    const data = await projectManager.load(key);
    if (!data) { hideLoading(); alert('Project not found.'); return; }

    audioEngine._ensureContext();

    if (data.audio) {
      const buf = ProjectManager.reconstructBuffer(audioEngine.audioContext!, data.audio);
      audioEngine.audioBuffer = buf;
    }

    if (data.labels) {
      labelTrack.labels = data.labels.map((l: any) => ({ ...l, id: l.id || uniqueId('lbl') }));
    }

    if (data.viewport) {
      viewport.samplesPerPixel = data.viewport.samplesPerPixel;
      viewport.scrollSamples = data.viewport.scrollSamples;
    }

    if (data.cursorTime != null) {
      selectionManager.setCursor(data.cursorTime);
    }

    if (data.viewMode) {
      viewMode = data.viewMode as ViewMode;
      dom.viewModeSelect.value = viewMode;
    }

    for (const t of [...extraTracks]) {
      t.engine.stop();
      t.row.remove();
    }
    extraTracks.length = 0;

    onBufferReady();
    hideLoading();
    await computeSpectrogram();
  } catch (err: any) {
    hideLoading();
    alert('Failed to load project: ' + err.message);
  }
}

// ===== Toolbar Events =====
dom.btnLoad.addEventListener('click', () => dom.fileInput.click());

dom.fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  if (file) {
    if (file.type.startsWith('video/') || /\.(mp4|webm|ogv|mov)$/i.test(file.name)) {
      loadVideoFile(file);
    } else {
      loadAudioFile(file);
    }
  }
  dom.fileInput.value = '';
});

dom.btnPlay.addEventListener('click', () => {
  if (!isLoaded) return;

  if (isYouTubeMode && youtubePlayer) {
    // YouTube mode: YouTube player is the source of truth
    youtubePlayer.seekTo(selectionManager.cursorTime, true);
    youtubePlayer.playVideo();
    startYouTubeAnimLoop();
    return;
  }

  const sel = selectionManager.selectionRange;
  if (sel) {
    audioEngine.playRange(sel.start, sel.end);
    for (const t of extraTracks) {
      if (t.engine.audioBuffer) t.engine.playRange(sel.start, sel.end);
    }
  } else {
    audioEngine.play(selectionManager.cursorTime);
    for (const t of extraTracks) {
      if (t.engine.audioBuffer) t.engine.play(selectionManager.cursorTime);
    }
  }
  updatePlayPauseButtons();
  startAnimLoop();
  if (hasVideoSource) {
    dom.videoElement.currentTime = selectionManager.cursorTime;
    dom.videoElement.play().catch(() => {});
  }
});

dom.btnPause.addEventListener('click', () => {
  if (isYouTubeMode && youtubePlayer) {
    youtubePlayer.pauseVideo();
    // Don't stop the YT anim loop — it will detect paused state and update buttons
    return;
  }
  audioEngine.pause();
  for (const t of extraTracks) t.engine.pause();
  selectionManager.setCursor(audioEngine.currentTime);
  updatePlayPauseButtons();
  stopAnimLoop();
  redrawAll();
  if (hasVideoSource) dom.videoElement.pause();
});

dom.btnStop.addEventListener('click', () => {
  if (isYouTubeMode && youtubePlayer) {
    youtubePlayer.pauseVideo();
    youtubePlayer.seekTo(0, true);
    selectionManager.setCursor(0);
    redrawAll();
    return;
  }
  audioEngine.stop(selectionManager.cursorTime);
  for (const t of extraTracks) t.engine.stop(selectionManager.cursorTime);
  updatePlayPauseButtons();
  stopAnimLoop();
  redrawAll();
  if (hasVideoSource) { dom.videoElement.pause(); dom.videoElement.currentTime = 0; }
});

dom.btnZoomIn.addEventListener('click', () => { viewport.zoomIn(); redrawAll(); });
dom.btnZoomOut.addEventListener('click', () => { viewport.zoomOut(); redrawAll(); });
dom.btnZoomFit.addEventListener('click', () => { viewport.zoomFit(); redrawAll(); });

dom.viewModeSelect.addEventListener('change', (e) => {
  viewMode = (e.target as HTMLSelectElement).value as ViewMode;
  redrawAll();
});

// ===== Speed Selector =====
dom.speedSelect.addEventListener('change', (e) => {
  const rate = parseFloat((e.target as HTMLSelectElement).value);
  audioEngine.setPlaybackRate(rate);
  for (const t of extraTracks) t.engine.setPlaybackRate(rate);
  if (isYouTubeMode && youtubePlayer && youtubePlayer.setPlaybackRate) {
    youtubePlayer.setPlaybackRate(rate);
  }
  if (hasVideoSource) {
    dom.videoElement.playbackRate = rate;
  }
});

// ===== Theme Toggle =====
dom.btnTheme.addEventListener('click', () => {
  themeManager.toggle();
});

// ===== Snap Toggle =====
dom.snapToggle.addEventListener('change', (e) => {
  snapEnabled = (e.target as HTMLInputElement).checked;
});

// ===== Label Search/Filter =====
if (dom.labelSearch) {
  dom.labelSearch.addEventListener('input', (e) => {
    labelTrack.filterText = (e.target as HTMLInputElement).value;
    labelTrack.draw();
  });
}

if (dom.labelCategoryFilter) {
  dom.labelCategoryFilter.addEventListener('change', (e) => {
    labelTrack.filterCategory = (e.target as HTMLSelectElement).value;
    labelTrack.draw();
  });
}

// ===== Export Labels =====
function openExportLabelsDialog(): void {
  if (labelTrack.labels.length === 0) { alert('No labels to export.'); return; }
  dom.exportDialog.style.display = 'flex';
}

dom.exportCancel.addEventListener('click', () => { dom.exportDialog.style.display = 'none'; });

dom.exportConfirm.addEventListener('click', () => {
  const fmt = (document.querySelector('input[name="export-fmt"]:checked') as HTMLInputElement).value;
  let content: string, filename: string, mimeType: string;
  switch (fmt) {
    case 'audacity':
      content = labelTrack.exportAudacity();
      filename = 'labels.txt';
      mimeType = 'text/plain';
      break;
    case 'json':
      content = labelTrack.exportJSON();
      filename = 'labels.json';
      mimeType = 'application/json';
      break;
    case 'srt':
      content = labelTrack.exportSRT();
      filename = 'labels.srt';
      mimeType = 'text/plain';
      break;
    case 'vtt':
      content = labelTrack.exportVTT();
      filename = 'labels.vtt';
      mimeType = 'text/plain';
      break;
    case 'elan':
      content = labelTrack.exportELAN();
      filename = 'labels.xml';
      mimeType = 'application/xml';
      break;
    default:
      content = labelTrack.exportAudacity();
      filename = 'labels.txt';
      mimeType = 'text/plain';
  }
  downloadBlob(new Blob([content], { type: mimeType }), filename);
  dom.exportDialog.style.display = 'none';
});

// ===== Import Labels =====
function importLabels(): void {
  dom.labelFileInput.click();
}

dom.labelFileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  if (!file) return;
  try {
    captureUndoState('Import labels');
    const text = await file.text();
    labelTrack.importAuto(text);
    labelTrack.draw();
  } catch (err: any) {
    alert('Failed to import labels: ' + err.message);
  }
  dom.labelFileInput.value = '';
});

// ===== Add Label =====
function addLabel(): void {
  if (!isLoaded) return;
  captureUndoState('Add label');
  const sel = selectionManager.selectionRange;
  if (sel) {
    labelTrack.addRegionLabel(sel.start, sel.end);
  } else {
    labelTrack.addPointLabel(selectionManager.cursorTime);
  }
  labelTrack.draw();
}

// ===== Analysis Actions =====
// BUG FIX: Previously used `new FFT(fftSize)` which doesn't exist.
// Now uses the correct `fft(real, imag)` function and `createWindow()`.
function showSpectrogramAnalysis(): void {
  if (!isLoaded) return;
  const sel = selectionManager.selectionRange;
  const startT = sel ? sel.start : 0;
  const endT = sel ? sel.end : audioEngine.duration;
  const segment = audioEngine.extractSegment(startT, endT);
  if (!segment) return;

  const mono = segment.numberOfChannels === 1
    ? segment.getChannelData(0)
    : (() => {
        const m = new Float32Array(segment.length);
        for (let ch = 0; ch < segment.numberOfChannels; ch++) {
          const d = segment.getChannelData(ch);
          for (let i = 0; i < segment.length; i++) m[i] += d[i] / segment.numberOfChannels;
        }
        return m;
      })();

  const fftSize = 1024;
  const hopSize = 256;
  const win = createWindow(fftSize, 'hann');
  const numFrames = Math.floor((mono.length - fftSize) / hopSize) + 1;
  const numBins = fftSize / 2 + 1;
  const data: Float32Array[] = [];

  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    for (let i = 0; i < fftSize; i++) {
      real[i] = (offset + i < mono.length) ? mono[offset + i] * win[i] : 0;
      imag[i] = 0;
    }
    fft(real, imag);

    const magnitudes = new Float32Array(numBins);
    for (let i = 0; i < numBins; i++) {
      magnitudes[i] = 20 * Math.log10(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) + 1e-10);
    }
    data.push(magnitudes);
  }

  analysisPanel.show('Spectrogram', data, {
    colorMap: 'magma',
    info: `${numFrames} frames \u00d7 ${numBins} bins | ${formatTime(endT - startT, 2)}`
  });
}

function showFilterbankAnalysis(): void {
  if (!isLoaded) return;
  const sel = selectionManager.selectionRange;
  const startT = sel ? sel.start : 0;
  const endT = sel ? sel.end : Math.min(audioEngine.duration, 30);
  const segment = audioEngine.extractSegment(startT, endT);
  if (!segment) return;

  const data = Filterbank.compute(segment, { numFilters: 40, fftSize: 1024, hopSize: 256 });
  analysisPanel.show('Mel Filterbank', data, {
    colorMap: 'magma',
    info: `${data.length} frames \u00d7 40 mel filters | ${formatTime(endT - startT, 2)}`
  });
}

function showMFCCAnalysis(): void {
  if (!isLoaded) return;
  const sel = selectionManager.selectionRange;
  const startT = sel ? sel.start : 0;
  const endT = sel ? sel.end : Math.min(audioEngine.duration, 30);
  const segment = audioEngine.extractSegment(startT, endT);
  if (!segment) return;

  const data = MFCC.compute(segment, { numCoeffs: 13, numFilters: 40, fftSize: 1024, hopSize: 256 });
  analysisPanel.show('MFCC', data, {
    colorMap: 'magma',
    info: `${data.length} frames \u00d7 13 coefficients | ${formatTime(endT - startT, 2)}`
  });
}

// ===== Export Waveform as Image =====
function exportWaveformImage(): void {
  if (!isLoaded) return;
  const link = document.createElement('a');
  link.download = 'waveform.png';
  link.href = dom.waveformCanvas.toDataURL('image/png');
  link.click();
}

// ===== Reset Audio =====
function resetAudio(): void {
  if (!audioEngine.hasOriginal) {
    alert('No original audio to restore.');
    return;
  }
  captureUndoState('Reset to original');
  audioEngine.resetToOriginal();
}

// ===== New Project =====
function newProject(): void {
  if (isLoaded && !confirm('Create a new project? Unsaved changes will be lost.')) return;
  audioEngine.stop();
  audioEngine.audioBuffer = null;
  audioEngine.originalBuffer = null;
  cleanupYouTubePlayer();
  cleanupVideoSource();
  for (const t of [...extraTracks]) {
    t.engine.stop();
    t.row.remove();
  }
  extraTracks.length = 0;
  labelTrack.labels = [];
  labelTrack.selectedLabelId = null;
  labelTrack.selectedLabelIds.clear();
  selectionManager.clearSelection();
  selectionManager.setCursor(0);
  undoManager.clear();
  isLoaded = false;
  dom.dropZone.classList.remove('hidden');
  updateTrackMeta();
  redrawAll();
}

// ===== Separate Channels to Tracks =====
function separateChannels(): void {
  if (!isLoaded || audioEngine.channels < 2) {
    alert('Need a stereo or multi-channel file to separate.');
    return;
  }
  audioEngine._ensureContext();
  const numCh = audioEngine.channels;
  const sr = audioEngine.sampleRate;
  const len = audioEngine.totalSamples;

  for (let ch = 0; ch < numCh; ch++) {
    const engine = new AudioEngine();
    engine._ensureContext = audioEngine._ensureContext.bind(audioEngine);
    engine.audioContext = audioEngine.audioContext;
    engine.gainNode = audioEngine.audioContext!.createGain();
    engine.gainNode.connect(audioEngine.audioContext!.destination);

    const monoBuf = audioEngine.audioContext!.createBuffer(1, len, sr);
    monoBuf.getChannelData(0).set(audioEngine.getChannelData(ch));
    engine.audioBuffer = monoBuf;

    const id = ++trackIdCounter;
    const row = document.createElement('div');
    row.className = 'track-row-item';
    row.dataset.trackId = String(id);

    const header = document.createElement('div');
    header.className = 'track-header';
    header.innerHTML = `
      <button class="track-close-btn" title="Remove track">&times;</button>
      <div class="track-name">Ch ${ch + 1}</div>
      <div class="track-meta" style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">${sr} Hz &middot; 1ch</div>
      <div class="track-controls">
        <div class="track-buttons">
          <button class="track-btn track-mute-btn" title="Mute">M</button>
          <button class="track-btn track-solo-btn" title="Solo">S</button>
        </div>
        <label class="track-slider-label">Vol<input type="range" class="track-vol" min="0" max="1" step="0.01" value="1"></label>
      </div>
    `;

    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'track-canvas-container';
    const canvas = document.createElement('canvas');
    canvasContainer.appendChild(canvas);

    row.appendChild(header);
    row.appendChild(canvasContainer);
    addResizeHandle(row);
    dom.tracksArea.appendChild(row);

    const wf = new WaveformRenderer(canvas, viewport, engine);
    const sz = getElementSize(canvasContainer);
    wf.resize(sz.width, Math.max(sz.height, 80));
    wf.buildMipmaps();

    const track: ExtraTrack = {
      id, name: 'Ch ' + (ch + 1), engine, waveform: wf, canvas, container: canvasContainer, row,
      muted: false, solo: false, pan: 0, volume: 1, panNode: null
    };
    extraTracks.push(track);

    const vol = header.querySelector('.track-vol') as HTMLInputElement;
    vol.addEventListener('input', () => {
      track.volume = parseFloat(vol.value);
      engine.setVolume(track.muted ? 0 : track.volume);
    });

    const muteBtn = header.querySelector('.track-mute-btn') as HTMLButtonElement;
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('muted', track.muted);
      engine.setVolume(track.muted ? 0 : track.volume);
    });

    const soloBtn = header.querySelector('.track-solo-btn') as HTMLButtonElement;
    soloBtn.addEventListener('click', () => {
      track.solo = !track.solo;
      soloBtn.classList.toggle('active', track.solo);
      applySoloState();
    });

    header.querySelector('.track-close-btn')!.addEventListener('click', () => {
      engine.stop();
      row.remove();
      const idx = extraTracks.findIndex(t => t.id === id);
      if (idx !== -1) extraTracks.splice(idx, 1);
      applySoloState();
      updateSizes();
    });

    updateSizes();
  }
}

// ===== Menu Bar =====
function setupMenuBar(): void {
  menuBar.setMenus([
    {
      label: 'File',
      items: [
        { label: 'New Project', icon: Icons.newFile, action: newProject },
        { label: 'Open Project', icon: Icons.load, action: loadProject },
        { label: 'Import Audio', icon: Icons.importFile, shortcut: 'Ctrl+O', action: () => dom.fileInput.click() },
        { label: 'Load from URL...', icon: Icons.url, shortcut: 'Ctrl+U', action: openURLDialog },
        { label: 'Load YouTube Video...', icon: Icons.youtube, action: openYouTubeDialog },
        { label: 'Import Labels', action: importLabels },
        { separator: true },
        { label: 'Export Audio', icon: Icons.exportFile, action: openExportAudioDialog },
        { label: 'Export Labels', action: openExportLabelsDialog },
        { label: 'Export Mixdown', action: () => { if (isLoaded) dom.mixdownDialog.style.display = 'flex'; } },
        { label: 'Export Waveform Image', icon: Icons.image, action: exportWaveformImage },
        { separator: true },
        { label: 'Save Project', icon: Icons.save, shortcut: 'Ctrl+S', action: saveProject },
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', icon: Icons.undo, shortcut: 'Ctrl+Z', action: () => dom.btnUndo.click() },
        { label: 'Redo', icon: Icons.redo, shortcut: 'Ctrl+Shift+Z', action: () => dom.btnRedo.click() },
        { separator: true },
        { label: 'Cut', icon: Icons.cut, shortcut: 'Ctrl+X', action: doCut },
        { label: 'Copy', icon: Icons.copy, shortcut: 'Ctrl+C', action: doCopy },
        { label: 'Paste', icon: Icons.paste, shortcut: 'Ctrl+V', action: doPaste },
        { label: 'Delete', icon: Icons.trash, shortcut: 'Del', action: doDelete },
        { label: 'Duplicate', icon: Icons.duplicate, shortcut: 'Ctrl+D', action: doDuplicate },
        { separator: true },
        { label: 'Select All', icon: Icons.selectAll, shortcut: 'Ctrl+A', action: doSelectAll },
        { label: 'Deselect', shortcut: 'Esc', action: () => { selectionManager.clearSelection(); redrawAll(); } },
        { separator: true },
        { label: 'Reset Audio', icon: Icons.reset, action: resetAudio },
      ]
    },
    {
      label: 'Tracks',
      items: [
        { label: 'Add Audio Track', icon: Icons.addTrack, action: () => dom.addTrackInput.click() },
        { label: 'Append Audio', action: () => { if (isLoaded) dom.concatInput.click(); } },
        { separator: true },
        { label: 'Separate Channels', action: separateChannels },
        { separator: true },
        { label: 'Add Label', icon: Icons.label, shortcut: 'Ctrl+B', action: addLabel },
        { separator: true },
        { label: 'Resample Track...', action: () => { if (isLoaded) dom.resampleDialog.style.display = 'flex'; } },
      ]
    },
    {
      label: 'Effects',
      items: [
        { label: 'Fade In', action: () => openFadeDialog('in') },
        { label: 'Fade Out', action: () => openFadeDialog('out') },
        { separator: true },
        { label: 'Normalize', action: () => {
          if (!isLoaded) return;
          const sel = selectionManager.selectionRange;
          captureUndoState('Normalize');
          AudioEffects.normalize(audioEngine.audioBuffer!, -1, sel ? sel.start : null, sel ? sel.end : null);
          refreshAfterEffect();
        }},
        { label: 'Adjust Gain...', action: () => {
          if (!isLoaded) return;
          dom.gainDbInput.value = '0';
          dom.gainDialog.style.display = 'flex';
        }},
        { separator: true },
        { label: 'Noise Reduction...', action: () => { if (isLoaded) dom.noiseDialog.style.display = 'block'; } },
        { label: 'Reverb...', action: () => { if (isLoaded) dom.reverbDialog.style.display = 'flex'; } },
        { label: 'Saturation...', action: () => { if (isLoaded) dom.saturationDialog.style.display = 'flex'; } },
        { separator: true },
        { label: 'Parametric EQ...', icon: Icons.eq, action: openEQDialog },
        { label: 'Compressor / Limiter...', action: openCompressorDialog },
        { separator: true },
        { label: 'Speed / Pitch...', icon: Icons.speed, action: () => { if (isLoaded) dom.speedDialog.style.display = 'flex'; } },
      ]
    },
    {
      label: 'Analysis',
      items: [
        { label: 'Spectrogram', icon: Icons.spectrum, action: showSpectrogramAnalysis },
        { label: 'Filterbank (Mel)', action: showFilterbankAnalysis },
        { label: 'MFCC', action: showMFCCAnalysis },
        { separator: true },
        { label: 'Save Analysis Image', icon: Icons.image, action: () => analysisPanel.saveAsImage() },
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', icon: Icons.keyboard, action: () => { dom.shortcutsDialog.style.display = 'flex'; } },
        { label: 'About Annota', icon: Icons.help, action: () => { dom.aboutDialog.style.display = 'flex'; } },
      ]
    }
  ]);
}

setupMenuBar();

// ===== Context Menu =====
function getWaveformContextItems(): MenuItem[] {
  const hasSel = selectionManager.hasSelection;

  if (hasSel) {
    return [
      { label: 'Cut', icon: Icons.cut, shortcut: 'Ctrl+X', action: doCut },
      { label: 'Copy', icon: Icons.copy, shortcut: 'Ctrl+C', action: doCopy },
      { label: 'Paste', icon: Icons.paste, shortcut: 'Ctrl+V', action: doPaste, disabled: !clipboard.hasAudio },
      { label: 'Delete', icon: Icons.trash, shortcut: 'Del', action: doDelete },
      { label: 'Duplicate', icon: Icons.duplicate, shortcut: 'Ctrl+D', action: doDuplicate },
      { separator: true },
      { label: 'Export Segment', icon: Icons.exportFile, action: openExportAudioDialog },
      { label: 'Export Waveform Image', icon: Icons.image, action: exportWaveformImage },
      { separator: true },
      { label: 'Add Label', icon: Icons.label, action: addLabel },
      { separator: true },
      { label: 'Analysis', submenu: [
        { label: 'Spectrogram', action: showSpectrogramAnalysis },
        { label: 'Filterbank (Mel)', action: showFilterbankAnalysis },
        { label: 'MFCC', action: showMFCCAnalysis },
      ]},
    ];
  } else {
    return [
      { label: 'Paste', icon: Icons.paste, shortcut: 'Ctrl+V', action: doPaste, disabled: !clipboard.hasAudio },
      { label: 'Select All', icon: Icons.selectAll, shortcut: 'Ctrl+A', action: doSelectAll },
      { separator: true },
      { label: 'Add Label', icon: Icons.label, action: addLabel },
    ];
  }
}

function getLabelContextItems(hitLabel: Label | null): MenuItem[] {
  const selectedLabels = labelTrack.getSelectedLabels();
  const hasSelectedLabels = selectedLabels.length > 0;

  if (hitLabel || hasSelectedLabels) {
    return [
      { label: 'Copy Label', icon: Icons.copy, action: () => {
        const labels = hasSelectedLabels ? selectedLabels : [hitLabel!];
        clipboard.copyLabels(labels);
      }},
      { label: 'Cut Label', icon: Icons.cut, action: () => {
        captureUndoState('Cut labels');
        const ids = hasSelectedLabels
          ? [...labelTrack.selectedLabelIds]
          : [hitLabel!.id];
        clipboard.cutLabels(labelTrack, ids);
        labelTrack.draw();
      }},
      { label: 'Delete Label', icon: Icons.trash, action: () => {
        captureUndoState('Delete labels');
        labelTrack.removeSelected();
        labelTrack.draw();
      }},
      { separator: true },
      { label: 'Set Category', submenu: Object.entries(labelTrack.categories).map(([key, cat]) => ({
        label: (cat as any).label,
        action: () => {
          captureUndoState('Set category');
          const labels = hasSelectedLabels ? selectedLabels : [hitLabel!];
          for (const l of labels) {
            l.category = key;
          }
          labelTrack.draw();
        }
      }))},
      { separator: true },
      { label: 'Export Segment Audio', icon: Icons.exportFile, action: () => {
        const label = hitLabel || selectedLabels[0];
        if (label && label.type === 'region') {
          const segment = audioEngine.extractSegment(label.start, label.end);
          if (segment) {
            const blob = AudioEngine.encodeWAV(segment);
            downloadBlob(blob, (label.text || 'segment') + '.wav');
          }
        }
      }},
    ];
  } else {
    return [
      { label: 'Add Label', icon: Icons.label, action: addLabel },
      { label: 'Paste Label', icon: Icons.paste, action: () => {
        if (!clipboard.hasLabels) return;
        captureUndoState('Paste labels');
        clipboard.pasteLabels(labelTrack, selectionManager.cursorTime);
        labelTrack.draw();
      }, disabled: !clipboard.hasLabels },
    ];
  }
}

// Right-click on waveform area
dom.trackContainer.addEventListener('contextmenu', (e) => {
  if (!isLoaded) return;
  e.preventDefault();
  contextMenu.show(e.clientX, e.clientY, getWaveformContextItems());
});

// Right-click on label area
dom.labelContainer.addEventListener('contextmenu', (e) => {
  if (!isLoaded) return;
  e.preventDefault();
  const rect = dom.labelContainer.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const hit = labelTrack.hitTest(px, py);
  contextMenu.show(e.clientX, e.clientY, getLabelContextItems(hit.label));
});

// ===== Timeline Click-to-Seek =====
dom.timelineContainer.addEventListener('mousedown', (e) => {
  if (!isLoaded) return;
  const rect = dom.timelineContainer.getBoundingClientRect();
  const px = e.clientX - rect.left;
  let time = viewport.pixelToTime(px);
  time = snapTime(time);
  selectionManager.setCursor(time);
  selectionManager.clearSelection();
  if (isYouTubeMode && youtubePlayer && youtubePlayer.seekTo) {
    youtubePlayer.seekTo(time, true);
  } else if (audioEngine.isPlaying) {
    audioEngine.seek(time);
    for (const t of extraTracks) t.engine.seek(time);
  }
  redrawAll();
});

// ===== Track Canvas Mouse Events (Selection) =====
dom.trackContainer.addEventListener('mousedown', (e) => {
  if (e.button === 2) return;
  if (!isLoaded || (e.target !== dom.cursorCanvas && e.target !== dom.selectionCanvas)) return;
  const rect = dom.trackContainer.getBoundingClientRect();
  selectionManager.onMouseDown(e, rect);

  if (snapEnabled) {
    selectionManager.cursorTime = snapTime(selectionManager.cursorTime);
    selectionManager.selectionStart = selectionManager.cursorTime;
    selectionManager.selectionEnd = selectionManager.cursorTime;
  }

  if (isYouTubeMode && youtubePlayer && youtubePlayer.seekTo) {
    youtubePlayer.seekTo(selectionManager.cursorTime, true);
  } else if (audioEngine.isPlaying) {
    audioEngine.seek(selectionManager.cursorTime);
    for (const t of extraTracks) t.engine.seek(selectionManager.cursorTime);
  }
  if (hasVideoSource && dom.videoElement.readyState >= 2) {
    dom.videoElement.currentTime = selectionManager.cursorTime;
  }
  redrawAll();
});

document.addEventListener('mousemove', (e) => {
  if (!isLoaded) return;
  if (selectionManager._isDragging) {
    const rect = dom.trackContainer.getBoundingClientRect();
    selectionManager.onMouseMove(e, rect);
    if (snapEnabled) {
      selectionManager.selectionEnd = snapTime(selectionManager.selectionEnd!);
    }
    selectionManager.drawSelection();
    updateStatusBar();
    updateEditButtons();
  }
  if (labelTrack._isDragging) {
    const rect = dom.labelContainer.getBoundingClientRect();
    labelTrack.onMouseMove(e, rect);
    labelTrack.draw();
  }
});

document.addEventListener('mouseup', (e) => {
  if (!isLoaded) return;
  if (selectionManager._isDragging) {
    const rect = dom.trackContainer.getBoundingClientRect();
    selectionManager.onMouseUp(e, rect);
    if (snapEnabled && selectionManager.hasSelection) {
      selectionManager.selectionStart = snapTime(selectionManager.selectionStart!);
      selectionManager.selectionEnd = snapTime(selectionManager.selectionEnd!);
    }
    redrawAll();
  }
  if (labelTrack._isDragging) {
    const rect = dom.labelContainer.getBoundingClientRect();
    labelTrack.onMouseUp(e, rect);
    labelTrack.draw();
  }
});

// ===== Label Canvas Events =====
dom.labelContainer.addEventListener('mousedown', (e) => {
  if (e.button === 2) return;
  if (!isLoaded) return;
  const rect = dom.labelContainer.getBoundingClientRect();
  labelTrack.onMouseDown(e, rect);
  labelTrack.draw();
});

dom.labelContainer.addEventListener('dblclick', (e) => {
  if (!isLoaded) return;
  const rect = dom.labelContainer.getBoundingClientRect();
  labelTrack.onDoubleClick(e, rect);
  labelTrack.draw();
});

dom.labelContainer.addEventListener('mousemove', (e) => {
  if (!isLoaded || labelTrack._isDragging) return;
  const rect = dom.labelContainer.getBoundingClientRect();
  labelTrack.onMouseMove(e, rect);
});

// ===== Scroll: Wheel =====
function handleWheel(e: WheelEvent): void {
  if (!isLoaded) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (e.deltaY < 0) viewport.zoomIn(px);
    else viewport.zoomOut(px);
  } else {
    viewport.scrollByPixels(e.deltaY > 0 ? 50 : -50);
  }
  redrawAll();
}

dom.trackContainer.addEventListener('wheel', handleWheel, { passive: false });
dom.timelineContainer.addEventListener('wheel', handleWheel, { passive: false });
dom.labelContainer.addEventListener('wheel', handleWheel, { passive: false });

// ===== Scrollbar =====
let scrollbarDragging = false;
let scrollbarDragStart = 0;
let scrollbarDragFrac = 0;

dom.scrollbarThumb.addEventListener('mousedown', (e) => {
  e.preventDefault();
  scrollbarDragging = true;
  scrollbarDragStart = e.clientX;
  scrollbarDragFrac = viewport.scrollFraction;
});

dom.scrollbarTrack.addEventListener('mousedown', (e) => {
  if (e.target === dom.scrollbarThumb) return;
  const rect = dom.scrollbarTrack.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  viewport.setScrollFraction(frac);
  redrawAll();
});

document.addEventListener('mousemove', (e) => {
  if (!scrollbarDragging) return;
  const trackWidth = dom.scrollbarTrack.offsetWidth;
  const thumbWidth = dom.scrollbarThumb.offsetWidth;
  const maxTravel = trackWidth - thumbWidth;
  if (maxTravel <= 0) return;
  const dx = e.clientX - scrollbarDragStart;
  const fracDelta = dx / maxTravel;
  viewport.setScrollFraction(clamp(scrollbarDragFrac + fracDelta, 0, 1));
  redrawAll();
});

document.addEventListener('mouseup', () => { scrollbarDragging = false; });

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
  if (labelTrack._isEditing) return;
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return;

  const isCtrl = e.ctrlKey || e.metaKey;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      if (isYouTubeMode && youtubePlayer && youtubePlayer.getPlayerState) {
        const ytState = youtubePlayer.getPlayerState();
        if (ytState === 1) dom.btnPause.click();
        else dom.btnPlay.click();
      } else if (audioEngine.isPlaying) {
        dom.btnPause.click();
      } else if (isLoaded) {
        dom.btnPlay.click();
      }
      break;
    case '=': case '+':
      if (isCtrl) { e.preventDefault(); viewport.zoomIn(); redrawAll(); }
      break;
    case '-': case '_':
      if (isCtrl) { e.preventDefault(); viewport.zoomOut(); redrawAll(); }
      break;
    case 'f':
      if (isCtrl) { e.preventDefault(); viewport.zoomFit(); redrawAll(); }
      break;
    case 'o':
      if (isCtrl) { e.preventDefault(); dom.fileInput.click(); }
      break;
    case 'b':
      if (isCtrl) { e.preventDefault(); addLabel(); }
      break;
    case 'x':
      if (isCtrl) { e.preventDefault(); doCut(); }
      break;
    case 'c':
      if (isCtrl) { e.preventDefault(); doCopy(); }
      break;
    case 'v':
      if (isCtrl) { e.preventDefault(); doPaste(); }
      else if (hasVideoSource || isYouTubeMode) { toggleVideoDisplayMode(); }
      break;
    case 'd':
      if (isCtrl) { e.preventDefault(); doDuplicate(); }
      break;
    case 'a':
      if (isCtrl) { e.preventDefault(); doSelectAll(); }
      break;
    case 'z':
      if (isCtrl && e.shiftKey) {
        e.preventDefault();
        dom.btnRedo.click();
      } else if (isCtrl) {
        e.preventDefault();
        dom.btnUndo.click();
      }
      break;
    case 'y':
      if (isCtrl) { e.preventDefault(); dom.btnRedo.click(); }
      break;
    case 'u':
      if (isCtrl) { e.preventDefault(); openURLDialog(); }
      break;
    case 's':
      if (isCtrl) { e.preventDefault(); saveProject(); }
      break;
    case 'm':
      if (isLoaded && !isCtrl) {
        dom.btnMute.click();
      }
      break;
    case 'Escape':
      if (dom.fadeDialog.style.display !== 'none') { dom.fadeDialog.style.display = 'none'; break; }
      if (dom.eqDialog.style.display !== 'none') { dom.eqDialog.style.display = 'none'; break; }
      if (dom.compressorDialog.style.display !== 'none') { dom.compressorDialog.style.display = 'none'; break; }
      if (dom.reverbDialog.style.display !== 'none') { dom.reverbDialog.style.display = 'none'; break; }
      if (dom.noiseDialog.style.display !== 'none') { dom.noiseDialog.style.display = 'none'; break; }
      if (dom.speedDialog.style.display !== 'none') { dom.speedDialog.style.display = 'none'; break; }
      if (dom.saturationDialog.style.display !== 'none') { dom.saturationDialog.style.display = 'none'; break; }
      if (dom.resampleDialog.style.display !== 'none') { dom.resampleDialog.style.display = 'none'; break; }
      if (dom.shortcutsDialog.style.display !== 'none') { dom.shortcutsDialog.style.display = 'none'; break; }
      if (dom.aboutDialog.style.display !== 'none') { dom.aboutDialog.style.display = 'none'; break; }
      if (dom.exportDialog.style.display !== 'none') { dom.exportDialog.style.display = 'none'; break; }
      if (dom.exportAudioDialog.style.display !== 'none') { dom.exportAudioDialog.style.display = 'none'; break; }
      if (dom.gainDialog.style.display !== 'none') { dom.gainDialog.style.display = 'none'; break; }
      if (dom.mixdownDialog.style.display !== 'none') { dom.mixdownDialog.style.display = 'none'; break; }
      if (dom.urlDialog.style.display !== 'none') { dom.urlDialog.style.display = 'none'; break; }
      if (dom.youtubeDialog.style.display !== 'none') { dom.youtubeDialog.style.display = 'none'; break; }
      selectionManager.clearSelection();
      labelTrack.selectedLabelId = null;
      labelTrack.selectedLabelIds.clear();
      redrawAll();
      break;
    case 'Delete':
      if (labelTrack.selectedLabelIds.size > 0 || labelTrack.selectedLabelId) {
        captureUndoState('Delete label');
        labelTrack.removeSelected();
        labelTrack.draw();
      } else if (selectionManager.hasSelection && isLoaded) {
        doDelete();
      }
      break;
    case 'Backspace':
      if (labelTrack.selectedLabelIds.size > 0 || labelTrack.selectedLabelId) {
        captureUndoState('Delete label');
        labelTrack.removeSelected();
        labelTrack.draw();
      }
      break;
    case 'Home':
      if (isLoaded) {
        selectionManager.setCursor(0);
        viewport.setScrollFraction(0);
        redrawAll();
      }
      break;
    case 'End':
      if (isLoaded) {
        selectionManager.setCursor(audioEngine.duration);
        viewport.setScrollFraction(1);
        redrawAll();
      }
      break;
    case 'ArrowLeft':
      if (isLoaded) { viewport.scrollByPixels(-30); redrawAll(); }
      break;
    case 'ArrowRight':
      if (isLoaded) { viewport.scrollByPixels(30); redrawAll(); }
      break;
  }
});

// ===== URL Dialog =====
function openURLDialog(): void {
  dom.urlInput.value = '';
  dom.urlError.style.display = 'none';
  dom.urlDialog.style.display = 'flex';
  dom.urlInput.focus();
}

dom.urlCancel.addEventListener('click', () => {
  dom.urlDialog.style.display = 'none';
});

dom.urlConfirm.addEventListener('click', () => {
  const url = dom.urlInput.value.trim();
  if (!url) {
    dom.urlError.textContent = 'Please enter a URL';
    dom.urlError.style.display = 'block';
    return;
  }
  try {
    new URL(url);
  } catch {
    dom.urlError.textContent = 'Invalid URL format';
    dom.urlError.style.display = 'block';
    return;
  }
  dom.urlError.style.display = 'none';
  dom.urlDialog.style.display = 'none';
  loadFromURL(url);
});

dom.urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') dom.urlConfirm.click();
});

// ===== YouTube Dialog =====
function openYouTubeDialog(): void {
  dom.youtubeInput.value = '';
  dom.youtubeError.style.display = 'none';
  dom.youtubeDialog.style.display = 'flex';
  dom.youtubeInput.focus();
}

dom.youtubeCancel.addEventListener('click', () => {
  dom.youtubeDialog.style.display = 'none';
});

dom.youtubeConfirm.addEventListener('click', () => {
  const input = dom.youtubeInput.value.trim();
  const videoId = extractYouTubeId(input);
  if (!videoId) {
    dom.youtubeError.textContent = 'Could not extract YouTube video ID. Enter a YouTube URL or 11-character video ID.';
    dom.youtubeError.style.display = 'block';
    return;
  }
  dom.youtubeError.style.display = 'none';
  dom.youtubeDialog.style.display = 'none';
  loadYouTubeVideo(videoId);
});

dom.youtubeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') dom.youtubeConfirm.click();
});

// ===== Video Panel Events =====
dom.videoPanelClose.addEventListener('click', () => {
  videoDisplayMode = 'hidden';
  dom.videoPanel.style.display = 'none';
  removeVideoInline();
});

dom.videoPanelModeBtn.addEventListener('click', toggleVideoDisplayMode);
makeVideoPanelDraggable();

// ===== Drag & Drop =====
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    dom.dropZone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-over');
  const files = e.dataTransfer!.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('video/') || /\.(mp4|webm|ogv|mov|mkv)$/i.test(file.name)) {
      loadVideoFile(file);
    } else if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(file.name)) {
      loadAudioFile(file);
    } else if (/\.(txt|json|srt|vtt|xml)$/i.test(file.name)) {
      file.text().then(text => {
        captureUndoState('Import labels');
        labelTrack.importAuto(text);
        labelTrack.draw();
      });
    }
  }
});

// ===== Audio Engine Events =====
audioEngine.on('ended', () => {
  for (const t of extraTracks) t.engine.stop();
  stopAnimLoop();
  updatePlayPauseButtons();
  selectionManager.drawCursor();
});

audioEngine.on('stop', () => {
  stopAnimLoop();
  updatePlayPauseButtons();
});

// ===== Window Resize =====
window.addEventListener('resize', debounce(() => { updateSizes(); }, 100));

// ===== Auto-save Recovery =====
async function checkAutoSave(): Promise<void> {
  try {
    await projectManager.hasAutoSave();
  } catch (e) {
    // Ignore
  }
}

// ===== Init =====
function init(): void {
  updateSizes();
  updateStatusBar();
  updateEditButtons();
  updateUndoButtons();
  checkAutoSave();
}

requestAnimationFrame(() => { requestAnimationFrame(() => { init(); }); });
