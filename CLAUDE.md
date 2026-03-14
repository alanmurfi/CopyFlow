# CLAUDE.md — CopyFlow Project Context

**Last Updated:** 2026-03-14
**Version:** 0.2.1
**Status:** Launch-ready — encryption, snippets, folders, image support, security hardening complete

---

## Critical Rules

- NEVER bypass the storage mutex — all entry read-modify-write operations go through `withEntryLock()`
- NEVER read raw `chrome.storage.local` for UI data — always use `getEntries()` (handles decryption)
- NEVER import password settings from backups — `passwordEnabled` and `autoLockMinutes` excluded for security
- NEVER use `console.log` in production — use `console.debug` only
- NEVER send data to external servers — all storage is local-only
- ALL storage operations must handle both encrypted and plaintext entry types
- ALL message handlers must validate `sender.id` and `sender.tab` for privilege separation
- ALL user input from imports must go through `isValidEntry()` validation
- SVG data URIs blocked, BiDi characters stripped, content script messages never privileged

---

## Success Metrics

- **Build:** `npx tsc --noEmit` passes with zero errors
- **Tests:** all unit tests passing (`pnpm test`), both encryption ON and OFF
- **Security:** no XSS vectors, no privilege escalation paths, constant-time password comparison
- **Performance:** PBKDF2 derivation ~200ms, AES-GCM <1ms/entry, storage I/O <50ms for 500 entries
- **Capacity:** ~30,000+ text entries without quota issues
- **Coverage:** new `src/lib/` modules include unit tests in same commit

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
- **Testing**: Vitest
- **Target**: Chrome Manifest V3

### Project Structure
```
src/
├── entrypoints/
│   ├── background.ts           # Service worker (clipboard polling, menus, auto-lock, image compression, snippets)
│   ├── content.ts              # Copy toast, insecure paste warning, image clipboard polling, text expander
│   ├── popup/
│   │   ├── App.tsx             # Main UI (search, pin, edit, folders, image preview)
│   │   ├── LockScreen.tsx      # Password entry with rate limiting
│   │   ├── PasswordSettings.tsx # Encryption management
│   │   ├── SnippetEditor.tsx   # Snippet create/edit form
│   │   ├── SnippetsPanel.tsx   # Snippets management panel
│   │   └── FolderManager.tsx   # Folder CRUD UI
│   └── welcome/
│       └── Welcome.tsx         # Onboarding page (shown on install)
├── lib/
│   ├── storage.ts              # Encrypted storage abstraction + mutex + quota monitoring
│   ├── crypto.ts               # AES-GCM + PBKDF2 primitives
│   ├── session.ts              # JWK key persistence
│   ├── snippets.ts             # Text snippets storage + template resolution
│   ├── features.ts             # Feature flags
│   ├── crypto.test.ts          # Crypto unit tests
│   ├── storage.test.ts         # Storage unit tests
│   ├── session.test.ts         # Session unit tests
│   ├── features.test.ts        # Feature flags tests
│   └── snippets.test.ts        # Snippets unit tests
├── types/
│   └── index.ts                # TypeScript interfaces
public/
├── offscreen.html              # Offscreen document for clipboard API access
├── offscreen-script.js         # Clipboard read/write via execCommand
└── icon/                       # Extension icons
```

---

## Key Technical Decisions

### 1. Why Offscreen Document for Clipboard?
**Problem**: Chrome MV3 service workers can't access `navigator.clipboard` directly.
**Solution**: Offscreen document with `document.execCommand('paste')` running in a hidden context.
**Trade-off**: Uses deprecated API, but required until Chrome implements async clipboard for service workers.
**Image workaround**: `navigator.clipboard.read()` requires document focus, so image polling is done in the content script and popup (which have focus), not the offscreen doc.
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
- **Session Access Level**: Explicitly set to `TRUSTED_CONTEXTS` — content scripts cannot access the encryption key

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
- Context menu paste doesn't validate target domain (phishing risk on HTTPS pages)
- ~~No CSP in manifest~~ CSP added in v0.2.0
- ~~Storage quota exhaustion fails silently~~ Quota monitoring + badge warnings added in v0.2.0

---

## Data Models

