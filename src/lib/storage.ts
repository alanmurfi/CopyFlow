// ============================================
// CopyFlow — Chrome Storage Wrapper
// ============================================

import type { ClipboardEntry, Folder, Settings, DEFAULT_SETTINGS } from '../types';

const STORAGE_KEYS = {
  entries: 'copyflow_entries',
  folders: 'copyflow_folders',
  settings: 'copyflow_settings',
  lastClipboard: 'copyflow_last_clipboard',
} as const;

// --- Constants ---

const MAX_ENTRY_SIZE_BYTES = 500 * 1024; // 500 KB per entry

// --- Entries ---

export async function getEntries(): Promise<ClipboardEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.entries);
  return result[STORAGE_KEYS.entries] ?? [];
}

export async function addEntry(entry: ClipboardEntry): Promise<void> {
  // Reject oversized entries
  if (entry.content && entry.content.length > MAX_ENTRY_SIZE_BYTES) {
    console.debug('CopyFlow: Entry too large, skipping');
    return;
  }

  const entries = await getEntries();

  // Deduplicate: don't add if same content as most recent
  if (entries.length > 0 && entries[0].content === entry.content && entries[0].type === entry.type) {
    return;
  }

  // Add to front (newest first)
  entries.unshift(entry);

  // Enforce max entries limit
  const settings = await getSettings();
  const maxEntries = Math.max(settings.maxEntries || 500, 1); // floor at 1 to prevent loop
  while (entries.length > maxEntries) {
    // Remove oldest unpinned entry
    const lastUnpinnedIndex = entries.findLastIndex((e) => !e.pinned);
    if (lastUnpinnedIndex !== -1) {
      entries.splice(lastUnpinnedIndex, 1);
    } else {
      // All pinned — remove last anyway
      entries.pop();
    }
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
  } catch (err) {
    console.error('CopyFlow: Storage write failed (quota?):', err);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await getEntries();
  const filtered = entries.filter((e) => e.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: filtered });
}

export async function updateEntry(id: string, updates: Partial<ClipboardEntry>): Promise<void> {
  const entries = await getEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index !== -1) {
    entries[index] = { ...entries[index], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
  }
}

export async function clearAllEntries(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: [] });
}

// --- Folders ---

export async function getFolders(): Promise<Folder[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.folders);
  return result[STORAGE_KEYS.folders] ?? [];
}

export async function addFolder(folder: Folder): Promise<void> {
  const folders = await getFolders();
  folders.push(folder);
  await chrome.storage.local.set({ [STORAGE_KEYS.folders]: folders });
}

export async function deleteFolder(id: string): Promise<void> {
  const folders = await getFolders();
  const filtered = folders.filter((f) => f.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.folders]: filtered });

  // Remove folder assignment from entries
  const entries = await getEntries();
  const updated = entries.map((e) =>
    e.folderId === id ? { ...e, folderId: undefined } : e
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: updated });
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return result[STORAGE_KEYS.settings] ?? {
    theme: 'system',
    maxEntries: 500,
    autoDeleteDays: 30,
    keyboardShortcutEnabled: true,
  };
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  const settings = await getSettings();
  const merged = { ...settings, ...updates };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged });
}

// --- Last clipboard (for dedup) ---

export async function getLastClipboard(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.lastClipboard);
  return result[STORAGE_KEYS.lastClipboard] ?? null;
}

export async function setLastClipboard(content: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastClipboard]: content });
}

// --- Storage stats ---

export async function getStorageUsage(): Promise<{ bytesUsed: number; totalEntries: number }> {
  const bytesUsed = await chrome.storage.local.getBytesInUse();
  const entries = await getEntries();
  return { bytesUsed, totalEntries: entries.length };
}

// --- Export / Import ---

export async function exportData(): Promise<string> {
  const entries = await getEntries();
  const folders = await getFolders();
  const settings = await getSettings();
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries, folders, settings }, null, 2);
}

// Validate a single imported entry against expected schema
function isValidEntry(e: unknown): e is ClipboardEntry {
  if (typeof e !== 'object' || e === null) return false;
  const entry = e as Record<string, unknown>;
  return (
    typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length < 200 &&
    typeof entry.content === 'string' && entry.content.length <= MAX_ENTRY_SIZE_BYTES &&
    (entry.type === 'text' || entry.type === 'image') &&
    typeof entry.timestamp === 'number' && entry.timestamp > 0 &&
    typeof entry.pinned === 'boolean' &&
    (entry.imageDataUrl === undefined || entry.imageDataUrl === null ||
      (typeof entry.imageDataUrl === 'string' && entry.imageDataUrl.startsWith('data:image/'))) &&
    (entry.sourceUrl === undefined || entry.sourceUrl === null || typeof entry.sourceUrl === 'string') &&
    (entry.sourceTitle === undefined || entry.sourceTitle === null || typeof entry.sourceTitle === 'string')
  );
}

// Validate imported settings — only allow known safe fields
function sanitizeSettings(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const s = raw as Record<string, unknown>;
  const safe: Partial<Settings> = {};
  if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') safe.theme = s.theme;
  if (typeof s.maxEntries === 'number' && s.maxEntries >= 1 && s.maxEntries <= 10000) safe.maxEntries = s.maxEntries;
  if (typeof s.autoDeleteDays === 'number' && s.autoDeleteDays >= 0 && s.autoDeleteDays <= 365) safe.autoDeleteDays = s.autoDeleteDays;
  if (typeof s.keyboardShortcutEnabled === 'boolean') safe.keyboardShortcutEnabled = s.keyboardShortcutEnabled;
  return safe;
}

export async function importData(json: string): Promise<{ entriesImported: number }> {
  const data = JSON.parse(json);
  if (!data.entries || !Array.isArray(data.entries)) {
    throw new Error('Invalid CopyFlow backup file');
  }

  // Validate each entry against schema — reject invalid ones
  const validEntries = data.entries.filter(isValidEntry);

  // Merge: add imported entries that don't already exist (by content match)
  const existing = await getEntries();
  const existingContents = new Set(existing.map((e) => e.content));
  const newEntries = validEntries.filter((e) => !existingContents.has(e.content));

  // Enforce max entries after merge
  const settings = await getSettings();
  const maxEntries = Math.max(settings.maxEntries || 500, 1);
  const merged = [...existing, ...newEntries].slice(0, maxEntries);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.entries]: merged });
  } catch (err) {
    throw new Error('Import failed: storage quota exceeded');
  }

  // Import settings if present — sanitize each field
  if (data.settings) {
    const safe = sanitizeSettings(data.settings);
    if (Object.keys(safe).length > 0) {
      await updateSettings(safe);
    }
  }

  return { entriesImported: newEntries.length };
}
