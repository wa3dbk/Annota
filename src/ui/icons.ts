// ===== SVG Icons =====
// Inline SVG icon strings for toolbar, menu, and context menu

export const Icons: Record<string, string> = {
  // File
  newFile: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h5.586L13 4.414V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1H4v12h8V5h-3V2z"/></svg>',
  load: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>',
  save: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2a1 1 0 0 1 1-1h8.586L14 3.414V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2zm1 0v11h10V4H11V2H3zm2 7h6v3H5v-3zm1 1v1h4v-1H6z"/></svg>',
  importFile: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v8.586L5.707 7.293l-1.414 1.414L8 12.414l3.707-3.707-1.414-1.414L8 9.586V1zM2 12v2h12v-2h2v3a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1v-3h2z"/></svg>',
  exportFile: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12V3.414L5.707 5.707 4.293 4.293 8 .586l3.707 3.707-1.414 1.414L8 3.414V12zM2 12v2h12v-2h2v3a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1v-3h2z"/></svg>',

  // Transport
  play: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>',
  stop: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10"/></svg>',

  // Edit
  undo: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8l5-5v3h4a4 4 0 0 1 0 8H7v-2h4a2 2 0 0 0 0-4H7v3L2 8z"/></svg>',
  redo: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 8l-5-5v3H5a4 4 0 0 0 0 8h4v-2H5a2 2 0 0 1 0-4h4v3l5-5z"/></svg>',
  cut: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 1A2.5 2.5 0 0 0 3.27 5.6L7.12 8l-3.85 2.4A2.5 2.5 0 1 0 4.5 13c.49 0 .95-.14 1.34-.38L8 11.18l2.16 1.44A2.5 2.5 0 1 0 11.5 10.4L7.88 8l3.62-2.4A2.5 2.5 0 1 0 9.66 3.38L8 4.82 6.34 3.38A2.5 2.5 0 0 0 4.5 1zm0 2a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm7 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm-7 9a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1zm7 0a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 4V1.5A.5.5 0 0 1 4.5 1h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H10v1.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9A.5.5 0 0 1 2.5 3H4zm1 0h6V2H5v2zM3 4h-.5v8h6v-1H4.5A.5.5 0 0 1 4 10.5V4H3z"/></svg>',
  paste: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 1a1 1 0 0 0-1 1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-1a1 1 0 0 0-1-1H5zm0 1h6v1H5V2zM3 4h10v9H3V4z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 2V1h6v1h4v1h-1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3H1V2h4zm1 3v7h1V5H6zm3 0v7h1V5H9zM3 3v10h10V3H3z"/></svg>',
  duplicate: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h8v8H2V2zm1 1v6h6V3H3zm4 8v2h6V7h-2v1h1v4H7z"/></svg>',
  selectAll: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h14v14H1V1zm1 1v12h12V2H2zm2 2h8v8H4V4z"/></svg>',

  // Zoom
  zoomIn: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1a5.5 5.5 0 0 1 4.383 8.823l3.896 3.896-1.414 1.414-3.896-3.896A5.5 5.5 0 1 1 6.5 1zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5.5 5H7V3.5h1V5h1.5v1H8v1.5H7V6H5.5V5z"/></svg>',
  zoomOut: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1a5.5 5.5 0 0 1 4.383 8.823l3.896 3.896-1.414 1.414-3.896-3.896A5.5 5.5 0 1 1 6.5 1zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM4.5 5h4v1h-4V5z"/></svg>',
  zoomFit: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h4v1H3v3H2V2zm8 0h4v4h-1V3h-3V2zM2 10h1v3h3v1H2v-4zm11 0h1v4h-4v-1h3v-3z"/></svg>',

  // Labels
  label: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h6.586L13 5.414V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v10h8V6H9V3H3zm7 .414V5h1.586L10 3.414z"/></svg>',

  // Theme
  sun: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.414 1.414m7.07 7.07l1.414 1.414M3.05 12.95l1.414-1.414m7.07-7.07l1.414-1.414M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" stroke="currentColor" fill="none" stroke-width="1.2"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 1a7 7 0 1 0 8.062 6.5A5 5 0 0 1 6 1z"/></svg>',

  // Effects
  waveform: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 8h2l1-4 2 8 2-6 2 4 1-2h4" stroke="currentColor" fill="none" stroke-width="1.2"/></svg>',
  eq: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 3v10M8 5v6M13 2v12" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',

  // Track
  addTrack: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2v12M2 8h12" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>',

  // Analysis
  spectrum: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="10" width="2" height="4"/><rect x="4" y="7" width="2" height="7"/><rect x="7" y="4" width="2" height="10"/><rect x="10" y="6" width="2" height="8"/><rect x="13" y="9" width="2" height="5"/></svg>',

  // Misc
  settings: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6.32-2.9l-1.2-.7a5 5 0 0 0 0-1.8l1.2-.7a.5.5 0 0 0 .18-.68l-1-1.73a.5.5 0 0 0-.68-.18l-1.2.7a5 5 0 0 0-1.56-.9V.5a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0-.5.5v1.4a5 5 0 0 0-1.56.9l-1.2-.7a.5.5 0 0 0-.68.18l-1 1.73a.5.5 0 0 0 .18.68l1.2.7a5 5 0 0 0 0 1.8l-1.2.7a.5.5 0 0 0-.18.68l1 1.73a.5.5 0 0 0 .68.18l1.2-.7a5 5 0 0 0 1.56.9v1.4a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-1.4a5 5 0 0 0 1.56-.9l1.2.7a.5.5 0 0 0 .68-.18l1-1.73a.5.5 0 0 0-.18-.68z"/></svg>',
  help: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2a5 5 0 1 1 0 10A5 5 0 0 1 8 3zm-.5 2.5A1.5 1.5 0 0 1 9 6.5c0 .5-.5 1-1 1.5v1h-1V8c.5-.5 1.5-1 1.5-1.5a.5.5 0 0 0-1 0H6.5zm-.5 5h2v1.5H7V10.5z"/></svg>',
  keyboard: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="5" width="2" height="1.5"/><rect x="6" y="5" width="2" height="1.5"/><rect x="9" y="5" width="2" height="1.5"/><rect x="4" y="9" width="8" height="1.5"/><rect x="3" y="7" width="2" height="1.5"/><rect x="6" y="7" width="2" height="1.5"/><rect x="9" y="7" width="2" height="1.5"/></svg>',
  image: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1 0v7l3-3 2 2 3-3 2 2V3H3z"/></svg>',
  speed: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-3v3.5l2.5 1.5-.5.87L7 9V5h1z"/></svg>',
  reset: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8a6 6 0 0 1 10.47-4H10v-1h4v4h-1V4.53A7 7 0 1 0 14.93 9H13.9A6 6 0 0 1 2 8z"/></svg>',
};
