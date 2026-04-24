# E2E Harness — Design Spec

**Date:** 2026-04-24
**Status:** Approved for planning
**Supersedes:** nothing
**Blocks:** PRs #15, #16, #17, #18 (all merged only after this lands + rebase + e2e pass)

## Goal

Enable agents (and the maintainer) to run autonomous end-to-end verification of greentap against a live WhatsApp Web session without exposing PII from unrelated chats. Establish the e2e run as a mandatory pre-merge step for any PR that changes `lib/commands.js`, `lib/parser.js`, or `lib/daemon.js`.

## Non-goals

- Full CI integration (repo has no CI yet; deferred).
- Pre-commit hooks / husky (overengineering for a personal CLI).
- Send/download operations against chats other than the sandbox.
- Auto-creation of the sandbox chat (manual one-time setup; Playwright-driven group creation is fragile and pays off only once).

## Sandbox chat

- WhatsApp group named exactly `greentap-sandbox`, created manually by the maintainer.
- Only member: the maintainer.
- All e2e send/read/download traffic flows through this chat. No other chat may be targeted while `GREENTAP_E2E=1`.
- Detection: first step of `greentap e2e` reads `chats()` and asserts one row with `name === "greentap-sandbox"`. If absent, exit with an actionable error (group name + instructions).

## Guard mechanism

New module `lib/e2e-guard.js` exports two functions:

```javascript
export function isE2EMode() {
  return process.env.GREENTAP_E2E === "1";
}

export function assertE2EAllowed(chatName) {
  if (!isE2EMode()) return;
  const allowed = process.env.GREENTAP_E2E_CHAT ?? "greentap-sandbox";
  if (chatName !== allowed) {
    throw new Error(`E2E mode: chat '${chatName}' not allowed; only '${allowed}'`);
  }
}
```

`assertE2EAllowed(chatName)` must be called at the top of every command in `lib/commands.js` that accepts a chat-name argument. Explicit list (as of this spec):

- `navigateToChat`
- `read`
- `send`
- `fetchImages`
- `pollResults`
- `search` (chat-name variant — if one exists)
- `snapshot` (when targeting a specific chat)

`chats()` and `unread()` list all chats — they do NOT call the guard. Instead, while `isE2EMode()` is true, they **filter their return value** to only include the sandbox row. This allows `e2e` pre-flight to confirm the sandbox exists without leaking other chat names into logs.

### Enforcement test

`lib/e2e-guard.js` also exports a list of guarded command names — the single source of truth:

```javascript
export const GUARDED_COMMANDS = [
  "navigateToChat", "read", "send", "fetchImages", "pollResults", "search", "snapshot",
];
```

`test/e2e-guard.test.js` imports this list and, for each name, calls the corresponding exported function from `lib/commands.js` with `GREENTAP_E2E=1` and a non-allowlisted chat name. Each call must throw. This catches a developer removing a guard call from a known command.

**Known limitation:** if a developer adds a *new* chat-accepting command to `lib/commands.js` but forgets to add its name to `GUARDED_COMMANDS`, the enforcement test has no signal — false negative. `CONTRIBUTING.md` documents the "must add to GUARDED_COMMANDS" rule as a code-review checklist item. This is deliberately imperfect but cheap; a Babel-AST or eslint rule that detects chat-name parameters is follow-up work only if the rule is broken in practice.

## `e2e` subcommand

Invocation: `GREENTAP_E2E=1 node greentap.js e2e [--verbose]`

Ordered stages. First failure aborts (fail-fast).

| # | Stage | What it does | Pass criterion |
|---|-------|--------------|----------------|
| 1 | Pre-flight | Ensure daemon up; `chats` filtered shows sandbox row | Row present |
| 2 | Rate-limit check | Read `~/.greentap/e2e-last-run`; if <60s ago, abort | File absent or older |
| 3 | Round-trip text | `send` a unique marker `e2e-probe-<uuid>`, `read`, scan last N messages | Marker found with sender `"You"` |
| 4 | Round-trip image | `send` the committed PNG fixture (`test/fixtures/e2e/sample.png`), call `fetchImages --limit 1` | File written; `file` says PNG/JPEG; `mimeType` present; path printed to stdout for multimodal verification |
| 5 | Round-trip link | `send` `https://example.com/e2e-<uuid>`, wait 2s, `read --json` | `links[0].href` contains the uuid |
| 6 | Post | Write timestamp to `~/.greentap/e2e-last-run` | File exists |

Output: JSON summary with `{stage, pass, duration_ms}` per step. No message content is logged — only structural fields (counts, types, paths). `--verbose` adds ARIA snapshot length + number of rows inspected per stage.

Exit codes: `0` pass, `1` fail, `2` sandbox missing, `3` rate-limited.

### Why structural-only output

Content fields may contain link URLs with session tokens, file names, or (if the user misuses the sandbox) personal text. Logging only counts and shapes keeps the stdout / agent transcripts safe to commit as build artifacts.

### Multimodal verification (follow-on to stage 4)

The image round-trip proves the file was downloaded. It does NOT prove the *content* of the downloaded file matches the source fixture — a broken pipeline could silently write the wrong bytes. To close that gap without adding OCR to greentap itself, the flow is:

