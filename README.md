# greentap

CLI for WhatsApp Web via Playwright aria snapshots. Reads chats, sends messages, searches contacts — all from the terminal.

Uses structural ARIA selectors and runtime locale detection, so it works with any WhatsApp UI language.

> **Disclaimer**: This project is unofficial and not affiliated with, endorsed by, or connected to WhatsApp or Meta in any way. Using automation tools with WhatsApp may violate their [Terms of Service](https://www.whatsapp.com/legal/terms-of-service). There is a risk of account suspension or ban. **Use at your own risk, for personal use only, at low volume.**

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Playwright](https://playwright.dev/) — bundled Chromium installed via `npx playwright install chromium` (`npm install` runs this automatically)

## Install

```sh
git clone https://github.com/psacc/greentap.git
cd greentap
npm install
npx playwright install chromium   # if not run automatically by your setup
```

> **v0.4.0+ note:** greentap uses Playwright's bundled Chromium (was system Chrome in v0.3.x). If you upgraded from v0.3.1 or earlier, you will need to re-scan the QR code via `node greentap.js login` — browser profile data is not portable between Chrome and Chromium.

First run — scan the QR code to link your WhatsApp account:

```sh
node greentap.js login
```

This opens a headed Chromium window. Scan the QR code with your phone, then close the browser. Session data is stored in `~/.greentap/browser-data/`.

## Usage

```sh
# List all visible chats
node greentap.js chats
node greentap.js chats --json

# List only unread chats
node greentap.js unread --json

# Read messages from a chat (substring match on name)
# --json output includes a `links` array per message with full URLs
# recovered from the DOM (not just the truncated preview text).
node greentap.js read "Family" --json

# Read full chat history (scrolls up, deduplicates)
node greentap.js read "Family" --scroll --json

# Send a message
node greentap.js send "Family" "Hello from the terminal"

# Download recent images from a chat to ~/.greentap/downloads/<chat-slug>/
node greentap.js fetch-images "Family" --limit 5 --json
# Scroll back to load older images first (mirrors `read --scroll`)
node greentap.js fetch-images "Family" --limit 5 --scroll --json

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

1. **Browser daemon**: The first command auto-launches a headless Chromium instance (Playwright's bundled build) on CDP port 19222. It stays alive for 15 minutes of idle time, so subsequent commands are fast (~500ms).

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

greentap ships with a skill at `.claude/skills/greentap/SKILL.md` that teaches AI agents how to use it: which commands to call, when to use `--json`, and to **never send messages without user confirmation**.

Install the skill globally with [skills](https://github.com/vercel-labs/skills):

```sh
npx skills add psacc/greentap
```

This works with Claude Code, Cursor, Cline, and [40+ other agents](https://github.com/vercel-labs/skills#supported-agents).

<details>
<summary>Manual install (symlink or copy)</summary>

```sh
# Option A: symlink (always up to date)
ln -s /path/to/greentap/.claude/skills/greentap ~/.claude/skills/greentap

# Option B: copy
cp -r /path/to/greentap/.claude/skills/greentap ~/.claude/skills/greentap
```
</details>

## Testing

```sh
npm test    # 53 unit tests (node:test), fixture-based
```

## E2E testing

`greentap e2e` runs a round-trip check against a dedicated sandbox
WhatsApp group called `greentap-sandbox`. The sandbox must contain
only you — no other members. See `CONTRIBUTING.md` for setup.

```bash
GREENTAP_E2E=1 node greentap.js e2e
```

Exit codes: `0` pass, `1` stage failure, `2` sandbox missing,
`3` rate-limited (60s min between runs).

Output is structural JSON — no message content is logged, so the
stdout is safe to commit as a build artifact.

## Contributing

Issues and PRs welcome. This is a personal tool shared as-is — expect rough edges.

## License

[MIT](LICENSE)
