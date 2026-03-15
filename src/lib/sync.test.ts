// ============================================
// CopyFlow — Sync Unit Tests
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSyncAvailable, pushToSync, pullFromSync, clearSync, getLastSyncTime } from './sync';

// --- Chrome mock ---

let mockLocalStorage: Record<string, any> = {};
let mockSyncStorage: Record<string, any> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[]) => {
        if (typeof keys === 'string') keys = [keys];
        const result: Record<string, any> = {};
        for (const k of keys) {
          if (k in mockLocalStorage) result[k] = mockLocalStorage[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.assign(mockLocalStorage, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        if (typeof keys === 'string') keys = [keys];
        for (const k of keys) delete mockLocalStorage[k];
        return Promise.resolve();
      }),
      getBytesInUse: vi.fn(() => Promise.resolve(1000)),
    },
    sync: {
      get: vi.fn((keys: string | string[]) => {
        if (typeof keys === 'string') keys = [keys];
        const result: Record<string, any> = {};
        for (const k of keys) {
          if (k in mockSyncStorage) result[k] = mockSyncStorage[k];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.assign(mockSyncStorage, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        if (typeof keys === 'string') keys = [keys];
        for (const k of keys) delete mockSyncStorage[k];
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
    },
  },
};

vi.stubGlobal('chrome', mockChrome);

// --- Mock dependencies ---

vi.mock('./session', () => ({
  getSessionKey: vi.fn(),
  isUnlocked: vi.fn(),
  storeSessionKey: vi.fn(() => Promise.resolve()),
  clearSessionKey: vi.fn(() => Promise.resolve()),
}));

vi.mock('./storage', () => ({
  isEncryptionEnabled: vi.fn(),
  getEntries: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('./snippets', () => ({
  getSnippets: vi.fn(),
}));

vi.mock('./crypto', () => ({
  encryptPayload: vi.fn((_key: any, plaintext: string) =>
    Promise.resolve({ iv: 'test-iv', ciphertext: Buffer.from(plaintext).toString('base64') }),
  ),
  decryptPayload: vi.fn((_key: any, _iv: string, ciphertext: string) =>
    Promise.resolve(Buffer.from(ciphertext, 'base64').toString()),
  ),
}));

import { getSessionKey, isUnlocked } from './session';
import { isEncryptionEnabled, getEntries, getSettings } from './storage';
import { getSnippets } from './snippets';
import type { ClipboardEntry, Snippet, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

function makeEntry(overrides: Partial<ClipboardEntry> = {}): ClipboardEntry {
  return {
    id: 'e1',
    content: 'Hello world',
    type: 'text',
    timestamp: 1000,
    pinned: true,
    ...overrides,
  };
}

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 's1',
    shortcut: ';sig',
    title: 'Signature',
    content: 'Best regards',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

const mockKey = {} as CryptoKey;

beforeEach(() => {
  mockLocalStorage = {};
  mockSyncStorage = {};
  vi.clearAllMocks();
});

// --- isSyncAvailable ---

describe('isSyncAvailable', () => {
  it('returns false when encryption is not enabled', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(false);
    expect(await isSyncAvailable()).toBe(false);
  });

  it('returns false when locked', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(isUnlocked).mockResolvedValue(false);
    expect(await isSyncAvailable()).toBe(false);
  });

  it('returns false when syncEnabled is false', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(isUnlocked).mockResolvedValue(true);
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, passwordEnabled: true, syncEnabled: false });
    expect(await isSyncAvailable()).toBe(false);
  });

  it('returns true when encryption enabled, unlocked, and sync enabled', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(isUnlocked).mockResolvedValue(true);
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, passwordEnabled: true, syncEnabled: true });
    expect(await isSyncAvailable()).toBe(true);
  });
});

// --- pushToSync ---

describe('pushToSync', () => {
  function setupAvailable() {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(isUnlocked).mockResolvedValue(true);
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, passwordEnabled: true, syncEnabled: true });
    vi.mocked(getSessionKey).mockResolvedValue(mockKey);
  }

  it('returns 0 when sync is not available', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(false);
    const result = await pushToSync();
    expect(result).toEqual({ pushed: 0, skipped: 0 });
    expect(mockChrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('pushes pinned text entries and snippets', async () => {
    setupAvailable();
    vi.mocked(getEntries).mockResolvedValue([
      makeEntry({ id: 'e1', pinned: true }),
      makeEntry({ id: 'e2', pinned: false }), // not pinned — should be skipped
      makeEntry({ id: 'e3', pinned: true, type: 'image' }), // image — should be skipped
    ]);
    vi.mocked(getSnippets).mockResolvedValue([makeSnippet({ id: 's1' })]);

    const result = await pushToSync();
    expect(result.pushed).toBe(2); // e1 + s1
    expect(result.skipped).toBe(0);
    expect(mockChrome.storage.sync.set).toHaveBeenCalledTimes(1);

    // Verify manifest
    const setCall = mockChrome.storage.sync.set.mock.calls[0][0];
    expect(setCall['cf_manifest']).toBeDefined();
    expect(setCall['cf_manifest'].itemKeys).toContain('cf_e_e1');
    expect(setCall['cf_manifest'].itemKeys).toContain('cf_s_s1');
    expect(setCall['cf_manifest'].itemKeys).not.toContain('cf_e_e2');
  });

  it('skips items that exceed the per-item size limit', async () => {
    setupAvailable();
    // Create an entry with very large content
    vi.mocked(getEntries).mockResolvedValue([
      makeEntry({ id: 'big', content: 'x'.repeat(10_000) }),
    ]);
    vi.mocked(getSnippets).mockResolvedValue([]);

    const result = await pushToSync();
    expect(result.skipped).toBe(1);
    expect(result.pushed).toBe(0);
  });

  it('cleans up stale keys from previous sync', async () => {
    setupAvailable();
    // Old manifest had keys that no longer exist
    mockSyncStorage['cf_manifest'] = {
      version: 1,
      lastPush: 500,
      itemKeys: ['cf_e_old1', 'cf_e_old2'],
    };

    vi.mocked(getEntries).mockResolvedValue([makeEntry({ id: 'new1' })]);
    vi.mocked(getSnippets).mockResolvedValue([]);

    await pushToSync();

    // Should have removed old keys
    expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith(['cf_e_old1', 'cf_e_old2']);
  });

  it('stores last sync time locally', async () => {
    setupAvailable();
    vi.mocked(getEntries).mockResolvedValue([makeEntry()]);
    vi.mocked(getSnippets).mockResolvedValue([]);

    await pushToSync();

    expect(mockLocalStorage['copyflow_last_sync']).toBeDefined();
    expect(typeof mockLocalStorage['copyflow_last_sync']).toBe('number');
  });
});

