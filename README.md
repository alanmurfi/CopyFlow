# 📋 CopyFlow — Clipboard History Manager

A privacy-first Chrome extension that saves everything you copy. Search, pin, edit, and export your clipboard history.

**[Install from Chrome Web Store](#)** · **[Landing Page](https://alanmurfi.github.io/CopyFlow/)** · **[Privacy Policy](https://alanmurfi.github.io/CopyFlow/privacy-policy.html)**

---

## Why CopyFlow?

Most clipboard managers ask for permissions they don't need — browsing history, access to all your data on every website, analytics tracking. CopyFlow only requests what it needs to read your clipboard and store clips locally. That's it.

- **No browsing history access**
- **No data sent to any server**
- **No account required**
- **All data stored locally**
- **Export your data anytime**

## Features

| Feature | Description |
|---|---|
| **Auto-save** | Every Ctrl+C / Cmd+C is automatically saved |
| **Search** | Find any clip instantly with real-time search |
| **Pin** | Keep your most-used clips at the top |
| **Edit** | Fix typos or tweak saved clips inline |
| **Right-click paste** | Paste from your history via the context menu |
| **Copy toast** | Visual confirmation on screen every time you copy |
| **Export / Import** | Back up your clips as JSON, restore on any machine |
| **Auto-cleanup** | Old unpinned clips are removed after 30 days |
| **Dark mode** | Toggle between light and dark themes |
| **Keyboard shortcut** | Alt+Shift+V opens CopyFlow instantly |

## Tech Stack

- [WXT](https://wxt.dev/) — Vite-based Chrome extension framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Mantine](https://mantine.dev/) — UI component library
- Chrome Manifest V3

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (loads extension in Chrome)
pnpm dev

# Build for production
pnpm build

# Production zip is at .output/copyflow-0.1.0-chrome.zip
```

## Project Structure

```
src/
├── entrypoints/
│   ├── background.ts      # Service worker — clipboard polling, context menus, auto-cleanup
│   ├── content.ts          # Content script — copy toast notification
│   └── popup/
│       ├── App.tsx          # Main popup UI
│       ├── index.html
│       ├── main.tsx
│       └── style.css
├── lib/
│   └── storage.ts          # Chrome storage wrapper (entries, settings, export/import)
└── types/
    └── index.ts             # TypeScript interfaces
public/
├── offscreen.html           # Offscreen document for clipboard API access
├── offscreen-script.js      # Clipboard read/write via execCommand
└── icon/                    # Extension icons
```

## How It Works

1. A **service worker** polls the clipboard every 1.5s via an **offscreen document** (required because MV3 service workers can't access the Clipboard API directly)
2. The offscreen document uses `document.execCommand('paste')` with a hidden textarea to read clipboard contents
3. New clips are deduplicated and stored in `chrome.storage.local`
4. A **content script** listens for native `copy` events and shows a toast notification
5. The **popup** reads from storage and updates in real-time via `chrome.storage.onChanged`

## Permissions Explained

| Permission | Why |
|---|---|
| `clipboardRead` / `clipboardWrite` | Read and write clipboard (core feature) |
| `storage` | Store clip history locally |
| `offscreen` | Chrome requires this for background clipboard access |
| `activeTab` / `tabs` | Detect which page you copied from |
| `contextMenus` | Right-click paste menu |
| `scripting` | Insert text into form fields from context menu |

## License

MIT
