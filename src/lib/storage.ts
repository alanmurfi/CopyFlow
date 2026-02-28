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

// --- Entries ---

export async function getEntries(): Promise<ClipboardEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.entries);
  return result[STORAGE_KEYS.entries] ?? [];
}

export async function addEntry(entry: ClipboardEntry): Promise<void> {
  const entries = await getEntries();

  // Deduplicate: don't add if same content as most recent
  if (entries.length > 0 && entries[0].content === entry.content && entries[0].type === entry.type) {
    return;
  }

  // Add to front (newest first)
  entries.unshift(entry);

  // Enforce max entries limit
  const settings = await getSettings();
  const maxEntries = settings.maxEntries || 500;
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

  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
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

export async function importData(json: string): Promise<{ entriesImported: number }> {
  const data = JSON.parse(json);
  if (!data.entries || !Array.isArray(data.entries)) {
    throw new Error('Invalid CopyFlow backup file');
  }

  // Merge: add imported entries that don't already exist (by content match)
  const existing = await getEntries();
  const existingContents = new Set(existing.map((e) => e.content));
  const newEntries = data.entries.filter((e: ClipboardEntry) => !existingContents.has(e.content));

  const merged = [...existing, ...newEntries];
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: merged });

  // Import settings if present
  if (data.settings) {
    await updateSettings(data.settings);
  }

  return { entriesImported: newEntries.length };
}
