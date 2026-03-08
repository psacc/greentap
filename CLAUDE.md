# greentap

CLI driver for WhatsApp Web via Playwright aria snapshots.

## Tech stack

- Node.js (ESM), Playwright (system Chrome via CDP)
- Daemon-backed: persistent Chrome on port 19222, lazy start, 15min idle shutdown
- Persistent browser context at `~/.greentap/browser-data/`
- Pure parsing logic in `lib/parser.js`, browser automation in `lib/commands.js`

## Commands

```bash
node greentap.js login               # Open browser for QR scan
node greentap.js logout              # Clear session data
node greentap.js chats [--json]      # List all chats
node greentap.js unread [--json]     # List unread chats
node greentap.js read <chat> [--json] [--scroll] # Read messages from a chat
node greentap.js send <chat> <msg>   # Send a message
node greentap.js search <q> [--json] # Search chats
node greentap.js snapshot [SCOPE]    # Dump aria snapshot (full|chats|messages|compose)
node greentap.js status              # Show daemon status
node greentap.js daemon stop         # Stop the daemon
```

## Testing

```bash
npm test                             # Run all unit tests (node:test)
```

## Architecture

| Path | Purpose |
|------|---------|
| `greentap.js` | CLI entrypoint — arg parsing + command dispatch |
| `lib/commands.js` | Pure command logic (accepts `page`, returns data) |
| `lib/parser.js` | Pure parsing of aria snapshot text |
| `lib/daemon.js` | Background Chrome process management |
| `lib/locale.js` | Runtime locale detection via Intl API probing |
| `lib/client.js` | CDP connection, lazy start, lockfile, recovery |
| `test/parser.test.js` | Fixture-based parser unit tests |
| `test/cli.test.js` | JSON contract + arg parsing tests |
| `test/fixtures/` | Recorded aria snapshots from live sessions |
| `openspec/` | Specs, change proposals, workflow |

## openspec workflow

See `openspec/WORKFLOW.md` for the full lifecycle.

Changes follow: `proposal → design → tasks → implement → review → commit → archive`

Commands:
- `/opsx:propose` — create a new change with all artifacts
- `/opsx:apply` — implement tasks from a change
- `/opsx:archive` — archive a completed change
- `/opsx:explore` — think through ideas without implementing
- `/review-code` — code review before commit (blockers + advisory)
- `/review-security` — security review before commit (blockers + advisory)

Before committing a completed feature, run both `/review-code` and `/review-security`.

## Releases

Semver tags, manual process. No CHANGELOG file — release notes live on GitHub.

```bash
git tag v0.x.y
git push origin v0.x.y
gh release create v0.x.y --title "v0.x.y — Short title" --notes "..."
```

- Tag after merging a meaningful batch of changes (new command, breaking change, significant fix)
- Patch (`v0.1.1`): bug fixes. Minor (`v0.2.0`): new features. Major: breaking changes.
- Write release notes with: what changed, why, any migration steps

## Roadmap

`ROADMAP.md` tracks phases, priorities, and risk table. Keep it up to date:

- After completing a phase or milestone → mark it done, set the next phase as current
- After a significant decision or discovery → update the risk table if severity/status changed
- At the start of a new session that changes scope → check if ROADMAP.md reflects reality

## Constraints

- **PUBLIC REPO — NO PII**: This repo is public. NEVER commit real names, phone numbers, email addresses, chat content, or any personally identifiable information. Fixtures use fake names (Roberto Marini, Elena Conti, Famiglia Rossi, etc.). All new fixtures and examples MUST use fake data only.
- Selectors are locale-agnostic (structural ARIA roles + runtime locale detection); aria snapshot structure may still change with WhatsApp Web updates
- Low volume personal use only — minimize automation fingerprint
- No CI yet — tests run locally
