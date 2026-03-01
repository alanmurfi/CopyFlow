// ============================================
// CopyFlow — Content Script
// ============================================
// 1. Copy toast — shows brief notification when user copies text
// 2. Context menu paste — inserts text from background
// 3. Text expander — detects typed shortcuts, replaces with expanded snippets

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // ==========================================
    // 1. Copy Toast
    // ==========================================

    let toast: HTMLDivElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function showToast(text: string) {
      // Remove existing toast
      if (toast) {
        toast.remove();
        toast = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      // Create toast container
      toast = document.createElement('div');
      toast.id = 'copyflow-toast';

      // Shadow DOM so page CSS can't interfere
      const shadow = toast.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
        }
        .cf-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: #1a1b1e;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          line-height: 1.4;
          border-radius: 10px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.25);
          opacity: 0;
          transform: translateY(8px);
          animation: cf-slide-in 0.2s ease forwards;
          max-width: 320px;
          pointer-events: none;
        }
        .cf-toast.cf-hide {
          animation: cf-slide-out 0.2s ease forwards;
        }
        .cf-icon {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
        }
        .cf-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cf-label {
          color: #8b8d91;
          font-size: 11px;
          margin-right: 4px;
        }
        @keyframes cf-slide-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes cf-slide-out {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(8px);
          }
        }
      `;

      const container = document.createElement('div');
      container.className = 'cf-toast';

      // Build DOM programmatically — never use innerHTML with user content
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'cf-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', '#4ade80');
      icon.setAttribute('stroke-width', '2.5');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', '20 6 9 17 4 12');
      icon.appendChild(poly);

      const textSpan = document.createElement('span');
      textSpan.className = 'cf-text';

      const label = document.createElement('span');
      label.className = 'cf-label';
      label.textContent = 'Copied';

      // Safe: textContent never interprets HTML
      const clipText = document.createTextNode(truncate(text, 40));

      textSpan.appendChild(label);
      textSpan.appendChild(clipText);

      container.appendChild(icon);
      container.appendChild(textSpan);

      shadow.appendChild(style);
      shadow.appendChild(container);
      document.documentElement.appendChild(toast);

      // Auto-hide after 1.5s
      hideTimer = setTimeout(() => {
        container.classList.add('cf-hide');
        setTimeout(() => {
          toast?.remove();
          toast = null;
        }, 200);
      }, 1500);
    }

    function truncate(str: string, max: number): string {
      const clean = str.replace(/\n/g, ' ').trim();
      if (clean.length <= max) return clean;
      return clean.slice(0, max) + '\u2026';
    }

    // Listen for native copy events
    document.addEventListener('copy', () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.trim().length > 0) {
        showToast(selection.trim());
      }
    });

    // ==========================================
    // 2. Message handler (paste + snippet updates)
    // ==========================================

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Security: only accept messages from our own extension's background worker
      if (sender.id !== chrome.runtime.id) return false;
      if (sender.tab !== undefined) return false;

      if (message.type === 'COPYFLOW_INSERT_TEXT') {
        if (typeof message.text !== 'string') {
          sendResponse({ success: false, error: 'Invalid text' });
          return false;
        }
        insertTextAtCursor(message.text);
        sendResponse({ success: true });
      }

      if (message.type === 'COPYFLOW_SNIPPETS_UPDATED') {
        loadSnippetShortcuts();
        sendResponse({ success: true });
      }
    });

    // ==========================================
    // 3. Text Expander Engine
    // ==========================================

    const MAX_BUFFER = 20;
    const IDLE_RESET_MS = 2000;

    let keyBuffer = '';
    let snippetMap: Map<string, string> = new Map(); // shortcut → id
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let expanding = false; // guard to prevent re-entrant expansion

    // Load snippet shortcuts from background on init
    loadSnippetShortcuts();

    function loadSnippetShortcuts() {
      chrome.runtime.sendMessage({ type: 'GET_SNIPPETS' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success && Array.isArray(response.shortcuts)) {
          snippetMap = new Map(
            response.shortcuts.map((s: { id: string; shortcut: string }) => [s.shortcut, s.id]),
          );
        }
      });
    }

    function resetBuffer() {
      keyBuffer = '';
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }

    function restartIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(resetBuffer, IDLE_RESET_MS);
    }

    // Listen for keystrokes on the document (capture phase for earliest access)
    document.addEventListener('keydown', onKeyDown, true);

    // Reset buffer on focus change and clicks
    document.addEventListener('focusin', resetBuffer, true);
    document.addEventListener('click', resetBuffer, true);

    function onKeyDown(e: KeyboardEvent) {
      if (expanding) return;

      // Ignore modifier-only keys and navigation keys that don't produce characters
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Navigation / special keys reset the buffer
      const resetKeys = [
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
        'Escape', 'Tab', 'Enter',
      ];
      if (resetKeys.includes(e.key)) {
        resetBuffer();
        return;
      }

      // Backspace: remove last char from buffer
      if (e.key === 'Backspace') {
        keyBuffer = keyBuffer.slice(0, -1);
        restartIdleTimer();
        return;
      }

      // Only append printable single characters
      if (e.key.length !== 1) return;

      // Must be in a text input
      const el = document.activeElement;
      if (!el) return;
      const isTextInput =
        (el.tagName === 'INPUT' && isTextInputType(el as HTMLInputElement)) ||
        el.tagName === 'TEXTAREA' ||
        (el as HTMLElement).isContentEditable;
      if (!isTextInput) return;

      // Append to buffer
      keyBuffer += e.key;
      if (keyBuffer.length > MAX_BUFFER) {
        keyBuffer = keyBuffer.slice(-MAX_BUFFER);
      }
      restartIdleTimer();

      // Check if buffer ends with any shortcut
      if (snippetMap.size === 0) return;

      for (const [shortcut] of snippetMap) {
        if (keyBuffer.endsWith(shortcut)) {
          e.preventDefault();
          expandSnippet(shortcut, el as HTMLElement);
          return;
        }
      }
    }

    function isTextInputType(input: HTMLInputElement): boolean {
      const textTypes = ['text', 'search', 'url', 'tel', 'email', 'password', ''];
      return textTypes.includes(input.type.toLowerCase());
    }

    async function expandSnippet(shortcut: string, element: HTMLElement) {
      expanding = true;
      try {
        // Request expanded text from background (handles decryption + template resolution)
        const response = await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage({ type: 'EXPAND_SNIPPET', shortcut }, (r) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false });
            } else {
              resolve(r);
            }
          });
        });

        if (!response?.success || typeof response.text !== 'string') {
          return;
        }

        const { text, cursorOffset } = response as { success: boolean; text: string; cursorOffset: number };

        // Verify element is still focused and in the document after async round-trip
        if (!document.contains(element) || document.activeElement !== element) {
          return;
        }

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          expandInInputElement(element as HTMLInputElement | HTMLTextAreaElement, shortcut, text, cursorOffset);
        } else if (element.isContentEditable) {
          expandInContentEditable(shortcut, text, cursorOffset);
        }
      } finally {
        resetBuffer();
        expanding = false;
      }
    }

    function expandInInputElement(
      el: HTMLInputElement | HTMLTextAreaElement,
      shortcut: string,
      text: string,
      cursorOffset: number,
    ) {
      const cursorPos = el.selectionEnd ?? el.value.length;
      // The shortcut was being typed, but we prevented the last character.
      // The buffer has the full shortcut, but the last char wasn't inserted (e.preventDefault).
      // So the field has shortcut.length - 1 chars of the shortcut.
      const charsInField = shortcut.length - 1;
      const start = cursorPos - charsInField;

      if (start < 0) return;

      el.value = el.value.slice(0, start) + text + el.value.slice(cursorPos);

      // Position cursor
      const newPos = cursorOffset >= 0 ? start + cursorOffset : start + text.length;
      el.selectionStart = el.selectionEnd = newPos;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function expandInContentEditable(
      shortcut: string,
      text: string,
      cursorOffset: number,
    ) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const charsInField = shortcut.length - 1;

      // Move selection back to cover the partial shortcut
      try {
        // Select backwards to cover the already-typed portion of the shortcut
        for (let i = 0; i < charsInField; i++) {
          sel.modify('extend', 'backward', 'character');
        }
      } catch {
        return;
      }

      // Delete the selected shortcut text and insert expansion
      document.execCommand('insertText', false, text);

      // Position cursor at {{cursor}} location if specified
      if (cursorOffset >= 0 && sel.rangeCount > 0) {
        const newRange = sel.getRangeAt(0);
        // After insertText, cursor is at end of inserted text.
        // We need to move it back by (text.length - cursorOffset) positions.
        const moveBack = text.length - cursorOffset;
        try {
          for (let i = 0; i < moveBack; i++) {
            sel.modify('move', 'backward', 'character');
          }
        } catch {
          // Some contentEditable implementations may not support this
        }
      }
    }

    // ==========================================
    // Shared helpers
    // ==========================================

    function insertTextAtCursor(text: string) {
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
    }
  },
});
