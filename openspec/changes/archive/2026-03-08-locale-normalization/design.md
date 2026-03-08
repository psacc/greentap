## Context

The codebase has ~50 hardcoded Italian strings used as aria selectors and parser patterns. Spike confirmed that Playwright's `locale` option cannot override WhatsApp Web's UI language — WhatsApp syncs language from the phone app, overriding `navigator.language` after login.

New approach: replace Italian strings with locale-agnostic alternatives in three tiers.

## Goals / Non-Goals

**Goals:**
- All aria selectors and parser patterns work regardless of WhatsApp UI language
- No re-login or session reset required
- Existing Italian fixtures remain valid for unit tests
- Tool works out of the box for any locale

**Non-Goals:**
- Multi-locale regex alternation (IT+EN)
- Testing with multiple locales (validate structurally, trust runtime detection)
- Changing the phone's WhatsApp language

## Decisions

### 1. Tier 1 — Structural selectors (replace named aria selectors)

Spike-validated replacements based on live WhatsApp Web aria snapshot:

| Italian string | Structural alternative | Validation |
|---|---|---|
| `grid "Lista delle chat"` | `page.getByRole("grid").first()` | Only grid on main view |
| `textbox "Cerca o avvia una nuova chat"` | `page.getByRole("textbox").first()` (when no chat open) or first textbox not in `contentinfo` | Only textbox in sidebar |
| `textbox /Scrivi a/` (compose) | `page.locator("contentinfo").getByRole("textbox")` | Single textbox in footer |
| `button "Invia"` (Send) | Last `button` in `contentinfo` after typing (replaces voice message button) | Confirmed: voice → send swap |
| `button "Dettagli profilo"` (message area boundary) | Find `row` elements NOT inside a `grid` | Already used in `findScrollContainer` |
| `"Risultati della ricerca."` (search results grid) | Second `grid` appearing after search / `page.getByRole("grid").nth(1)` | Only grid that appears post-search |
| `"clicca qui per info (gruppo\|contatto)"` (chat header verify) | Header button whose label `includes(chatName)` | Line 196: `button "Ferragosto Andrea, Antonietta..."` |
| `"Si è verificato un errore"` (send error) | Check if compose textbox still has text after send (failed = text remains) | Structural — no locale dependency |

### 2. Tier 2 — Icon-based detection (replace text patterns with image markers)

| Italian string | Icon alternative | Validation |
|---|---|---|
| `Tu:` prefix (own message) | `img "msg-dblcheck"` or `img "msg-check"` in row | Every own message has delivery icon |
| `"Letto"` / `"Consegnato"` (delivery status) | Same — `msg-dblcheck` / `msg-check` | Icon names are internal WhatsApp IDs, locale-independent |
| Sender assignment `"Tu"` → keep internal value | Drop `"Tu"` entirely — own messages detected by icon, assign `sender = "You"` as universal constant | No locale-dependent sender value in output |

**Decision on sender value:** Change from `"Tu"` to `"You"` as a universal English constant. This is a minor output change but makes the JSON API consistent regardless of locale.

### 3. Tier 3 — Runtime auto-detection (irreducible locale patterns)

These patterns are genuinely locale-dependent and cannot be replaced structurally:

| Pattern | Auto-detection method |
|---|---|
| Day names (`lunedì`, `Monday`, etc.) | At daemon startup: `page.evaluate(() => [...Array(7)].map((_, i) => new Intl.DateTimeFormat(navigator.language, {weekday: 'long'}).format(new Date(2024, 0, i+1))))` |
| `"Ieri"` / `"Yesterday"` | `new Intl.RelativeTimeFormat(navigator.language, {numeric: 'auto'}).format(-1, 'day')` — extract the word |
| `"Oggi"` / `"Today"` | `new Intl.RelativeTimeFormat(navigator.language, {numeric: 'auto'}).format(0, 'day')` — or `formatToParts` |
| Date format (`DD/MM/YYYY` vs `M/D/YYYY`) | Detect from locale: `new Intl.DateTimeFormat(navigator.language).formatToParts(new Date())` — build regex from part order |

These are evaluated once at daemon startup and cached. Commands receive them as part of connection context.

### 4. Architecture for locale config

```
daemon.js startup:
  1. Launch browser
  2. Navigate to WhatsApp
  3. page.evaluate(() => { ... Intl detection ... }) → localeConfig
  4. Store localeConfig in daemon memory
  5. Expose via CDP or pass to commands

client.js connect:
  1. Connect via CDP
  2. Detect locale from page (same Intl evaluation)
  3. Return { page, disconnect, localeConfig }

commands.js / parser.js:
  - Accept localeConfig parameter
  - Build regex dynamically from localeConfig.dayNames, etc.
```

### 5. Sender detection in group chats

The `"Apri dettagli chat di X"` button pattern is locale-dependent. Structural alternative:

- These buttons appear between message rows (outside any grid)
- They contain an `img` child
- The sender name is part of the button label

Approach: detect the locale-specific prefix at runtime using a known group member name from the first such button encountered. Or: strip the button label's static prefix/suffix, leaving just the name. The prefix can be auto-detected by comparing button text with the sender name visible in subsequent messages.

Simpler fallback: keep current regex but make the prefix configurable via localeConfig. Detect prefix from first button match at startup.

**Decision:** Start with the simplest approach — make `"Apri dettagli chat di"` a localeConfig value auto-detected at first use. If the first sender button in any group chat matches `button "PREFIX SenderName"`, learn the prefix.

### 6. Fixture strategy

- **Keep existing Italian fixtures** for unit tests — they validate parsing logic
- Add a small English fixture for testing the agnostic parser
- E2E tests validate actual live locale

### 7. Breaking changes

- `sender: "Tu"` → `sender: "You"` in JSON output (minor)
- No re-login required (major improvement over previous approach)

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Positional selectors break if WhatsApp adds more grids/textboxes | Monitor aria structure; fallback to name-based selector if first() fails |
| `msg-dblcheck` icon names change | These are internal WhatsApp IDs, stable across versions |
| `Intl.DateTimeFormat` gives different output than WhatsApp's actual strings | Validate at startup by comparing detected day names with actual chat list entries |
| Sender prefix auto-detection fails on edge cases | Keep hardcoded Italian as fallback, log warning |
| Performance: locale detection at each connect | Cache in daemon, detect once |
