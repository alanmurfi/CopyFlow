// ============================================
// CopyFlow — Crypto Unit Tests
// ============================================
// Runs under Node 18+ (Web Crypto available via globalThis.crypto)

import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  saltToBase64,
  saltFromBase64,
  deriveCryptoKey,
  hashPassword,
  verifyPassword,
  encryptPayload,
  decryptPayload,
  exportKeyToJwk,
  importKeyFromJwk,
  hashContent,
} from './crypto';

describe('crypto primitives', () => {
  it('generateSalt returns 16-byte Uint8Array', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('saltToBase64 / saltFromBase64 round-trip', () => {
    const salt = generateSalt();
    const b64 = saltToBase64(salt);
    const restored = saltFromBase64(b64);
    expect(restored).toEqual(salt);
  });

  it('deriveCryptoKey returns a CryptoKey', async () => {
    const salt = generateSalt();
    const key = await deriveCryptoKey('test-password', salt);
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('hashPassword + verifyPassword correct password returns true', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('my-password', salt);
    const valid = await verifyPassword('my-password', salt, hash);
    expect(valid).toBe(true);
  });

  it('verifyPassword wrong password returns false', async () => {
    const salt = generateSalt();
    const hash = await hashPassword('correct-password', salt);
    const valid = await verifyPassword('wrong-password', salt, hash);
    expect(valid).toBe(false);
  });

  it('encryptPayload + decryptPayload round-trip', async () => {
    const salt = generateSalt();
    const key = await deriveCryptoKey('test-password', salt);
    const plaintext = 'Hello, CopyFlow!';
    const { iv, ciphertext } = await encryptPayload(key, plaintext);
    const decrypted = await decryptPayload(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('decryptPayload with wrong key throws', async () => {
    const salt = generateSalt();
    const key1 = await deriveCryptoKey('password-one', salt);
    const key2 = await deriveCryptoKey('password-two', salt);
    const { iv, ciphertext } = await encryptPayload(key1, 'secret');
    await expect(decryptPayload(key2, iv, ciphertext)).rejects.toThrow();
  });

  it('exportKeyToJwk + importKeyFromJwk round-trip', async () => {
    const salt = generateSalt();
    const key = await deriveCryptoKey('test-password', salt);
    const jwk = await exportKeyToJwk(key);
    const restored = await importKeyFromJwk(jwk);
    // Verify restored key works by decrypting what the original key encrypted
    const { iv, ciphertext } = await encryptPayload(key, 'test data');
    const decrypted = await decryptPayload(restored, iv, ciphertext);
    expect(decrypted).toBe('test data');
  });

  it('hashContent is deterministic', async () => {
    const content = 'clipboard content to hash';
    const hash1 = await hashContent(content);
    const hash2 = await hashContent(content);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });
});