### Core Types
```typescript
// Plaintext entry
interface ClipboardEntry {
  id: string;                // UUID
  content: string;           // Actual text (or dedup key for images)
  type: 'text' | 'image';
  imageDataUrl?: string;     // Base64 data URI (JPEG compressed)
  timestamp: number;         // Unix epoch ms
  sourceUrl?: string;        // Page URL when copied
  sourceTitle?: string;      // Page title
  pinned: boolean;
  folderId?: string;         // Folder organization
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

// --- Snippets ---

interface Snippet {
  id: string;
  shortcut: string;    // e.g., ";sig", "/addr"
  title: string;
  content: string;     // template body with {{vars}}
  createdAt: number;
  updatedAt: number;
}

interface EncryptedSnippet {
  id: string;
  shortcut: string;    // stays plaintext for matching in content script
  createdAt: number;
  updatedAt: number;
  encrypted: EncryptedPayload;  // title + content encrypted together
}

// --- Feature flags ---

interface FeatureFlags {
  snippetsEnabled: boolean;  // default: true (free tier)
}
```

### Storage Schema
```typescript
chrome.storage.local:
  - copyflow_entries: ClipboardEntry[] | EncryptedEntry[]
  - copyflow_folders: Folder[]
  - copyflow_settings: Settings
  - copyflow_last_clipboard: string | sha256_hash  // Dedup
  - copyflow_encryption_meta?: EncryptionMeta
  - copyflow_snippets: Snippet[] | EncryptedSnippet[]
  - copyflow_feature_flags: FeatureFlags
  - copyflow_quota_exceeded: boolean  // Set by background on write failure

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
**Framework**: Vitest (configured in package.json)
```bash
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode
```

**Test files** (in `src/lib/`):
- `crypto.test.ts` — Crypto primitives (committed)
- `storage.test.ts` — Storage operations (committed)
- `session.test.ts` — Session key management
- `features.test.ts` — Feature flags
- `snippets.test.ts` — Snippets storage + template resolution

**Manual Test Checklist** (for features not yet covered by unit tests):
- [ ] Clipboard polling captures text + images
- [ ] Encryption enable/disable flow
- [ ] Lock/unlock with correct/wrong password
- [ ] Auto-lock after inactivity
- [ ] Export/import preserves data
- [ ] Context menu paste works (HTTPS + HTTP warning)
- [ ] Storage quota exceeded handling (badge + UI warning)
- [ ] Snippet expansion in text fields
- [ ] Folder assignment and filtering
- [ ] Image compression (large images resized to JPEG)

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

### 1. Clipboard Polling (background.ts)
```
pollClipboard() every 1.5s
  ├─ Check if locked (skip if encrypted + locked)
  ├─ Send READ_CLIPBOARD to offscreen (text only)
  ├─ Deduplicate (isLastClipboard — plaintext or hashed)
  ├─ Get active tab info (source URL/title)
  ├─ addEntry() → encrypts if enabled → storage
  └─ updateQuotaBadge() → warn if near capacity

Image capture (content.ts + popup/App.tsx):
  ├─ navigator.clipboard.read() (requires focus)
  ├─ Dedup via first 40 chars of base64
  ├─ Send STORE_IMAGE_ENTRY to background
  └─ background compresses (OffscreenCanvas → JPEG) → addEntry()
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

### 4. Text Expander (content.ts)
```
keydown listener (capture phase)
  ├─ Append printable chars to key buffer (max 20)
  ├─ Check if buffer ends with any snippet shortcut
  ├─ If match: preventDefault last keystroke
  ├─ Send EXPAND_SNIPPET to background
  │    └─ background resolves template vars ({{clipboard}}, {{date}}, {{cursor}})
  ├─ Delete partial shortcut from field
  └─ Insert expanded text (input/textarea or contentEditable)
```

### 5. Context Menu Paste (background.ts)
```
contextMenus.onClicked
  ├─ Look up entry by ID
  ├─ Skip non-web pages (chrome://, etc.)
  ├─ HTTP check → send INSECURE_PASTE_WARNING to content script
  │    └─ Content script shows confirm dialog
  │         └─ User confirms → COPYFLOW_CONFIRM_INSECURE_PASTE → background
  ├─ Write text to clipboard via offscreen
  └─ Send COPYFLOW_TRIGGER_PASTE to content script → execCommand('paste')
```

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
Never trust imported JSON. All entries run through `isValidEntry()` validator.
Password settings (`passwordEnabled`, `autoLockMinutes`) **never** imported from backups (security).

### 6. Image Entries Use `content` for Dedup
Image entries store a dedup key (e.g., `[image:<base64-prefix>]`) in the `content` field, not the actual image data.
The actual image is in `imageDataUrl`. Don't display `content` for image-type entries.

### 7. Snippet Shortcuts Stay Plaintext
Even when encryption is enabled, `EncryptedSnippet.shortcut` stays plaintext so the content script can match typed shortcuts without decryption. Only `title` and `content` are encrypted.

