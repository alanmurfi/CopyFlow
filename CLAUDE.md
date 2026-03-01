# CLAUDE.md — CopyFlow Project Context

**Last Updated:** 2026-03-01
**Version:** 0.1.0
**Status:** Early development / Security hardening phase

---

## Project Overview

**CopyFlow** is a privacy-first Chrome clipboard history manager built with security and user trust as core principles. Unlike competitors, we minimize permissions, encrypt data at rest (optional), and never send data to external servers.

### Core Mission
Enable users to never lose copied content while maintaining complete privacy and data ownership.

### Key Differentiators
- **Zero-trust architecture**: Optional AES-256 encryption, local-only storage
- **Minimal permissions**: No browsing history access, no external network calls
- **Export-first**: Users own their data, can export anytime
- **Open source**: Transparent security for technical users

---

## Architecture Overview

### Tech Stack
- **Framework**: WXT (Vite-powered Chrome extension framework)
- **UI**: React 18 + TypeScript + Mantine v7
- **Crypto**: Web Crypto API (AES-256-GCM, PBKDF2-SHA256)
- **Build**: Vite + TypeScript 5.7
- **Target**: Chrome Manifest V3

### Project Structure
```
src/
├── entrypoints/
│   ├── background.ts           # Service worker (clipboard polling, menus, auto-lock)
│   ├── content.ts              # Copy toast notifications
│   ├── popup/
│   │   ├── App.tsx             # Main UI (search, pin, edit)
│   │   ├── LockScreen.tsx      # Password entry with rate limiting
│   │   └── PasswordSettings.tsx # Encryption management
│   └── offscreen.html          # Clipboard API access workaround
├── lib/
│   ├── storage.ts              # Encrypted storage abstraction + mutex
│   ├── crypto.ts               # AES-GCM + PBKDF2 primitives
│   └── session.ts              # JWK key persistence
└── types/
    └── index.ts                # TypeScript interfaces
```

---

## Key Technical Decisions

