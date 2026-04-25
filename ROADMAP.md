## Strategic context
Priority: medium — stable, agent-autonomy + media shipped in v0.4.0
Current phase: Phase 9 — quality polish (sticker visibility, performance, sender inheritance hardening) — target v0.5.0
Blocks: nothing
Blocked by: nothing
Last updated: 2026-04-25
→ Full strategic context: psacc/docs/ROADMAP.md

---

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
| Aria labels are locale-dependent | Low | Mitigated: structural ARIA selectors + runtime locale detection (Phase 6) |
| WhatsApp rejects bundled Chromium | Resolved (2026-04-25) | Bundled Chromium adopted; daemon strips `HeadlessChrome` from UA via CDP `Network.setUserAgentOverride`, WA accepts the session. |
| Aria tree restructuring (WA updates) | Medium | Two row formats already handled; parser may need updates. E2E harness catches breakage early. |
| Sticker vs photo input confusion | Mitigated (2026-04-25) | E2E `sendFixtureImage` uses Allega → Foto e video flow keyed on `ic-filter-filled` icon; never touches the sticker input. |

**Current: Phase 9 (quality polish, v0.5.0 target)**

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

### Phase 4 — Deprecate AX + Skill Migration ✓
- [x] Feature parity audit — all Swift skill commands covered by Node.js CLI
- [x] CLI-level tests (JSON contracts + arg parsing) — 14 new tests
- [x] Update Claude Code greentap skill to use `node greentap.js`
- [x] Remove Swift codebase (`Sources/`, `Package.swift`) — tag `pre-swift-removal`
- [x] Remove `~/bin/greentap` binary
- [x] Update CLAUDE.md
- [x] Fix: search/navigateToChat `fill()` → `keyboard.type()` (WhatsApp event handler bug)

### Phase 5 — Scroll + Robustness ✓
- [x] **Message scroll** (`read --scroll` — full history via virtual scroll + dedup)
- [x] Fix: scroll container targeting (message panel vs chat list sidebar)
- [x] Fix: timestamp extraction for group messages (trailing time in row label)
- [x] Fix: scroll back to bottom after collection (stale daemon state)
- [x] Switch daemon to headless mode
- [ ] Retry logic for transient WA errors → deferred

### Phase 6 — Open Source (MIT) ✓
- [x] Locale-agnostic selectors — structural ARIA selectors + runtime locale detection
- [x] Add LICENSE (MIT)
- [x] Add privacy disclaimer + WhatsApp ToS notice (README)
- [x] Anonymize all fixtures (no real PII in committed snapshots)
- [x] Scrub git history (`git filter-repo` — PII replacements + email rewrite)
- [x] Add README with install, usage, architecture
- [x] Ship Claude Code skill in repo (`.claude/skills/greentap/SKILL.md`)
- [x] Skill installable via `npx skills add psacc/greentap`
- [x] Release process: semver tags + GitHub releases (`v0.1.0`)
- [x] Publish to GitHub (public)

### Post-Phase 6 — Shipped (v0.3.0–v0.3.1)
- [x] `poll-results` command — reads native WhatsApp poll vote counts (v0.3.0)
- [x] `--index N` flag — disambiguates multiple chats with the same name (v0.3.0)
- [x] Timestamp enrichment from date separators — adds `timestamp` to message JSON (v0.3.1)

### Phase 7 — Multi-agent Concurrency (deferred)
- [ ] Spike: can multiple agents use greentap concurrently without interfering?
- [ ] Options: tab-per-agent, port-per-agent, locking, or queuing
- [ ] Assess: is this a real need or premature optimization?

Status: deferred. Single-agent usage works. Re-open if multiple parallel agents become a real need.

### Phase 8 — Media + Agent Autonomy ✓ (shipped v0.4.0)

- [x] Daemon hardening — port file pre-launch (#15), bundled Chromium with UA strip (#15+#21)
- [x] `navigateToChat` robustness — wait-for-grid (#16), `--index` in search fallback, fast-path no-op when chat already open (#24)
- [x] `read --json` link recovery — `links: [{href, text}]` per message via DOM walk; greedy monotone merge handles parser/DOM length drift and URL-only messages (#17 + #22)
- [x] `fetch-images <chat>` command — in-DOM blob download to `~/.greentap/downloads/<chat-slug>/` (#18 + #23)
- [x] E2E harness — `greentap e2e` against `greentap-sandbox` group, four stages roundtripped end-to-end with multimodal verification (#19 + #25)
- [x] Iron-clad merge + e2e rules — per-PR maintainer approval, feature-stage-must-not-be-skipped (#20)
- [x] `send` newline handling — `\n` becomes Shift+Enter, multi-line messages stay in one bubble (#26)
- [x] Parser robustness — `sender` always populated, additive `quoted_sender` / `quoted_text` / `body` fields, orphan-row recovery (#27)
- [x] `whoami` command + locale-stable timestamps + `null`-instead-of-empty (#28)

### Phase 9 — Quality polish (planned, v0.5.0 target)

- [ ] **Sticker visibility** — parser `kind: "sticker"` + `fetchStickers` download. Reuses fetchImages mechanics with a different DOM marker. Tracked in task tracker.
- [ ] **Sender-inheritance hardening** — current orphan-row recovery blindly inherits previous-row sender. Tighten to require a "same-author" hint (e.g. `msg-dblcheck` for own, structural cue) and prefer `(unknown)` when ambiguous. Tracked in task tracker.
- [ ] **Performance hygiene** — concrete proposals reviewed by 3 independent agents, accepted only if no functionality loss. Likely targets: replace hardcoded `setTimeout` waits with element-based `waitFor`, reduce review-agent prompt size for diffs <30 LOC, cheaper overlay-dismiss alternative to `page.reload()` between e2e stages.

### Phase 10 — Voice + documents (deferred, no spike yet)

- [ ] Voice messages — download audio + transcribe (Whisper or equivalent)
- [ ] Documents / generic file download — same blob pattern as images, MIME detection trickier
- [ ] Feasibility spike: can audio URLs be extracted from aria snapshot or DOM?

### Phase 11 — Skill coherence automation (planned)

- [ ] Pre-release subagent that compares `lib/commands.js` exports + new fields in parser output against `.claude/skills/greentap/SKILL.md`. Fails CI if a public-API surface is undocumented.
- [ ] Currently a manual checklist item in `.github/pull_request_template.md`; promote to automated check before tagging v0.5.0.
