// ============================================
// CopyFlow — Core Type Definitions
// ============================================

export interface ClipboardEntry {
  id: string;
  content: string;
  type: 'text' | 'image';
  imageDataUrl?: string;
  timestamp: number;
  sourceUrl?: string;
  sourceTitle?: string;
  pinned: boolean;
  folderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  maxEntries: number;
  autoDeleteDays: number;
  keyboardShortcutEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  maxEntries: 500,
  autoDeleteDays: 30,
  keyboardShortcutEnabled: true,
};

// Message types for service worker <-> offscreen communication
export type MessageType =
  | { type: 'READ_CLIPBOARD' }
  | { type: 'WRITE_CLIPBOARD'; text: string }
  | { type: 'CLIPBOARD_DATA'; entry: ClipboardEntry | null }
  | { type: 'COPY_TO_CLIPBOARD'; text: string };

export interface StorageData {
  entries: ClipboardEntry[];
  folders: Folder[];
  settings: Settings;
}