1. `greentap e2e` prints the downloaded image absolute path on stage 4 pass.
2. The invoking agent (or the maintainer) calls the Read tool on that path. Claude's multimodal pipeline returns the image contents.
3. Assertion: the text `GREENTAP-E2E` must appear legibly. Secondary text `roundtrip fixture` and `do not edit` are allowed markers.

The fixture `test/fixtures/e2e/sample.png` is a committed 600×200 PNG (~8KB) with those three text lines rendered in Helvetica. The text is a constant — no per-run uniqueness — so the assertion is deterministic. Per-run freshness is already proven by the text round-trip (stage 3, uuid marker).

CONTRIBUTING.md documents this as the final manual step of the e2e checklist. `greentap e2e` itself does not call any vision model.

## Rate limiting

Spec minimum: 60s between runs enforced via `~/.greentap/e2e-last-run` (unix timestamp). Exit code 3 on rate-limit, with a human-readable message indicating seconds-until-next-run. Override with `GREENTAP_E2E_SKIP_RATE_LIMIT=1` (not documented publicly; intended for maintainer debugging).

Each run sends ≤3 messages. At one run per minute that's ≤180 messages/hour — comfortably under any reasonable WA automated-send threshold for a personal account. `humanDelay` (already in `lib/commands.js`) stays in the loop.

## Testing the harness itself

1. **Unit: guard behavior.** `test/e2e-guard.test.js` covers:
   - `GREENTAP_E2E` unset → `assertE2EAllowed` is a no-op
   - Set to `1`, chat matches `GREENTAP_E2E_CHAT` → no throw
   - Set to `1`, chat does not match → throws
   - `GREENTAP_E2E_CHAT` unset defaults to `greentap-sandbox`

2. **Unit: guarded-command enforcement.** Iterates `GUARDED_COMMANDS` from `lib/e2e-guard.js` and, for each name, calls the corresponding export from `lib/commands.js` with `GREENTAP_E2E=1` and a non-allowlisted chat. Every call must throw. Catches guard removal on known commands. False-negative on *new* commands is acknowledged and covered by the CONTRIBUTING.md code-review checklist.

3. **Integration (pure):** spawn `node greentap.js e2e` against a stubbed `page` (no real browser). Not required for MVP but cheap follow-up.

4. **Meta e2e (manual):** the maintainer runs `GREENTAP_E2E=1 node greentap.js e2e` once against their live daemon and sandbox group. Captured as the first pass baseline. No automation here.

## Rollout plan

1. This spec → plan → implementation → PR E. Merged first, ahead of #15, #16, #17, #18.
2. After merge, an agent rebases #15/#16/#17/#18 onto `main` (which now contains the harness).
3. Each rebased PR adds one checkbox to its Test plan: `` `GREENTAP_E2E=1 node greentap.js e2e` passes locally ``. No code changes beyond the rebase itself; the guard is opt-in via env var and does not affect default behavior.
4. The maintainer runs the e2e check before clicking merge on each.

## Mandatory-scope rule

`greentap e2e` must pass locally before merging any PR whose diff touches:

- `lib/commands.js`
- `lib/parser.js`
- `lib/daemon.js`
- `lib/client.js`
- `lib/locale.js`
- any file under `test/fixtures/`

Exempt: docs-only PRs (`README.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/**`), `CONTRIBUTING.md` itself, `.claude/**` (skills, settings), `.gitignore`, CI config once added, release notes.

The rule lives in:
- `CONTRIBUTING.md` — primary source, written in this change
- `CLAUDE.md` — short reference pointing to `CONTRIBUTING.md`
- PR template (`.github/pull_request_template.md`) — Test plan checkbox referenced, not enforced

No pre-commit hook. No CI check. Enforcement is social / review-driven.

## Affected files summary

New:
- `lib/e2e-guard.js`
- `greentap.js` — new `e2e` subcommand dispatch block
- `test/e2e-guard.test.js`
- `test/fixtures/e2e/sample.png` — committed 600×200 PNG, ~8KB, text `GREENTAP-E2E` / `roundtrip fixture` / `do not edit` in Helvetica. PII-free. Regeneration script included at `test/fixtures/e2e/regenerate.py` (not invoked at test time; reproducibility record only).
- `test/fixtures/e2e/regenerate.py` — Python + PIL script that reproduces `sample.png` byte-stably given the same font
- `CONTRIBUTING.md`
- `.github/pull_request_template.md` (if not present)

Modified:
- `lib/commands.js` — call `assertE2EAllowed` in each chat-accepting command; conditional filter in `chats` / `unread`
- `CLAUDE.md` — short mandatory-e2e pointer, ~5 lines
- `README.md` — short E2E testing section, ~15 lines
- `.claude/skills/greentap/SKILL.md` — note e2e is a pre-merge step

## Open questions / deferred

- **PR template:** create `.github/pull_request_template.md`? Default-yes but worth confirming; it's a public-repo artifact.
- **CI integration:** once CI is added (not in this change), port the mandatory-e2e rule to a workflow gate. Until then, rule is local-only.

## Success criteria

1. `GREENTAP_E2E=1 node greentap.js e2e` runs end-to-end against a live daemon with the sandbox group present, exits 0, completes in <15s.
2. `test/e2e-guard.test.js` proves every chat-accepting export is guarded.
3. Rebased #15/#16/#17/#18 each have an e2e checkbox in Test plan and reference `CONTRIBUTING.md`.
4. A fresh agent can run the entire e2e sequence autonomously after this lands (given the daemon is up and the sandbox exists).
