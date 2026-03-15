// ============================================
// CopyFlow — Chrome Storage Wrapper
// ============================================

import type { ClipboardEntry, Folder, Settings, EncryptedEntry, EncryptionMeta, TrustedDomain } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { encryptPayload, decryptPayload, hashContent } from './crypto';
import { getSessionKey, isUnlocked } from './session';
import { detectContentType } from './detect';

const STORAGE_KEYS = {
  entries: 'copyflow_entries',
  folders: 'copyflow_folders',
  settings: 'copyflow_settings',
  lastClipboard: 'copyflow_last_clipboard',
  encryptionMeta: 'copyflow_encryption_meta',
  quotaExceeded: 'copyflow_quota_exceeded',
  trustedDomains: 'copyflow_trusted_domains',
} as const;

// --- Constants ---

const MAX_TEXT_SIZE_BYTES = 500 * 1024;   // 500 KB per text entry
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image entry (unlimitedStorage)

export const STORAGE_QUOTA_BYTES = 52_428_800; // 50 MB soft limit (unlimitedStorage removes Chrome's hard cap)
export const STORAGE_QUOTA_WARN_THRESHOLD = 0.8; // Warn at 80% usage

// Allowed MIME types for image data URIs (SVG excluded to prevent embedded script payloads)
const ALLOWED_IMAGE_DATA_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/webp'];

function isValidImageDataUrl(url: string): boolean {
  return ALLOWED_IMAGE_DATA_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// --- Storage Mutex ---
// chrome.storage.local get+set is not atomic. A promise-based mutex serializes
// all read-modify-write operations on entries to prevent concurrent overwrites.

let _entryMutex: Promise<void> = Promise.resolve();

function withEntryLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const wait = _entryMutex;
  _entryMutex = next;
  return wait.then(fn).finally(() => release!());
}

// --- Encryption helpers ---

export async function getEncryptionMeta(): Promise<EncryptionMeta | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.encryptionMeta);
  return result[STORAGE_KEYS.encryptionMeta] ?? null;
}

export async function setEncryptionMeta(meta: EncryptionMeta): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.encryptionMeta]: meta });
}

export async function removeEncryptionMeta(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.encryptionMeta);
}

export async function isEncryptionEnabled(): Promise<boolean> {
  return (await getEncryptionMeta()) !== null;
}

// Encrypt sensitive fields of an entry into a single ciphertext blob
async function encryptEntry(entry: ClipboardEntry, key: CryptoKey): Promise<EncryptedEntry> {
  const sensitivePayload = JSON.stringify({
    content: entry.content,
    imageDataUrl: entry.imageDataUrl,
    sourceUrl: entry.sourceUrl,
    sourceTitle: entry.sourceTitle,
  });
  const { iv, ciphertext } = await encryptPayload(key, sensitivePayload);
  return {
    id: entry.id,
    type: entry.type,
    timestamp: entry.timestamp,
    pinned: entry.pinned,
    folderId: entry.folderId,
    detectedType: entry.detectedType,
    encrypted: { iv, ciphertext },
  };
}

// Decrypt an encrypted entry back to a full ClipboardEntry
async function decryptEntry(entry: EncryptedEntry, key: CryptoKey): Promise<ClipboardEntry> {
  const json = await decryptPayload(key, entry.encrypted.iv, entry.encrypted.ciphertext);
  const sensitive = JSON.parse(json);
  return {
    id: entry.id,
    type: entry.type,
    timestamp: entry.timestamp,
    pinned: entry.pinned,
    folderId: entry.folderId,
    detectedType: entry.detectedType,
    content: sensitive.content,
    imageDataUrl: sensitive.imageDataUrl,
    sourceUrl: sensitive.sourceUrl,
    sourceTitle: sensitive.sourceTitle,
  };
}

// Check if a raw storage entry is encrypted (has .encrypted field)
function isEncryptedEntry(e: any): e is EncryptedEntry {
  return e && typeof e === 'object' && e.encrypted && typeof e.encrypted.iv === 'string';
}

// Read raw entries from storage without decryption
async function getRawEntries(): Promise<any[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.entries);
  return result[STORAGE_KEYS.entries] ?? [];
}

