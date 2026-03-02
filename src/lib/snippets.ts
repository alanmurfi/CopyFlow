// ============================================
// CopyFlow — Snippet Storage & Template Engine
// ============================================
// CRUD for text expander snippets. Encrypts snippet
// content when encryption is enabled (same session-key
// flow as clipboard entries).

import type { Snippet, EncryptedSnippet } from '../types';
import { encryptPayload, decryptPayload } from './crypto';
import { getSessionKey } from './session';
import { isEncryptionEnabled } from './storage';

const STORAGE_KEY = 'copyflow_snippets';

// Valid trigger characters for shortcuts
const TRIGGER_CHARS = [';', '/', '!', '\\'];

// --- Mutex (same pattern as storage.ts) ---

let _snippetMutex: Promise<void> = Promise.resolve();

function withSnippetLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const wait = _snippetMutex;
  _snippetMutex = next;
  return wait.then(fn).finally(() => release!());
}

// --- Encryption helpers ---

async function encryptSnippet(snippet: Snippet, key: CryptoKey): Promise<EncryptedSnippet> {
  const sensitivePayload = JSON.stringify({
    title: snippet.title,
    content: snippet.content,
  });
  const { iv, ciphertext } = await encryptPayload(key, sensitivePayload);
  return {
    id: snippet.id,
    shortcut: snippet.shortcut, // plaintext for matching
    createdAt: snippet.createdAt,
    updatedAt: snippet.updatedAt,
    encrypted: { iv, ciphertext },
  };
}

async function decryptSnippet(entry: EncryptedSnippet, key: CryptoKey): Promise<Snippet> {
  const json = await decryptPayload(key, entry.encrypted.iv, entry.encrypted.ciphertext);
  const sensitive = JSON.parse(json);
  return {
    id: entry.id,
    shortcut: entry.shortcut,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    title: sensitive.title,
    content: sensitive.content,
  };
}

function isEncryptedSnippet(e: any): e is EncryptedSnippet {
  return e && typeof e === 'object' && e.encrypted && typeof e.encrypted.iv === 'string';
}

// --- Raw storage access ---

async function getRawSnippets(): Promise<any[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? [];
}

async function setRawSnippets(snippets: any[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: snippets });
}

// --- Public CRUD ---

export async function getSnippets(): Promise<Snippet[]> {
  const raw = await getRawSnippets();
  if (raw.length === 0) return [];

  const encEnabled = await isEncryptionEnabled();
  if (!encEnabled) {
    return raw as Snippet[];
  }

  const key = await getSessionKey();
  if (!key) return []; // Locked

  const decrypted: Snippet[] = [];
  for (const entry of raw) {
    if (isEncryptedSnippet(entry)) {
      try {
        decrypted.push(await decryptSnippet(entry, key));
      } catch (err) {
        console.error('CopyFlow: Failed to decrypt snippet', entry.id, err);
      }
    } else {
      decrypted.push(entry as Snippet);
    }
  }
  return decrypted;
}

/** Get just the shortcut strings (always plaintext, even when encrypted). */
export async function getSnippetShortcuts(): Promise<Array<{ id: string; shortcut: string }>> {
  const raw = await getRawSnippets();
  return raw.map((e: any) => ({ id: e.id, shortcut: e.shortcut }));
}

export function addSnippet(snippet: Snippet): Promise<void> {
  return withSnippetLock(async () => {
    const encEnabled = await isEncryptionEnabled();
    const key = encEnabled ? await getSessionKey() : null;

    if (encEnabled && !key) {
      console.debug('CopyFlow: Locked, cannot add snippet');
      return;
    }

    const existing = await getSnippets();

    // Check shortcut uniqueness
    if (existing.some((s) => s.shortcut === snippet.shortcut)) {
      throw new Error(`Shortcut "${snippet.shortcut}" already exists`);
    }

    existing.push(snippet);

    if (encEnabled && key) {
      const encrypted = await Promise.all(existing.map((s) => encryptSnippet(s, key)));
      await setRawSnippets(encrypted);
    } else {
      await setRawSnippets(existing);
    }
  });
}

export function updateSnippet(id: string, updates: Partial<Snippet>): Promise<void> {
  return withSnippetLock(async () => {
    const encEnabled = await isEncryptionEnabled();
    const key = encEnabled ? await getSessionKey() : null;

    if (encEnabled && !key) {
      console.debug('CopyFlow: Locked, cannot update snippet');
      return;
    }

    const snippets = await getSnippets();
    const index = snippets.findIndex((s) => s.id === id);
    if (index === -1) return;

    // If shortcut is being changed, check uniqueness
    if (updates.shortcut && updates.shortcut !== snippets[index].shortcut) {
      if (snippets.some((s) => s.shortcut === updates.shortcut)) {
        throw new Error(`Shortcut "${updates.shortcut}" already exists`);
      }
    }

    snippets[index] = { ...snippets[index], ...updates, updatedAt: Date.now() };

    if (encEnabled && key) {
      const encrypted = await Promise.all(snippets.map((s) => encryptSnippet(s, key)));
      await setRawSnippets(encrypted);
    } else {
      await setRawSnippets(snippets);
    }
  });
}

