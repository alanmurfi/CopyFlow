# 📋 CopyFlow — Clipboard History Manager

A privacy-first Chrome extension that saves everything you copy. Search, pin, edit, and export your clipboard history — with optional AES-256 encryption.

**[Install from Chrome Web Store](#)** · **[Landing Page](https://alanmurfi.github.io/CopyFlow/)** · **[Privacy Policy](https://alanmurfi.github.io/CopyFlow/privacy-policy.html)**

---

## Why CopyFlow?

Most clipboard managers ask for permissions they don't need — browsing history, access to all your data on every website, analytics tracking. CopyFlow only requests what it needs to read your clipboard and store clips locally. That's it.

- **No browsing history access**
- **No data sent to any server**
- **No account required**
- **All data stored locally**
- **Optional AES-256 encryption**
- **Export your data anytime**

## Features

| Feature | Description |
|---|---|
| **Auto-save** | Every Ctrl+C / Cmd+C is automatically saved |
| **Image capture** | Copied images are captured, compressed, and stored |
| **Search** | Find any clip instantly with real-time search |
| **Pin** | Keep your most-used clips at the top |
| **Edit** | Fix typos or tweak saved clips inline |
| **Folders** | Organize clips into color-coded folders |
| **Right-click paste** | Paste from your history via the context menu |
| **Insecure paste warning** | Warns before pasting on HTTP pages |
| **Copy toast** | Visual confirmation on screen every time you copy |
| **Export / Import** | Back up your clips as JSON, restore on any machine |
| **AES-256 encryption** | Optional password-based encryption with PBKDF2 key derivation |
| **Auto-lock** | Automatically lock encrypted history after a configurable inactivity period |
| **Text snippets** | Create shortcuts that expand to full snippets when typed |
| **Storage monitoring** | Badge + footer warning when storage approaches the 5 MB limit |
| **Auto-cleanup** | Old unpinned clips are removed after 30 days |
| **Dark mode** | Toggle between light and dark themes |
| **Keyboard shortcuts** | Alt+Shift+V to open; j/k, /search, p pin, d delete, e edit in popup |

## Tech Stack

- [WXT](https://wxt.dev/) — Vite-based Chrome extension framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Mantine](https://mantine.dev/) — UI component library
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — AES-256-GCM, PBKDF2-SHA256
- Chrome Manifest V3

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (loads extension in Chrome)
pnpm dev

# Build for production
pnpm build

# Run unit tests
pnpm test

# Production zip is at .output/copyflow-0.2.1-chrome.zip
```

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts           # Service worker — clipboard polling, context menus, auto-lock, image compression, snippets
│   ├── content.ts              # Content script — copy toast, insecure paste warning, image polling, text expander
│   ├── popup/
│   │   ├── App.tsx             # Main popup UI (clips, folders, image preview)
│   │   ├── LockScreen.tsx      # Password entry with rate limiting
│   │   ├── PasswordSettings.tsx # Encryption management
│   │   ├── SnippetEditor.tsx   # Snippet create/edit form
│   │   ├── SnippetsPanel.tsx   # Snippets management panel
│   │   ├── FolderManager.tsx   # Folder CRUD UI
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── style.css
│   └── welcome/
│       └── Welcome.tsx         # Onboarding page (shown on install)
├── lib/
│   ├── crypto.ts               # AES-256-GCM + PBKDF2 primitives
│   ├── features.ts             # Feature flags
│   ├── session.ts              # Session key management (chrome.storage.session)
│   ├── snippets.ts             # Text snippets storage + template resolution
│   ├── storage.ts              # Chrome storage wrapper (entries, settings, export/import)
│   └── *.test.ts               # Unit tests (crypto, storage, session, features, snippets)
└── types/
    └── index.ts                # TypeScript interfaces
public/
├── offscreen.html              # Offscreen document for clipboard API access
├── offscreen-script.js         # Clipboard read/write via execCommand
└── icon/                       # Extension icons
```

## How It Works

1. A **service worker** polls the clipboard every 1.5s via an **offscreen document** (required because MV3 service workers can't access the Clipboard API directly)
2. The offscreen document uses `document.execCommand('paste')` with a hidden textarea to read text clipboard contents
3. **Image capture** uses `navigator.clipboard.read()` in the content script and popup (which have document focus), since the offscreen doc does not
4. Images are compressed via `OffscreenCanvas` (resized to max 1400px, JPEG at 82% quality) before storage
5. New clips are deduplicated and stored in `chrome.storage.local`
6. When encryption is enabled, each entry is AES-256-GCM encrypted before storage; the session key is kept in `chrome.storage.session` (cleared when the browser closes)
7. A **content script** listens for native `copy` events, shows a toast notification, monitors for image clipboard content, and runs the **text expander** (snippet shortcut detection)
8. Context menu paste warns on HTTP pages with a confirmation dialog before inserting
9. The **popup** reads from storage and updates in real-time via `chrome.storage.onChanged`

## Permissions Explained

| Permission | Why |
|---|---|
| `clipboardRead` / `clipboardWrite` | Read and write clipboard (core feature) |
| `storage` | Store clip history locally |
| `offscreen` | Chrome requires this for background clipboard access |
| `activeTab` / `tabs` | Detect which page you copied from |
| `contextMenus` | Right-click paste menu |

## License

MIT
