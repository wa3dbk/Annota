// ===== Typed DOM Element References =====

const $ = (sel: string) => document.querySelector(sel);

export interface DOMRefs {
  btnLoad: HTMLButtonElement;
  btnPlay: HTMLButtonElement;
  btnPause: HTMLButtonElement;
  btnStop: HTMLButtonElement;
  btnZoomIn: HTMLButtonElement;
  btnZoomOut: HTMLButtonElement;
  btnZoomFit: HTMLButtonElement;
  viewModeSelect: HTMLSelectElement;
  btnUndo: HTMLButtonElement;
  btnRedo: HTMLButtonElement;
  btnCut: HTMLButtonElement;
  btnCopy: HTMLButtonElement;
  btnPaste: HTMLButtonElement;
  btnDeleteSegment: HTMLButtonElement;
  snapToggle: HTMLInputElement;
  btnSaveProject: HTMLButtonElement;
  btnTheme: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  fileInput: HTMLInputElement;
  addTrackInput: HTMLInputElement;
  concatInput: HTMLInputElement;
  labelFileInput: HTMLInputElement;
  projectFileInput: HTMLInputElement;
  dropZone: HTMLElement;

  timelineCanvas: HTMLCanvasElement;
  waveformCanvas: HTMLCanvasElement;
  spectrogramCanvas: HTMLCanvasElement;
  selectionCanvas: HTMLCanvasElement;
  cursorCanvas: HTMLCanvasElement;
  labelCanvas: HTMLCanvasElement;
  labelEditor: HTMLInputElement;
  dbScaleCanvas: HTMLCanvasElement;
  freqScaleCanvas: HTMLCanvasElement;

  trackContainer: HTMLElement;
  tracksArea: HTMLElement;
  labelContainer: HTMLElement;
  timelineContainer: HTMLElement;
  scrollbarTrack: HTMLElement;
  scrollbarThumb: HTMLElement;

  statusRate: HTMLElement;
  statusChannels: HTMLElement;
  statusDuration: HTMLElement;
  statusSelection: HTMLElement;
  statusCursor: HTMLElement;
  statusZoom: HTMLElement;
  toolbarTime: HTMLElement;
  trackMeta: HTMLElement;

  btnMute: HTMLButtonElement;
  btnSolo: HTMLButtonElement;
  volumeSlider: HTMLInputElement;
  panSlider: HTMLInputElement;

  labelSearch: HTMLInputElement | null;
  labelCategoryFilter: HTMLSelectElement | null;

  exportDialog: HTMLElement;
  exportCancel: HTMLButtonElement;
  exportConfirm: HTMLButtonElement;

  exportAudioDialog: HTMLElement;
  exportAudioCancel: HTMLButtonElement;
  exportAudioConfirm: HTMLButtonElement;
  exportAudioRange: HTMLElement;
  exportSampleRate: HTMLSelectElement;
  exportMono: HTMLInputElement;

  gainDialog: HTMLElement;
  gainCancel: HTMLButtonElement;
  gainConfirm: HTMLButtonElement;
  gainDbInput: HTMLInputElement;

  mixdownDialog: HTMLElement;
  mixdownCancel: HTMLButtonElement | null;
  mixdownConfirm: HTMLButtonElement | null;

  fadeDialog: HTMLElement;
  fadeDialogTitle: HTMLElement;
  fadeCancel: HTMLButtonElement;
  fadeConfirm: HTMLButtonElement;

  eqDialog: HTMLElement;
  eqCanvas: HTMLCanvasElement;
  eqBandsContainer: HTMLElement;
  eqCancel: HTMLButtonElement;
  eqConfirm: HTMLButtonElement;

  compressorDialog: HTMLElement;
  compressorCancel: HTMLButtonElement;
  compressorConfirm: HTMLButtonElement;

  reverbDialog: HTMLElement;
  reverbCancel: HTMLButtonElement;
  reverbConfirm: HTMLButtonElement;

  noiseDialog: HTMLElement;
  noiseProfileBtn: HTMLButtonElement;
  noiseProfileStatus: HTMLElement;
  noiseCancel: HTMLButtonElement;
  noiseConfirm: HTMLButtonElement;

  speedDialog: HTMLElement;
  speedCancel: HTMLButtonElement;
  speedConfirm: HTMLButtonElement;

  saturationDialog: HTMLElement;
  saturationCancel: HTMLButtonElement;
  saturationConfirm: HTMLButtonElement;

  resampleDialog: HTMLElement;
  resampleCancel: HTMLButtonElement;
  resampleConfirm: HTMLButtonElement;

  shortcutsDialog: HTMLElement;
  shortcutsClose: HTMLButtonElement;

