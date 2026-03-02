// ============================================
// CopyFlow — Snippets Unit Tests
// ============================================
// Chrome APIs mocked via vi.stubGlobal.
// crypto, session, and storage modules mocked to avoid PBKDF2 overhead.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSnippets,
  getSnippetShortcuts,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  migrateSnippetsToEncrypted,
  migrateSnippetsToPlaintext,
  isValidShortcut,
  resolveTemplate,
} from './snippets';
import { encryptPayload, decryptPayload } from './crypto';
import { getSessionKey } from './session';
import { isEncryptionEnabled } from './storage';
import type { Snippet } from '../types';

// --- Module mocks ---

vi.mock('./crypto', () => ({
  encryptPayload: vi.fn(),
  decryptPayload: vi.fn(),
}));

vi.mock('./session', () => ({
  getSessionKey: vi.fn(),
}));

vi.mock('./storage', () => ({
  isEncryptionEnabled: vi.fn(),
}));

// --- Chrome storage mock ---

let localStore: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      }),
    },
  },
};

// --- Snippet factory ---

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snip-1',
    shortcut: ';sig',
    title: 'Signature',
    content: 'Best regards, Alan',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    ...overrides,
  };
}

// --- Setup / teardown ---

beforeEach(() => {
  localStore = {};

  mockChrome.storage.local.get.mockImplementation(async (key: string) => ({ [key]: localStore[key] }));
  mockChrome.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(localStore, items);
  });

  vi.stubGlobal('chrome', mockChrome);

  // Default: no encryption, identity-transform encrypt/decrypt
  vi.mocked(isEncryptionEnabled).mockResolvedValue(false);
  vi.mocked(getSessionKey).mockResolvedValue({} as CryptoKey);
  vi.mocked(encryptPayload).mockImplementation(async (_key, plaintext) => ({
    iv: 'mock-iv',
    ciphertext: btoa(plaintext),
  }));
  vi.mocked(decryptPayload).mockImplementation(async (_key, _iv, ciphertext) => atob(ciphertext));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ============================================
// getSnippets
// ============================================

describe('getSnippets — no encryption', () => {
  it('returns empty array when nothing stored', async () => {
    expect(await getSnippets()).toEqual([]);
  });

  it('returns raw plaintext snippets', async () => {
    localStore['copyflow_snippets'] = [makeSnippet()];
    const result = await getSnippets();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Best regards, Alan');
  });
});

describe('getSnippets — encryption enabled, unlocked', () => {
  beforeEach(() => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
  });

  it('decrypts encrypted snippets', async () => {
    const payload = JSON.stringify({ title: 'Sig', content: 'Cheers' });
    localStore['copyflow_snippets'] = [{
      id: 'snip-1', shortcut: ';sig', createdAt: 1000, updatedAt: 1000,
      encrypted: { iv: 'mock-iv', ciphertext: btoa(payload) },
    }];
    const result = await getSnippets();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Cheers');
    expect(result[0].title).toBe('Sig');
  });

  it('skips corrupted entries', async () => {
    localStore['copyflow_snippets'] = [{
      id: 'bad', shortcut: ';bad', createdAt: 1000, updatedAt: 1000,
      encrypted: { iv: 'bad-iv', ciphertext: 'corrupt' },
    }];
    vi.mocked(decryptPayload).mockRejectedValueOnce(new Error('Decrypt failed'));
    expect(await getSnippets()).toHaveLength(0);
  });
});

describe('getSnippets — encryption enabled, locked', () => {
  it('returns empty array when session key is missing', async () => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    localStore['copyflow_snippets'] = [makeSnippet()];
    expect(await getSnippets()).toEqual([]);
  });
});

// ============================================
// getSnippetShortcuts
// ============================================

describe('getSnippetShortcuts', () => {
  it('returns shortcut list from raw storage (no decryption)', async () => {
    localStore['copyflow_snippets'] = [
      makeSnippet({ id: 'a', shortcut: ';sig' }),
      makeSnippet({ id: 'b', shortcut: '/addr' }),
    ];
    const result = await getSnippetShortcuts();
    expect(result).toEqual([
      { id: 'a', shortcut: ';sig' },
      { id: 'b', shortcut: '/addr' },
    ]);
    // Should NOT call decryptPayload
    expect(decryptPayload).not.toHaveBeenCalled();
  });

  it('returns empty array when nothing stored', async () => {
    expect(await getSnippetShortcuts()).toEqual([]);
  });
});

// ============================================
// addSnippet
// ============================================

