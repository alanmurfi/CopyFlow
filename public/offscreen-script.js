// ============================================
// CopyFlow — Offscreen Document Script
// ============================================
// Separate file because Manifest V3 CSP blocks inline scripts.
// Uses document.execCommand('paste') instead of navigator.clipboard.read()
// because the Clipboard API requires document focus, which offscreen
// documents don't have.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'READ_CLIPBOARD') {
    handleReadClipboard(sendResponse);
    return true;
  }

  if (message.type === 'WRITE_CLIPBOARD') {
    handleWriteClipboard(message.text, sendResponse);
    return true;
  }

  return false;
});

function handleReadClipboard(sendResponse) {
  try {
    const textarea = document.getElementById('clipboard-area');
    textarea.value = '';
    textarea.focus();

    // execCommand('paste') works with clipboardRead permission
    // without requiring document focus like the Clipboard API does
    const success = document.execCommand('paste');

    if (success && textarea.value.trim()) {
      sendResponse({
        success: true,
        type: 'text',
        content: textarea.value,
      });
    } else {
      sendResponse({ success: true, type: null, content: null });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

function handleWriteClipboard(text, sendResponse) {
  try {
    const textarea = document.getElementById('clipboard-area');
    textarea.value = text;
    textarea.select();

    const success = document.execCommand('copy');

    if (success) {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'execCommand copy failed' });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}