  aboutDialog: HTMLElement;
  aboutClose: HTMLButtonElement;

  menuBarContainer: HTMLElement;

  videoPanel: HTMLElement;
  videoPanelClose: HTMLButtonElement;
  videoPanelModeBtn: HTMLButtonElement;
  videoElement: HTMLVideoElement;

  urlDialog: HTMLElement;
  urlInput: HTMLInputElement;
  urlError: HTMLElement;
  urlCancel: HTMLButtonElement;
  urlConfirm: HTMLButtonElement;

  youtubeDialog: HTMLElement;
  youtubeInput: HTMLInputElement;
  youtubeError: HTMLElement;
  youtubeCancel: HTMLButtonElement;
  youtubeConfirm: HTMLButtonElement;
}

export function getDOMRefs(): DOMRefs {
  return {
    btnLoad: $('#btn-load') as HTMLButtonElement,
    btnPlay: $('#btn-play') as HTMLButtonElement,
    btnPause: $('#btn-pause') as HTMLButtonElement,
    btnStop: $('#btn-stop') as HTMLButtonElement,
    btnZoomIn: $('#btn-zoom-in') as HTMLButtonElement,
    btnZoomOut: $('#btn-zoom-out') as HTMLButtonElement,
    btnZoomFit: $('#btn-zoom-fit') as HTMLButtonElement,
    viewModeSelect: $('#view-mode') as HTMLSelectElement,
    btnUndo: $('#btn-undo') as HTMLButtonElement,
    btnRedo: $('#btn-redo') as HTMLButtonElement,
    btnCut: $('#btn-cut') as HTMLButtonElement,
    btnCopy: $('#btn-copy') as HTMLButtonElement,
    btnPaste: $('#btn-paste') as HTMLButtonElement,
    btnDeleteSegment: $('#btn-delete-segment') as HTMLButtonElement,
    snapToggle: $('#snap-toggle') as HTMLInputElement,
    btnSaveProject: $('#btn-save-project') as HTMLButtonElement,
    btnTheme: $('#btn-theme') as HTMLButtonElement,
    speedSelect: $('#speed-select') as HTMLSelectElement,
    fileInput: $('#file-input') as HTMLInputElement,
    addTrackInput: $('#add-track-input') as HTMLInputElement,
    concatInput: $('#concat-input') as HTMLInputElement,
    labelFileInput: $('#label-file-input') as HTMLInputElement,
    projectFileInput: $('#project-file-input') as HTMLInputElement,
    dropZone: $('#drop-zone') as HTMLElement,

    timelineCanvas: $('#timeline-canvas') as HTMLCanvasElement,
    waveformCanvas: $('#waveform-canvas') as HTMLCanvasElement,
    spectrogramCanvas: $('#spectrogram-canvas') as HTMLCanvasElement,
    selectionCanvas: $('#selection-canvas') as HTMLCanvasElement,
    cursorCanvas: $('#cursor-canvas') as HTMLCanvasElement,
    labelCanvas: $('#label-canvas') as HTMLCanvasElement,
    labelEditor: $('#label-editor') as HTMLInputElement,
    dbScaleCanvas: $('#db-scale-canvas') as HTMLCanvasElement,
    freqScaleCanvas: $('#freq-scale-canvas') as HTMLCanvasElement,

    trackContainer: $('#track-container') as HTMLElement,
    tracksArea: $('#tracks-area') as HTMLElement,
    labelContainer: $('#label-container') as HTMLElement,
    timelineContainer: $('#timeline-container') as HTMLElement,
    scrollbarTrack: $('#scrollbar-track') as HTMLElement,
    scrollbarThumb: $('#scrollbar-thumb') as HTMLElement,

    statusRate: $('#status-rate') as HTMLElement,
    statusChannels: $('#status-channels') as HTMLElement,
    statusDuration: $('#status-duration') as HTMLElement,
    statusSelection: $('#status-selection') as HTMLElement,
    statusCursor: $('#status-cursor') as HTMLElement,
    statusZoom: $('#status-zoom') as HTMLElement,
    toolbarTime: $('#toolbar-time') as HTMLElement,
    trackMeta: $('#track-meta') as HTMLElement,

    btnMute: $('#btn-mute') as HTMLButtonElement,
    btnSolo: $('#btn-solo') as HTMLButtonElement,
    volumeSlider: $('#volume-slider') as HTMLInputElement,
    panSlider: $('#pan-slider') as HTMLInputElement,

    labelSearch: $('#label-search') as HTMLInputElement | null,
    labelCategoryFilter: $('#label-category-filter') as HTMLSelectElement | null,

    exportDialog: $('#export-dialog') as HTMLElement,
    exportCancel: $('#export-cancel') as HTMLButtonElement,
    exportConfirm: $('#export-confirm') as HTMLButtonElement,

    exportAudioDialog: $('#export-audio-dialog') as HTMLElement,
    exportAudioCancel: $('#export-audio-cancel') as HTMLButtonElement,
    exportAudioConfirm: $('#export-audio-confirm') as HTMLButtonElement,
    exportAudioRange: $('#export-audio-range') as HTMLElement,
    exportSampleRate: $('#export-sample-rate') as HTMLSelectElement,
    exportMono: $('#export-mono') as HTMLInputElement,

    gainDialog: $('#gain-dialog') as HTMLElement,
    gainCancel: $('#gain-cancel') as HTMLButtonElement,
    gainConfirm: $('#gain-confirm') as HTMLButtonElement,
    gainDbInput: $('#gain-db-input') as HTMLInputElement,

    mixdownDialog: $('#mixdown-dialog') as HTMLElement,
    mixdownCancel: $('#mixdown-cancel') as HTMLButtonElement | null,
    mixdownConfirm: $('#mixdown-confirm') as HTMLButtonElement | null,

    fadeDialog: $('#fade-dialog') as HTMLElement,
    fadeDialogTitle: $('#fade-dialog-title') as HTMLElement,
    fadeCancel: $('#fade-cancel') as HTMLButtonElement,
    fadeConfirm: $('#fade-confirm') as HTMLButtonElement,

    eqDialog: $('#eq-dialog') as HTMLElement,
    eqCanvas: $('#eq-canvas') as HTMLCanvasElement,
    eqBandsContainer: $('#eq-bands') as HTMLElement,
    eqCancel: $('#eq-cancel') as HTMLButtonElement,
    eqConfirm: $('#eq-confirm') as HTMLButtonElement,

    compressorDialog: $('#compressor-dialog') as HTMLElement,
    compressorCancel: $('#compressor-cancel') as HTMLButtonElement,
    compressorConfirm: $('#compressor-confirm') as HTMLButtonElement,

    reverbDialog: $('#reverb-dialog') as HTMLElement,
    reverbCancel: $('#reverb-cancel') as HTMLButtonElement,
    reverbConfirm: $('#reverb-confirm') as HTMLButtonElement,

    noiseDialog: $('#noise-dialog') as HTMLElement,
    noiseProfileBtn: $('#noise-profile-btn') as HTMLButtonElement,
    noiseProfileStatus: $('#noise-profile-status') as HTMLElement,
    noiseCancel: $('#noise-cancel') as HTMLButtonElement,
    noiseConfirm: $('#noise-confirm') as HTMLButtonElement,

    speedDialog: $('#speed-dialog') as HTMLElement,
    speedCancel: $('#speed-cancel') as HTMLButtonElement,
    speedConfirm: $('#speed-confirm') as HTMLButtonElement,

    saturationDialog: $('#saturation-dialog') as HTMLElement,
    saturationCancel: $('#saturation-cancel') as HTMLButtonElement,
    saturationConfirm: $('#saturation-confirm') as HTMLButtonElement,

    resampleDialog: $('#resample-dialog') as HTMLElement,
    resampleCancel: $('#resample-cancel') as HTMLButtonElement,
    resampleConfirm: $('#resample-confirm') as HTMLButtonElement,

    shortcutsDialog: $('#shortcuts-dialog') as HTMLElement,
    shortcutsClose: $('#shortcuts-close') as HTMLButtonElement,

    aboutDialog: $('#about-dialog') as HTMLElement,
    aboutClose: $('#about-close') as HTMLButtonElement,

    menuBarContainer: $('#menu-bar-container') as HTMLElement,

    videoPanel: $('#video-panel') as HTMLElement,
    videoPanelClose: $('#video-panel-close') as HTMLButtonElement,
    videoPanelModeBtn: $('#video-panel-mode') as HTMLButtonElement,
    videoElement: $('#video-element') as HTMLVideoElement,

    urlDialog: $('#url-dialog') as HTMLElement,
    urlInput: $('#url-input') as HTMLInputElement,
    urlError: $('#url-error') as HTMLElement,
    urlCancel: $('#url-cancel') as HTMLButtonElement,
    urlConfirm: $('#url-confirm') as HTMLButtonElement,

    youtubeDialog: $('#youtube-dialog') as HTMLElement,
    youtubeInput: $('#youtube-input') as HTMLInputElement,
    youtubeError: $('#youtube-error') as HTMLElement,
    youtubeCancel: $('#youtube-cancel') as HTMLButtonElement,
    youtubeConfirm: $('#youtube-confirm') as HTMLButtonElement,
  };
}
