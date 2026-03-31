---
name: greentap
description: |
  Read and send messages from WhatsApp Web via Playwright and aria snapshots.
  Use when the user wants to:
  - Check unread messages or chat list
  - Read messages from a specific chat
  - Search for a contact or group
  - Send a message to a contact or group
  - Draft a message for review before sending
  - Read poll results from a chat
  Triggers: "whatsapp", "check messages", "read chat", "send message to",
  "unread messages", "message from", "greentap", "poll results", "sondaggio"
license: MIT
compatibility: "Requires Node.js 18+, Google Chrome (system install)"
allowed-tools: Bash
---

# greentap — WhatsApp Web CLI via Playwright

Node.js CLI that drives WhatsApp Web via Playwright aria snapshots.
Uses a background browser daemon for fast (~500ms) command execution.

## Prerequisites

- Node.js (v18+), Google Chrome (system install)
- First run: `node greentap.js login` to scan QR code

## Commands

```bash
# List visible chats with last message and unread count
node greentap.js chats --json

# List only chats with unread messages
node greentap.js unread --json

# Read messages from a chat (substring match on name)
node greentap.js read "contact or group name" --json

# Read full chat history (scrolls up, deduplicates)
node greentap.js read "contact or group name" --scroll --json

# If multiple chats share the same name, use --index N (1-based) to pick one
node greentap.js read "contact or group name" --index 2 --json
node greentap.js send "contact or group name" --index 2 "message text"

# Search for a contact or group (finds archived chats too)
node greentap.js search "query" --json

# Send a message (finds chat by name, types and sends)
node greentap.js send "contact or group name" "message text"

# Read poll results from a chat (most recent poll, with vote counts per option)
node greentap.js poll-results "contact or group name" --json
node greentap.js poll-results "contact or group name" --index 2 --json

# Daemon management
node greentap.js status
node greentap.js daemon stop
```

## Important behavior

- **Daemon**: first command auto-launches a background Chrome instance (port 19222), shuts down after 15min idle
- **read** shows messages visible in the viewport by default; use `--scroll` for full history
- **read** marks messages as read in WhatsApp (cannot be prevented)
- **send** verifies correct chat opened and message delivered
- **poll-results** navigates to the chat and reads the most recent WhatsApp native poll (question + options + vote counts)
- If multiple chats share the same name, commands error with a numbered list — re-run with `--index N` to pick one
- Chat matching is case-insensitive substring
- Locale-agnostic: works with any WhatsApp UI language
- Own messages have `sender: "You"` in JSON output

## Guidelines for the agent

- Use `--json` for parsing, plain text when showing to the user
- **NEVER send a message without explicit user confirmation**
- When drafting messages, match the language the user typically uses with that contact
- If asked to "check messages", start with `greentap unread --json`
- If a chat isn't found, try `greentap search` with a shorter query
- If asked about poll results or a vote, use `greentap poll-results`
- Keep tool calls minimal — one `unread` or `read` call is usually enough
- First command auto-starts daemon (~6s cold start), subsequent ones are ~500ms
