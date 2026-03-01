// ============================================
// CopyFlow — Storage Unit Tests
// ============================================
// Chrome APIs mocked via vi.stubGlobal.
// crypto + session modules mocked via vi.mock to avoid 200ms PBKDF2 per test.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEncryptionMeta,
  setEncryptionMeta,
  removeEncryptionMeta,
  isEncryptionEnabled,
  getEntries,
  addEntry,
  deleteEntry,
  deleteEntries,
  updateEntry,
  clearAllEntries,
  getSettings,
  updateSettings,
  getStorageUsage,
  getLastClipboard,
  setLastClipboard,
  isLastClipboard,
  exportData,
  importData,
  migrateToEncrypted,
  migrateToPlaintext,
  STORAGE_QUOTA_BYTES,
  STORAGE_QUOTA_WARN_THRESHOLD,
} from './storage';
import { encryptPayload, decryptPayload, hashContent } from './crypto';
import { getSessionKey } from './session';
import type { ClipboardEntry, EncryptionMeta, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// --- Module mocks (hoisted before imports by Vitest transform) ---

vi.mock('./crypto', () => ({
  encryptPayload: vi.fn(),
  decryptPayload: vi.fn(),
  hashContent: vi.fn(),
}));

vi.mock('./session', () => ({
  getSessionKey: vi.fn(),
  isUnlocked: vi.fn(),
}));

// --- Chrome storage in-memory mock ---

let localStore: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      }),
      remove: vi.fn(async (key: string | string[]) => {
        const keys = typeof key === 'string' ? [key] : key;
        for (const k of keys) delete localStore[k];
      }),
      getBytesInUse: vi.fn(async () => 1024),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
};

// --- Entry factory ---

function makeEntry(overrides: Partial<ClipboardEntry> = {}): ClipboardEntry {
  return {
    id: 'test-id-1',
    content: 'hello world',
    type: 'text',
    timestamp: 1_000_000,
    pinned: false,
    ...overrides,
  };
}

const ENCRYPTION_META: EncryptionMeta = { version: 1, salt: 'salt-value', passwordHash: 'hash-value' };

// --- Setup / teardown ---

beforeEach(() => {
  localStore = {};

  // Reset chrome mock implementations each test (in case a test overrode them)
  mockChrome.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(localStore, items);
  });

  vi.stubGlobal('chrome', mockChrome);

  // Default: identity-transform encryption (simple base64 wrap/unwrap)
  vi.mocked(encryptPayload).mockImplementation(async (_key, plaintext) => ({
    iv: 'mock-iv',
    ciphertext: btoa(plaintext),
  }));
  vi.mocked(decryptPayload).mockImplementation(async (_key, _iv, ciphertext) => atob(ciphertext));
  vi.mocked(hashContent).mockImplementation(async (content) => `hash:${content}`);
  vi.mocked(getSessionKey).mockResolvedValue({} as CryptoKey);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ============================================
// Constants
// ============================================

describe('storage constants', () => {
  it('STORAGE_QUOTA_BYTES is 5 MB', () => {
    expect(STORAGE_QUOTA_BYTES).toBe(5_242_880);
  });

  it('STORAGE_QUOTA_WARN_THRESHOLD is 0.8', () => {
    expect(STORAGE_QUOTA_WARN_THRESHOLD).toBe(0.8);
  });
});

// ============================================
// Encryption Meta
// ============================================

describe('getEncryptionMeta', () => {
  it('returns null when nothing stored', async () => {
    expect(await getEncryptionMeta()).toBeNull();
  });

  it('returns the stored EncryptionMeta object', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    expect(await getEncryptionMeta()).toEqual(ENCRYPTION_META);
  });
});

describe('setEncryptionMeta', () => {
  it('writes meta under the correct storage key', async () => {
    await setEncryptionMeta(ENCRYPTION_META);
    expect(localStore['copyflow_encryption_meta']).toEqual(ENCRYPTION_META);
  });
});

describe('removeEncryptionMeta', () => {
  it('deletes the encryption meta key from storage', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    await removeEncryptionMeta();
    expect(localStore['copyflow_encryption_meta']).toBeUndefined();
  });
});

describe('isEncryptionEnabled', () => {
  it('returns false when no meta stored', async () => {
    expect(await isEncryptionEnabled()).toBe(false);
  });

  it('returns true when meta is stored', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    expect(await isEncryptionEnabled()).toBe(true);
  });
});

