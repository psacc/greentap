## Context

greentap currently uses Swift + macOS Accessibility API to drive the WhatsApp desktop app. This approach is fatally flawed (see proposal). hey-cli already validates the Playwright + aria snapshot pattern for a similar use case (Hey.com email). This spike applies the same architecture to WhatsApp Web.

## Goals / Non-Goals

**Goals:**
- Validate that WhatsApp Web aria snapshots expose enough structure to parse chats and messages
- Establish QR login flow with persistent browser session
- Build testable parser with fixture-based tests (no browser needed to run tests)
- Capture initial fixture set for parser development

**Non-Goals:**
- Full CLI with send/search/scroll (Phase 1-2)
- Browser daemon for fast startup (Phase 3)
- Removing Swift code (Phase 4)
- HAR recording/replay (premature — aria snapshots are the primary contract)

## Decisions

### 1. Playwright + `launchPersistentContext`

**Decision**: Same pattern as hey-cli — persistent Chromium context stored in `~/.greentap/browser-data/`.

**Rationale**: Keeps WhatsApp session alive across invocations. QR scan only needed once (or after 14-day inactivity). Proven pattern in hey-cli.

**Alternative**: `puppeteer` — less built-in aria snapshot support, would need custom implementation.

### 2. Aria snapshots as primary data source

**Decision**: Use `page.locator(":root").ariaSnapshot()` as the sole data extraction method.

**Rationale**: CSS selectors on WhatsApp Web are obfuscated (`_akbu`, `_amjy`) and rotate with every deploy. Aria roles/names are stable across versions because WhatsApp needs them for screen readers.

**Alternative**: DOM scraping with CSS classes — brittle, breaks weekly.

### 3. node:test (built-in test runner)

**Decision**: Use Node.js built-in test runner. Zero test dependencies.

**Rationale**: Same choice as hey-cli. Project is small, `describe/it/assert` is sufficient.

### 4. Pure parser separation

**Decision**: All parsing logic in `lib/parser.js`, browser automation in `greentap.js`. Tests import only from `lib/`.

**Rationale**: The seam between "get aria text from browser" and "parse aria text" is the natural test boundary. Parser tests run without Playwright.

### 5. Snapshot command for exploration

**Decision**: `greentap snapshot [full|chats|messages|compose]` dumps raw aria text to stdout. Not a user-facing feature — development/debugging tool.

**Rationale**: Need to capture and study the aria structure before writing parsers. Output can be piped to fixture files: `node greentap.js snapshot full > test/fixtures/main-aria.txt`.

## Risks / Trade-offs

- [Aria labels are locale-dependent] → Start with English locale, detect and warn on mismatch later
- [WhatsApp Web detects headless browser] → Use `--disable-blink-features=AutomationControlled`, headed mode as fallback
- [Session expires after 14-day inactivity] → `greentap login` to re-auth, low-friction
- [Aria structure may change with WhatsApp updates] → Fixture-based tests catch regressions; parsers are easy to adjust