// Write raw entries to storage (already in final form — plaintext or encrypted)
async function setRawEntries(entries: any[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.entries]: entries });
}

// --- Entries ---

export async function getEntries(): Promise<ClipboardEntry[]> {
  const raw = await getRawEntries();
  if (raw.length === 0) return [];

  const encEnabled = await isEncryptionEnabled();
  if (!encEnabled) {
    return raw as ClipboardEntry[];
  }

  // Encryption is enabled — need the session key
  const key = await getSessionKey();
  if (!key) {
    // Locked — return empty (caller should check isUnlocked() first)
    return [];
  }

  const decrypted: ClipboardEntry[] = [];
  for (const entry of raw) {
    if (isEncryptedEntry(entry)) {
      try {
        decrypted.push(await decryptEntry(entry, key));
      } catch (err) {
        console.error('CopyFlow: Failed to decrypt entry', entry.id, err);
        // Skip corrupted entries rather than crashing
      }
    } else {
      // Plaintext entry in encrypted store (shouldn't happen, but handle gracefully)
      decrypted.push(entry as ClipboardEntry);
    }
  }
  return decrypted;
}

export function addEntry(entry: ClipboardEntry): Promise<void> {
  return withEntryLock(async () => {
    // Reject oversized entries — images use a higher limit than text
    const limit = entry.type === 'image' ? MAX_IMAGE_SIZE_BYTES : MAX_TEXT_SIZE_BYTES;
    const sizeToCheck = entry.type === 'image' && entry.imageDataUrl
      ? entry.imageDataUrl.length
      : entry.content.length;
    if (sizeToCheck > limit) {
      console.error('CopyFlow: Entry too large, skipping. size=' + sizeToCheck + ' limit=' + limit);
      return;
    }

    // Validate imageDataUrl if present
    if (entry.imageDataUrl != null && !isValidImageDataUrl(entry.imageDataUrl)) {
      entry = { ...entry, imageDataUrl: undefined };
    }

    const encEnabled = await isEncryptionEnabled();
    const key = encEnabled ? await getSessionKey() : null;

    if (encEnabled && !key) {
      // Locked — cannot encrypt. Drop the entry silently.
      console.debug('CopyFlow: Locked, skipping new entry');
      return;
    }

    // Auto-detect content type for text entries
    if (entry.type === 'text' && !entry.detectedType) {
      entry = { ...entry, detectedType: detectContentType(entry.content) };
    }

    // Read existing entries (decrypted if encrypted)
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

    // Pre-check: skip write if storage is nearly full (>95% capacity)
    try {
      const bytesUsed = await chrome.storage.local.getBytesInUse();
      if (bytesUsed > STORAGE_QUOTA_BYTES * 0.95) {
        console.debug('CopyFlow: Storage near capacity, skipping new entry');
        await chrome.storage.local.set({ [STORAGE_KEYS.quotaExceeded]: true }).catch(() => {});
        return;
      }
    } catch {
      // getBytesInUse unavailable — proceed with write and let the catch below handle it
    }

    try {
      if (encEnabled && key) {
        const encrypted = await Promise.all(entries.map((e) => encryptEntry(e, key)));
        await setRawEntries(encrypted);
      } else {
        await setRawEntries(entries);
      }
      // Clear quota exceeded flag on successful write
      await chrome.storage.local.set({ [STORAGE_KEYS.quotaExceeded]: false }).catch(() => {});
    } catch (err) {
      console.error('CopyFlow: Storage write failed (quota?):', err);
      // Signal quota exceeded so the UI can warn the user
      await chrome.storage.local.set({ [STORAGE_KEYS.quotaExceeded]: true }).catch(() => {});
    }
  });
}

export function deleteEntry(id: string): Promise<void> {
  return withEntryLock(async () => {
    // id is plaintext even when encrypted — filter on raw storage
    const raw = await getRawEntries();
    const filtered = raw.filter((e: any) => e.id !== id);
    await setRawEntries(filtered);
  });
}

export function deleteEntries(ids: string[]): Promise<void> {
  return withEntryLock(async () => {
    const raw = await getRawEntries();
    const idSet = new Set(ids);
    const filtered = raw.filter((e: any) => !idSet.has(e.id));
    await setRawEntries(filtered);
  });
}

