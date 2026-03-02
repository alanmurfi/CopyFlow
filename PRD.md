# Product Requirements Document — CopyFlow

**Document Version:** 1.2
**Last Updated:** 2026-03-02
**Product Version:** v0.2.0 (current)
**Owner:** Solo Developer
**Status:** Active Development

---

## Executive Summary

**CopyFlow** is a privacy-first clipboard history manager for Chrome that saves everything users copy, with optional password-based encryption. Unlike competitors that request excessive permissions and track user data, CopyFlow operates entirely locally with zero external network calls.

**Target Users**: Privacy-conscious developers, writers, researchers, and power users who frequently copy-paste but don't trust cloud-based clipboard managers.

**Market Positioning**: Open-source, transparent security, minimal permissions, user data ownership.

---

## Problem Statement

### User Pain Points

1. **Lost Clipboard Data**
   Users frequently copy something important, then copy something else, losing the first item forever. This happens dozens of times per day for developers, writers, and researchers.

2. **Privacy Concerns with Existing Solutions**
   Popular clipboard managers (Ditto, CopyQ, Clipboard History Pro) request:
   - Access to all browsing history
   - Read/change data on all websites
   - Send anonymous usage data to servers

   Users don't trust these tools with sensitive data (API keys, passwords, private notes).

3. **No Data Portability**
   Most clipboard managers lock data in proprietary formats or cloud accounts. Users can't export, migrate, or audit what's stored.

4. **Encryption Trade-offs**
   Cloud clipboard managers encrypt in transit but not at rest (they need plaintext for sync). Local-only tools rarely offer encryption.

### Market Opportunity

- **100M+ Chrome users** use clipboard tools (based on extension install counts)
- **Privacy-focused tools growing**: Signal, Proton, Brave all gaining market share
- **Developer market**: 30M+ active developers globally, high clipboard usage
- **Chrome Web Store gap**: No clipboard manager with <5 permissions AND encryption

---

## User Personas

### Primary: Privacy-Conscious Developer (Alex)
- **Age**: 28-45
- **Job**: Software engineer, DevOps, security researcher
- **Pain**: Copies API keys, credentials, code snippets daily. Doesn't trust cloud clipboards.
- **Goals**: Never lose copied data, keep secrets local, export backups
- **Technical Level**: High (understands encryption, reads source code)
- **Willingness to Pay**: $0-10 one-time (values open source)