// ============================================
// Settings
// ============================================

describe('getSettings', () => {
  it('returns DEFAULT_SETTINGS when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored values over defaults', async () => {
    localStore['copyflow_settings'] = { theme: 'dark', maxEntries: 100 };
    const settings = await getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.maxEntries).toBe(100);
    expect(settings.autoDeleteDays).toBe(DEFAULT_SETTINGS.autoDeleteDays);
  });
});

describe('updateSettings', () => {
  it('merges updates into the current settings', async () => {
    await updateSettings({ theme: 'light' });
    const stored = localStore['copyflow_settings'] as Settings;
    expect(stored.theme).toBe('light');
    expect(stored.maxEntries).toBe(DEFAULT_SETTINGS.maxEntries);
  });

  it('does not overwrite keys absent from the update', async () => {
    localStore['copyflow_settings'] = { ...DEFAULT_SETTINGS, maxEntries: 200 };
    await updateSettings({ theme: 'dark' });
    const stored = localStore['copyflow_settings'] as Settings;
    expect(stored.maxEntries).toBe(200);
    expect(stored.theme).toBe('dark');
  });
});

// ============================================
// Last Clipboard / Dedup
// ============================================

describe('getLastClipboard', () => {
  it('returns null when nothing stored', async () => {
    expect(await getLastClipboard()).toBeNull();
  });

  it('returns the stored value', async () => {
    localStore['copyflow_last_clipboard'] = 'my text';
    expect(await getLastClipboard()).toBe('my text');
  });
});

describe('setLastClipboard', () => {
  it('stores raw content when encryption is disabled', async () => {
    await setLastClipboard('raw content');
    expect(localStore['copyflow_last_clipboard']).toBe('raw content');
    expect(hashContent).not.toHaveBeenCalled();
  });

  it('stores hash when encryption is enabled', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    await setLastClipboard('sensitive');
    expect(hashContent).toHaveBeenCalledWith('sensitive');
    expect(localStore['copyflow_last_clipboard']).toBe('hash:sensitive');
  });
});

describe('isLastClipboard', () => {
  it('returns false when nothing is stored', async () => {
    expect(await isLastClipboard('anything')).toBe(false);
  });

  it('returns true for matching content in plaintext mode', async () => {
    localStore['copyflow_last_clipboard'] = 'my text';
    expect(await isLastClipboard('my text')).toBe(true);
  });

  it('returns false for non-matching content in plaintext mode', async () => {
    localStore['copyflow_last_clipboard'] = 'my text';
    expect(await isLastClipboard('other text')).toBe(false);
  });

  it('returns true for matching content in encrypted mode (compares hashes)', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    localStore['copyflow_last_clipboard'] = 'hash:my text';
    expect(await isLastClipboard('my text')).toBe(true);
  });

  it('returns false for non-matching content in encrypted mode', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    localStore['copyflow_last_clipboard'] = 'hash:other text';
    expect(await isLastClipboard('my text')).toBe(false);
  });
});

// ============================================
// getEntries
// ============================================

describe('getEntries — no encryption', () => {
  it('returns empty array when storage is empty', async () => {
    expect(await getEntries()).toEqual([]);
  });

  it('returns raw plaintext entries', async () => {
    localStore['copyflow_entries'] = [makeEntry()];
    const result = await getEntries();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hello world');
  });
});

describe('getEntries — encryption enabled, unlocked', () => {
  beforeEach(() => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
  });

  it('calls decryptPayload for each encrypted entry and returns decrypted data', async () => {
    const payload = JSON.stringify({ content: 'secret', imageDataUrl: null, sourceUrl: null, sourceTitle: null });
    localStore['copyflow_entries'] = [{
      id: 'e1', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'mock-iv', ciphertext: btoa(payload) },
    }];
    const result = await getEntries();
    expect(decryptPayload).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('secret');
    expect((result[0] as any).encrypted).toBeUndefined();
  });

  it('skips corrupted entries that fail decryption', async () => {
    localStore['copyflow_entries'] = [{
      id: 'bad', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'bad-iv', ciphertext: 'bad' },
    }];
    vi.mocked(decryptPayload).mockRejectedValueOnce(new Error('Decryption failed'));
    expect(await getEntries()).toHaveLength(0);
  });
});

