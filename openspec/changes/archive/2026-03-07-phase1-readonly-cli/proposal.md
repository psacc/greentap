## Why

Phase 0 validated Playwright + aria snapshots as the migration path. The parsers (`parseChatList`, `parseMessages`) and formatters (`printChats`, `printMessages`) exist and are tested, but are not wired into CLI commands. The CLI only exposes raw `snapshot` dumps, which are unusable for the greentap skill and day-to-day use.

## What Changes

- Add `greentap chats [--json]` — list all chats with name, time, last message, unread status
- Add `greentap unread [--json]` — filter to unread chats only
- Add `greentap read <chat> [--json]` — open a chat and display messages
- Replace `waitForTimeout(5000)` with element-based wait on the chat list grid
- Fix own-message attribution (messages without `Tu:` prefix get empty sender)
- Fix scoped snapshot locators (chat list uses `grid` role, not `list`)
- Keep `login`, `logout`, `snapshot` commands unchanged

## Capabilities

### New Capabilities
- `chat-list`: CLI command to list and filter chats from aria snapshot
- `message-read`: CLI command to open a chat and read messages
- `browser-wait`: Reliable element-based wait replacing fixed timeouts

### Modified Capabilities

## Impact

- `greentap.js` — new command handlers, improved `withBrowser` wait logic
- `lib/parser.js` — fix own-message attribution in `parseMessages`
- `test/parser.test.js` — new tests for attribution fix
- No new dependencies
