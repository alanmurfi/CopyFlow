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
  passwordEnabled: boolean;
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  maxEntries: 500,
  autoDeleteDays: 30,
  keyboardShortcutEnabled: true,
  passwordEnabled: false,
  autoLockMinutes: 0,
};

// Encrypted payload stored per-entry when encryption is enabled
export interface EncryptedPayload {
  iv: string;        // base64, 12-byte AES-GCM nonce
  ciphertext: string; // base64
}

// Entry as stored in chrome.storage.local when encryption is enabled.
// Sensitive fields (content, imageDataUrl, sourceUrl, sourceTitle) are
// bundled into a single encrypted JSON blob.
export interface EncryptedEntry {
  id: string;
  type: 'text' | 'image';
  timestamp: number;
  pinned: boolean;
  folderId?: string;
  encrypted: EncryptedPayload;
}

// Stored in chrome.storage.local alongside encrypted entries
export interface EncryptionMeta {
  version: 1;
  salt: string;          // base64, 16-byte PBKDF2 salt
  passwordHash: string;  // base64, verification hash (different derivation purpose than encryption key)
}

// --- Snippets (paid feature) ---

export interface Snippet {
  id: string;
  shortcut: string;    // e.g., ";sig", "/addr"
  title: string;
  content: string;     // template body with {{vars}}
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedSnippet {
  id: string;
  shortcut: string;    // stays plaintext for matching in content script
  createdAt: number;
  updatedAt: number;
  encrypted: EncryptedPayload;  // title + content encrypted together
}

// --- Feature flags ---

export interface FeatureFlags {
  snippetsEnabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  snippetsEnabled: true,
};

// Message types for service worker <-> offscreen/popup communication
export type MessageType =
  | { type: 'READ_CLIPBOARD' }
  | { type: 'WRITE_CLIPBOARD'; text: string }
  | { type: 'CLIPBOARD_DATA'; entry: ClipboardEntry | null }
  | { type: 'COPY_TO_CLIPBOARD'; text: string }
  | { type: 'LOCK_EXTENSION' }
  | { type: 'UNLOCK_EXTENSION'; password: string }
  | { type: 'GET_SNIPPETS' }
  | { type: 'EXPAND_SNIPPET'; shortcut: string }
  | { type: 'COPYFLOW_SNIPPETS_UPDATED' }
  | { type: 'SNIPPETS_CHANGED' }
  | { type: 'COPYFLOW_INSECURE_PASTE_WARNING'; entryContent: string }
  | { type: 'COPYFLOW_CONFIRM_INSECURE_PASTE'; content: string };

export interface StorageData {
  entries: ClipboardEntry[];
  folders: Folder[];
  settings: Settings;
}
