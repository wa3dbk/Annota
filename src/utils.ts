// ===== Utility Functions =====

import type { ColorMapFn } from './types';

/**
 * Format seconds to mm:ss.ms or hh:mm:ss.ms
 */
export function formatTime(seconds: number, precision: number = 3): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ms = s.toFixed(precision);
  const pad = ms.indexOf('.') === 1 ? '0' : '';
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${pad}${ms}`;
  }
  return `${m}:${pad}${ms}`;
}

/**
 * Format short time for ruler ticks
 */
export function formatTimeShort(seconds: number): string {
  if (seconds < 60) {
    return seconds.toFixed(seconds % 1 === 0 ? 0 : 1) + 's';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return function (this: unknown, ...args: Parameters<T>) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0;
  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another
 */
export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

/**
 * Convert dB to linear amplitude
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear amplitude to dB
 */
export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Spectrogram color maps
 * Returns [r, g, b] for a normalized value 0..1
 */
export const ColorMaps: Record<string, ColorMapFn> = {
  magma(t: number): [number, number, number] {
    t = clamp(t, 0, 1);
    if (t < 0.25) {
      const s = t / 0.25;
      return [lerp(0, 40, s), lerp(0, 10, s), lerp(4, 60, s)];
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [lerp(40, 150, s), lerp(10, 20, s), lerp(60, 100, s)];
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [lerp(150, 240, s), lerp(20, 100, s), lerp(100, 50, s)];
    } else {
      const s = (t - 0.75) / 0.25;
      return [lerp(240, 252, s), lerp(100, 230, s), lerp(50, 150, s)];
    }
  },

  viridis(t: number): [number, number, number] {
    t = clamp(t, 0, 1);
    if (t < 0.25) {
      const s = t / 0.25;
      return [lerp(68, 59, s), lerp(1, 82, s), lerp(84, 139, s)];
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [lerp(59, 33, s), lerp(82, 145, s), lerp(139, 140, s)];
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [lerp(33, 94, s), lerp(145, 201, s), lerp(140, 98, s)];
    } else {
      const s = (t - 0.75) / 0.25;
      return [lerp(94, 253, s), lerp(201, 231, s), lerp(98, 37, s)];
    }
  },

  inferno(t: number): [number, number, number] {
    t = clamp(t, 0, 1);
    if (t < 0.33) {
      const s = t / 0.33;
      return [lerp(0, 120, s), lerp(0, 15, s), lerp(4, 80, s)];
    } else if (t < 0.66) {
      const s = (t - 0.33) / 0.33;
      return [lerp(120, 230, s), lerp(15, 75, s), lerp(80, 15, s)];
    } else {
      const s = (t - 0.66) / 0.34;
      return [lerp(230, 252, s), lerp(75, 255, s), lerp(15, 164, s)];
    }
  }
};

/**
 * Setup HiDPI canvas
 */
export function setupHiDPICanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

/**
 * Get CSS pixel dimensions of an element
 */
export function getElementSize(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  return { width: Math.floor(rect.width), height: Math.floor(rect.height) };
}

/**
 * Generate a unique ID
 */
let _idCounter = 0;
export function uniqueId(prefix: string = 'id'): string {
  return `${prefix}_${++_idCounter}_${Date.now().toString(36)}`;
}
