// ============================================
// CopyFlow — Cryptographic Primitives
// ============================================
// Pure Web Crypto API — no external dependencies.
// AES-GCM-256 for encryption, PBKDF2-SHA256 for key derivation.

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for SHA-256
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12; // AES-GCM standard nonce size
const KEY_LENGTH_BITS = 256;

// --- Base64 helpers ---

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Salt generation ---

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
}

export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt);
}

export function saltFromBase64(base64: string): Uint8Array {
  return base64ToBytes(base64);
}

// --- Key derivation ---
// Uses a purpose tag so the encryption key and verification hash
// are derived from different PBKDF2 inputs — knowing one does not
// reveal the other.

async function deriveRawKey(
  password: string,
  salt: Uint8Array,
  purpose: 'encryption' | 'verification',
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const taggedPassword = encoder.encode(password + '\0' + 'copyflow-' + purpose);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    taggedPassword,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    KEY_LENGTH_BITS,
  );
}

export async function deriveCryptoKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const taggedPassword = encoder.encode(password + '\0' + 'copyflow-encryption');

  const baseKey = await crypto.subtle.importKey(
    'raw',
    taggedPassword,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    true, // extractable — needed for JWK export to session storage
    ['encrypt', 'decrypt'],
  );
}

// --- Password hashing (verification purpose) ---

export async function hashPassword(
  password: string,
  salt: Uint8Array,
): Promise<string> {
  const bits = await deriveRawKey(password, salt, 'verification');
  return bytesToBase64(new Uint8Array(bits));
}

export async function verifyPassword(
  password: string,
  salt: Uint8Array,
  expectedHash: string,
): Promise<boolean> {
  const candidateHash = await hashPassword(password, salt);
  // Constant-time comparison
  if (candidateHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidateHash.length; i++) {
    diff |= candidateHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

// --- AES-GCM encryption ---

export async function encryptPayload(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoded,
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptPayload(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
): Promise<string> {
  const ivBytes = base64ToBytes(iv);
  const ciphertextBytes = base64ToBytes(ciphertext);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertextBytes,
  );

  return new TextDecoder().decode(plaintextBuffer);
}

// --- CryptoKey JWK serialization (for chrome.storage.session) ---

export async function exportKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

// --- Content hashing (for dedup without storing plaintext) ---

export async function hashContent(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToBase64(new Uint8Array(digest));
}