export function updateEntry(id: string, updates: Partial<ClipboardEntry>): Promise<void> {
  return withEntryLock(async () => {
    const encEnabled = await isEncryptionEnabled();
    const key = encEnabled ? await getSessionKey() : null;

    if (encEnabled && !key) {
      console.debug('CopyFlow: Locked, cannot update entry');
      return;
    }

    // Must decrypt, merge, re-encrypt
    const entries = await getEntries();
    const index = entries.findIndex((e) => e.id === id);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      if (encEnabled && key) {
        const encrypted = await Promise.all(entries.map((e) => encryptEntry(e, key)));
        await setRawEntries(encrypted);
      } else {
        await setRawEntries(entries);
      }
    }
  });
}

export async function clearAllEntries(): Promise<void> {
  // No mutex needed — unconditional overwrite, not read-modify-write
  await setRawEntries([]);
}

// --- Migration ---

export async function migrateToEncrypted(key: CryptoKey): Promise<void> {
  return withEntryLock(async () => {
    const raw = await getRawEntries();
    const plaintext = raw as ClipboardEntry[];
    const encrypted = await Promise.all(plaintext.map((e) => encryptEntry(e, key)));
    await setRawEntries(encrypted);
  });
}

export async function migrateToPlaintext(key: CryptoKey): Promise<void> {
  return withEntryLock(async () => {
    const raw = await getRawEntries();
    const decrypted: ClipboardEntry[] = [];
    for (const entry of raw) {
      if (isEncryptedEntry(entry)) {
        try {
          decrypted.push(await decryptEntry(entry, key));
        } catch (err) {
          console.error('CopyFlow: Failed to decrypt during migration', entry.id, err);
        }
      } else {
        decrypted.push(entry as ClipboardEntry);
      }
    }
    await setRawEntries(decrypted);
  });
}

// --- Re-encryption (atomic password change) ---
// Decrypt with old key and re-encrypt with new key in a single write.
// Avoids the plaintext-on-disk window that would occur with migrateToPlaintext + migrateToEncrypted.

export async function reencryptEntries(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  return withEntryLock(async () => {
    const raw = await getRawEntries();
    if (raw.length === 0) return;

    const decrypted: ClipboardEntry[] = [];
    for (const entry of raw) {
      if (isEncryptedEntry(entry)) {
        try {
          decrypted.push(await decryptEntry(entry, oldKey));
        } catch (err) {
          console.error('CopyFlow: Failed to decrypt entry during re-encryption', entry.id, err);
        }
      } else {
        decrypted.push(entry as ClipboardEntry);
      }
    }

    const reencrypted = await Promise.all(decrypted.map((e) => encryptEntry(e, newKey)));
    await setRawEntries(reencrypted);
  });
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
  // For encrypted entries, folderId is plaintext so we can update raw storage
  await withEntryLock(async () => {
    const raw = await getRawEntries();
    const updated = raw.map((e: any) =>
      e.folderId === id ? { ...e, folderId: undefined } : e,
    );
    await setRawEntries(updated);
  });
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] ?? {}) };
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
  // When encryption is enabled, store a hash to prevent plaintext leakage
  const encEnabled = await isEncryptionEnabled();
  const value = encEnabled ? await hashContent(content) : content;
  await chrome.storage.local.set({ [STORAGE_KEYS.lastClipboard]: value });
}

// Compare clipboard content against stored last clipboard value.
// Handles both plaintext and hashed modes.
export async function isLastClipboard(content: string): Promise<boolean> {
  const stored = await getLastClipboard();
  if (stored === null) return false;

  const encEnabled = await isEncryptionEnabled();
  if (encEnabled) {
    const hash = await hashContent(content);
    return hash === stored;
  }
  return content === stored;
}

// --- Storage stats ---

export async function getStorageUsage(): Promise<{ bytesUsed: number; totalEntries: number }> {
  const bytesUsed = await chrome.storage.local.getBytesInUse();
  const raw = await getRawEntries();
  return { bytesUsed, totalEntries: raw.length };
}

// --- Trusted Domains ---