describe('addSnippet — no encryption', () => {
  it('adds snippet to empty store', async () => {
    await addSnippet(makeSnippet());
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored).toHaveLength(1);
    expect(stored[0].shortcut).toBe(';sig');
  });

  it('throws on duplicate shortcut', async () => {
    localStore['copyflow_snippets'] = [makeSnippet({ id: 'existing' })];
    await expect(addSnippet(makeSnippet({ id: 'new' }))).rejects.toThrow('already exists');
  });
});

describe('addSnippet — encryption enabled', () => {
  beforeEach(() => {
    vi.mocked(isEncryptionEnabled).mockResolvedValue(true);
  });

  it('encrypts snippet when encryption enabled', async () => {
    await addSnippet(makeSnippet());
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0].encrypted).toBeDefined();
    expect(stored[0].encrypted.iv).toBe('mock-iv');
    expect(encryptPayload).toHaveBeenCalled();
  });

  it('drops snippet when locked', async () => {
    vi.mocked(getSessionKey).mockResolvedValueOnce(null);
    await addSnippet(makeSnippet());
    expect(localStore['copyflow_snippets']).toBeUndefined();
  });
});

// ============================================
// updateSnippet
// ============================================

describe('updateSnippet', () => {
  it('updates existing snippet fields', async () => {
    localStore['copyflow_snippets'] = [makeSnippet()];
    await updateSnippet('snip-1', { title: 'New Title' });
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored[0].title).toBe('New Title');
    expect(stored[0].content).toBe('Best regards, Alan');
  });

  it('sets updatedAt timestamp', async () => {
    localStore['copyflow_snippets'] = [makeSnippet({ updatedAt: 1000 })];
    const before = Date.now();
    await updateSnippet('snip-1', { title: 'Updated' });
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored[0].updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('is a no-op when id not found', async () => {
    localStore['copyflow_snippets'] = [makeSnippet()];
    await updateSnippet('nonexistent', { title: 'X' });
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored[0].title).toBe('Signature');
  });

  it('throws on shortcut collision when changing shortcut', async () => {
    localStore['copyflow_snippets'] = [
      makeSnippet({ id: 'a', shortcut: ';sig' }),
      makeSnippet({ id: 'b', shortcut: '/addr' }),
    ];
    await expect(updateSnippet('b', { shortcut: ';sig' })).rejects.toThrow('already exists');
  });

  it('allows updating shortcut when no collision', async () => {
    localStore['copyflow_snippets'] = [makeSnippet({ id: 'a', shortcut: ';sig' })];
    await updateSnippet('a', { shortcut: ';newsig' });
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored[0].shortcut).toBe(';newsig');
  });
});

// ============================================
// deleteSnippet
// ============================================

describe('deleteSnippet', () => {
  it('removes snippet by id', async () => {
    localStore['copyflow_snippets'] = [
      makeSnippet({ id: 'a' }),
      makeSnippet({ id: 'b', shortcut: '/addr' }),
    ];
    await deleteSnippet('a');
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('b');
  });

  it('works on encrypted entries (id is plaintext)', async () => {
    localStore['copyflow_snippets'] = [
      { id: 'enc-1', shortcut: ';s', createdAt: 1000, updatedAt: 1000, encrypted: { iv: 'iv', ciphertext: 'ct' } },
    ];
    await deleteSnippet('enc-1');
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(0);
  });
});

// ============================================
// Migration
// ============================================

