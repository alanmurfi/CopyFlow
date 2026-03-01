// ============================================
// CopyFlow — Session Key Management
// ============================================
// Wraps chrome.storage.session to store/retrieve the derived CryptoKey.
// Session storage survives service worker restarts but clears on browser close.
// The key is stored as JWK (JSON Web Key) since CryptoKey is not serializable.

import { exportKeyToJwk, importKeyFromJwk } from './crypto';

const SESSION_KEY = 'copyflow_session_key';

export async function storeSessionKey(key: CryptoKey): Promise<void> {
  const jwk = await exportKeyToJwk(key);
  await chrome.storage.session.set({ [SESSION_KEY]: jwk });
}

export async function getSessionKey(): Promise<CryptoKey | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const jwk = result[SESSION_KEY];
  if (!jwk) return null;
  try {
    return await importKeyFromJwk(jwk);
  } catch {
    // Corrupted JWK — clear it
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
}

export async function clearSessionKey(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function isUnlocked(): Promise<boolean> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] != null;
}
