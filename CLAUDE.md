# greentap

CLI driver for WhatsApp Web via Playwright aria snapshots.
Migrating from Swift/AX (legacy, in `Sources/`) to Node.js/Playwright.

## Tech stack

- Node.js (ESM), Playwright (Chromium)
- Persistent browser context at `~/.greentap/browser-data/`
- Pure parsing logic in `lib/parser.js`, browser automation in `greentap.js`
- Legacy: Swift + macOS Accessibility API (deprecated, Phase 4 removal)

## Commands (current — Phase 0 spike)

```bash
node greentap.js login               # Open browser for QR scan
node greentap.js logout              # Clear session data
node greentap.js snapshot [SCOPE]    # Dump aria snapshot (full|chats|messages|compose)
```

## Testing

```bash
npm test                             # Run all unit tests (node:test)
```

## Architecture

| Path | Purpose |
|------|---------|
| `greentap.js` | CLI entrypoint — arg parsing + command dispatch |
| `lib/parser.js` | Pure parsing of aria snapshot text |
| `test/parser.test.js` | Fixture-based unit tests |
| `test/fixtures/` | Recorded aria snapshots from live sessions |
| `openspec/` | Specs, change proposals, workflow |
| `Sources/` | Legacy Swift/AX code (deprecated) |

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

## Constraints

- Aria snapshot structure is locale-dependent and may change with WhatsApp Web updates
- Low volume personal use only — minimize automation fingerprint
- No CI yet — tests run locally
