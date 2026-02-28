// ============================================
// CopyFlow — Background Service Worker
// ============================================
// Polls clipboard via offscreen document, stores new entries.
// Manages context menus and auto-cleanup.

import { v4 as uuidv4 } from 'uuid';
import { addEntry, getEntries, getLastClipboard, setLastClipboard, getSettings, deleteEntry } from '../lib/storage';
import type { ClipboardEntry } from '../types';

export default defineBackground(() => {
  const POLL_INTERVAL = 1500; // ms
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  const MAX_CONTEXT_MENU_ITEMS = 10;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let offscreenReady = false;

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
      await ensureOffscreen();

      const response = await sendToOffscreen({ type: 'READ_CLIPBOARD' });

      if (!response?.success || !response.content) {
        return;
      }

      // Check if content is new
      const lastClipboard = await getLastClipboard();
      if (response.content === lastClipboard) {
        return;
      }

      // Save the new content
      await setLastClipboard(response.content);

      const tabInfo = await getActiveTabInfo();

      const entry: ClipboardEntry = {
        id: uuidv4(),
        content: response.content,
        type: response.type || 'text',
        imageDataUrl: response.imageDataUrl,
        timestamp: Date.now(),
        sourceUrl: tabInfo.url,
        sourceTitle: tabInfo.title,
        pinned: false,
      };

      await addEntry(entry);
      console.log('CopyFlow: Saved new clip:', response.content.substring(0, 50));

      // Storage listener will rebuild context menus
    } catch (err) {
      console.debug('CopyFlow: Poll error:', err);
    }
  }

  // ---- Context Menus ----

  let menuRebuildPending = false;

  async function rebuildContextMenus(): Promise<void> {
    if (menuRebuildPending) return;
    menuRebuildPending = true;
    try {
      await chrome.contextMenus.removeAll();

      const entries = await getEntries();
      if (entries.length === 0) return;

      // Parent menu
      chrome.contextMenus.create({
        id: 'copyflow-parent',
        title: 'CopyFlow — Paste clip',
        contexts: ['editable'],
      });

      // Add pinned first, then recent
      const pinned = entries.filter((e) => e.pinned);
      const unpinned = entries.filter((e) => !e.pinned);

      let count = 0;

      for (const entry of pinned) {
        if (count >= MAX_CONTEXT_MENU_ITEMS) break;
        const label = entry.content.length > 60
          ? entry.content.substring(0, 57) + '...'
          : entry.content;
        chrome.contextMenus.create({
          id: `copyflow-entry-${entry.id}`,
          parentId: 'copyflow-parent',
          title: `📌 ${label.replace(/\n/g, ' ')}`,
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
        const label = entry.content.length > 60
          ? entry.content.substring(0, 57) + '...'
          : entry.content;
        chrome.contextMenus.create({
          id: `copyflow-entry-${entry.id}`,
          parentId: 'copyflow-parent',
          title: label.replace(/\n/g, ' '),
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
      // Insert text into the focused field on the page
      chrome.tabs.sendMessage(tab.id, {
        type: 'COPYFLOW_INSERT_TEXT',
        text: entry.content,
      }).catch(() => {
        // Content script might not be injected — use execCommand approach via scripting
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: (text: string) => {
            const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              el.value = el.value.slice(0, start) + text + el.value.slice(end);
              el.selectionStart = el.selectionEnd = start + text.length;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el?.isContentEditable) {
              document.execCommand('insertText', false, text);
            }
          },
          args: [entry.content],
        });
      });
    }
  });

  // ---- Auto-delete old clips ----

  async function cleanupOldEntries(): Promise<void> {
    try {
      const settings = await getSettings();
      if (!settings.autoDeleteDays || settings.autoDeleteDays <= 0) return;

      const cutoff = Date.now() - settings.autoDeleteDays * 24 * 60 * 60 * 1000;
      const entries = await getEntries();
      const toDelete = entries.filter((e) => !e.pinned && e.timestamp < cutoff);

      for (const entry of toDelete) {
        await deleteEntry(entry.id);
      }

      if (toDelete.length > 0) {
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

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'COPY_TO_CLIPBOARD') {
      ensureOffscreen().then(() => {
        sendToOffscreen({ type: 'WRITE_CLIPBOARD', text: message.text }).then(
          (response) => {
            sendResponse(response);
          }
        );
      });
      return true;
    }
    if (message.type === 'REBUILD_CONTEXT_MENUS') {
      rebuildContextMenus().then(() => sendResponse({ success: true }));
      return true;
    }
    return false;
  });

  // Start on install/startup
  startPolling();
  rebuildContextMenus();

  // Run cleanup on startup and every hour
  cleanupOldEntries();
  setInterval(cleanupOldEntries, CLEANUP_INTERVAL);

  // Rebuild context menus when storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes['copyflow_entries']) {
      rebuildContextMenus();
    }
  });

  console.log('CopyFlow: Background service worker started');
});
