// ============================================
// CopyFlow — Test Setup
// ============================================
// Shared setup for all tests. Provides Chrome API mocks
// and MantineProvider wrapper for component tests.

import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// --- Ensure @testing-library/react cleans up DOM between tests ---
afterEach(() => {
  cleanup();
});

// --- window.matchMedia mock (required by Mantine in jsdom) ---

if (typeof globalThis.window !== 'undefined' && !globalThis.window.matchMedia) {
  Object.defineProperty(globalThis.window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// --- ResizeObserver mock (required by some Mantine components in jsdom) ---

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// --- Chrome API mock ---
// Only stub if not already present (lib tests already mock chrome per-file)

if (typeof globalThis.chrome === 'undefined') {
  const mockChrome = {
    runtime: {
      id: 'test-extension-id',
      sendMessage: vi.fn((_msg: any, cb?: (r: any) => void) => {
        if (cb) cb({ success: true });
        return Promise.resolve({ success: true });
      }),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
      lastError: null as any,
    },
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        remove: vi.fn(() => Promise.resolve()),
        getBytesInUse: vi.fn(() => Promise.resolve(1000)),
        onChanged: { addListener: vi.fn() },
      },
      sync: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        remove: vi.fn(() => Promise.resolve()),
      },
      session: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        setAccessLevel: vi.fn(() => Promise.resolve()),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn(() => Promise.resolve()),
      onClicked: { addListener: vi.fn() },
    },
  };

  vi.stubGlobal('chrome', mockChrome);
}
