// ============================================
// CopyFlow — Sensitive Content Detection
// ============================================
// Detects API keys, tokens, private keys, connection strings, and other
// sensitive content that should trigger a paste warning on unfamiliar domains.

export interface SensitiveResult {
  sensitive: boolean;
  reason?: string;
}

// --- Detection patterns ---

const PATTERNS: Array<{ test: (s: string) => boolean; reason: string }> = [
  // AWS access keys (always start with AKIA)
  { test: (s) => /\bAKIA[A-Z0-9]{16}\b/.test(s), reason: 'AWS access key' },

  // Generic secret-prefixed keys (Stripe sk_live_, Slack xoxb-, etc.)
  { test: (s) => /\b(sk[_-]live[_-]|sk[_-]test[_-]|pk[_-]live[_-]|pk[_-]test[_-]|rk[_-]live[_-]|rk[_-]test[_-])[\w]{10,}\b/.test(s), reason: 'API key' },

  // Slack tokens
  { test: (s) => /\bxox[bpas]-[\w-]{10,}\b/.test(s), reason: 'Slack token' },

  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { test: (s) => /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/.test(s), reason: 'GitHub token' },

  // JWTs (three base64url segments separated by dots)
  { test: (s) => /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(s), reason: 'JWT token' },

  // PEM private keys
  { test: (s) => /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/.test(s), reason: 'Private key' },

  // Database connection strings
  { test: (s) => /\b(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s]{10,}/.test(s), reason: 'Database connection string' },

  // Generic long hex tokens (40+ hex chars — likely API keys, SHA hashes used as secrets)
  { test: (s) => /\b[0-9a-f]{40,}\b/i.test(s) && !/^#?[0-9a-f]{6}$/i.test(s.trim()), reason: 'Long token/hash' },

  // Generic long base64 tokens (standalone, 40+ chars, not a JWT or data URI)
  {
    test: (s) => {
      if (s.includes('eyJ') || s.startsWith('data:')) return false;
      return /(?:^|\s)[A-Za-z0-9+/=]{40,}(?:\s|$)/.test(s);
    },
    reason: 'Encoded secret',
  },
];

/**
 * Check if content looks like it contains sensitive data (API keys, tokens, etc.).
 * Returns `{ sensitive: true, reason }` on first match.
 */
export function isSensitiveContent(content: string): SensitiveResult {
  if (!content || content.length < 10) return { sensitive: false };

  for (const pattern of PATTERNS) {
    if (pattern.test(content)) {
      return { sensitive: true, reason: pattern.reason };
    }
  }

  return { sensitive: false };
}
