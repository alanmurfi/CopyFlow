// ============================================
// CopyFlow — Session Key Unit Tests
// ============================================

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeSessionKey, getSessionKey, clearSessionKey, isUnlocked } from './session';
import { exportKeyToJwk, importKeyFromJwk } from './crypto';

vi.mock('./crypto', () => ({
  exportKeyToJwk: vi.fn(),
  importKeyFromJwk: vi.fn(),
}));

// --- Chrome storage mock ---

let sessionStore: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionStore[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete sessionStore[key];
      }),
    },
  },
};

beforeEach(() => {
  sessionStore = {};

  mockChrome.storage.session.get.mockImplementation(async (key: string) => ({ [key]: sessionStore[key] }));
  mockChrome.storage.session.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(sessionStore, items);
  });
  mockChrome.storage.session.remove.mockImplementation(async (key: string) => {
    delete sessionStore[key];
  });

  vi.stubGlobal('chrome', mockChrome);

  const mockJwk: JsonWebKey = { kty: 'oct', k: 'test-key-material' };
  vi.mocked(exportKeyToJwk).mockResolvedValue(mockJwk);
  vi.mocked(importKeyFromJwk).mockResolvedValue({} as CryptoKey);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ============================================
// storeSessionKey
// ============================================

describe('storeSessionKey', () => {
  it('exports key to JWK and stores in session storage', async () => {
    const mockKey = {} as CryptoKey;
    await storeSessionKey(mockKey);
    expect(exportKeyToJwk).toHaveBeenCalledWith(mockKey);
    expect(sessionStore['copyflow_session_key']).toEqual({ kty: 'oct', k: 'test-key-material' });
  });
});

// ============================================
// getSessionKey
// ============================================

describe('getSessionKey', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getSessionKey()).toBeNull();
  });

  it('imports JWK and returns CryptoKey when stored', async () => {
    const jwk: JsonWebKey = { kty: 'oct', k: 'stored-key' };
    sessionStore['copyflow_session_key'] = jwk;
    const result = await getSessionKey();
    expect(importKeyFromJwk).toHaveBeenCalledWith(jwk);
    expect(result).toEqual({} as CryptoKey);
  });

  it('returns null and clears storage when JWK is corrupted', async () => {
    sessionStore['copyflow_session_key'] = { kty: 'bad' };
    vi.mocked(importKeyFromJwk).mockRejectedValueOnce(new Error('Invalid JWK'));
    const result = await getSessionKey();
    expect(result).toBeNull();
    expect(sessionStore['copyflow_session_key']).toBeUndefined();
  });
});

// ============================================
// clearSessionKey
// ============================================

describe('clearSessionKey', () => {
  it('removes the session key from storage', async () => {
    sessionStore['copyflow_session_key'] = { kty: 'oct' };
    await clearSessionKey();
    expect(sessionStore['copyflow_session_key']).toBeUndefined();
  });
});

// ============================================
// isUnlocked
// ============================================

describe('isUnlocked', () => {
  it('returns true when session key exists', async () => {
    sessionStore['copyflow_session_key'] = { kty: 'oct' };
    expect(await isUnlocked()).toBe(true);
  });

  it('returns false when session key is absent', async () => {
    expect(await isUnlocked()).toBe(false);
  });
});
