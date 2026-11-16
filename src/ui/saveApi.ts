/**
 * Save/load contract between the UI and the app shell (src/app / src/save implement it).
 * Slots: 'auto-0'..'auto-2' (rolling autosave), 'quick', 'slot-1'..'slot-8' (any string is accepted).
 */
export type MaybePromise<T> = T | Promise<T>;

export interface SaveSlotInfo {
  slot: string;
  name: string;
  savedAt: number;          // epoch ms
  summary: string;          // e.g. "Fall of France - 14 May 1940 - Germany"
  sizeBytes?: number;
  corrupt?: boolean;
}

export interface SaveApi {
  list(): MaybePromise<SaveSlotInfo[]>;
  save(slot: string, name: string): MaybePromise<void>;
  /** Loads the slot into the running app (shell swaps the engine). */
  load(slot: string): MaybePromise<void>;
  delete(slot: string): MaybePromise<void>;
  /** Triggers a .tcsave download (or resolves a Blob the UI will download). */
  exportSave(slot: string): MaybePromise<Blob | void>;
  importSave(file: File): MaybePromise<SaveSlotInfo | void>;
}

export const SAVE_SLOT_IDS = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5', 'slot-6', 'slot-7', 'slot-8'] as const;
