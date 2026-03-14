# Chrome Web Store Listing — CopyFlow

## Extension Name (max 45 chars)
CopyFlow — Clipboard History Manager

## Short Description (max 132 chars)
Save everything you copy. Search, pin, encrypt, and organize your clipboard history. No tracking. No servers. 100% local.

## Detailed Description (max 16,000 chars)

Tired of losing things you copied 5 minutes ago? CopyFlow saves every piece of text you copy and keeps it searchable, organized, and always available — with optional encryption so even your clipboard stays private.

WHAT COPYFLOW DOES
• Automatically saves everything you copy — text and images
• Search your entire clipboard history instantly
• Pin important clips so they stay at the top
• Edit saved clips directly in the popup
• Organize clips into color-coded folders
• Right-click any text field to paste from your history
• Text snippets — type a short trigger (e.g. ;sig) and it expands automatically
• Visual copy confirmation — brief on-screen toast every time you copy
• Keyboard navigation — j/k to move, Enter to copy, / to search
• Export and import your clips as JSON backups
• Dark mode and light mode
• Keyboard shortcut (Alt+Shift+V) to open instantly

OPTIONAL ENCRYPTION
Enable a password to protect your clipboard with AES-256-GCM encryption (the same standard used by banks and password managers). Your data is encrypted locally — CopyFlow never sees your password or your clips.
• AES-256-GCM encryption, 600,000 PBKDF2 iterations (OWASP 2023 standard)
• Auto-lock after inactivity
• All existing clips migrated automatically when you enable encryption
• Export still works — decrypts to portable JSON for backups

WHY COPYFLOW?
Most clipboard managers ask for permissions they don't need — like your full browsing history. CopyFlow only requests the minimum required to do its job. No analytics. No tracking. No account. No cloud.

Your data stays on your machine. Always exportable. Never locked in.

PRIVACY FIRST
• No browsing history access
• No data sent to any server — ever
• No account required
• All clips stored locally in your browser
• Optional AES-256 encryption at rest
• Export your data anytime as a JSON file

PERMISSIONS EXPLAINED
• clipboardRead/Write: Read and write to your clipboard (the core feature)
• storage/unlimitedStorage: Save your clip history locally on your device (unlimited storage for large image histories)
• offscreen: Required by Chrome to access the clipboard in the background
• activeTab/tabs: Record which page you copied from (shown as source info on each clip)
• contextMenus: Right-click paste menu in text fields

CopyFlow is free and open source. Built by a solo developer who was tired of losing copied text.

## Category
Productivity

## Language
English

## Tags/Keywords
clipboard, clipboard history, clipboard manager, copy paste, clipboard tool, productivity, encryption, snippets, text expander

---

## Changelog (for store release notes)

### v0.2.1 — Security hardening & bug fixes
- Replaced all console.log with console.debug (no clipboard content in logs)
- Explicit session storage access level restriction (TRUSTED_CONTEXTS only)
- Fixed password settings layout (scrollable, cleaner disable flow)
- Improved image clipboard capture reliability
- Source titles are now clickable links to the original page
- Updated privacy policy
- 122 unit tests passing across 5 test suites

### v0.2.0 — Encryption, snippets, folders & images
- Password-based encryption (AES-256-GCM) with auto-lock
- Text snippets with template variables ({{clipboard}}, {{date}}, {{cursor}})
- Folder organization with color-coded labels
- Image clipboard capture with JPEG compression
- Insecure paste warning on HTTP pages
- Storage quota monitoring
- Onboarding welcome page
- Keyboard shortcuts (j/k, /, p, d, e)
- CSP headers in manifest
