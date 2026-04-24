# Contributing to greentap

## Scope

greentap is a personal CLI. External PRs are welcome for bugs and
small features, but expect slow review and opinionated rejections on
scope.

## Ground rules

- **No PII.** Fixtures and tests must use fake personas
  (e.g. Roberto Marini, Elena Conti, Famiglia Rossi). Never commit
  real names, phone numbers, chat content, or any identifier that
  could be traced to a real person. CI (when added) will grep.
- **Locale-agnostic selectors.** Don't hardcode WhatsApp UI strings.
  See `CLAUDE.md` for the three-tier selector strategy.
- **TDD.** Write the failing test first; make it pass.

## Merge approval protocol

These rules are iron-clad. Agents and humans MUST follow them.

1. **Every merge requires explicit maintainer approval.** Not
   implicit. Not "if review approves". Not "if tests pass".
2. **"Approval" means:** the maintainer, **in the current session**,
   says "merge it" (or equivalent) for the **specific PR** being
   merged. Per-PR. Not a batch. Not carried over from a previous
   session.
3. **A generic "procedi" / "continue autonomously" / "keep going"
   does NOT authorize merges.** It authorizes the next orchestration
   step up to `gh pr create`. Stop there and wait.
4. **Admin-bypass of branch protection (`gh pr merge --admin` or the
   `--admin` flag) is FORBIDDEN** unless the maintainer explicitly
   says "use admin" for the specific PR being merged.
5. **When in doubt: ping and wait.** Ping cost is trivial;
   merge-regret cost is not. Reverting a bad merge on a public repo
   is a one-way door with audit-trail costs.

Approval is **per-PR and per-session**. Re-ask for each PR. Re-ask
after a new session starts even if the previous session had approval
for a different PR.

## E2E is mandatory — local, not CI

E2E means a **real roundtrip against WhatsApp Web**, not unit tests.
`npm test` passing is NOT e2e. Unit tests verify code paths in
isolation; e2e verifies the whole pipeline against live WhatsApp Web.

### Scope — which PRs MUST run e2e

Any PR whose diff touches one or more of the following paths MUST
pass `GREENTAP_E2E=1 node greentap.js e2e` on the contributor's
machine **before** the PR is merged:

- `lib/commands.js`
- `lib/parser.js`
- `lib/daemon.js`
- `lib/client.js`
- `lib/locale.js`
- any file under `test/fixtures/`

Exempt paths: docs (`README.md`, `CLAUDE.md`, `ROADMAP.md`,
`docs/**`, `CONTRIBUTING.md`), `.claude/**`, `.gitignore`,
`.github/**`, release notes.

### Pass criteria — the feature's stage MUST NOT be skipped

`GREENTAP_E2E=1 node greentap.js e2e` MUST exit `0` **AND** the stage
that exercises THIS PR's code MUST actually run and pass. A run where
the feature stage is skipped (due to guard, flag, env, preflight
bailout, or any other reason) does NOT satisfy the requirement.

Examples:

- PR adds `links[]` to parser → the `link` stage MUST be active and pass.
- PR adds `fetchImages` to commands → the `image` stage MUST be
  active and pass, AND the downloaded image path MUST be
  Read()-verified multimodally to confirm the text `GREENTAP-E2E` is
  legible in the pixels.
- PR touches `lib/daemon.js` → the daemon-lifecycle stages MUST
  actually run. A preflight-only pass is NOT sufficient.

### If meta-e2e cannot run → PR does not merge

If `GREENTAP_E2E=1 node greentap.js e2e` cannot run the feature's
stage (daemon blocked, sandbox issue, preflight bug, sandbox group
missing, rate-limited with no override), the PR **does not merge**
until the blocker is fixed. The blocker itself may become a
follow-up PR — but the feature PR waits.

### Sandbox setup (one-time)

1. In WhatsApp, create a group named exactly `greentap-sandbox`.
2. Add yourself as the only member.
3. Confirm with `GREENTAP_E2E=1 node greentap.js e2e` — the
   pre-flight stage verifies the group exists.

### Running

```bash
GREENTAP_E2E=1 node greentap.js e2e
```

Exit codes:

- `0` — all stages passed
- `1` — a stage failed
- `2` — sandbox group missing
- `3` — rate-limited (min 60s between runs; override with
  `GREENTAP_E2E_SKIP_RATE_LIMIT=1` for local debugging)

A `0` exit code is necessary but not sufficient. You MUST also
confirm the feature's stage was not skipped — read the stdout stage
list.

### Multimodal image check

Stage 4 ("image") prints the path of the downloaded image fixture.
Open that path with any image viewer, or — if an AI agent is doing
the check — Read the path. The fixture text `GREENTAP-E2E` MUST be
legible. If the image is blank or the text is unreadable, the
pipeline is broken even though the CLI returned pass, and the PR
does not merge.

## Adding a new chat-targeting command

1. Add the command's exported name to `GUARDED_COMMANDS` in
   `lib/e2e-guard.js`.
2. Call `assertE2EAllowed(chatName)` as the first statement of the
   function body.
3. The `test/e2e-guard.test.js` enforcement test will verify the
   new command rejects non-sandbox chats.

## PR checklist

See `.github/pull_request_template.md`.
