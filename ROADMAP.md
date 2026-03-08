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
- **Node.js ESM** — single-invocation CLI, no daemon (Phase 3 adds daemon)
- **Session persistence** via `~/.greentap/browser-data/`
- **Low volume personal use** — minimize ban risk
- **`--disable-blink-features=AutomationControlled`** to reduce automation fingerprint

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CSS selectors break on WA updates | High | Use aria snapshots + roles, not CSS classes |
| Account ban (ToS violation) | Medium | Low volume, human-like delays, personal account |
| Session expires (14-day inactivity) | Low | Keep sessions active, `greentap login` to re-auth |
| Aria labels are locale-dependent | Medium | Detect locale or use role-based selectors |
| WhatsApp detects headless browser | Low | `--disable-blink-features`, headed mode fallback |

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

### Phase 4 — Deprecate AX
- [ ] Remove Swift codebase (`Sources/`)
- [ ] Update Claude Code greentap skill to use `node greentap.js` instead of `~/bin/greentap`
- [ ] Update CLAUDE.md

### Phase 5 — Robustness (ideas)
- [ ] Message scroll (read history beyond viewport)
- [ ] Media support (send/receive images)
- [ ] Retry logic for transient WA errors
- [ ] Locale detection (currently hardcoded Italian)