describe('getEntries — encryption enabled, locked', () => {
  it('returns empty array when session key is missing', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    // Need at least one entry so getEntries() doesn't return early before calling getSessionKey
    localStore['copyflow_entries'] = [{
      id: 'enc-1', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'iv', ciphertext: 'ct' },
    }];
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    expect(await getEntries()).toEqual([]);
  });
});

// ============================================
// addEntry
// ============================================

describe('addEntry — no encryption', () => {
  it('adds entry to empty store', async () => {
    await addEntry(makeEntry());
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('hello world');
  });

  it('prepends new entry (newest first)', async () => {
    await addEntry(makeEntry({ id: 'id-1', content: 'first' }));
    await addEntry(makeEntry({ id: 'id-2', content: 'second' }));
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored[0].content).toBe('second');
    expect(stored[1].content).toBe('first');
  });

  it('deduplicates: does not add if same content as most recent', async () => {
    await addEntry(makeEntry({ id: 'id-1' }));
    await addEntry(makeEntry({ id: 'id-2' })); // same content 'hello world'
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(1);
  });

  it('deduplicates: adds if content differs', async () => {
    await addEntry(makeEntry({ id: 'id-1', content: 'first' }));
    await addEntry(makeEntry({ id: 'id-2', content: 'second' }));
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(2);
  });

  it('rejects oversized entries (content > 500 KB)', async () => {
    await addEntry(makeEntry({ content: 'x'.repeat(500 * 1024 + 1) }));
    expect(localStore['copyflow_entries']).toBeUndefined();
  });

  it('strips invalid imageDataUrl (SVG blocked)', async () => {
    await addEntry(makeEntry({ type: 'image', imageDataUrl: 'data:image/svg+xml;base64,abc' }));
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored[0].imageDataUrl).toBeUndefined();
  });

  it('preserves valid imageDataUrl (PNG allowed)', async () => {
    await addEntry(makeEntry({ type: 'image', imageDataUrl: 'data:image/png;base64,abc' }));
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored[0].imageDataUrl).toBe('data:image/png;base64,abc');
  });

  it('enforces maxEntries — removes oldest unpinned when over limit', async () => {
    localStore['copyflow_settings'] = { ...DEFAULT_SETTINGS, maxEntries: 2 };
    await addEntry(makeEntry({ id: 'id-1', content: 'first' }));
    await addEntry(makeEntry({ id: 'id-2', content: 'second' }));
    await addEntry(makeEntry({ id: 'id-3', content: 'third' }));
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(2);
    expect(stored.map((e) => e.content)).toEqual(['third', 'second']);
  });

  it('sets copyflow_quota_exceeded flag on storage write failure', async () => {
    mockChrome.storage.local.set.mockRejectedValueOnce(new Error('QuotaExceededError'));
    await addEntry(makeEntry());
    expect(localStore['copyflow_quota_exceeded']).toBe(true);
  });
});

describe('addEntry — encryption enabled, unlocked', () => {
  it('encrypts entry before writing — stores EncryptedEntry, no plaintext content', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    vi.mocked(getSessionKey).mockImplementation(async () => ({} as CryptoKey));
    await addEntry(makeEntry());
    const stored = localStore['copyflow_entries'] as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0].encrypted).toBeDefined();
    expect(stored[0].encrypted.iv).toBe('mock-iv');
    expect(stored[0].content).toBeUndefined();
    expect(encryptPayload).toHaveBeenCalledTimes(1);
  });
});

describe('addEntry — encryption enabled, locked', () => {
  it('drops entry silently when session key is missing', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    await addEntry(makeEntry());
    expect(localStore['copyflow_entries']).toBeUndefined();
  });
});

// ============================================
// deleteEntry / deleteEntries
// ============================================

