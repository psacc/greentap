## Why

Phase 1 delivered read-only CLI commands. The greentap skill needs send capability to be useful as an AI assistant tool, and search to find chats not visible in the sidebar. The legacy Swift implementation proved send works via compose box + Send button, and search via the search bar.

## What Changes

- Add `greentap send <chat> <message>` — navigate to chat, type message, click Send, verify delivery
- Add `greentap search <query> [--json]` — search chats via WhatsApp search bar, return results
- Add human-like delays (random jitter) to all browser interactions to reduce automation fingerprint
- Post-send verification: confirm message appears in chat after sending

## Capabilities

### New Capabilities
- `send-message`: CLI command to send a message to a chat
- `search-chats`: CLI command to search WhatsApp chats
- `human-delays`: Random jitter between browser actions to reduce automation fingerprint

### Modified Capabilities

## Impact

- `greentap.js` — new command handlers (`cmdSend`, `cmdSearch`), delay utility
- `lib/parser.js` — may need search result parser (if search results have different aria structure)
- No new dependencies
