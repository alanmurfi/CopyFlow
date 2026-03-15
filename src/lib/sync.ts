// ============================================
// CopyFlow — Encrypted Chrome Sync
// ============================================
// E2E encrypted sync of pinned entries + snippets via chrome.storage.sync.
// Requires encryption enabled (same password on all devices).
// Only syncs pinned text entries + snippets — high-value, small data.
//
// Constraints:
//   chrome.storage.sync: 100 KB total, 8 KB/item, 512 items max
//   We enforce: 90 KB total, 7.5 KB/item to leave headroom.

import type { ClipboardEntry, Snippet, SyncedItem, SyncManifest, EncryptedPayload } from '../types';
import { encryptPayload, decryptPayload } from './crypto';
import { getSessionKey, isUnlocked } from './session';
import { isEncryptionEnabled, getEntries, getSettings } from './storage';
import { getSnippets } from './snippets';

// --- Constants ---

const SYNC_PREFIX_ENTRY = 'cf_e_';
const SYNC_PREFIX_SNIPPET = 'cf_s_';
const SYNC_MANIFEST_KEY = 'cf_manifest';
const MAX_ITEM_BYTES = 7_500;   // 7.5 KB per item (8 KB Chrome limit minus headroom)
const MAX_TOTAL_BYTES = 92_160; // 90 KB total (100 KB limit minus headroom)
const MAX_SYNC_ITEMS = 500;     // 512 Chrome limit minus headroom

// --- Availability check ---

export async function isSyncAvailable(): Promise<boolean> {
  const encEnabled = await isEncryptionEnabled();
  if (!encEnabled) return false;

  const unlocked = await isUnlocked();
  if (!unlocked) return false;

  const settings = await getSettings();
  return settings.syncEnabled;
}

// --- Push to sync ---

export async function pushToSync(): Promise<{ pushed: number; skipped: number }> {
  if (!(await isSyncAvailable())) {
    return { pushed: 0, skipped: 0 };
  }

  const key = await getSessionKey();
  if (!key) return { pushed: 0, skipped: 0 };

  // Gather items to sync: pinned text entries + all snippets
  const entries = await getEntries();
  const pinnedText = entries.filter((e) => e.pinned && e.type === 'text');
  const snippets = await getSnippets();

  let totalBytes = 0;
  let pushed = 0;
  let skipped = 0;
  const syncData: Record<string, SyncedItem> = {};
  const itemKeys: string[] = [];

  // Encrypt and size-check pinned entries
  for (const entry of pinnedText) {
    const payload = JSON.stringify({
      content: entry.content,
      sourceUrl: entry.sourceUrl,
      sourceTitle: entry.sourceTitle,
      detectedType: entry.detectedType,
    });
    const encrypted = await encryptPayload(key, payload);
    const item: SyncedItem = {
      id: entry.id,
      type: 'entry',
      timestamp: entry.timestamp,
      encrypted,
    };

    const serialized = JSON.stringify(item);
    const itemBytes = new TextEncoder().encode(serialized).length;

    if (itemBytes > MAX_ITEM_BYTES) {
      skipped++;
      continue;
    }
    if (totalBytes + itemBytes > MAX_TOTAL_BYTES) {
      skipped++;
      continue;
    }
    if (itemKeys.length >= MAX_SYNC_ITEMS) {
      skipped++;
      continue;
    }

    const syncKey = SYNC_PREFIX_ENTRY + entry.id;
    syncData[syncKey] = item;
    itemKeys.push(syncKey);
    totalBytes += itemBytes;
    pushed++;
  }

  // Encrypt and size-check snippets
  for (const snippet of snippets) {
    const payload = JSON.stringify({
      shortcut: snippet.shortcut,
      title: snippet.title,
      content: snippet.content,
    });
    const encrypted = await encryptPayload(key, payload);
    const item: SyncedItem = {
      id: snippet.id,
      type: 'snippet',
      timestamp: snippet.updatedAt,
      encrypted,
    };

    const serialized = JSON.stringify(item);
    const itemBytes = new TextEncoder().encode(serialized).length;

    if (itemBytes > MAX_ITEM_BYTES) {
      skipped++;
      continue;
    }
    if (totalBytes + itemBytes > MAX_TOTAL_BYTES) {
      skipped++;
      continue;
    }
    if (itemKeys.length >= MAX_SYNC_ITEMS) {
      skipped++;
      continue;
    }

    const syncKey = SYNC_PREFIX_SNIPPET + snippet.id;
    syncData[syncKey] = item;
    itemKeys.push(syncKey);
    totalBytes += itemBytes;
    pushed++;
  }

  // Write manifest
  const manifest: SyncManifest = {
    version: 1,
    lastPush: Date.now(),
    itemKeys,
  };

  // Clean up old keys that are no longer in the sync set
  try {
    const existing = await chrome.storage.sync.get(SYNC_MANIFEST_KEY);
    const oldManifest = existing[SYNC_MANIFEST_KEY] as SyncManifest | undefined;
    if (oldManifest?.itemKeys) {
      const newKeySet = new Set(itemKeys);
      const staleKeys = oldManifest.itemKeys.filter((k) => !newKeySet.has(k));
      if (staleKeys.length > 0) {
        await chrome.storage.sync.remove(staleKeys);
      }
    }
  } catch {
    // Failed to clean up — non-critical
  }

  // Write all items + manifest
  try {
    await chrome.storage.sync.set({
      ...syncData,
      [SYNC_MANIFEST_KEY]: manifest,
    });
  } catch (err) {
    console.debug('CopyFlow: Sync push failed:', err);
    return { pushed: 0, skipped: pinnedText.length + snippets.length };
  }

  // Store last sync time locally for UI display
  await chrome.storage.local.set({ copyflow_last_sync: Date.now() }).catch(() => {});

  return { pushed, skipped };
}

