## Why

The Swift/AX approach is a dead end: Catalyst window disappears and can't be recovered, viewport-only reads (no scroll), CGEvent Enter silently ignored, AX tree is fragile. Need to migrate to Playwright on WhatsApp Web using aria snapshots as the stable data contract (CSS selectors are obfuscated and rotate weekly). This spike validates the approach before building the full CLI.

## What Changes

- Initialize Node.js ESM project with Playwright dependency
- `greentap login` — headed browser for manual QR scan, persistent session in `~/.greentap/browser-data/`
- `greentap logout` — clear session data
- `greentap snapshot [SCOPE]` — capture and dump aria snapshots (full page, chat list, messages, compose)
- Capture initial aria snapshot fixtures from a live WhatsApp Web session
- Build pure parser in `lib/parser.js` for chat list and message extraction
- Fixture-based unit tests with `node:test`

## Capabilities

### New Capabilities
- `session-management`: Login via QR scan, logout, persistent browser context
- `aria-snapshot`: Snapshot command to dump and scope aria snapshots for development/debugging
- `chat-list-parsing`: Parse chat entries (name, last message, time, unread status) from aria text
- `message-parsing`: Parse message entries (sender, text, time) from aria text

### Modified Capabilities
(none — greenfield)

## Impact

- New: `greentap.js`, `lib/parser.js`, `test/parser.test.js`, `test/fixtures/`
- New: `package.json` with Playwright dependency
- Modified: `.gitignore` — add `node_modules/`
- Existing Swift code untouched (deprecated in Phase 4)
- Risk: aria structure is locale-dependent and may change with WhatsApp Web updates
- Risk: account ban (mitigated by low volume, human-like delays, personal use only)
