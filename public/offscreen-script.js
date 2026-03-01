// ============================================
// CopyFlow — Offscreen Document Script
// ============================================
// Uses navigator.clipboard.read() to support both text and images.
// With the clipboardRead permission, Chrome does not require document
// focus for this API in extension contexts.
// Falls back to document.execCommand('paste') for text if the
// Clipboard API is unavailable.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'READ_CLIPBOARD') {
    handleReadClipboard(sendResponse);
    return true;
  }

  if (message.type === 'WRITE_CLIPBOARD') {
    if (typeof message.text !== 'string') {
      sendResponse({ success: false, error: 'Invalid text' });
      return false;
    }
    handleWriteClipboard(message.text, sendResponse);
    return true;
  }

  return false;
});

async function handleReadClipboard(sendResponse) {
  try {
    const items = await navigator.clipboard.read();

    for (const item of items) {
      // Check for raster image types — SVG excluded (could contain script payloads)
      const imageType = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
        .find((t) => item.types.includes(t));

      if (imageType) {
        const blob = await item.getType(imageType);
        const dataUrl = await blobToDataUrl(blob);
        // Use a short prefix of the base64 payload as the dedup key —
        // storing the full data URL in content would hit the 500 KB size limit.
        const b64Start = dataUrl.indexOf(',') + 1;
        const dedupKey = '[image:' + dataUrl.slice(b64Start, b64Start + 40) + ']';
        sendResponse({
          success: true,
          type: 'image',
          content: dedupKey,     // short identifier for dedup
          imageDataUrl: dataUrl, // full data URL for display
        });
        return;
      }

      // Plain text
      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain');
        const text = await blob.text();
        if (text.trim()) {
          sendResponse({ success: true, type: 'text', content: text });
          return;
        }
      }
    }

    sendResponse({ success: true, type: null, content: null });
  } catch (_err) {
    // Clipboard API unavailable — fall back to execCommand for text
    handleReadClipboardFallback(sendResponse);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

function handleReadClipboardFallback(sendResponse) {
  try {
    const textarea = document.getElementById('clipboard-area');
    textarea.value = '';
    textarea.focus();

    const success = document.execCommand('paste');

    if (success && textarea.value.trim()) {
      sendResponse({ success: true, type: 'text', content: textarea.value });
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
