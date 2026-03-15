import { describe, it, expect } from 'vitest';
import { detectContentType } from './detect';

describe('detectContentType', () => {
  // --- JSON ---
  it('detects JSON object', () => {
    expect(detectContentType('{"key": "value"}')).toBe('json');
  });

  it('detects JSON array', () => {
    expect(detectContentType('[1, 2, 3]')).toBe('json');
  });

  it('detects nested JSON', () => {
    expect(detectContentType('{"users": [{"name": "Alice"}]}')).toBe('json');
  });

  it('does not detect invalid JSON', () => {
    expect(detectContentType('{not json}')).not.toBe('json');
  });

  it('does not detect JSON primitives (string/number)', () => {
    expect(detectContentType('"just a string"')).not.toBe('json');
  });

  // --- URL ---
  it('detects HTTP URL', () => {
    expect(detectContentType('http://example.com')).toBe('url');
  });

  it('detects HTTPS URL', () => {
    expect(detectContentType('https://example.com/path?q=1')).toBe('url');
  });

  it('does not detect non-URL text', () => {
    expect(detectContentType('just some text')).not.toBe('url');
  });

  it('detects multi-line URL list', () => {
    expect(detectContentType('https://a.com\nhttps://b.com\nhttps://c.com')).toBe('url');
  });

  // --- Email ---
  it('detects email address', () => {
    expect(detectContentType('user@example.com')).toBe('email');
  });

  it('detects email with dots and plus', () => {
    expect(detectContentType('first.last+tag@sub.domain.co')).toBe('email');
  });

  it('does not detect partial email', () => {
    expect(detectContentType('@example.com')).not.toBe('email');
  });

  // --- Phone ---
  it('detects US phone number', () => {
    expect(detectContentType('(555) 123-4567')).toBe('phone');
  });

  it('detects international phone', () => {
    expect(detectContentType('+1 555 123 4567')).toBe('phone');
  });

  it('detects simple phone digits', () => {
    expect(detectContentType('5551234567')).toBe('phone');
  });

  it('does not detect too-short number', () => {
    expect(detectContentType('12345')).not.toBe('phone');
  });

  // --- Color ---
  it('detects 3-digit hex color', () => {
    expect(detectContentType('#fff')).toBe('color');
  });

  it('detects 6-digit hex color', () => {
    expect(detectContentType('#ff00aa')).toBe('color');
  });

  it('detects 8-digit hex color (with alpha)', () => {
    expect(detectContentType('#ff00aa80')).toBe('color');
  });

  it('detects rgb() color', () => {
    expect(detectContentType('rgb(255, 0, 128)')).toBe('color');
  });

  it('detects rgba() color', () => {
    expect(detectContentType('rgba(255, 0, 128, 0.5)')).toBe('color');
  });

  it('detects hsl() color', () => {
    expect(detectContentType('hsl(120, 50%, 50%)')).toBe('color');
  });

  it('does not detect invalid hex', () => {
    expect(detectContentType('#xyz')).not.toBe('color');
  });

  // --- Code ---
  it('detects JavaScript code', () => {
    const code = `function add(a, b) {
  return a + b;
}`;
    expect(detectContentType(code)).toBe('code');
  });

  it('detects Python code', () => {
    const code = `def greet(name):
    print(f"Hello {name}")
    return True`;
    expect(detectContentType(code)).toBe('code');
  });

  it('detects code by indentation ratio', () => {
    const code = `{
  "name": "test",
  "version": "1.0",
  "scripts": {
    "build": "tsc"
  }
}`;
    // This is valid JSON, so JSON takes priority
    expect(detectContentType(code)).toBe('json');
  });

  it('detects code with syntax tokens', () => {
    const code = `const x = 1;
const y = 2;
const z = x + y;`;
    expect(detectContentType(code)).toBe('code');
  });

  it('does not detect short text as code', () => {
    expect(detectContentType('hello\nworld')).not.toBe('code');
  });

  // --- Priority ordering ---
  it('JSON takes priority over code', () => {
    const json = `{
  "name": "test",
  "value": 123
}`;
    expect(detectContentType(json)).toBe('json');
  });

  // --- Edge cases ---
  it('returns undefined for empty string', () => {
    expect(detectContentType('')).toBeUndefined();
  });

  it('returns undefined for whitespace', () => {
    expect(detectContentType('   ')).toBeUndefined();
  });

  it('returns undefined for plain text', () => {
    expect(detectContentType('Hello, this is just a sentence.')).toBeUndefined();
  });

  it('returns undefined for short multi-line text', () => {
    expect(detectContentType('line one\nline two')).toBeUndefined();
  });

  it('handles trimming of whitespace around content', () => {
    expect(detectContentType('  https://example.com  ')).toBe('url');
  });

  it('handles trimming around JSON', () => {
    expect(detectContentType('  {"a": 1}  ')).toBe('json');
  });
});
