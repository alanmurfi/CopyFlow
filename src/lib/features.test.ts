// ============================================
// CopyFlow — Feature Flags Unit Tests
// ============================================

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFeatureFlags, setFeatureFlags, isFeatureEnabled } from './features';
import { DEFAULT_FEATURE_FLAGS } from '../types';

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

beforeEach(() => {
  localStore = {};

  mockChrome.storage.local.get.mockImplementation(async (key: string) => ({ [key]: localStore[key] }));
  mockChrome.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(localStore, items);
  });

  vi.stubGlobal('chrome', mockChrome);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ============================================
// getFeatureFlags
// ============================================

describe('getFeatureFlags', () => {
  it('returns DEFAULT_FEATURE_FLAGS when nothing is stored', async () => {
    expect(await getFeatureFlags()).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('merges stored values over defaults', async () => {
    localStore['copyflow_feature_flags'] = { snippetsEnabled: false };
    const flags = await getFeatureFlags();
    expect(flags.snippetsEnabled).toBe(false);
  });
});

// ============================================
// setFeatureFlags
// ============================================

describe('setFeatureFlags', () => {
  it('merges partial update into existing flags', async () => {
    await setFeatureFlags({ snippetsEnabled: false });
    const stored = localStore['copyflow_feature_flags'] as Record<string, boolean>;
    expect(stored.snippetsEnabled).toBe(false);
  });
});

// ============================================
// isFeatureEnabled
// ============================================

describe('isFeatureEnabled', () => {
  it('returns true when flag is enabled (default)', async () => {
    expect(await isFeatureEnabled('snippetsEnabled')).toBe(true);
  });

  it('returns false when flag is disabled', async () => {
    localStore['copyflow_feature_flags'] = { snippetsEnabled: false };
    expect(await isFeatureEnabled('snippetsEnabled')).toBe(false);
  });
});
