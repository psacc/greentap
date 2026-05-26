# Design: Release-process hardening + v0.6.0 stabilization

**Date:** 2026-05-26
**Status:** awaiting maintainer approval
**Author:** Claude (orchestrated, multi-subagent)

## Goal

Bring greentap's release process up to the maturity level of `psacc/omnisess`
— in particular a real **QA gate** — while cleaning up accumulated debt
(stale branches, stashes, dead Makefile, red tests, unmerged work) and
closing the automated-PII-guard gap that caused the 2026-04-27 leak. End
state: a more stable, releasable **v0.6.0** with artifacts prepared and
**every merge/tag/remote-push held for explicit per-PR maintainer OK**.

Repo is **public**: no PII in any committed file. Local work proceeds
freely; anything that publishes (PR merge, tag, push) is gated.

## Locked decisions (approved 2026-05-26)

1. **Release scope → v0.6.0** = stability fixes + salvage daemon idle-death
   fix (Todoist #9) + fetch-images `--limit` fix (Todoist #6). The two
   salvaged fixes touch `lib/` → **E2E MANDATORY** before their PRs merge.
2. **PII guard → automated** pre-commit hook + scan script (no new deps).
3. **Cleanup → prune now**, local + remote stale merged branches + drop the
   2 obsolete stashes.

## Current-state findings (evidence)

- GitHub: 0 open PRs/issues. Backlog is local + Todoist (12 greentap tasks).
- `main` is **red**: 2 failing tests in `test/navigate.test.js:322,345` — a
  PII-sanitization artifact (`GROUP_X` placeholder doesn't contain the query
  `"Foot"`, so it's correctly excluded from partial-match candidates, but the
  assertions still expect it). v0.5.0 + v0.5.1 were tagged red.
- 17 stale **remote** branches = squash-merged PRs (#15–#34); safe to prune.
  3 branches hold genuinely unmerged work:
  `fix/daemon-heartbeat-idle-reset` (local-only, daemon idle fix),
  `fix/greentap-5-bugs-2026-04-25` (fetch-images `--limit`),
  `chore/contributing-cleanup-and-install` (docs, superseded).
- 2 stashes: stale snapshots of already-merged work (PRs #16/#18/#19).
- PII defense is **manual grep only** → the exact failure mode of 4/27.
  `docs/known-leaks.md` is referenced (CONTRIBUTING.md:66) but **missing**.
- Dead Swift `Makefile` (Swift removed in Phase 4). No lint/release scripts.
- ROADMAP strategic block stale (targets v0.5.0; we're at v0.5.1).

## Workstreams

PRs are grouped so the E2E-exempt bulk can move independently of the
E2E-gated lib salvage.

### PR A — Stabilization + release process (E2E-exempt: docs/tooling/test-only)

A1. **Fix red tests** — `test/navigate.test.js`: rename the fixture chat so
    it shares the `"Foot"` prefix (e.g. `Football`) OR relax the two
    assertions to expect only the genuine match. Target: `npm test` green.
    (Test file, not `test/fixtures/**` → E2E-exempt.)

A2. **PII automation** — `scripts/pii-scan.sh`:
    - Ships only **structural** patterns (phone regex `+\d{10,15}` minus the
      synthetic allowlist; `/Users/<username>/` paths; task-tracker URL
      shapes).
    - Reads **identity-specific** forbidden tokens (maintainer name/email/
      domain) from a **gitignored** local file (`.git/greentap-pii-tokens`
      or `~/.greentap/pii-tokens`), never from a tracked file
      (CONTRIBUTING.md:25 forbids committing real tokens).
    - Modes: `--staged` (pre-commit), `--range <a>..<b>` (release/pre-tag),
      `--messages` (commit messages). Non-zero exit on any hit.
    - Pre-commit hook installer: `scripts/install-hooks.sh` writes a plain
      `.git/hooks/pre-commit` calling the scanner (no husky dep). Documented
      so a fresh clone can opt in.
    - `npm run pii` wired in; release script calls the range+messages scan.

A3. **Release process** — replace the dead Swift `Makefile` with real
    targets (or npm scripts): `test`, `pii`, `qa` (prints runbook pointer),
    `release-check` (version sync + clean tree + tests + PII), `tag`.
    Add `RELEASE.md` documenting the **two-stage flow** (release-prep PR
    carrying version bump + QA verdict → after merge, tag + `gh release`),
    adapted from omnisess. Add a release-notes template with the privacy
    style-guide ("numbers not adjectives", no `/Users/<name>/`, no real
    IDs). Version-sync guard: `package.json` version ↔ tag ↔ `SKILL.md`.

A4. **Agentic QA runbook** — `docs/QA.md`, adapted from omnisess
    `TESTING.md`:
    - Per-command golden + designed-to-fail matrix for every user-facing
      command (`chats`, `unread`, `read`, `search`, `poll-results`,
      `fetch-images`, `send`, `whoami`, `status`, `snapshot`), asserting
      JSON-contract shape + exit codes.
    - **Risk overlay**: `git log <last-tag>..HEAD` — each `feat:` gets a
      deeper exercise, each `fix:` re-runs the bug scenario to confirm it's
      live, each `refactor:` re-runs the touched command's regression suite.
    - **Perf budgets** (wallclock): `<5s` PASS, `5–30s` PASS-WITH-NOTES,
      `≥30s` FAIL (likely hung) — cold-start daemon caveat documented.
    - **PII allow/forbid table** for report content (greentap reads real
      WhatsApp data): counts/exit-codes/wallclock allowed; message
      previews / full chat names / phone numbers forbidden.
    - **Live-vs-offline split**: which checks need a live WhatsApp session
      (read/send/fetch/poll roundtrips → the existing `e2e` harness) vs.
      which run offline (JSON contracts, arg parsing, error paths, `status`,
      `--help`). Report goes to `qa-reports/<version>.md` (gitignored).
    - **Agent-emits / human-posts** boundary: the QA subagent writes the
      report + a one-line verdict; the maintainer relays it. The agent never
      posts to GitHub.

A5. **Cleanup** — delete 17 stale merged remote branches + local copies;
    drop the 2 obsolete stashes; create `docs/known-leaks.md` (documenting
    the 4/27 release-notes leak per CONTRIBUTING.md:60–67); refresh the
    ROADMAP strategic block (date + current version + phase).

### PR B — Salvage daemon idle-death fix (E2E-gated)

Rebase `fix/daemon-heartbeat-idle-reset` onto current `main` as a fresh
branch. Touches `lib/daemon.js` + `lib/client.js` → **E2E daemon stage
MANDATORY**. Maps to Todoist #9. Prepare PR; run E2E; **STOP before merge**.

### PR C — Salvage fetch-images `--limit` fix (E2E-gated)

Extract the `--limit` clamp + scroll from `fix/greentap-5-bugs-2026-04-25`
onto a fresh branch off `main`. Touches `lib/commands.js` → **E2E image
stage MANDATORY** (incl. multimodal `GREENTAP-E2E` legibility check). Maps
to Todoist #6. Prepare PR; run E2E; **STOP before merge**.

### QA pilot + fix cycle

Run the new `docs/QA.md` runbook against greentap as a **pilot**, using
parallel subagents for the offline matrix. Collect findings into
`qa-reports/`. Run a fix cycle for the **most relevant** findings (red
tests already in A1; plus any contract/error-path defects surfaced). Parser
quote-reply misattribution (Todoist #5/#8) is investigated and fixed **only
if** the pilot confirms a reproducible defect with an offline fixture —
otherwise it's logged as a tracked follow-up (it touches `lib/parser.js` →
its own E2E-gated PR, out of scope for this batch unless trivial).

### Unbiased review

Dispatch **parallel review subagents** with no stake in the work:
`/review-code`, `/review-security`, and a release-process reviewer that
checks the new QA/release docs for internal consistency and that the PII
scanner ships no real tokens. Consolidate; address blockers before
preparing release artifacts.

## E2E reality + fallback

E2E needs a live authenticated WhatsApp session + the `greentap-sandbox`
group. Daemon is currently down; session may have expired (last E2E
2026-04-27). **If E2E cannot run** (login expired → needs maintainer QR
scan, which the agent cannot perform): PR B and PR C **do not merge** and
v0.6.0 **falls back to v0.5.2 scope** (PR A only). This is surfaced, not
worked around. PR A is unaffected (E2E-exempt).

## What requires maintainer OK (gates)

- **Every PR merge** — per-PR, per-session, explicit (CONTRIBUTING merge
  protocol). No `--admin`.
- **Pushing branches to the public remote** and **deleting remote branches**.
- **Cutting the tag** + publishing the GitHub release.

Local work (branch/stash cleanup that's local, file edits, tests, QA pilot,
review) proceeds without a gate.

## Testing

- `npm test` must be green (precondition + after each change).
- E2E (`GREENTAP_E2E=1 node greentap.js e2e`) for PR B/C lib changes.
- QA pilot offline matrix as a new product-sanity layer.

## Risks

- **E2E unavailable** → v0.6.0 degrades to v0.5.2 (mitigation above).
- **Pruning a not-actually-merged branch** → mitigated: each remote branch
  verified against its merged PR (#15–#34) before deletion; salvage
  branches explicitly excluded.
- **PII scanner false sense of security** → it's a backstop, not a
  replacement for the manual checklist; documented as such. Reviewer
  subagent confirms it ships zero real tokens.
- **Scope creep** → parser quote-reply work is explicitly deferred unless
  trivially proven; this batch is stabilization + process, not a parser
  overhaul.
