// ============================================
// CopyFlow — Sensitive Content Detection Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { isSensitiveContent } from './sensitive';

describe('isSensitiveContent', () => {
  // --- Non-sensitive content ---

  it('returns false for empty/short strings', () => {
    expect(isSensitiveContent('')).toEqual({ sensitive: false });
    expect(isSensitiveContent('hello')).toEqual({ sensitive: false });
  });

  it('returns false for normal text', () => {
    expect(isSensitiveContent('Hello, this is a normal sentence.')).toEqual({ sensitive: false });
  });

  it('returns false for URLs', () => {
    expect(isSensitiveContent('https://example.com/page')).toEqual({ sensitive: false });
  });

  it('returns false for short hex like color codes', () => {
    expect(isSensitiveContent('#ff00aa')).toEqual({ sensitive: false });
  });

  it('returns false for normal code snippets', () => {
    const code = `function add(a, b) {\n  return a + b;\n}`;
    expect(isSensitiveContent(code)).toEqual({ sensitive: false });
  });

  // --- AWS keys ---

  it('detects AWS access keys', () => {
    const result = isSensitiveContent('AKIAIOSFODNN7EXAMPLE');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('AWS access key');
  });

  it('detects AWS keys embedded in text', () => {
    const result = isSensitiveContent('My key is AKIAIOSFODNN7EXAMPLE and it works');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('AWS access key');
  });

  // --- Stripe/generic API keys ---

  it('detects Stripe secret keys', () => {
    // Build the key dynamically to avoid GitHub push protection
    const result = isSensitiveContent('sk' + '_live_' + 'xxxxxxxxxxxxxxxxxxxx');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('API key');
  });

  it('detects Stripe test keys', () => {
    const result = isSensitiveContent('sk' + '_test_' + 'xxxxxxxxxxxxxxxxxxxx');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('API key');
  });

  it('detects Stripe publishable keys', () => {
    const result = isSensitiveContent('pk' + '_live_' + 'xxxxxxxxxxxxxxxxxxxx');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('API key');
  });

  // --- Slack tokens ---

  it('detects Slack bot tokens', () => {
    const result = isSensitiveContent('xoxb-12345678-abcdef1234');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Slack token');
  });

  it('detects Slack app tokens', () => {
    const result = isSensitiveContent('xoxp-12345678-abcdef1234');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Slack token');
  });

  // --- GitHub tokens ---

  it('detects GitHub personal access tokens', () => {
    const result = isSensitiveContent('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('GitHub token');
  });

  // --- JWT tokens ---

  it('detects JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.Gfx6VO9tcxwk6xqx9yYzSfebfeakZp5JYIgP_edcw_A';
    const result = isSensitiveContent(jwt);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('JWT token');
  });

  // --- Private keys ---

  it('detects RSA private keys', () => {
    const result = isSensitiveContent('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ...');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Private key');
  });

  it('detects generic private keys', () => {
    const result = isSensitiveContent('-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANB...');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Private key');
  });

  it('detects EC private keys', () => {
    const result = isSensitiveContent('-----BEGIN EC PRIVATE KEY-----\nMHQCAQ...');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Private key');
  });

  it('detects OpenSSH private keys', () => {
    const result = isSensitiveContent('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn...');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Private key');
  });

  // --- Connection strings ---

  it('detects PostgreSQL connection strings', () => {
    const result = isSensitiveContent('postgres://user:password@host:5432/database');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Database connection string');
  });

  it('detects MongoDB connection strings', () => {
    const result = isSensitiveContent('mongodb+srv://user:pass@cluster0.abc123.mongodb.net/mydb');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Database connection string');
  });

  it('detects Redis connection strings', () => {
    const result = isSensitiveContent('redis://default:password@redis-12345.c1.us-east-1.ec2.cloud.redislabs.com:12345');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Database connection string');
  });

  it('detects MySQL connection strings', () => {
    const result = isSensitiveContent('mysql://root:secretpass@localhost:3306/myapp_production');
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Database connection string');
  });

  // --- Long hex tokens ---

  it('detects long hex strings (40+ chars)', () => {
    const hex = 'a'.repeat(40);
    const result = isSensitiveContent(hex);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Long token/hash');
  });

  it('does not flag short hex strings', () => {
    const result = isSensitiveContent('abcdef1234567890');
    expect(result.sensitive).toBe(false);
  });

  // --- Long base64 tokens ---

  it('detects long base64 strings', () => {
    const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/==';
    const result = isSensitiveContent(b64);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Encoded secret');
  });

  it('does not flag data URIs as base64', () => {
    const result = isSensitiveContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA');
    expect(result.sensitive).toBe(false);
  });

  // --- Priority / first match ---

  it('returns the first matching reason', () => {
    // Contains both AWS key and JWT — AWS should match first
    const content = 'AKIAIOSFODNN7EXAMPLE eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123abc123abc123abc1';
    const result = isSensitiveContent(content);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('AWS access key');
  });

  // --- Edge cases ---

  it('handles multiline content', () => {
    const content = 'Config file:\n\nDB_URL=postgres://user:pass@host:5432/db\nAPI_KEY=abc';
    const result = isSensitiveContent(content);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('Database connection string');
  });

  it('handles content with embedded sensitive data', () => {
    const content = 'Please use this token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn to access the API';
    const result = isSensitiveContent(content);
    expect(result.sensitive).toBe(true);
    expect(result.reason).toBe('GitHub token');
  });
});
