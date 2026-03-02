// ============================================
// CopyFlow — Background Service Worker
// ============================================
// Polls clipboard via offscreen document, stores new entries.
// Manages context menus, auto-cleanup, and encryption lock state.

import { v4 as uuidv4 } from 'uuid';
import { addEntry, getEntries, setLastClipboard, isLastClipboard, getSettings, deleteEntries, getEncryptionMeta, isEncryptionEnabled, STORAGE_QUOTA_BYTES, STORAGE_QUOTA_WARN_THRESHOLD } from '../lib/storage';
import { deriveCryptoKey, verifyPassword, saltFromBase64 } from '../lib/crypto';
import { storeSessionKey, clearSessionKey, isUnlocked } from '../lib/session';
import { getSnippetShortcuts, getSnippets, resolveTemplate } from '../lib/snippets';
import { isFeatureEnabled } from '../lib/features';
import type { ClipboardEntry } from '../types';

// ==========================================
// Image compression (OffscreenCanvas — available in MV3 service workers)
// ==========================================
// Resizes images larger than MAX_DIM and re-encodes as JPEG to keep storage
// under the 3 MB per-entry limit.  Falls back to the original if anything fails.

const IMG_MAX_DIM = 1400;   // px — max width or height after resize
const IMG_QUALITY = 0.82;   // JPEG quality

async function compressImageDataUrl(dataUrl: string): Promise<string> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    let { width, height } = bitmap;
    if (width > IMG_MAX_DIM || height > IMG_MAX_DIM) {
      const scale = IMG_MAX_DIM / Math.max(width, height);
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return dataUrl; }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const compressed = await canvas.convertToBlob({ type: 'image/jpeg', quality: IMG_QUALITY });
    const buffer = await compressed.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...(bytes.subarray(i, i + chunk) as unknown as number[]));
    }
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return dataUrl; // compression failed — return original and let size check handle it
  }
}

// Strip control characters and Unicode BiDi overrides that could cause UI spoofing
function sanitizeMenuLabel(text: string): string {
  return text
    .replace(/[\x00-\x1f\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, '')
    .replace(/\n/g, ' ');
}

// Update extension badge to warn when storage is nearly full
async function updateQuotaBadge(): Promise<void> {
  try {
    const bytesUsed = await chrome.storage.local.getBytesInUse();
    const ratio = bytesUsed / STORAGE_QUOTA_BYTES;

    if (ratio >= 0.95) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#e03131' }); // red
    } else if (ratio >= STORAGE_QUOTA_WARN_THRESHOLD) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#fd7e14' }); // orange
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // getBytesInUse failed — skip badge update
  }
}

