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
node greentap.js poll-results <chat> [--json]  # Get most recent poll question + vote counts
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

## Localization

WhatsApp Web syncs its UI language from the phone — `navigator.language` and Playwright's `locale` option have no effect. All parsing must work regardless of UI language.

**Three-tier strategy — apply in order:**

| Tier | Approach | Examples |
|------|----------|---------|
| 1. Structural | ARIA roles + position, no text | `page.getByRole("grid").first()`, `contentinfo` textbox for compose |
| 2. Icon-based | WhatsApp internal icon IDs (stable, locale-independent) | `img "msg-dblcheck"` / `img "msg-check"` for own messages |
| 3. Runtime detection | `lib/locale.js` — probes Intl API against chat list content to identify the active locale | Day names, "Yesterday"/"Ieri", date format regex |

**Rules for new code:**
- Never hardcode locale strings as selectors or parser patterns (no `"lunedì"`, no `"Yesterday"`, no `"Apri dettagli chat di"`)
- If Tier 1 or 2 cannot cover a pattern, add it to `lib/locale.js` as a detected value passed via `localeConfig`
- `sender: "You"` is a hardcoded English constant by design — it's the JSON API contract, not a UI string
- Known gap: sender prefix in group chats (`"Apri dettagli chat di"`) is hardcoded Italian with a regex fallback — treat as tech debt, do not copy the pattern

**Fixtures:** existing fixtures are Italian (phone locale). Keep them — they test parsing logic. New fixtures for new features must also use fake data only (see Constraints).

## Constraints

- **PUBLIC REPO — NO PII**: This repo is public. NEVER commit real names, phone numbers, email addresses, chat content, or any personally identifiable information. Fixtures use fake names (Roberto Marini, Elena Conti, Famiglia Rossi, etc.). All new fixtures and examples MUST use fake data only.
- Selectors are locale-agnostic (structural ARIA roles + runtime locale detection); aria snapshot structure may still change with WhatsApp Web updates
- Low volume personal use only — minimize automation fingerprint
- No CI yet — tests run locally
- **E2E mandatory for `lib/` changes.** Any diff touching `lib/commands.js`, `lib/parser.js`, `lib/daemon.js`, `lib/client.js`, `lib/locale.js`, or `test/fixtures/**` must pass `GREENTAP_E2E=1 node greentap.js e2e` locally before merge. See `CONTRIBUTING.md`. Sandbox group `greentap-sandbox` required (member: maintainer only).

<!-- BEGIN SYNCED: psacc/docs/CONVENTIONS.md — do not edit here -->
## Doc conventions (synced from psacc/docs/CONVENTIONS.md)

SYNCED blocks are human-maintained. Do not edit this section — edit psacc/docs/CONVENTIONS.md and sync manually.

### File placement rule
| File | Location |
|------|----------|
| `ROADMAP.md` | root of project |
| `CLAUDE.md` / `AGENTS.md` | root of project |
| `README.md` | root of project |
| Design docs, specs, runbooks | `docs/` |
| Exec plans, proposals | `docs/` |

### Strategic context block
Every project `ROADMAP.md` starts with:
```
## Strategic context
Priority: [high|medium|low] — [one-line rationale]
Current phase: [e.g., "Phase 7 — explore"]
Blocks: [project/milestone that depends on this, or "nothing"]
Blocked by: [external dependency, or "nothing"]
Last updated: [YYYY-MM-DD]
→ Full strategic context: psacc/docs/ROADMAP.md
```
Staleness rule: if `Last updated` >7 days old with active commits in the project repository, review and touch the date.
Conflict rule: if this block contradicts psacc/docs/ROADMAP.md, psacc wins. For public repos: log the contradiction and proceed using psacc/docs/ROADMAP.md as authoritative.

### Agent spawning rule
1. Read `CLAUDE.md` (tech stack, architecture, workflows)
2. Read `ROADMAP.md` fully (strategic context block + phases)
3. If "Blocked by" or "Blocks" is non-empty, read `psacc/docs/ROADMAP.md` before planning
4. `psacc/docs/ROADMAP.md` always wins if it contradicts the project block
<!-- END SYNCED -->