export function deleteSnippet(id: string): Promise<void> {
  return withSnippetLock(async () => {
    // id is plaintext even when encrypted
    const raw = await getRawSnippets();
    const filtered = raw.filter((e: any) => e.id !== id);
    await setRawSnippets(filtered);
  });
}

// --- Migration (for encryption enable/disable) ---

export async function migrateSnippetsToEncrypted(key: CryptoKey): Promise<void> {
  return withSnippetLock(async () => {
    const raw = await getRawSnippets();
    if (raw.length === 0) return;
    // Skip already-encrypted entries to prevent double-encryption corruption
    const plaintext = raw.filter((e: any) => !isEncryptedSnippet(e)) as Snippet[];
    const alreadyEncrypted = raw.filter((e: any) => isEncryptedSnippet(e));
    const freshlyEncrypted = await Promise.all(plaintext.map((s) => encryptSnippet(s, key)));
    await setRawSnippets([...alreadyEncrypted, ...freshlyEncrypted]);
  });
}

export async function migrateSnippetsToPlaintext(key: CryptoKey): Promise<void> {
  return withSnippetLock(async () => {
    const raw = await getRawSnippets();
    if (raw.length === 0) return;
    const decrypted: Snippet[] = [];
    for (const entry of raw) {
      if (isEncryptedSnippet(entry)) {
        try {
          decrypted.push(await decryptSnippet(entry, key));
        } catch (err) {
          console.error('CopyFlow: Failed to decrypt snippet during migration', entry.id, err);
        }
      } else {
        decrypted.push(entry as Snippet);
      }
    }
    await setRawSnippets(decrypted);
  });
}

// --- Re-encryption (atomic password change) ---

export async function reencryptSnippets(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  return withSnippetLock(async () => {
    const raw = await getRawSnippets();
    if (raw.length === 0) return;

    const decrypted: Snippet[] = [];
    for (const entry of raw) {
      if (isEncryptedSnippet(entry)) {
        try {
          decrypted.push(await decryptSnippet(entry, oldKey));
        } catch (err) {
          console.error('CopyFlow: Failed to decrypt snippet during re-encryption', entry.id, err);
        }
      } else {
        decrypted.push(entry as Snippet);
      }
    }

    const reencrypted = await Promise.all(decrypted.map((s) => encryptSnippet(s, newKey)));
    await setRawSnippets(reencrypted);
  });
}

// --- Shortcut validation ---

export function isValidShortcut(shortcut: string): { valid: boolean; error?: string } {
  if (!shortcut || shortcut.length < 2) {
    return { valid: false, error: 'Shortcut must be at least 2 characters' };
  }
  if (shortcut.length > 20) {
    return { valid: false, error: 'Shortcut must be 20 characters or less' };
  }
  if (/\s/.test(shortcut)) {
    return { valid: false, error: 'Shortcut cannot contain spaces' };
  }
  if (!TRIGGER_CHARS.includes(shortcut[0])) {
    return { valid: false, error: `Shortcut must start with ${TRIGGER_CHARS.join(', ')}` };
  }
  return { valid: true };
}

// --- Template resolution ---

export interface ResolvedTemplate {
  text: string;
  cursorOffset: number; // position to place caret (-1 = end of text)
}

export function resolveTemplate(content: string, clipboardText?: string): ResolvedTemplate {
  const now = new Date();

  // Sanitize clipboard text: strip control chars and BiDi overrides
  const safeClipboard = (clipboardText ?? '')
    .replace(/[\x00-\x1f\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, '');

  let text = content
    .replace(/\{\{date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{time\}\}/g, now.toLocaleTimeString())
    .replace(/\{\{day\}\}/g, now.toLocaleDateString(undefined, { weekday: 'long' }))
    .replace(/\{\{clipboard\}\}/g, safeClipboard);

  // Handle {{cursor}} — find first occurrence, remove it, record offset
  const cursorMarker = '{{cursor}}';
  const cursorIndex = text.indexOf(cursorMarker);
  if (cursorIndex !== -1) {
    text = text.slice(0, cursorIndex) + text.slice(cursorIndex + cursorMarker.length);
    return { text, cursorOffset: cursorIndex };
  }

  return { text, cursorOffset: -1 };
}