### 1. Why Offscreen Document for Clipboard?
**Problem**: Chrome MV3 service workers can't access `navigator.clipboard` directly.
**Solution**: Offscreen document with `document.execCommand('paste')` running in a hidden context.
**Trade-off**: Uses deprecated API, but required until Chrome implements async clipboard for service workers.
**Monitoring**: Track [Chromium Issue #1098937](https://bugs.chromium.org/p/chromium/issues/detail?id=1098937) for native solution.

### 2. Why Optional Encryption?
**Reasoning**:
- Most users prioritize convenience over encryption
- Encryption adds UX friction (password required on startup, auto-lock)
- Power users who need it can opt-in
- Non-encrypted mode still private (local-only storage)

**Implementation**: Dual-mode storage layer. Plaintext entries vs encrypted entries with separate data models (`ClipboardEntry` vs `EncryptedEntry`).

### 3. Why Mutex for Storage?
**Problem**: `chrome.storage.local` get+set is not atomic. Concurrent clipboard polls could race and lose data.
**Solution**: Promise-based mutex serializes all read-modify-write operations.
**Code**: `storage.ts:33-41` - `withEntryLock()`

### 4. Why Purpose-Tagged Key Derivation?
**Security**: Derive encryption key and password hash from different PBKDF2 inputs:
```typescript
// Encryption: PBKDF2(password + "\0copyflow-encryption", salt)
// Verification: PBKDF2(password + "\0copyflow-verification", salt)
```
Prevents offline password cracking if one key is compromised.

---

## Security Architecture

### Encryption Stack
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2-SHA256, 600,000 iterations (OWASP 2023)
- **IV**: 12-byte random nonce per entry (cryptographically secure)
- **Salt**: 16-byte random per-password
- **Session Storage**: CryptoKey stored as JWK in `chrome.storage.session` (survives service worker restarts, cleared on browser close)

### Attack Surface Mitigation
1. **XSS Prevention**:
   - SVG images blocked from data URIs (storage.ts:23)
   - BiDi override characters stripped from context menus (background.ts:14-18)
   - Input validation on all imports

2. **Privilege Escalation**:
   - Content scripts can't send privileged messages (background.ts:290-293)
   - Sender.id validation on all IPC

3. **Rate Limiting**:
   - Exponential backoff on password failures (LockScreen.tsx:55-60)
   - Max 10 attempts before 60s cooldown

4. **Memory Safety**:
   - Constant-time password comparison (crypto.ts:113-119)
   - No plaintext password logging

### Known Security Limitations
- Passwords stored as strings in React state (JS memory can't be zeroed reliably)
- No CSP in manifest (add in v0.2.0)
- Context menu paste doesn't validate target domain (phishing risk)
- Storage quota exhaustion fails silently

---

## Data Models

### Core Types
```typescript
// Plaintext entry
interface ClipboardEntry {
  id: string;                // UUID
  content: string;           // Actual text
  type: 'text' | 'image';
  imageDataUrl?: string;     // Base64 data URI
  timestamp: number;         // Unix epoch ms
  sourceUrl?: string;        // Page URL when copied
  sourceTitle?: string;      // Page title
  pinned: boolean;
  folderId?: string;         // Future: folder organization
}

// Encrypted entry (stored when encryption enabled)
interface EncryptedEntry {
  id: string;                // Plaintext (for deletion)
  type: 'text' | 'image';    // Plaintext (for filtering)
  timestamp: number;         // Plaintext (for sorting)
  pinned: boolean;           // Plaintext (for UI)
  folderId?: string;         // Plaintext
  encrypted: {
    iv: string;              // Base64 AES-GCM nonce
    ciphertext: string;      // Base64 encrypted payload
  };
}
// Sensitive fields (content, imageDataUrl, sourceUrl, sourceTitle)
// bundled into a single encrypted JSON blob.
```

### Storage Schema
```typescript
chrome.storage.local:
  - copyflow_entries: ClipboardEntry[] | EncryptedEntry[]
  - copyflow_folders: Folder[]
  - copyflow_settings: Settings
  - copyflow_last_clipboard: string | sha256_hash  // Dedup
  - copyflow_encryption_meta?: EncryptionMeta

chrome.storage.session:
  - copyflow_session_key: JsonWebKey  // Only when unlocked
```

---

## Development Workflow

### Setup
```bash
pnpm install
pnpm dev              # Hot reload, opens chrome://extensions
pnpm build            # Production build
pnpm zip              # Creates .output/copyflow-X.X.X-chrome.zip
```

### Testing
**Current Status**: ⚠️ No automated tests (v0.2.0 priority)
**Manual Test Checklist**:
- [ ] Clipboard polling captures text
- [ ] Encryption enable/disable flow
- [ ] Lock/unlock with correct/wrong password
- [ ] Auto-lock after inactivity
- [ ] Export/import preserves data
- [ ] Context menu paste works
- [ ] Storage quota exceeded handling

### Type Checking
```bash
npx tsc --noEmit
```

### Debug Tips
- Check `chrome.storage.local` in DevTools: `chrome.storage.local.get(console.log)`
- Service worker logs: `chrome://extensions` → "Service worker" → Inspect
- Offscreen document: `chrome://extensions` → "Offscreen document" → Inspect

---

## Critical Code Paths

### 1. Clipboard Polling (background.ts:84-129)
```
pollClipboard() every 1.5s
  ├─ Check if locked (skip if encrypted + locked)
  ├─ Send READ_CLIPBOARD to offscreen
  ├─ Deduplicate (isLastClipboard)
  ├─ Get active tab info (source URL/title)
  └─ addEntry() → encrypts if enabled → storage
```

### 2. Encryption Toggle (PasswordSettings.tsx)
**Enable**: Plaintext → Encrypted
```
User enters password
  ├─ Generate 16-byte salt
  ├─ Derive key (PBKDF2, 600k iterations)
  ├─ Hash password (verification purpose)
  ├─ Store EncryptionMeta (salt + hash)
  ├─ migrateToEncrypted() - encrypt all entries
  └─ storeSessionKey() - JWK to session storage
```

**Disable**: Encrypted → Plaintext
```
User enters password
  ├─ Verify against stored hash
  ├─ Derive key from password + salt
  ├─ migrateToPlaintext() - decrypt all entries
  ├─ removeEncryptionMeta()
  └─ clearSessionKey()
```

### 3. Storage Mutex (storage.ts:33-41)
```typescript
let _entryMutex: Promise<void> = Promise.resolve();

function withEntryLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const wait = _entryMutex;
  _entryMutex = next;
  return wait.then(fn).finally(() => release!());
}
```
Every `addEntry()`, `updateEntry()`, `deleteEntry()` wrapped in this mutex.

---

## Common Pitfalls for AI Assistants

### 1. Don't Break the Mutex
❌ **Bad**: Direct `chrome.storage.local.set()` for entries
✅ **Good**: Always use `withEntryLock()` wrapper

### 2. Encryption State Awareness
When encryption enabled, `chrome.storage.local` contains **EncryptedEntry[]**, not **ClipboardEntry[]**.
Always use `getEntries()` to decrypt, never read raw storage directly for UI.

### 3. Session Key Lifecycle
- Key exists: User is unlocked
- Key missing: User is locked (or encryption disabled)
- Service worker restart: Key persists in `chrome.storage.session`
- Browser close: Key cleared automatically

### 4. Storage Listeners
`chrome.storage.onChanged` fires with **encrypted** values when encryption enabled.
Don't try to decrypt in listener — call `getEntries()` instead.

### 5. Import Validation
Never trust imported JSON. All entries run through `isValidEntry()` validator (storage.ts:376-390).
Password settings (`passwordEnabled`, `autoLockMinutes`) **never** imported from backups (security).

---

## Performance Characteristics

### Storage Limits
- **Per-entry max**: 500 KB (enforced at addEntry)
- **chrome.storage.local quota**: ~5 MB total
- **Encryption overhead**: ~33% size increase (base64 encoding)
- **Estimated capacity**: ~3000-5000 text entries, fewer with images

### Bottlenecks
1. **PBKDF2 derivation**: ~200ms on average hardware (intentional - security vs UX trade-off)
2. **AES-GCM encrypt/decrypt**: ~1ms per entry (negligible)
3. **Storage I/O**: ~10-50ms for 500 entries (Chrome internal)

### Optimization Opportunities (v0.2.0+)
- Lazy load entries (virtualized list for 1000+ entries)
- Index by timestamp for faster old-entry cleanup
- Batch encrypt/decrypt operations

---

## Known Issues & Technical Debt

### High Priority
1. **No automated tests** - Crypto, storage, and UI all untested
2. **Storage quota silent failure** - Loses data with no user notification
3. **Context menu paste security** - No domain validation before inserting text
4. **execCommand deprecation** - Will break when Chrome removes it

### Medium Priority
5. **Race condition in dedup check** (storage.ts:175) - Rare, cosmetic impact
6. **Auto-lock timer doesn't update on settings change** - Can lock early/late
7. **Password in React state memory** - Can't reliably zero in JavaScript

### Low Priority / Future Features
8. **Folder system incomplete** - Data model exists, no UI
9. **No Chrome sync** - All data local-only (could add encrypted sync)
10. **Limited image support** - No compression, large images hit quota fast

---

## Version History

### v0.1.0 (2026-01-15) — Initial Release
- Clipboard auto-save with polling
- Search, pin, edit, delete
- Context menu paste
- Export/import
- Dark mode
- Auto-cleanup (30 days)

### v0.1.0 Security Patch (2026-03-01)
- ✅ Fixed 6 security vulnerabilities
  - Sender validation for privileged messages
  - BiDi character sanitization
  - SVG data URI blocking
  - Import validation hardening
  - Password settings excluded from imports
  - Message type validation

### v0.2.0 Roadmap (see PRD.md)
- Password-based encryption (AES-256)
- Auto-lock support
- Unit tests (crypto + storage)
- CSP headers
- Storage quota monitoring

---

## Resources

### Documentation
- [WXT Framework Docs](https://wxt.dev/)
- [Chrome Extension MV3 Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### External Dependencies
- `uuid` - UUID generation
- `@mantine/core` - UI components
- `@tabler/icons-react` - Icons
- `react` + `react-dom` - UI framework

### Security References
- [OWASP PBKDF2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)

---

## Contributing Guidelines for AI Assistants

### Before Making Changes
1. Run `npx tsc --noEmit` to check types
2. Read the relevant section of this CLAUDE.md
3. Check if change affects encryption logic (test both modes)
4. Verify storage operations use mutex

### Security-Sensitive Areas (Extra Caution)
- `src/lib/crypto.ts` - Crypto primitives
- `src/lib/storage.ts` - Mutex and encryption logic
- `src/entrypoints/background.ts` - Message handling (lines 289-353)
- `src/entrypoints/popup/PasswordSettings.tsx` - Migration logic

### Code Style
- Prefer functional components (React hooks)
- Use TypeScript strict mode
- Add section header comments (see existing files)
- No console.log in production (use console.debug)

### Testing New Code
Since no automated tests exist:
1. Test encryption ON and OFF states separately
2. Test lock/unlock flows
3. Test storage quota edge cases (fill storage, try to add)
4. Test concurrent operations (rapid copy while UI open)

---

**For questions, see PRD.md for product context or open an issue on GitHub.**