// --- pullFromSync ---

describe('pullFromSync', () => {
  function setupAvailable() {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(isUnlocked).mockResolvedValue(true);
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, passwordEnabled: true, syncEnabled: true });
    vi.mocked(getSessionKey).mockResolvedValue(mockKey);
  }

  it('returns empty when sync is not available', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(false);
    const result = await pullFromSync();
    expect(result.entries).toEqual([]);
    expect(result.snippets).toEqual([]);
  });

  it('returns empty when no manifest exists', async () => {
    setupAvailable();
    const result = await pullFromSync();
    expect(result.entries).toEqual([]);
    expect(result.snippets).toEqual([]);
  });

  it('decrypts and returns synced entries', async () => {
    setupAvailable();
    const entryPayload = JSON.stringify({
      content: 'synced text',
      sourceUrl: 'https://example.com',
      detectedType: 'url',
    });

    mockSyncStorage = {
      cf_manifest: {
        version: 1,
        lastPush: 1000,
        itemKeys: ['cf_e_e1'],
      },
      cf_e_e1: {
        id: 'e1',
        type: 'entry',
        timestamp: 1000,
        encrypted: {
          iv: 'test-iv',
          ciphertext: Buffer.from(entryPayload).toString('base64'),
        },
      },
    };

    const result = await pullFromSync();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toBe('synced text');
    expect(result.entries[0].pinned).toBe(true);
    expect(result.entries[0].sourceUrl).toBe('https://example.com');
  });

  it('decrypts and returns synced snippets', async () => {
    setupAvailable();
    const snippetPayload = JSON.stringify({
      shortcut: ';sig',
      title: 'My Signature',
      content: 'Best regards, Me',
    });

    mockSyncStorage = {
      cf_manifest: {
        version: 1,
        lastPush: 1000,
        itemKeys: ['cf_s_s1'],
      },
      cf_s_s1: {
        id: 's1',
        type: 'snippet',
        timestamp: 2000,
        encrypted: {
          iv: 'test-iv',
          ciphertext: Buffer.from(snippetPayload).toString('base64'),
        },
      },
    };

    const result = await pullFromSync();
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].shortcut).toBe(';sig');
    expect(result.snippets[0].title).toBe('My Signature');
  });

  it('skips items that fail decryption (wrong password)', async () => {
    setupAvailable();
    const { decryptPayload } = await import('./crypto');
    vi.mocked(decryptPayload).mockRejectedValueOnce(new Error('Decryption failed'));

    mockSyncStorage = {
      cf_manifest: {
        version: 1,
        lastPush: 1000,
        itemKeys: ['cf_e_e1'],
      },
      cf_e_e1: {
        id: 'e1',
        type: 'entry',
        timestamp: 1000,
        encrypted: { iv: 'bad-iv', ciphertext: 'bad-data' },
      },
    };

    const result = await pullFromSync();
    expect(result.entries).toHaveLength(0);
  });
});

// --- clearSync ---

describe('clearSync', () => {
  it('removes manifest and all item keys', async () => {
    mockSyncStorage = {
      cf_manifest: {
        version: 1,
        lastPush: 1000,
        itemKeys: ['cf_e_e1', 'cf_s_s1'],
      },
      cf_e_e1: { id: 'e1' },
      cf_s_s1: { id: 's1' },
    };

    await clearSync();

    expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith(
      expect.arrayContaining(['cf_manifest', 'cf_e_e1', 'cf_s_s1']),
    );
  });

  it('handles missing manifest gracefully', async () => {
    await clearSync();
    expect(mockChrome.storage.sync.remove).toHaveBeenCalled();
  });
});

// --- getLastSyncTime ---

describe('getLastSyncTime', () => {
  it('returns null when no sync has occurred', async () => {
    const result = await getLastSyncTime();
    expect(result).toBeNull();
  });

  it('returns stored timestamp', async () => {
    mockLocalStorage['copyflow_last_sync'] = 12345;
    const result = await getLastSyncTime();
    expect(result).toBe(12345);
  });
});