export default defineBackground(() => {
  const POLL_INTERVAL = 1500; // ms
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  const MAX_CONTEXT_MENU_ITEMS = 10;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let offscreenReady = false;
  let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

  // Allow popup to access session storage for the encryption key
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' as any,
  });

  // Ensure offscreen document exists
  async function ensureOffscreen(): Promise<void> {
    if (offscreenReady) return;

    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as any],
      });

      if (contexts.length === 0) {
        console.log('CopyFlow: Creating offscreen document...');
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['CLIPBOARD' as any],
          justification: 'Monitor clipboard for history',
        });
        await new Promise((r) => setTimeout(r, 200));
        console.log('CopyFlow: Offscreen document created');
      }

      offscreenReady = true;
    } catch (err) {
      console.error('CopyFlow: Failed to create offscreen doc:', err);
      offscreenReady = false;
    }
  }

  // Get the active tab's URL and title
  async function getActiveTabInfo(): Promise<{ url?: string; title?: string }> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { url: tab?.url, title: tab?.title };
    } catch {
      return {};
    }
  }

  // Send message to offscreen document and get response
  function sendToOffscreen(message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  }

  // Poll the clipboard for new content
  async function pollClipboard(): Promise<void> {
    try {
      // Skip polling when locked — we can't encrypt without the key
      const settings = await getSettings();
      if (settings.passwordEnabled && !(await isUnlocked())) {
        return;
      }

      await ensureOffscreen();

      const response = await sendToOffscreen({ type: 'READ_CLIPBOARD' });

      if (!response?.success || !response.content) {
        return;
      }

      // Check if content is new (handles both plaintext and hashed dedup)
      if (await isLastClipboard(response.content)) {
        return;
      }

      // Save the new content (hashed if encryption enabled)
      await setLastClipboard(response.content);

      const tabInfo = await getActiveTabInfo();

      // Only record source metadata for real web pages — not chrome:// or other internal URLs
      const isWebUrl = (url?: string) =>
        typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));

      const entry: ClipboardEntry = {
        id: uuidv4(),
        content: response.content,
        type: response.type || 'text',
        imageDataUrl: response.imageDataUrl,
        timestamp: Date.now(),
        sourceUrl: isWebUrl(tabInfo.url) ? tabInfo.url : undefined,
        sourceTitle: isWebUrl(tabInfo.url) ? tabInfo.title : undefined,
        pinned: false,
      };

      await addEntry(entry);
      console.log('CopyFlow: Saved new clip:', response.content.substring(0, 50));

      // Update storage badge after adding entry
      updateQuotaBadge();

      // Reset auto-lock timer on activity
      resetAutoLockTimer();
    } catch (err) {
      console.debug('CopyFlow: Poll error:', err);
    }
  }

  // ---- Auto-lock timer ----

  async function resetAutoLockTimer(): Promise<void> {
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }

    try {
      const settings = await getSettings();
      if (settings.passwordEnabled && settings.autoLockMinutes > 0) {
        autoLockTimer = setTimeout(async () => {
          await clearSessionKey();
          await rebuildContextMenus();
          console.log('CopyFlow: Auto-locked after inactivity');
        }, settings.autoLockMinutes * 60 * 1000);
      }
    } catch {
      // Settings read failed — skip timer setup
    }
  }

  // ---- Context Menus ----

  let menuRebuildPending = false;

  async function rebuildContextMenus(): Promise<void> {
    if (menuRebuildPending) return;
    menuRebuildPending = true;
    try {
      await chrome.contextMenus.removeAll();

      // When locked, show a single disabled menu item
      const settings = await getSettings();
      if (settings.passwordEnabled && !(await isUnlocked())) {
        chrome.contextMenus.create({
          id: 'copyflow-locked',
          title: 'CopyFlow — Locked',
          contexts: ['editable'],
          enabled: false,
        });
        return;
      }

      const entries = await getEntries();
      // Only text entries can be pasted via context menu
      const textEntries = entries.filter((e) => e.type === 'text');
      if (textEntries.length === 0) return;

      // Parent menu
      chrome.contextMenus.create({
        id: 'copyflow-parent',
        title: 'CopyFlow — Paste clip',
        contexts: ['editable'],
      });

      // Add pinned first, then recent
      const pinned = textEntries.filter((e) => e.pinned);
      const unpinned = textEntries.filter((e) => !e.pinned);

      let count = 0;

      for (const entry of pinned) {
        if (count >= MAX_CONTEXT_MENU_ITEMS) break;
        const raw = entry.content.length > 60
          ? entry.content.substring(0, 57) + '...'
          : entry.content;
        chrome.contextMenus.create({
          id: `copyflow-entry-${entry.id}`,
          parentId: 'copyflow-parent',
          title: `📌 ${sanitizeMenuLabel(raw)}`,
          contexts: ['editable'],
        });
        count++;
      }

      if (pinned.length > 0 && unpinned.length > 0 && count < MAX_CONTEXT_MENU_ITEMS) {
        chrome.contextMenus.create({
          id: 'copyflow-separator',
          parentId: 'copyflow-parent',
          type: 'separator',
          contexts: ['editable'],
        });
      }

      for (const entry of unpinned) {
        if (count >= MAX_CONTEXT_MENU_ITEMS) break;
        const raw = entry.content.length > 60
          ? entry.content.substring(0, 57) + '...'
          : entry.content;
        chrome.contextMenus.create({
          id: `copyflow-entry-${entry.id}`,
          parentId: 'copyflow-parent',
          title: sanitizeMenuLabel(raw),
          contexts: ['editable'],
        });
        count++;
      }
    } catch (err) {
      console.debug('CopyFlow: Context menu error:', err);
    } finally {
      menuRebuildPending = false;
    }
  }

  // Handle context menu clicks — insert text into the page
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.menuItemId || typeof info.menuItemId !== 'string') return;
    if (!info.menuItemId.startsWith('copyflow-entry-')) return;

    const entryId = info.menuItemId.replace('copyflow-entry-', '');
    const entries = await getEntries();
    const entry = entries.find((e) => e.id === entryId);

    if (entry && tab?.id) {
      // Only paste into real web pages — content scripts don't run on internal pages
      const url = tab.url ?? '';
      if (!url.startsWith('https://') && !url.startsWith('http://')) {
        console.debug('CopyFlow: Skipping paste on non-web page:', url);
        return;
      }

      // Image entries can't be pasted as text
      if (entry.type === 'image') return;

      // Warn when pasting to non-secure (HTTP) pages — exclude localhost for dev
      const isInsecure = url.startsWith('http://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1');
      if (isInsecure) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'COPYFLOW_INSECURE_PASTE_WARNING',
          entryContent: entry.content,
        }).catch(() => {
          console.debug('CopyFlow: Content script not available on this tab');
        });
        return;
      }

      // Write text to clipboard first, then trigger native paste in the page.
      // This works with all element types (input, textarea, contentEditable)
      // and all frameworks (React, Vue, Angular, etc.) via the browser's native
      // paste event — direct DOM insertion fails on contentEditable without a
      // user gesture.
      await ensureOffscreen();
      await sendToOffscreen({ type: 'WRITE_CLIPBOARD', text: entry.content });

      chrome.tabs.sendMessage(tab.id, {
        type: 'COPYFLOW_TRIGGER_PASTE',
      }).catch(() => {
        console.debug('CopyFlow: Content script not available on this tab');
      });
    }
  });

  // ---- Auto-delete old clips ----

  async function cleanupOldEntries(): Promise<void> {
    try {
      const settings = await getSettings();
      if (!settings.autoDeleteDays || settings.autoDeleteDays <= 0) return;

      // Skip cleanup when locked if encryption is enabled
      if (settings.passwordEnabled && !(await isUnlocked())) {
        return;
      }

      const cutoff = Date.now() - settings.autoDeleteDays * 24 * 60 * 60 * 1000;
      const entries = await getEntries();
      const toDelete = entries.filter((e) => !e.pinned && e.timestamp < cutoff);

      if (toDelete.length > 0) {
        // Batch delete in a single atomic operation (uses mutex internally)
        await deleteEntries(toDelete.map((e) => e.id));
        console.log(`CopyFlow: Auto-deleted ${toDelete.length} old clips`);
        await rebuildContextMenus();
      }
    } catch (err) {
      console.debug('CopyFlow: Cleanup error:', err);
    }
  }

  // Start polling
  function startPolling(): void {
    if (pollingTimer) return;
    pollingTimer = setInterval(pollClipboard, POLL_INTERVAL);
    setTimeout(pollClipboard, 500);
  }

  // ---- Snippet helpers ----

  /** Broadcast snippet updates to all tabs so content scripts refresh shortcut maps. */
  async function broadcastSnippetsUpdated(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'COPYFLOW_SNIPPETS_UPDATED' }).catch(() => {
            // Content script not loaded on this tab — ignore
          });
        }
      }
    } catch {
      // tabs.query failed — ignore
    }
  }

  /** Read current clipboard via offscreen document (for {{clipboard}} template variable). */
  async function readClipboardText(): Promise<string> {
    try {
      await ensureOffscreen();
      const response = await sendToOffscreen({ type: 'READ_CLIPBOARD' });
      return response?.success ? (response.content ?? '') : '';
    } catch {
      return '';
    }
  }

  // ---- Content script message handler (snippets) ----
  // These messages come FROM content scripts (sender.tab is defined).

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab === undefined) return false; // Only content scripts

    if (message.type === 'GET_SNIPPETS') {
      (async () => {
        try {
          const enabled = await isFeatureEnabled('snippetsEnabled');
          if (!enabled) {
            sendResponse({ success: true, shortcuts: [] });
            return;
          }
          const shortcuts = await getSnippetShortcuts();
          sendResponse({ success: true, shortcuts });
        } catch (err) {
          console.debug('CopyFlow: GET_SNIPPETS error:', err);
          sendResponse({ success: false, shortcuts: [] });
        }
      })();
      return true;
    }

    if (message.type === 'EXPAND_SNIPPET') {
      (async () => {
        try {
          if (typeof message.shortcut !== 'string') {
            sendResponse({ success: false, error: 'Invalid shortcut' });
            return;
          }
          const enabled = await isFeatureEnabled('snippetsEnabled');
          if (!enabled) {
            sendResponse({ success: false, error: 'Feature disabled' });
            return;
          }
          const snippets = await getSnippets();
          const snippet = snippets.find((s) => s.shortcut === message.shortcut);
          if (!snippet) {
            sendResponse({ success: false, error: 'Snippet not found' });
            return;
          }
          const clipboardText = await readClipboardText();
          const resolved = resolveTemplate(snippet.content, clipboardText);
          sendResponse({ success: true, text: resolved.text, cursorOffset: resolved.cursorOffset });
        } catch (err) {
          console.debug('CopyFlow: EXPAND_SNIPPET error:', err);
          sendResponse({ success: false, error: 'Expansion failed' });
        }
      })();
      return true;
    }

    if (message.type === 'STORE_IMAGE_ENTRY') {
      // Image captured by content script via navigator.clipboard.read() on copy event
      (async () => {
        try {
          if (typeof message.dedupKey !== 'string' || typeof message.dataUrl !== 'string') {
            sendResponse({ success: false });
            return;
          }

          // Check if we've already seen this image
          if (await isLastClipboard(message.dedupKey)) {
            sendResponse({ success: true });
            return;
          }
          await setLastClipboard(message.dedupKey);

          const tab = sender.tab;
          const url = tab?.url ?? '';
          const isWebUrl = (u: string) => u.startsWith('https://') || u.startsWith('http://');

          // Compress before storing to stay under the 3 MB per-entry limit
          const storedDataUrl = await compressImageDataUrl(message.dataUrl);

          const entry: ClipboardEntry = {
            id: uuidv4(),
            content: message.dedupKey,
            type: 'image',
            imageDataUrl: storedDataUrl,
            timestamp: Date.now(),
            sourceUrl: isWebUrl(url) ? url : undefined,
            sourceTitle: isWebUrl(url) ? tab?.title : undefined,
            pinned: false,
          };

          await addEntry(entry);
          resetAutoLockTimer();
          sendResponse({ success: true });
        } catch (err) {
          console.debug('CopyFlow: STORE_IMAGE_ENTRY error:', err);
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'COPYFLOW_CONFIRM_INSECURE_PASTE') {
      // User confirmed paste on insecure (HTTP) page
      (async () => {
        try {
          if (typeof message.content !== 'string') {
            sendResponse({ success: false });
            return;
          }
          await ensureOffscreen();
          await sendToOffscreen({ type: 'WRITE_CLIPBOARD', text: message.content });
          const tabId = sender.tab?.id;
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'COPYFLOW_TRIGGER_PASTE' }).catch(() => {});
          }
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    return false;
  });

  // Listen for messages from popup (extension pages only — not content scripts)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Security: only accept privileged messages from extension pages (popup/options),
    // never from content scripts on web pages. Extension pages have no sender.tab.
    if (sender.tab !== undefined) return false;
    if (sender.id !== chrome.runtime.id) return false;

    if (message.type === 'COPY_TO_CLIPBOARD') {
      if (typeof message.text !== 'string') {
        sendResponse({ success: false, error: 'Invalid text' });
        return false;
      }
      ensureOffscreen().then(() => {
        sendToOffscreen({ type: 'WRITE_CLIPBOARD', text: message.text }).then(
          (response) => {
            sendResponse(response);
          },
        );
      });
      return true;
    }

    if (message.type === 'REBUILD_CONTEXT_MENUS') {
      rebuildContextMenus().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'LOCK_EXTENSION') {
      clearSessionKey()
        .then(() => rebuildContextMenus())
        .then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'SNIPPETS_CHANGED') {
      broadcastSnippetsUpdated().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'UNLOCK_EXTENSION') {
      (async () => {
        try {
          const meta = await getEncryptionMeta();
          if (!meta) {
            sendResponse({ success: false, error: 'No encryption configured' });
            return;
          }

          const salt = saltFromBase64(meta.salt);
          const valid = await verifyPassword(message.password, salt, meta.passwordHash);
          if (!valid) {
            sendResponse({ success: false, error: 'Wrong password' });
            return;
          }

          // Derive encryption key and store in session
          const key = await deriveCryptoKey(message.password, salt);
          await storeSessionKey(key);
          await rebuildContextMenus();
          resetAutoLockTimer();
          sendResponse({ success: true });
        } catch (err) {
          console.error('CopyFlow: Unlock error:', err);
          sendResponse({ success: false, error: 'Unlock failed' });
        }
      })();
      return true;
    }

    return false;
  });

  // Open welcome page on first install
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  });

  // Start on install/startup
  startPolling();
  rebuildContextMenus();
  updateQuotaBadge();

  // Run cleanup on startup and every hour
  cleanupOldEntries();
  setInterval(cleanupOldEntries, CLEANUP_INTERVAL);

  // Rebuild context menus when storage changes; re-arm auto-lock when settings change
  chrome.storage.onChanged.addListener((changes) => {
    if (changes['copyflow_entries']) {
      rebuildContextMenus();
      updateQuotaBadge();
    }
    if (changes['copyflow_settings']) {
      // Re-arm the auto-lock timer so the new autoLockMinutes value takes effect immediately
      resetAutoLockTimer();
    }
  });

  console.log('CopyFlow: Background service worker started');
});
