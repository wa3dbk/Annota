// ===== Project Save/Load via IndexedDB =====

import type { ProjectSaveData, SerializedAudioBuffer } from './types';

export class ProjectManager {
  readonly DB_NAME = 'annota_projects';
  readonly DB_VERSION = 1;
  readonly STORE_NAME = 'projects';
  readonly AUTOSAVE_KEY = '__autosave__';
  private _db: IDBDatabase | null = null;
  private _autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  private async _openDB(): Promise<IDBDatabase> {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        this._db = (e.target as IDBOpenDBRequest).result;
        resolve(this._db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async save(key: string, state: ProjectSaveData): Promise<void> {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      tx.objectStore(this.STORE_NAME).put(state, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(key: string): Promise<ProjectSaveData | null> {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const req = tx.objectStore(this.STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      tx.objectStore(this.STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listKeys(): Promise<string[]> {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const req = tx.objectStore(this.STORE_NAME).getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]).filter(k => k !== this.AUTOSAVE_KEY));
      req.onerror = () => reject(req.error);
    });
  }

  startAutoSave(getState: () => ProjectSaveData | null, intervalMs: number = 30000): void {
    this.stopAutoSave();
    this._autoSaveTimer = setInterval(async () => {
      try {
        const state = getState();
        if (state && state.audio) {
          await this.save(this.AUTOSAVE_KEY, state);
        }
      } catch (e) {
        console.warn('Auto-save failed:', e);
      }
    }, intervalMs);
  }

  stopAutoSave(): void {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  async hasAutoSave(): Promise<boolean> {
    const data = await this.load(this.AUTOSAVE_KEY);
    return data != null;
  }

  static reconstructBuffer(audioContext: AudioContext, savedAudio: SerializedAudioBuffer | null): AudioBuffer | null {
    if (!savedAudio) return null;
    const buf = audioContext.createBuffer(
      savedAudio.numberOfChannels,
      savedAudio.length,
      savedAudio.sampleRate
    );
    for (let ch = 0; ch < savedAudio.numberOfChannels; ch++) {
      buf.getChannelData(ch).set(new Float32Array(savedAudio.channels[ch]));
    }
    return buf;
  }
}
