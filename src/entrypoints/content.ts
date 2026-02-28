// ============================================
// CopyFlow — Content Script (Copy Toast)
// ============================================
// Shows a brief on-screen toast when the user copies text.
// Also handles COPYFLOW_INSERT_TEXT messages from background for context menu paste.

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
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

      // Checkmark icon (inline SVG)
      container.innerHTML = `
        <svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="cf-text">
          <span class="cf-label">Copied</span>
          ${escapeHtml(truncate(text, 40))}
        </span>
      `;

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
      return clean.slice(0, max) + '…';
    }

    function escapeHtml(str: string): string {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Listen for native copy events
    document.addEventListener('copy', () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.trim().length > 0) {
        showToast(selection.trim());
      }
    });

    // Listen for paste messages from background (context menu)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'COPYFLOW_INSERT_TEXT') {
        const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? el.value.length;
          el.value = el.value.slice(0, start) + message.text + el.value.slice(end);
          el.selectionStart = el.selectionEnd = start + message.text.length;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el?.isContentEditable) {
          document.execCommand('insertText', false, message.text);
        }
        sendResponse({ success: true });
      }
    });
  },
});