### 8. Content Script Message Routing
Background has **two** `onMessage` listeners with distinct routing:
- Content script messages: `sender.tab !== undefined` — handles GET_SNIPPETS, EXPAND_SNIPPET, STORE_IMAGE_ENTRY, COPYFLOW_CONFIRM_INSECURE_PASTE
- Popup/extension messages: `sender.tab === undefined` — handles COPY_TO_CLIPBOARD, LOCK/UNLOCK, REBUILD_CONTEXT_MENUS, SNIPPETS_CHANGED

---

## Performance Characteristics

### Storage Limits
- **Per-entry max (text)**: 500 KB (enforced at addEntry)
- **Per-entry max (image)**: 10 MB (enforced at addEntry)
- **Image compression**: Resized to max 1400px, JPEG at 82% quality (background.ts)
- **chrome.storage.local quota**: Unlimited (`unlimitedStorage` permission), 50 MB soft limit enforced in code
- **Quota warning**: Badge + UI warning at 80% of soft limit, skip writes at 95%
- **Encryption overhead**: ~33% size increase (base64 encoding)
- **Estimated capacity**: ~30,000+ text entries, thousands with images

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
1. ~~**No automated tests**~~ Unit tests started (crypto, storage, session, features, snippets) — UI tests still missing
2. ~~**Storage quota silent failure**~~ Quota monitoring + badge + UI warning added
3. **Context menu paste on HTTPS** — No domain validation before inserting text (HTTP warning added, HTTPS still open)
4. **execCommand deprecation** - Will break when Chrome removes it

### Medium Priority
5. **Race condition in dedup check** - Rare, cosmetic impact
6. ~~**Auto-lock timer doesn't update on settings change**~~ Fixed — `storage.onChanged` re-arms the timer
7. **Password in React state memory** - Can't reliably zero in JavaScript

### Low Priority / Future Features
8. ~~**Folder system incomplete**~~ Folders fully implemented (UI + data model)
9. **No Chrome sync** - All data local-only (could add encrypted sync)
10. ~~**Limited image support**~~ Image capture + JPEG compression added; large images still consume quota fast

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
- Fixed 6 security vulnerabilities
  - Sender validation for privileged messages
  - BiDi character sanitization
  - SVG data URI blocking
  - Import validation hardening
  - Password settings excluded from imports
  - Message type validation

### v0.2.0 (2026-03 — Current)
- Password-based encryption (AES-256-GCM)
- Auto-lock after inactivity
- Lock screen with rate limiting
- Text snippets with template variables ({{clipboard}}, {{date}}, {{cursor}})
- Folder organization (create, assign, filter)
- Image clipboard capture (content script + popup polling)
- Image compression (OffscreenCanvas → JPEG)
- Insecure paste warning (HTTP page detection)
- Storage quota monitoring (badge + UI warning)
- CSP headers in manifest
- Onboarding welcome page
- Keyboard shortcuts (j/k navigation, /search, p pin, d delete, e edit)
- Unit tests started (crypto, storage, session, features, snippets)
- Feature flags system

### v0.2.1 (2026-03-14) — Security Hardening
- Replaced all `console.log` with `console.debug` (no clipboard content in logs)
- Explicit `setAccessLevel('TRUSTED_CONTEXTS')` for session storage
- Fixed version string consistency across UI and manifest
- 122 unit tests passing across 5 test suites

### Remaining Work
- Expand test coverage (UI tests, integration tests)
- Domain paste warnings on HTTPS (currently HTTP-only)

---

## Resources

### Documentation
- [WXT Framework Docs](https://wxt.dev/)
- [Chrome Extension MV3 Guide](https://developer.chrome.com/docs/extensions/mv3/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### External Dependencies
- `uuid` - UUID generation
- `@mantine/core` + `@mantine/hooks` - UI components
- `@tabler/icons-react` - Icons
- `react` + `react-dom` - UI framework
- `vitest` - Testing framework (dev)

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
- `src/lib/snippets.ts` - Encrypted snippet storage
- `src/entrypoints/background.ts` - Message handling, image storage, snippet expansion
- `src/entrypoints/content.ts` - Insecure paste warning, text expander
- `src/entrypoints/popup/PasswordSettings.tsx` - Migration logic

### Code Style
- Prefer functional components (React hooks)
- Use TypeScript strict mode
- Add section header comments (see existing files)
- No console.log in production (use console.debug)

### Testing New Code
1. Run `pnpm test` to verify existing unit tests pass
2. Test encryption ON and OFF states separately
3. Test lock/unlock flows
4. Test storage quota edge cases (fill storage, try to add)
5. Test concurrent operations (rapid copy while UI open)
6. Add unit tests for new logic in `src/lib/` where possible

---

**For questions, see PRD.md for product context or open an issue on GitHub.**
