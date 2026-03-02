// ============================================
// CopyFlow — Feature Flags
// ============================================
// Simple feature gating for paid features.
// Flags stored in chrome.storage.local — payment/license
// verification will be wired up later.
//
// SECURITY: These flags are stored in chrome.storage.local and can be freely
// modified by users via DevTools (chrome.storage.local.set). This is acceptable
// while all features are free-tier. Before monetizing gated features, flags must
// be cryptographically signed (e.g., JWT from a license server) or validated
// server-side to prevent trivial bypass.

import type { FeatureFlags } from '../types';
import { DEFAULT_FEATURE_FLAGS } from '../types';

const STORAGE_KEY = 'copyflow_feature_flags';

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_FEATURE_FLAGS, ...(result[STORAGE_KEY] ?? {}) };
}

export async function setFeatureFlags(flags: Partial<FeatureFlags>): Promise<void> {
  const current = await getFeatureFlags();
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...flags } });
}

export async function isFeatureEnabled(flag: keyof FeatureFlags): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[flag] === true;
}
