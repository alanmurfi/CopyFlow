// ============================================
// CopyFlow — Smart Content Type Detection
// ============================================
// Priority: JSON > URL > email > phone > color > code

import type { DetectedType } from '../types';

const URL_RE = /^https?:\/\/\S+$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC_COLOR_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/]+\)$/i;

const CODE_TOKENS = /(?:function\s|const\s|let\s|var\s|import\s|export\s|class\s|if\s*\(|for\s*\(|while\s*\(|return\s|=>|===|!==|\{$|\}$|<\/?\w+>|def\s|self\.|print\(|#include)/m;

export function detectContentType(content: string): DetectedType | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  // JSON: must parse as object or array
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) return 'json';
    } catch {
      // Not valid JSON — fall through
    }
  }

  // Single-line checks (only apply to content without multiple lines)
  const lines = trimmed.split('\n');
  const singleLine = lines.length === 1;

  if (singleLine) {
    if (URL_RE.test(trimmed)) return 'url';
    if (EMAIL_RE.test(trimmed)) return 'email';
    if (PHONE_RE.test(trimmed)) return 'phone';
    if (HEX_COLOR_RE.test(trimmed) || FUNC_COLOR_RE.test(trimmed)) return 'color';
  }

  // URL: also match if every line is a URL (multi-line URL list)
  if (lines.length > 1 && lines.every((l) => URL_RE.test(l.trim()))) return 'url';

  // Code: 3+ lines AND (30%+ indented OR has common syntax tokens)
  if (lines.length >= 3) {
    const indentedCount = lines.filter((l) => /^[\t ]{2,}/.test(l)).length;
    const indentRatio = indentedCount / lines.length;
    if (indentRatio >= 0.3 || CODE_TOKENS.test(trimmed)) return 'code';
  }

  return undefined;
}
