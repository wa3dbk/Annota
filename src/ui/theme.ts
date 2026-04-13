// ===== Theme Manager =====
// Light/dark mode toggle with localStorage persistence

import type { ThemeColors } from '../types';

type ThemeMode = 'light' | 'dark';
type ThemeListener = (theme: ThemeMode) => void;

export class ThemeManager {
  private _theme: ThemeMode;
  private _listeners: ThemeListener[] = [];

  constructor() {
    this._theme = (localStorage.getItem('annota-theme') as ThemeMode) || 'light';
    this._apply();
  }

  get theme(): ThemeMode {
    return this._theme;
  }

  get isDark(): boolean {
    return this._theme === 'dark';
  }

  toggle(): void {
    this._theme = this._theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('annota-theme', this._theme);
    this._apply();
    this._notify();
  }

  setTheme(theme: ThemeMode): void {
    this._theme = theme;
    localStorage.setItem('annota-theme', this._theme);
    this._apply();
    this._notify();
  }

  private _apply(): void {
    document.documentElement.setAttribute('data-theme', this._theme);
  }

  onChange(cb: ThemeListener): void {
    this._listeners.push(cb);
  }

  private _notify(): void {
    for (const cb of this._listeners) cb(this._theme);
  }

  get colors(): ThemeColors {
    if (this._theme === 'dark') {
      return {
        waveformFill: 'rgba(129, 120, 255, 0.35)',
        waveformStroke: '#8178ff',
        waveformCenter: 'rgba(129, 120, 255, 0.15)',
        selectionFill: 'rgba(129, 120, 255, 0.2)',
        selectionBorder: 'rgba(129, 120, 255, 0.6)',
        cursor: '#ff5555',
        timelineBg: '#1e1e2e',
        timelineText: '#a0a0b8',
        timelineTick: 'rgba(255, 255, 255, 0.12)',
        timelineTickMajor: 'rgba(255, 255, 255, 0.3)',
        labelBg: '#1a1a2a',
        labelRegionFill: 'rgba(234, 88, 12, 0.2)',
        labelBorder: '#ea580c',
        labelBadgeBg: '#2a2a3a',
        labelBadgeBgSelected: '#3a2a1a',
        labelText: '#ea580c',
        axisBg: 'rgba(30, 30, 46, 0.85)',
        axisTick: 'rgba(255, 255, 255, 0.1)',
        axisText: '#8888a0',
        canvasBg: '#1a1a2a',
        channelSep: 'rgba(255, 255, 255, 0.1)',
      };
    }
    return {
      waveformFill: 'rgba(79, 70, 229, 0.3)',
      waveformStroke: '#4f46e5',
      waveformCenter: 'rgba(79, 70, 229, 0.12)',
      selectionFill: 'rgba(79, 70, 229, 0.15)',
      selectionBorder: 'rgba(79, 70, 229, 0.5)',
      cursor: '#e53e3e',
      timelineBg: '#f0f0f4',
      timelineText: '#5a5a70',
      timelineTick: 'rgba(0, 0, 0, 0.12)',
      timelineTickMajor: 'rgba(0, 0, 0, 0.3)',
      labelBg: '#fafafa',
      labelRegionFill: 'rgba(234, 88, 12, 0.2)',
      labelBorder: '#ea580c',
      labelBadgeBg: '#ffffff',
      labelBadgeBgSelected: '#fff7ed',
      labelText: '#c2410c',
      axisBg: 'rgba(240, 240, 244, 0.85)',
      axisTick: 'rgba(0, 0, 0, 0.1)',
      axisText: '#7a7a8e',
      canvasBg: '#fafafa',
      channelSep: 'rgba(0, 0, 0, 0.12)',
    };
  }
}