describe('migrateSnippetsToEncrypted', () => {
  it('encrypts all plaintext snippets', async () => {
    localStore['copyflow_snippets'] = [
      makeSnippet({ id: 'a' }),
      makeSnippet({ id: 'b', shortcut: '/addr' }),
    ];
    await migrateSnippetsToEncrypted({} as CryptoKey);
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(2);
    expect(stored[0].encrypted).toBeDefined();
    expect(stored[1].encrypted).toBeDefined();
    expect(encryptPayload).toHaveBeenCalledTimes(2);
  });

  it('skips already-encrypted snippets (prevents double encryption)', async () => {
    localStore['copyflow_snippets'] = [
      { id: 'enc-1', shortcut: ';s', createdAt: 1000, updatedAt: 1000, encrypted: { iv: 'iv', ciphertext: 'ct' } },
      makeSnippet({ id: 'plain-1' }),
    ];
    await migrateSnippetsToEncrypted({} as CryptoKey);
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(2);
    // Only the plaintext entry should have been encrypted
    expect(encryptPayload).toHaveBeenCalledTimes(1);
  });

  it('handles empty store', async () => {
    await migrateSnippetsToEncrypted({} as CryptoKey);
    // Should not throw and should not write
    expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('migrateSnippetsToPlaintext', () => {
  it('decrypts all encrypted snippets', async () => {
    const payload = JSON.stringify({ title: 'Sig', content: 'Cheers' });
    localStore['copyflow_snippets'] = [{
      id: 'enc-1', shortcut: ';sig', createdAt: 1000, updatedAt: 1000,
      encrypted: { iv: 'mock-iv', ciphertext: btoa(payload) },
    }];
    await migrateSnippetsToPlaintext({} as CryptoKey);
    const stored = localStore['copyflow_snippets'] as Snippet[];
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('Cheers');
    expect((stored[0] as any).encrypted).toBeUndefined();
  });

  it('skips entries that fail decryption', async () => {
    localStore['copyflow_snippets'] = [{
      id: 'bad', shortcut: ';bad', createdAt: 1000, updatedAt: 1000,
      encrypted: { iv: 'bad', ciphertext: 'bad' },
    }];
    vi.mocked(decryptPayload).mockRejectedValueOnce(new Error('bad decrypt'));
    await migrateSnippetsToPlaintext({} as CryptoKey);
    const stored = localStore['copyflow_snippets'] as any[];
    expect(stored).toHaveLength(0);
  });
});

// ============================================
// isValidShortcut (pure function — no mocks needed)
// ============================================

describe('isValidShortcut', () => {
  it('rejects empty string', () => {
    expect(isValidShortcut('').valid).toBe(false);
  });

  it('rejects single character', () => {
    expect(isValidShortcut(';').valid).toBe(false);
  });

  it('rejects shortcuts > 20 chars', () => {
    expect(isValidShortcut(';' + 'a'.repeat(20)).valid).toBe(false);
  });

  it('rejects shortcuts with spaces', () => {
    expect(isValidShortcut(';my sig').valid).toBe(false);
  });

  it('rejects shortcuts not starting with trigger char', () => {
    expect(isValidShortcut('sig').valid).toBe(false);
    expect(isValidShortcut('#sig').valid).toBe(false);
  });

  it('accepts valid shortcuts starting with ;', () => {
    expect(isValidShortcut(';sig').valid).toBe(true);
  });

  it('accepts valid shortcuts starting with /', () => {
    expect(isValidShortcut('/addr').valid).toBe(true);
  });

  it('accepts valid shortcuts starting with !', () => {
    expect(isValidShortcut('!todo').valid).toBe(true);
  });

  it('accepts valid shortcuts starting with \\', () => {
    expect(isValidShortcut('\\code').valid).toBe(true);
  });
});

// ============================================
// resolveTemplate (pure function — no mocks needed)
// ============================================

describe('resolveTemplate', () => {
  it('replaces {{date}} with current date', () => {
    const result = resolveTemplate('Today is {{date}}');
    const expected = new Date().toLocaleDateString();
    expect(result.text).toBe(`Today is ${expected}`);
  });

  it('replaces {{time}} with current time', () => {
    const result = resolveTemplate('Time: {{time}}');
    // Just check it doesn't contain the template marker
    expect(result.text).not.toContain('{{time}}');
    expect(result.text.startsWith('Time: ')).toBe(true);
  });

  it('replaces {{day}} with weekday name', () => {
    const result = resolveTemplate('Day: {{day}}');
    const expected = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    expect(result.text).toBe(`Day: ${expected}`);
  });

  it('replaces {{clipboard}} with provided text', () => {
    const result = resolveTemplate('Pasted: {{clipboard}}', 'hello world');
    expect(result.text).toBe('Pasted: hello world');
  });

  it('strips BiDi overrides from clipboard text', () => {
    const result = resolveTemplate('{{clipboard}}', 'hello\u202eworld');
    expect(result.text).toBe('helloworld');
  });

  it('handles {{cursor}} — removes marker and returns offset', () => {
    const result = resolveTemplate('Hello {{cursor}} World');
    expect(result.text).toBe('Hello  World');
    expect(result.cursorOffset).toBe(6);
  });

  it('returns cursorOffset -1 when no {{cursor}}', () => {
    const result = resolveTemplate('No cursor here');
    expect(result.cursorOffset).toBe(-1);
  });

  it('handles content with no template variables', () => {
    const result = resolveTemplate('Plain text');
    expect(result.text).toBe('Plain text');
    expect(result.cursorOffset).toBe(-1);
  });

  it('uses empty string when clipboardText is undefined', () => {
    const result = resolveTemplate('Clip: {{clipboard}}');
    expect(result.text).toBe('Clip: ');
  });
});
