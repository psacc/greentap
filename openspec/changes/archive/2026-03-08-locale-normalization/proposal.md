## Why

All aria selectors and parser regex are hardcoded in Italian (~50 strings across commands.js, parser.js, client.js, and fixtures). This makes the tool unusable for anyone with a non-Italian WhatsApp locale and blocks open-source release (Phase 6).

Spike confirmed: forcing `locale: "en-US"` via Playwright does NOT change WhatsApp Web's UI language — WhatsApp syncs language from the phone's app language, overriding `navigator.language` after login.

## What Changes

Replace hardcoded Italian strings with **locale-agnostic structural selectors** where possible, and **runtime locale auto-detection** for the irreducible language-dependent patterns (day names, relative dates).

Three tiers:
1. **Structural selectors** (~10 strings): use ARIA roles, positions, and element relationships instead of localized labels (e.g., `contentinfo > textbox` instead of `"Scrivi a..."`)
2. **Icon-based detection** (~3 strings): use `img "msg-dblcheck"` / `img "msg-check"` instead of `"Tu:"` prefix and `"Letto"` / `"Consegnato"` status text
3. **Runtime auto-detection** (~5 strings): detect day names and relative dates via `Intl.DateTimeFormat` from the browser's actual locale at daemon startup

No breaking change — works with any WhatsApp locale without re-login.

## Capabilities

### Modified Capabilities
- `chat-list`: Structural grid selector + auto-detected day names / relative dates
- `message-read`: Icon-based own-message detection, structural message area boundary
- `search-chats`: Structural selectors for search box and results grid
- `send-message`: Structural selectors for compose textbox and send button

## Impact

- `lib/commands.js`: Replace ~15 Italian selectors with structural/positional alternatives
- `lib/parser.js`: Replace ~10 Italian patterns with icon-based + auto-detected alternatives
- `lib/client.js`: Replace `"Lista delle chat"` grid selector
- `lib/daemon.js`: Add locale detection at startup (evaluate `Intl.DateTimeFormat` in browser)
- `test/fixtures/`: Keep existing Italian fixtures (still valid for testing)
- `test/parser.test.js`: Update assertions where parser output changes (e.g., `sender: "You"` → keep as-is if using icon detection)
- **NOT BREAKING**: No re-login needed. Works with existing sessions in any language.