describe('deleteEntry', () => {
  it('removes the entry with matching id', async () => {
    localStore['copyflow_entries'] = [
      makeEntry({ id: 'id-1', content: 'keep' }),
      makeEntry({ id: 'id-2', content: 'delete me' }),
    ];
    await deleteEntry('id-2');
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('id-1');
  });

  it('is a no-op when id does not exist', async () => {
    localStore['copyflow_entries'] = [makeEntry()];
    await deleteEntry('nonexistent');
    expect((localStore['copyflow_entries'] as ClipboardEntry[])).toHaveLength(1);
  });

  it('works on encrypted entries (id is plaintext)', async () => {
    localStore['copyflow_entries'] = [
      { id: 'enc-1', type: 'text', timestamp: 1000, pinned: false, encrypted: { iv: 'iv', ciphertext: 'ct' } },
      { id: 'enc-2', type: 'text', timestamp: 2000, pinned: false, encrypted: { iv: 'iv', ciphertext: 'ct' } },
    ];
    await deleteEntry('enc-1');
    const stored = localStore['copyflow_entries'] as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('enc-2');
  });
});

describe('deleteEntries', () => {
  it('removes all entries whose id is in the array', async () => {
    localStore['copyflow_entries'] = [
      makeEntry({ id: 'id-1', content: 'a' }),
      makeEntry({ id: 'id-2', content: 'b' }),
      makeEntry({ id: 'id-3', content: 'c' }),
    ];
    await deleteEntries(['id-1', 'id-3']);
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('id-2');
  });
});

// ============================================
// updateEntry
// ============================================

describe('updateEntry — no encryption', () => {
  it('merges updates into the matching entry', async () => {
    localStore['copyflow_entries'] = [makeEntry({ id: 'id-1', pinned: false })];
    await updateEntry('id-1', { pinned: true });
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored[0].pinned).toBe(true);
    expect(stored[0].content).toBe('hello world');
  });

  it('is a no-op when id does not exist', async () => {
    localStore['copyflow_entries'] = [makeEntry({ id: 'id-1', pinned: false })];
    await updateEntry('nonexistent', { pinned: true });
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored[0].pinned).toBe(false);
  });
});

describe('updateEntry — encryption enabled, locked', () => {
  it('does nothing when session key is missing', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    localStore['copyflow_entries'] = [makeEntry()];
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    await updateEntry('test-id-1', { pinned: true });
    // Storage should not have been written (set not called for entries)
    const setCalls = mockChrome.storage.local.set.mock.calls;
    expect(setCalls.every((args) => !('copyflow_entries' in args[0]))).toBe(true);
  });
});

// ============================================
// clearAllEntries
// ============================================

describe('clearAllEntries', () => {
  it('writes an empty array to storage', async () => {
    localStore['copyflow_entries'] = [makeEntry(), makeEntry({ id: 'id-2', content: 'b' })];
    await clearAllEntries();
    expect(localStore['copyflow_entries']).toEqual([]);
  });
});

// ============================================
// getStorageUsage
// ============================================

describe('getStorageUsage', () => {
  it('returns bytesUsed from getBytesInUse and totalEntries count', async () => {
    localStore['copyflow_entries'] = [makeEntry(), makeEntry({ id: 'id-2', content: 'b' })];
    const result = await getStorageUsage();
    expect(result.bytesUsed).toBe(1024);
    expect(result.totalEntries).toBe(2);
  });

  it('returns totalEntries = 0 for empty store', async () => {
    const result = await getStorageUsage();
    expect(result.totalEntries).toBe(0);
  });
});

// ============================================
// exportData
// ============================================

describe('exportData', () => {
  it('returns valid JSON with version, exportedAt, entries, folders, settings', async () => {
    localStore['copyflow_entries'] = [makeEntry()];
    const json = await exportData();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.folders).toEqual([]);
    expect(parsed.settings).toMatchObject({ theme: DEFAULT_SETTINGS.theme });
  });

  it('decrypts entries before exporting (calls getEntries, not raw storage)', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    const payload = JSON.stringify({ content: 'private', imageDataUrl: null, sourceUrl: null, sourceTitle: null });
    localStore['copyflow_entries'] = [{
      id: 'e1', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'mock-iv', ciphertext: btoa(payload) },
    }];
    const json = await exportData();
    const parsed = JSON.parse(json);
    expect(parsed.entries[0].content).toBe('private');
    expect(parsed.entries[0].encrypted).toBeUndefined();
  });
});

// ============================================
// importData
// ============================================