### Secondary: Content Creator (Jordan)
- **Age**: 25-40
- **Job**: Writer, marketer, blogger
- **Pain**: Loses research snippets, quotes, links when juggling multiple sources
- **Goals**: Search old clips, organize by project, paste across tabs
- **Technical Level**: Medium (uses Chrome extensions, doesn't code)
- **Willingness to Pay**: $0-5/month (subscription fatigue)

### Tertiary: General Power User (Sam)
- **Age**: 30-60
- **Job**: Project manager, analyst, student
- **Pain**: Copy-paste workflow inefficient, loses important URLs/text
- **Goals**: Quick access to recent clips, pin frequently used items
- **Technical Level**: Low (basic computer skills)
- **Willingness to Pay**: $0 (expects free tools)

---

## Core Use Cases

### UC-1: Save Everything Automatically
**Actor**: All users
**Trigger**: User presses Ctrl+C / Cmd+C
**Flow**:
1. CopyFlow detects clipboard change (1.5s polling)
2. Saves content to `chrome.storage.local`
3. Shows toast notification (visual confirmation)
4. Entry appears in popup history (newest first)

**Success Criteria**: 99%+ capture rate, <2s latency, no duplicates

### UC-2: Search Historical Clips
**Actor**: Developer (Alex) looking for API key from 3 days ago
**Trigger**: Opens CopyFlow popup, types search query
**Flow**:
1. Real-time filter on all entries (client-side)
2. Results update as user types
3. Click entry to copy back to clipboard
4. Entry moves to top of recent list

**Success Criteria**: <100ms search response, fuzzy match, highlights matches

### UC-3: Enable Encryption for Sensitive Data
**Actor**: Security-conscious user (Alex)
**Trigger**: User navigates to Settings → Password & Encryption
**Flow**:
1. User creates password (min 8 chars, confirmed)
2. CopyFlow generates salt, derives AES-256 key (PBKDF2, 600k iterations)
3. All existing entries encrypted in place
4. Future clipboard captures auto-encrypted
5. Extension locks on browser restart (requires password)

**Success Criteria**: <5s encryption time for 500 entries, no data loss, key derivation <500ms

### UC-4: Pin Important Clips
**Actor**: Content creator (Jordan) with frequently used email signatures
**Trigger**: User clicks pin icon on entry
**Flow**:
1. Entry moves to "Pinned" section (top of list)
2. Pinned entries exempt from auto-cleanup (never deleted)
3. Context menu shows pinned items first

**Success Criteria**: Pin state persists, survives encryption toggle, visible in all views

### UC-5: Export Data for Backup
**Actor**: Developer (Alex) backing up before system wipe
**Trigger**: User clicks "Export backup" in menu
**Flow**:
1. CopyFlow decrypts all entries (if encrypted)
2. Exports to JSON file: `copyflow-backup-2026-03-01.json`
3. User stores file in external backup (Dropbox, USB)
4. Can import on new machine / after reinstall

**Success Criteria**: Export is human-readable JSON, includes metadata, import restores 100% of data

### UC-6: Right-Click Paste from History
**Actor**: Power user (Sam) filling out web form
**Trigger**: User right-clicks text field → "CopyFlow — Paste clip"
**Flow**:
1. Context menu shows 10 most recent clips
2. User selects clip from submenu
3. Content inserted into focused field

**Success Criteria**: Works on 95%+ websites, <500ms insertion, handles multiline text

---

## Features

### v0.1.0 Features (Shipped)

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Auto-save clipboard | P0 | ✅ Shipped | Polls every 1.5s, saves to local storage |
| Search history | P0 | ✅ Shipped | Real-time client-side filter |
| Pin clips | P1 | ✅ Shipped | Keep important items at top |
| Edit clips | P1 | ✅ Shipped | Inline editing with Ctrl+Enter save |
| Delete clips | P1 | ✅ Shipped | Single delete + "Clear All" |
| Context menu paste | P1 | ✅ Shipped | Right-click paste from history |
| Copy toast notification | P2 | ✅ Shipped | Visual feedback on copy |
| Dark mode | P2 | ✅ Shipped | Light/dark/system theme |
| Export/Import | P1 | ✅ Shipped | JSON backup/restore |
| Auto-cleanup | P2 | ✅ Shipped | Delete unpinned after 30 days |
| Keyboard shortcut | P2 | ✅ Shipped | Alt+Shift+V opens popup |

### v0.2.0 Features (Current)

| Feature | Priority | Status | Target | Description |
|---------|----------|--------|--------|-------------|
| Password encryption | P0 | ✅ Shipped | 2026-03 | AES-256-GCM encryption |
| Auto-lock | P1 | ✅ Shipped | 2026-03 | Lock after inactivity |
| Lock screen | P0 | ✅ Shipped | 2026-03 | Password entry UI |
| Text snippets | P1 | ✅ Shipped | 2026-03 | Template variables, text expander |
| Folders | P1 | ✅ Shipped | 2026-03 | Organize clips by folder |
| Image capture | P1 | ✅ Shipped | 2026-03 | Clipboard image capture + compression |
| Onboarding | P2 | ✅ Shipped | 2026-03 | Welcome page on first install |
| Keyboard shortcuts | P2 | ✅ Shipped | 2026-03 | j/k nav, p pin, d delete, e edit |
| Storage quota alerts | P1 | ✅ Shipped | 2026-03 | Badge + UI warning before quota exceeded |
| CSP headers | P1 | ✅ Shipped | 2026-03 | Content Security Policy in manifest |
| Insecure paste warnings | P2 | ✅ Shipped | 2026-03 | Warn + confirm on paste to HTTP pages |
| Feature flags | P2 | ✅ Shipped | 2026-03 | Toggle features (snippets) |
| Unit tests | P0 | 🚧 In Progress | 2026-03 | Crypto, storage, session, features, snippets |

### v0.3.0 Features (Planned)

| Feature | Priority | Status | Target | Description |
|---------|----------|--------|--------|-------------|
| Smart detection | P2 | 💡 Ideation | 2026-05 | Auto-tag URLs, emails, code |
| Encrypted sync | P2 | 💡 Ideation | 2026-07 | E2E encrypted Chrome sync |
| UI tests | P1 | 📋 Planned | 2026-05 | React component + integration tests |
| HTTPS paste warnings | P2 | 📋 Planned | 2026-05 | Domain validation for secure pages |

### Future / Nice-to-Have

- Rich text formatting (preserve bold, links)
- OCR for copied images (text extraction)
- Cloud backup (optional, paid tier)
- Firefox/Safari versions
- Mobile companion app
- CLI for developers (`copyflow search "API key"`)

---

## Success Metrics

### Adoption Metrics (Chrome Web Store)
- **Week 1**: 100 installs
- **Month 1**: 1,000 installs
- **Month 3**: 5,000 installs
- **Month 6**: 10,000 installs

### Engagement Metrics
- **Daily Active Users (DAU)**: 60%+ of installs (high usage expected)
- **Clips Saved per User**: 50+ per week (indicates utility)
- **Encryption Adoption**: 20%+ users enable password protection
- **Export/Import Usage**: 5%+ users (power user indicator)

### Quality Metrics
- **Clipboard Capture Rate**: 99%+ (no missed copies)
- **Crash Rate**: <0.1% sessions
- **Storage Quota Errors**: <1% users
- **Negative Reviews**: <5% (address privacy/security concerns)

### Privacy Metrics (Validation)
- **Permissions Requested**: 6 (lowest in category)
- **External Network Calls**: 0 (auditable via DevTools)
- **Telemetry/Analytics**: 0 (no tracking code)

---

## Go-to-Market Strategy

### Launch Plan (v0.2.0)

**Week 1-2: Soft Launch**
- Submit to Chrome Web Store (unlisted)
- Beta test with 20 users (friends, Discord servers)
- Gather feedback, fix critical bugs

**Week 3: Public Launch**
- Publish to Chrome Web Store (listed)
- Post on:
  - Hacker News ("Show HN: Privacy-first clipboard manager")
  - Reddit: r/privacy, r/Chrome, r/webdev
  - ProductHunt (with video demo)
  - Dev.to / Hashnode (technical article)

**Week 4-8: Content Marketing**
- Blog post: "Why your clipboard manager is a security risk"
- YouTube demo: "CopyFlow setup + encryption walkthrough"
- Twitter thread: Privacy comparison vs competitors
- Open source promotion: GitHub trending, awesome-lists

**Month 3-6: Community Building**
- Discord server for power users
- GitHub Discussions for feature requests
- Monthly changelog updates
- Respond to all reviews within 48h

### Pricing Strategy

**v0.1-0.3**: Free (build trust, user base)
**v1.0+**: Freemium model
- **Free tier**: 500 clips max, core features
- **Pro tier ($3/month or $25/year)**:
  - Unlimited clips
  - Encrypted cloud sync
  - Priority support
  - Dark patterns: None (no nag screens, full export even on free)

**Revenue Goal**: 10K users → 2% convert → 200 Pro @ $25/yr = **$5K ARR**

---

## Competitive Analysis

| Feature | CopyFlow | Clipboard History Pro | Ditto (Desktop) | System Clipboard |
|---------|----------|----------------------|-----------------|------------------|
| **Price** | Free | Free + $3/mo Pro | Free (FOSS) | Free (built-in) |
| **Permissions** | 6 | 11+ | N/A (desktop) | 0 |
| **Privacy** | Local only | Cloud sync (plaintext) | Local only | RAM only |
| **Encryption** | AES-256 (optional) | ❌ None | ❌ None | ❌ None |
| **Export** | JSON | ❌ None | ✅ CSV | ❌ None |
| **Search** | ✅ Real-time | ✅ Real-time | ✅ Real-time | ❌ None |
| **Open Source** | ✅ Yes | ❌ No | ✅ Yes | N/A |
| **Auto-cleanup** | ✅ 30 days | ✅ Custom | ✅ Custom | 1 item only |

**Competitive Advantages**:
1. Only Chrome extension with encryption + open source
2. Minimal permissions (no browsing history access)
3. Transparent security (auditable code)
4. Export-first design (no lock-in)

**Competitive Weaknesses**:
1. No cloud sync (yet)
2. No rich text formatting (competitors have this)
3. Chrome-only (no cross-browser support)

---

## Non-Goals (Out of Scope)

### v0.1-0.3
❌ **Cloud sync** - Local-only for privacy, adds complexity
❌ **Rich text formatting** - Would bloat storage, lose plaintext search
❌ **Firefox/Safari** - Focus on Chrome MV3 first, port later
❌ **Mobile app** - Different clipboard APIs, separate project
❌ **AI features** - No LLM calls (privacy violation)
❌ **Collaboration** - Single-user tool, no sharing
❌ **Analytics/Telemetry** - Privacy-first = zero tracking

### Future Consideration
🤔 **Chrome sync with E2E encryption** - If users demand it (v0.4+)
🤔 **Paid cloud backup** - Optional premium feature (v1.0+)
🤔 **Browser agnostic** - WebExtension API port (v1.5+)

---

## Technical Requirements

### Performance

| Metric | Requirement | Current | Status |
|--------|-------------|---------|--------|
| Clipboard poll latency | <2s | 1.5s | ✅ Pass |
| Search response time | <100ms | ~10ms | ✅ Pass |
| Encryption (500 entries) | <5s | ~3s | ✅ Pass |
| PBKDF2 key derivation | <500ms | ~200ms | ✅ Pass |
| Storage quota usage | <5MB | ~2MB avg | ✅ Pass |
| Context menu paste | <500ms | ~100ms | ✅ Pass |

### Security

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Encryption algorithm | AES-256-GCM | ✅ Implemented |
| Key derivation | PBKDF2-SHA256, 600k iterations | ✅ Implemented |
| Password minimum | 8 characters | ✅ Implemented |
| Rate limiting | Exponential backoff, 10 attempts max | ✅ Implemented |
| XSS prevention | SVG blocking, BiDi sanitization | ✅ Implemented |
| Sender validation | Extension page only, no content scripts | ✅ Implemented |
| CSP headers | Restrict unsafe-inline, unsafe-eval | ✅ Implemented |
| No external network | 0 HTTP requests | ✅ Verified |

### Compatibility

| Platform | Requirement | Status |
|----------|-------------|--------|
| Chrome | v88+ (MV3 stable) | ✅ Tested |
| Edge | v88+ (Chromium) | 🧪 Untested |
| Brave | v1.30+ | 🧪 Untested |
| Opera | v74+ | 🧪 Untested |
| Firefox | N/A | ❌ Out of scope |

---

## Risks & Mitigation

### Technical Risks

**Risk 1: execCommand deprecation**
- **Impact**: HIGH - Clipboard polling will stop working
- **Likelihood**: MEDIUM (3-5 years)
- **Mitigation**: Monitor [Chromium Issue #1098937](https://bugs.chromium.org/p/chromium/issues/detail?id=1098937), implement async clipboard API when available

**Risk 2: Storage quota exhaustion**
- **Impact**: MEDIUM - Users lose data silently
- **Likelihood**: LOW (500-entry limit prevents most cases)
- **Mitigation**: Add quota monitoring (v0.2), show warnings at 80% capacity

**Risk 3: Password forgetting (locked data)**
- **Impact**: HIGH - User loses all encrypted data
- **Likelihood**: MEDIUM (users forget passwords)
- **Mitigation**: Export prompts before enabling encryption, recovery docs, no master key (by design)

### Business Risks

**Risk 4: Chrome Web Store rejection**
- **Impact**: HIGH - Can't distribute
- **Likelihood**: LOW (follows all policies)
- **Mitigation**: Clear permission justifications, privacy policy, comply with MV3

**Risk 5: User trust (closed-source alternatives)**
- **Impact**: MEDIUM - Slow adoption
- **Likelihood**: LOW (open source advantage)
- **Mitigation**: GitHub transparency, security audit (third-party), responsive support

**Risk 6: Competitor cloning**
- **Impact**: MEDIUM - Larger company ships similar tool
- **Likelihood**: MEDIUM (easy to copy)
- **Mitigation**: First-mover advantage, community building, brand trust

---

## Open Questions

### Product Questions
1. ~~**Should we support clipboard images?**~~
   - Resolved: Image capture shipped in v0.2.0 with JPEG compression (max 1400px, 82% quality)
   - Large images still consume quota fast — consider further optimization

2. **Freemium vs fully free?**
   - Current: Free during v0.x
   - Question: Can we sustain development without revenue?
   - Decision: Introduce optional Pro tier in v1.0 (cloud sync only)

3. ~~**Folder/tag organization?**~~
   - Resolved: Folders shipped in v0.2.0 (create, assign, filter by folder)

### Technical Questions
4. **How to handle password reset?**
   - Current: No master key recovery (by design)
   - Issue: Users who forget password lose all encrypted data
   - Options:
     - A) Keep current (most secure, user responsibility)
     - B) Add optional recovery key (reduces security)
     - C) Prompt export before encryption (minimize data loss)
   - Decision: Implement C in v0.2, consider B for v1.0

