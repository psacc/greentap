---
name: greentap
description: |
  Read and send messages from WhatsApp Web via Playwright and aria snapshots.
  Use when the user wants to:
  - Check unread messages or chat list
  - Read messages from a specific chat
  - Search for a contact or group
  - Send a message (single- or multi-line) to a contact or group
  - Draft a message for review before sending
  - Read poll results from a chat
  - Download images from a chat
  - Recover full URLs from link previews
  - Identify which WhatsApp account is currently in use
  Triggers: "whatsapp", "check messages", "read chat", "send message to",
  "unread messages", "message from", "greentap", "poll results", "sondaggio",
  "download image", "fetch image", "whoami", "who am i", "link preview"
license: MIT
compatibility: "Requires Node.js 18+, bundled Playwright Chromium (auto-installed)"
allowed-tools: Bash, Read
---

# greentap — WhatsApp Web CLI via Playwright

Node.js CLI that drives WhatsApp Web via Playwright aria snapshots.
Uses a background browser daemon for fast (~500ms) command execution.

## Prerequisites

- Node.js (v18+); bundled Chromium auto-installed via `npx playwright install chromium`
- First run: `node greentap.js login` to scan QR code

## Commands

```bash
# Identity of the currently logged-in WA account
node greentap.js whoami --json

# List visible chats with last message and unread count
node greentap.js chats --json

# List only chats with unread messages
node greentap.js unread --json

# Read messages from a chat (substring match on name)
# Each message includes: sender, time, text, body, quoted_sender, quoted_text,
# links[], kind, imageId (when image), is_self, timestamp
node greentap.js read "contact or group name" --json

# Read full chat history (scrolls up, deduplicates)
node greentap.js read "contact or group name" --scroll --json

# If multiple chats share the same name, use --index N (1-based) to pick one
node greentap.js read "contact or group name" --index 2 --json
node greentap.js send "contact or group name" --index 2 "message text"

# Search for a contact or group (finds archived chats too)
node greentap.js search "query" --json

# Send a message (finds chat by name, types and sends)
# Multi-line messages: use real \n in the string — they are sent as one bubble
node greentap.js send "contact or group name" "line one
line two"

# Read poll results from a chat (most recent poll, with vote counts per option)
node greentap.js poll-results "contact or group name" --json
node greentap.js poll-results "contact or group name" --index 2 --json

# Download recently-visible images from a chat to ~/.greentap/downloads/<chat-slug>/
node greentap.js fetch-images "contact or group name" --limit 3 --json

# E2E roundtrip verification against the dedicated greentap-sandbox group
GREENTAP_E2E=1 node greentap.js e2e

# Daemon management
node greentap.js status
node greentap.js daemon stop
```

## Important behavior

- **Daemon**: first command auto-launches a background Chromium instance (port 19222), shuts down after 15min idle. Bundled Chromium with `HeadlessChrome` UA stripped so WhatsApp Web accepts it.
- **read** shows messages visible in the viewport by default; use `--scroll` for full history.
- **read** marks messages as read in WhatsApp (cannot be prevented).
- **send** verifies correct chat opened and message delivered. Multi-line strings (with `\n`) become one WA bubble (uses Shift+Enter internally).
- **poll-results** navigates and reads the most recent WhatsApp native poll.
- **fetch-images** writes JPEG/PNG/WebP files to `~/.greentap/downloads/<chat-slug>/<imageId>.<ext>` with mode 0o600. Returns absolute paths so the agent can `Read` them for multimodal understanding.
- **whoami** returns `{ name, phone }` for the currently logged-in account. Either field can be `null` if WhatsApp Web doesn't expose it on this session.
- **e2e** runs four ordered stages (preflight, text, image, link) against the sandbox group `greentap-sandbox` (must exist; only the maintainer is a member). Output is structural JSON — no message content logged.
- If multiple chats share the same name, commands error with a numbered list — re-run with `--index N` to pick one.
- Chat matching is case-insensitive substring.
- Locale-agnostic: works with any WhatsApp UI language.

## Read output schema

Each message in `read --json` carries these fields (additive over time — older clients can ignore unknown fields):

| Field | Type | Notes |
|-------|------|-------|
| `sender` | string | Always populated. `"You"` for outbound; `"(unknown)"` if unattributable. Never empty string. |
| `time` | string | `"HH:MM"` from the row label. |
| `timestamp` | string \| null | `"YYYY-MM-DDTHH:MM"` ISO when WA shows a date separator; `null` otherwise. Stable across midnight (uses snapshot read-time, not parse-time). |
| `text` | string | Full visible text, including any quoted-reply bleed (backward compat). |
| `body` | string \| null | New: just the user's new text, with the quoted block removed. Equal to `text` when no quote. |
| `quoted_sender` | string \| null | New: author of the quoted message when this is a reply-with-quote. |
| `quoted_text` | string \| null | New: text of the quoted message. |
| `links` | `[{href, text}]` | http(s) URLs recovered from the DOM (handles WhatsApp's truncated previews). |
| `kind` | string | `"text"` or `"image"` (more kinds may appear in future versions). |
| `imageId` | string | Only on `kind: "image"`. Stable across reads of the same DOM. Use with `fetch-images` to materialize. |
| `is_self` | boolean | True for outbound messages. Pair with `whoami` to identify which account "self" is. |

## Multimodal flow for images

```
$ node greentap.js fetch-images "Famiglia Rossi" --limit 3 --json
[
  { "imageId": "a7f3c211", "path": "/Users/<you>/.greentap/downloads/famiglia-rossi/a7f3c211.jpg",
    "sender": "Elena Conti", "time": "14:22", "mimeType": "image/jpeg" }
]
```

After receiving the path: open with the Read tool — the image is handed to Claude as multimodal input. Describe, OCR, or reason about it directly. Delete the file when no longer needed (cache is not auto-pruned).

Limitations:
- Thumbnail resolution only (full-resolution viewer download is a future enhancement)
- Does not fetch images outside the currently-rendered DOM — scroll or re-read first

## Guidelines for the agent

- Use `--json` for parsing, plain text when showing to the user.
- **NEVER send a message without explicit user confirmation.**
- When drafting messages, match the language the user typically uses with that contact.
- If asked to "check messages", start with `greentap unread --json`.
- If a chat isn't found, try `greentap search` with a shorter query.
- If asked about poll results or a vote, use `greentap poll-results`.
- For image content questions, use `fetch-images` then `Read` the path.
- For full URLs (link previews), use `read --json` and inspect the `links[]` array — the visible `text` is often a truncated preview.
- For "who am I" / outbound identification: `whoami`.
- Keep tool calls minimal — one `unread` or `read` call is usually enough.
- First command auto-starts daemon (~6s cold start), subsequent ones are ~500ms.