// --- Pull from sync ---

export interface PullResult {
  entries: ClipboardEntry[];
  snippets: Snippet[];
}

export async function pullFromSync(): Promise<PullResult> {
  const result: PullResult = { entries: [], snippets: [] };

  if (!(await isSyncAvailable())) {
    return result;
  }

  const key = await getSessionKey();
  if (!key) return result;

  // Read manifest to know which keys to fetch
  let manifest: SyncManifest;
  try {
    const raw = await chrome.storage.sync.get(SYNC_MANIFEST_KEY);
    manifest = raw[SYNC_MANIFEST_KEY] as SyncManifest;
    if (!manifest?.itemKeys || manifest.version !== 1) {
      return result;
    }
  } catch {
    return result;
  }

  // Fetch all sync items
  let syncData: Record<string, SyncedItem>;
  try {
    syncData = await chrome.storage.sync.get(manifest.itemKeys) as Record<string, SyncedItem>;
  } catch {
    return result;
  }

  for (const syncKey of manifest.itemKeys) {
    const item = syncData[syncKey];
    if (!item?.encrypted) continue;

    try {
      const json = await decryptPayload(key, item.encrypted.iv, item.encrypted.ciphertext);
      const data = JSON.parse(json);

      if (item.type === 'entry') {
        result.entries.push({
          id: item.id,
          content: data.content ?? '',
          type: 'text',
          timestamp: item.timestamp,
          pinned: true, // only pinned entries are synced
          sourceUrl: data.sourceUrl,
          sourceTitle: data.sourceTitle,
          detectedType: data.detectedType,
        });
      } else if (item.type === 'snippet') {
        result.snippets.push({
          id: item.id,
          shortcut: data.shortcut ?? '',
          title: data.title ?? '',
          content: data.content ?? '',
          createdAt: item.timestamp,
          updatedAt: item.timestamp,
        });
      }
    } catch (err) {
      console.debug('CopyFlow: Failed to decrypt sync item', syncKey, err);
      // Skip — might be from a different password
    }
  }

  return result;
}

// --- Clear sync ---

export async function clearSync(): Promise<void> {
  try {
    const raw = await chrome.storage.sync.get(SYNC_MANIFEST_KEY);
    const manifest = raw[SYNC_MANIFEST_KEY] as SyncManifest | undefined;
    const keysToRemove = [SYNC_MANIFEST_KEY, ...(manifest?.itemKeys ?? [])];
    await chrome.storage.sync.remove(keysToRemove);
    await chrome.storage.local.remove('copyflow_last_sync');
  } catch {
    // Best effort
  }
}

// --- Get last sync time ---

export async function getLastSyncTime(): Promise<number | null> {
  try {
    const result = await chrome.storage.local.get('copyflow_last_sync');
    return result['copyflow_last_sync'] ?? null;
  } catch {
    return null;
  }
}