5. **Chrome sync integration?**
   - Pros: Multi-device access, automatic backup
   - Cons: 100KB quota (tiny), requires E2E encryption, complexity
   - Decision: Build E2E encrypted sync in v0.4 IF users request it (survey)

---

## Timeline & Milestones

### Q1 2026 (Current)
- ✅ v0.1.0 shipped (2026-01-15)
- ✅ Security hardening (2026-03-01)
- ✅ v0.2.0 feature-complete (encryption, snippets, folders, images, onboarding)
- 🚧 Finishing unit tests
- Target: v0.2.0 public launch by 2026-03-15

### Q2 2026
- v0.2.0 public launch
- Marketing push (Hacker News, ProductHunt)
- Community feedback → v0.2.1 bugfixes
- v0.3.0 planning (smart detection, encrypted sync)

### Q3 2026
- v0.3.0 launch (folders, smart detection)
- 5,000+ users milestone
- Security audit (third-party)
- Monetization research (user surveys)

### Q4 2026
- v1.0 prep (freemium model, encrypted sync)
- Firefox/Edge ports (if resources allow)
- Revenue launch ($3/mo Pro tier)
- End of year: 10,000+ users

---

## Appendix

### User Feedback (v0.1.0 Beta)

**Positive**:
- "Finally a clipboard manager that doesn't spy on me" - u/privacy_advocate
- "Encryption is a game-changer for devs" - Alex (tester)
- "Export feature saved me when I reinstalled Chrome" - Jordan

**Negative**:
- "Wish it synced across devices" - 3 users (common request)
- "Can't organize clips into folders" - 2 users
- "Images take up too much space" - 1 user

**Action Items**:
- ✅ Add encryption (v0.2)
- 📋 Plan folders (v0.3)
- 📋 Investigate encrypted sync (v0.4)
- 📋 Add image compression (v0.3)

### Privacy Policy Summary
- No data collection
- No external network calls
- No cookies or tracking pixels
- All data stored locally in `chrome.storage.local`
- Encryption key stored in `chrome.storage.session` (optional)
- User can export data anytime
- Uninstall removes all data

### Related Documents
- `CLAUDE.md` - Technical implementation guide
- `README.md` - User-facing documentation
- `store/listing.md` - Chrome Web Store copy
- `docs/privacy-policy.html` - Legal privacy policy
- GitHub Issues - Feature requests and bugs

---

**Document Status**: Living document, updated after each release
**Next Review**: After v0.2.0 launch (March 2026)
**Feedback**: Open GitHub issue or contact developer