describe('importData', () => {
  it('throws on invalid structure (no entries field)', async () => {
    await expect(importData(JSON.stringify({ version: 1 }))).rejects.toThrow('Invalid CopyFlow backup file');
  });

  it('filters out entries missing required id field', async () => {
    const bad = { content: 'hi', type: 'text', timestamp: 1000, pinned: false };
    const result = await importData(JSON.stringify({ entries: [bad] }));
    expect(result.entriesImported).toBe(0);
  });

  it('filters out entries with id too long (>= 200 chars)', async () => {
    const bad = makeEntry({ id: 'x'.repeat(200) });
    const result = await importData(JSON.stringify({ entries: [bad] }));
    expect(result.entriesImported).toBe(0);
  });

  it('filters out entries with content over 500 KB', async () => {
    const bad = makeEntry({ content: 'x'.repeat(500 * 1024 + 1) });
    const result = await importData(JSON.stringify({ entries: [bad] }));
    expect(result.entriesImported).toBe(0);
  });

  it('filters out entries with SVG imageDataUrl', async () => {
    const bad = makeEntry({ id: 'id-1', type: 'image', imageDataUrl: 'data:image/svg+xml;base64,abc' });
    const result = await importData(JSON.stringify({ entries: [bad] }));
    expect(result.entriesImported).toBe(0);
  });

  it('imports valid entries and deduplicates against existing by content', async () => {
    localStore['copyflow_entries'] = [makeEntry({ id: 'existing-id', content: 'existing' })];
    const newEntry = makeEntry({ id: 'new-id', content: 'new content' });
    const duplicate = makeEntry({ id: 'dup-id', content: 'existing' });
    const result = await importData(JSON.stringify({ entries: [newEntry, duplicate] }));
    expect(result.entriesImported).toBe(1);
  });

  it('sanitizes settings — imports safe fields, skips passwordEnabled and autoLockMinutes', async () => {
    const settings = { theme: 'dark', maxEntries: 999, passwordEnabled: true, autoLockMinutes: 60 };
    await importData(JSON.stringify({ entries: [makeEntry()], settings }));
    const stored = localStore['copyflow_settings'] as Settings;
    expect(stored.theme).toBe('dark');
    expect(stored.maxEntries).toBe(999);
    expect(stored.passwordEnabled).toBe(false);  // from DEFAULT_SETTINGS, not imported
    expect(stored.autoLockMinutes).toBe(0);       // from DEFAULT_SETTINGS, not imported
  });

  it('throws "Extension is locked" when encryption enabled but no session key', async () => {
    localStore['copyflow_encryption_meta'] = ENCRYPTION_META;
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    await expect(importData(JSON.stringify({ entries: [makeEntry()] }))).rejects.toThrow('Extension is locked');
  });
});

// ============================================
// Migration
// ============================================

describe('migrateToEncrypted', () => {
  it('encrypts all plaintext entries and writes EncryptedEntry[]', async () => {
    localStore['copyflow_entries'] = [
      makeEntry({ id: 'id-1', content: 'entry one' }),
      makeEntry({ id: 'id-2', content: 'entry two' }),
    ];
    await migrateToEncrypted({} as CryptoKey);
    const stored = localStore['copyflow_entries'] as any[];
    expect(stored).toHaveLength(2);
    expect(stored[0].encrypted).toBeDefined();
    expect(stored[0].encrypted.iv).toBe('mock-iv');
    expect(stored[0].content).toBeUndefined();
    expect(encryptPayload).toHaveBeenCalledTimes(2);
  });
});

describe('migrateToPlaintext', () => {
  it('decrypts all EncryptedEntry[] back to ClipboardEntry[]', async () => {
    const payload = JSON.stringify({ content: 'entry one', imageDataUrl: null, sourceUrl: null, sourceTitle: null });
    localStore['copyflow_entries'] = [{
      id: 'id-1', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'mock-iv', ciphertext: btoa(payload) },
    }];
    await migrateToPlaintext({} as CryptoKey);
    const stored = localStore['copyflow_entries'] as ClipboardEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('entry one');
    expect((stored[0] as any).encrypted).toBeUndefined();
  });

  it('skips entries that fail decryption', async () => {
    localStore['copyflow_entries'] = [{
      id: 'bad', type: 'text', timestamp: 1000, pinned: false,
      encrypted: { iv: 'bad-iv', ciphertext: 'bad' },
    }];
    vi.mocked(decryptPayload).mockRejectedValueOnce(new Error('bad decrypt'));
    await migrateToPlaintext({} as CryptoKey);
    expect(localStore['copyflow_entries']).toHaveLength(0);
  });
});
