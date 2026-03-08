# greentap

CLI for WhatsApp Web via Playwright aria snapshots. Reads chats, sends messages, searches contacts — all from the terminal.

Uses structural ARIA selectors and runtime locale detection, so it works with any WhatsApp UI language.

> **Disclaimer**: This project is unofficial and not affiliated with, endorsed by, or connected to WhatsApp or Meta in any way. Using automation tools with WhatsApp may violate their [Terms of Service](https://www.whatsapp.com/legal/terms-of-service). There is a risk of account suspension or ban. **Use at your own risk, for personal use only, at low volume.**

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Google Chrome](https://www.google.com/chrome/) (system install, not Chromium)
- [Playwright](https://playwright.dev/) (`npm install` handles this)

## Install

```sh
git clone https://github.com/psacc/greentap.git
cd greentap
npm install
```

First run — scan the QR code to link your WhatsApp account:

```sh
node greentap.js login
```

This opens a headed Chrome window. Scan the QR code with your phone, then close the browser. Session data is stored in `~/.greentap/browser-data/`.

## Usage

```sh
# List all visible chats
node greentap.js chats
node greentap.js chats --json

# List only unread chats
node greentap.js unread --json

# Read messages from a chat (substring match on name)
node greentap.js read "Family" --json

# Read full chat history (scrolls up, deduplicates)
node greentap.js read "Family" --scroll --json

# Send a message
node greentap.js send "Family" "Hello from the terminal"

# Search for a contact or group (finds archived chats too)
node greentap.js search "John" --json

# Dump raw aria snapshot (for debugging)
node greentap.js snapshot full
node greentap.js snapshot messages --chat "Family"

# Daemon management
node greentap.js status
node greentap.js daemon stop

# Clear session and log out
node greentap.js logout
```

## How it works

greentap drives WhatsApp Web through Playwright's CDP connection to a persistent Chrome instance.

1. **Browser daemon**: The first command auto-launches a headless Chrome instance on CDP port 19222. It stays alive for 15 minutes of idle time, so subsequent commands are fast (~500ms).

2. **Aria snapshots**: Instead of fragile CSS selectors (WhatsApp obfuscates classes and changes them frequently), greentap reads the page's accessibility tree. Chat lists, messages, compose boxes, and buttons are identified by ARIA roles and structural position.

3. **Locale detection**: WhatsApp syncs its UI language from your phone, ignoring the browser locale. greentap probes the actual UI content against 35 locale candidates to detect day names, date formats, and relative dates at runtime.

4. **Human-like interaction**: All typing uses `keyboard.type()` with random delays. No clipboard, no `fill()`, no programmatic shortcuts that WhatsApp's event handlers would reject.

## Architecture

```
greentap.js          CLI entrypoint — arg parsing + command dispatch
lib/commands.js      Command logic (accepts Playwright page, returns data)
lib/parser.js        Pure parsing of aria snapshot text
lib/locale.js        Runtime locale detection via Intl API
lib/daemon.js        Background Chrome process management
lib/client.js        CDP connection, lazy start, lockfile, recovery
```

## Important notes

- **`read` marks messages as read** in WhatsApp. This cannot be prevented.
- **Chat matching** is case-insensitive substring. Use enough of the name to be unambiguous.
- **`send` verifies** the correct chat opened and the message appeared after sending.
- The daemon runs headless by default. Use `login` for the initial QR scan (headed mode).

## Use as an AI agent skill

greentap is designed to be called by AI coding assistants (Claude Code, etc.) as a shell tool. All commands support `--json` for structured output.

Example skill configuration (Claude Code `SKILL.md`):

```yaml
---
name: greentap
description: Read and send WhatsApp messages via CLI
---
```

### Agent guidelines

- Use `--json` for parsing, plain text when showing to the user
- **Never send a message without explicit user confirmation**
- When drafting messages, match the language the user typically uses with that contact
- If asked to "check messages", start with `greentap unread --json`
- If a chat isn't found, try `greentap search` with a shorter query
- Own messages have `sender: "You"` in JSON output
- First command auto-starts the daemon (~6s cold start), subsequent ones are ~500ms

## Testing

```sh
npm test    # 53 unit tests (node:test), fixture-based
```

## Contributing

Issues and PRs welcome. This is a personal tool shared as-is — expect rough edges.

## License

[MIT](LICENSE)
