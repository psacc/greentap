# Greentap Roadmap — Playwright Migration

## Context

AX approach (Swift + macOS Accessibility API) works but is too fragile:
- Catalyst window disappears and can't be recovered programmatically
- Viewport-only reads (no scroll)
- CGEvent Enter silently ignored by Catalyst app
- Requires macOS, steals focus

Migrating to Playwright on WhatsApp Web, following the same pattern as hey-cli.

## Architecture Decisions

- **Playwright + `launchPersistentContext`** (same as hey-cli)
- **Aria snapshots** as primary data source (not CSS selectors — those are obfuscated and change weekly)
- **Node.js ESM** — daemon-backed CLI via CDP (persistent Chrome on port 19222, lazy start, 15min idle shutdown)
- **Session persistence** via `~/.greentap/browser-data/`
- **Low volume personal use** — minimize ban risk
- **`--disable-blink-features=AutomationControlled`** to reduce automation fingerprint

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CSS selectors break on WA updates | High | Use aria snapshots + roles, not CSS classes |
| Account ban (ToS violation) | Medium | Low volume, human-like delays, personal account |
| Session expires (14-day inactivity) | Low | Keep sessions active, `greentap login` to re-auth |
| Aria labels are locale-dependent | Medium | Hardcoded Italian; locale detection planned for Phase 6 |
| WhatsApp rejects bundled Chromium | Medium | Use system Chrome (`channel: "chrome"`), headed mode |
| Aria tree restructuring (WA updates) | Medium | Two row formats already handled; parser may need updates |

**Current: Phase 4**

## Phases

### Phase 0 — Spike ✓
- [x] `launchPersistentContext` + `headless: false` for QR login
- [x] Explore WhatsApp Web aria snapshot (chat list, messages, compose)
- [x] Validate aria selectors work reliably
- [x] Record fixtures (`test/fixtures/`)
- [x] Assess scroll behavior for message history

### Phase 1 — Read-only CLI ✓
- [x] `greentap login` — headed browser for manual QR scan
- [x] `greentap logout` — clear `~/.greentap/browser-data/`
- [x] `greentap chats [--json]` — list chats from aria snapshot
- [x] `greentap unread [--json]` — only unread chats
- [x] `greentap read <chat> [--json]` — messages (visible only, no scroll yet)
- [x] Pure parser in `lib/parser.js` with unit tests
- [x] Fixture-based tests (aria snapshots)
- [x] Element-based waits (replaced fixed timeouts)
- [x] Own-message attribution fix (msg-dblcheck detection)

### Phase 2 — Actions ✓
- [x] `greentap send <chat> <message>` — compose + send with chat verification
- [x] `greentap search <query> [--json]` — search chats (reuses chat list parser)
- [x] Post-send verification (compose empty + message in snapshot)
- [x] Human-like delays (random jitter between actions)

### Phase 3 — Performance ✓
- [x] Browser daemon (`launchPersistentContext` + CDP port 19222)
- [x] Per-command latency ~531ms (was 3-5s)
- [x] Lazy start: first command auto-launches daemon
- [x] Auto-shutdown after 15min idle (CDP event monitoring)
- [x] `greentap status` / `greentap daemon stop`
- [x] `waitForMessagePanel` fix (compose textbox, works for all chat types)
- [x] `navigateToChat` fallback to search (archived chats)
- [x] `button "Invia"` exact match fix

### Phase 4 — Deprecate AX + Skill Migration
- [ ] Feature parity audit — verify Node.js CLI covers all Swift skill commands:
  - `chats [--json]`, `unread [--json]`, `read <chat> [--json]`, `search <query> [--json]`, `send <chat> <message>`
  - Behavior: chat matching (case-insensitive substring), search fallback for archived chats, `--json` output
  - Guidelines: never send without user confirmation, use `--json` for parsing
- [ ] Ensure all commands tested with `node greentap.js` equivalents
- [ ] Update Claude Code greentap skill (`~/.claude/skills/greentap/SKILL.md`) to use `node greentap.js`
- [ ] Remove Swift codebase (`Sources/`) — git history preserves it
- [ ] Remove `~/bin/greentap` binary
- [ ] Update CLAUDE.md

### Phase 5 — Scroll + Robustness
- [ ] **Message scroll** (read history beyond viewport) — priority
- [ ] Retry logic for transient WA errors
- [ ] ~~Locale detection~~ → moved to Phase 6 (MIT blocker)

### Phase 6 — Open Source (MIT)
- [ ] Locale detection (moved from Phase 5 — blocker for public release)
- [ ] Add LICENSE (MIT)
- [ ] Add privacy disclaimer + WhatsApp ToS notice (README)
  - Clearly state: unofficial, not affiliated with WhatsApp/Meta
  - Warn about ToS violation risk and potential account ban
  - Recommend personal use only, low volume
- [ ] Anonymize all fixtures (no real PII in committed snapshots)
- [ ] Review codebase for hardcoded paths / personal config
- [ ] Add README with install, usage, architecture
- [ ] Publish to GitHub (public)

### Phase 7 — Media (post-release)
- [ ] Send/receive images
- [ ] Receive voice messages (download audio from chat)
- [ ] Transcribe voice messages (Whisper or equivalent)
- [ ] Surface transcription in `read` output
- [ ] Feasibility spike: can audio URLs be extracted from aria snapshot or DOM?