export async function getTrustedDomains(): Promise<TrustedDomain[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.trustedDomains);
  return result[STORAGE_KEYS.trustedDomains] ?? [];
}

export async function addTrustedDomain(domain: string): Promise<void> {
  const domains = await getTrustedDomains();
  // Don't add duplicates
  if (domains.some((d) => d.domain === domain)) return;
  domains.push({ domain, trustedAt: Date.now() });
  await chrome.storage.local.set({ [STORAGE_KEYS.trustedDomains]: domains });
}

export async function isDomainTrusted(domain: string): Promise<boolean> {
  const domains = await getTrustedDomains();
  return domains.some((d) => d.domain === domain);
}

export async function removeTrustedDomain(domain: string): Promise<void> {
  const domains = await getTrustedDomains();
  const filtered = domains.filter((d) => d.domain !== domain);
  await chrome.storage.local.set({ [STORAGE_KEYS.trustedDomains]: filtered });
}

// --- Export / Import ---

export async function exportData(): Promise<string> {
  // Always export decrypted data (portable backups not tied to a password)
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
    typeof entry.content === 'string' && entry.content.length <= MAX_TEXT_SIZE_BYTES &&
    (entry.type === 'text' || entry.type === 'image') &&
    typeof entry.timestamp === 'number' && entry.timestamp > 0 &&
    typeof entry.pinned === 'boolean' &&
    (entry.imageDataUrl === undefined || entry.imageDataUrl === null ||
      (typeof entry.imageDataUrl === 'string' && isValidImageDataUrl(entry.imageDataUrl))) &&
    (entry.sourceUrl === undefined || entry.sourceUrl === null || typeof entry.sourceUrl === 'string') &&
    (entry.sourceTitle === undefined || entry.sourceTitle === null || typeof entry.sourceTitle === 'string') &&
    (entry.detectedType === undefined || ['url', 'email', 'code', 'phone', 'color', 'json'].includes(entry.detectedType as string))
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
  // Never import passwordEnabled or autoLockMinutes from backups (security)
  return safe;
}

export async function importData(json: string): Promise<{ entriesImported: number }> {
  const data = JSON.parse(json);
  if (!data.entries || !Array.isArray(data.entries)) {
    throw new Error('Invalid CopyFlow backup file');
  }

  // Validate each entry against schema — reject invalid ones
  const validEntries = data.entries.filter(isValidEntry);

  const encEnabled = await isEncryptionEnabled();
  const key = encEnabled ? await getSessionKey() : null;

  if (encEnabled && !key) {
    throw new Error('Extension is locked. Unlock before importing.');
  }

  // Strip folderId values that don't exist in the current folder list
  const currentFolders = await getFolders();
  const folderIds = new Set(currentFolders.map((f) => f.id));
  for (const entry of validEntries) {
    if (entry.folderId && !folderIds.has(entry.folderId)) {
      entry.folderId = undefined;
    }
    // Backfill detectedType for imported entries that don't have it
    if (entry.type === 'text' && !entry.detectedType) {
      entry.detectedType = detectContentType(entry.content);
    }
  }

  // Merge within entry lock to prevent races with polling
  const newCount = await withEntryLock(async () => {
    const existing = await getEntries();
    const existingContents = new Set(existing.map((e) => e.content));
    const newEntries = validEntries.filter((e) => !existingContents.has(e.content));

    // Enforce max entries after merge
    const settings = await getSettings();
    const maxEntries = Math.max(settings.maxEntries || 500, 1);
    const merged = [...existing, ...newEntries].slice(0, maxEntries);

    try {
      if (encEnabled && key) {
        const encrypted = await Promise.all(merged.map((e) => encryptEntry(e, key)));
        await setRawEntries(encrypted);
      } else {
        await setRawEntries(merged);
      }
    } catch (err) {
      throw new Error('Import failed: storage quota exceeded');
    }

    return newEntries.length;
  });

  // Import settings if present — sanitize each field
  if (data.settings) {
    const safe = sanitizeSettings(data.settings);
    if (Object.keys(safe).length > 0) {
      await updateSettings(safe);
    }
  }

  return { entriesImported: newCount };
}
