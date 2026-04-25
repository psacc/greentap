# Contributing to greentap

## Scope

greentap is a personal CLI. External PRs are welcome for bugs and
small features, but expect slow review and opinionated rejections on
scope.

## Ground rules

- **No PII.** See the explicit pattern list below. Fixtures and tests must
  use fake personas (e.g. Roberto Marini, Elena Conti, Famiglia Rossi).
- **Locale-agnostic selectors.** Don't hardcode WhatsApp UI strings.
  See `CLAUDE.md` for the three-tier selector strategy.
- **TDD.** Write the failing test first; make it pass.

## PII patterns — mandatory pre-merge grep

Every PR — **including doc-only PRs** — MUST pass a PII grep before
push and again before merge. Run this against the diff and against
each commit message:

```bash
# Run with the real tokens substituted in your local shell —
# do NOT put the real tokens in this file or in any committed shell
# script. The patterns below are placeholders.
git log --format='%H%n%s%n%b' origin/main..HEAD | \
  grep -iE '(<maintainer-first-name>|<maintainer-last-name>|<task-tracker-domain>|/Users/<maintainer-username>|@<maintainer-email-domain>|<your-real-phone-prefix>)'
```

Forbidden tokens, by category:

- **Maintainer's name** — first name, last name, nickname. Even
  standalone in commit subjects or PR bodies.
- **Maintainer's email** — including any `@<personal-domain>` fragment.
- **Absolute filesystem paths** containing the maintainer's username
  (`/Users/<name>/...`).
- **Task-tracker URLs and IDs** — task tracker app URLs, raw task IDs (the
  short opaque alphanumeric strings these systems use), Linear/Jira/etc
  URLs with private workspace tokens.
- **Real phone numbers** — anything matching `+\d{10,15}` that's not in
  the synthetic-prefix allowlist (`+39 555 ...` / `+1 555 ...` are
  reserved for documentation, not assigned).
- **Real chat content** — quotes from real WhatsApp conversations,
  group names that aren't the established fake personas, real contact
  references.

Allowed exceptions:

- Author / committer metadata (`%an`/`%ae`) — can show the maintainer's
  real identity. Considered out-of-scope for the content rules above
  because GitHub fingerprints commits this way regardless.
- Fake personas: Roberto Marini, Daniele Bottazzini, Elena Conti,
  Famiglia Rossi, Lavinia Vitale, Estevan Tioni, Flavia, Amanda,
  Mattia, "Ferragosto" (Italian holiday).
- Synthetic phone numbers: `+39 02 0000 00000`, `+39 555 010 2030`,
  `+1 555 123 4567`. Document any new synthetic number in this list
  before using it.

If a leak is found post-merge in commits NOT yet inside a tagged
release: rewrite history with `git filter-branch --msg-filter` (or
`git filter-repo --replace-message`), then force-push under temporary
relaxation of branch protection. Restore protection immediately after.

If a leak is found in commits ALREADY inside a tagged release: do not
rewrite. Document the leak in `docs/known-leaks.md` with the SHA and
content category, and apply prevention to future PRs.

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
4. Document the command + its JSON shape in
   `.claude/skills/greentap/SKILL.md`. Run the skill-coherence checker
   (`docs/skill-coherence-checker.md`) — verdict MUST be `COHERENT`
   before tagging the next release.

## Release procedure

Releases follow semver (`v0.<minor>.<patch>`). All releases are manually
tagged from `main`. There is no CHANGELOG file — release notes live on
GitHub.

### Pre-tag checklist (mandatory)

Before running `git tag`, **every** item must be green:

1. **All open PRs intended for this release are merged.** Verify with
   `gh pr list --state open`. Defer anything that didn't make it; do
   not block the release on a half-finished PR.
2. **`main` is clean.** `git status` clean, `git log` shows nothing
   surprising since the previous tag.
3. **`npm test` on `main` HEAD is green.**
4. **`GREENTAP_E2E=1 node greentap.js e2e` on `main` HEAD is green.**
   This is a NEW pre-tag requirement: per-PR e2e runs catch each
   change in isolation, but the cumulative state of `main` must also
   pass before a tag. If a stage fails, the release is blocked until
   fixed (which itself may be a new PR).
5. **Skill coherence checker** (`docs/skill-coherence-checker.md`)
   returns `verdict: "COHERENT"`. New commands or new JSON fields
   added since the previous tag MUST be in `SKILL.md`.
6. **PII grep on every commit message since the previous tag is
   clean** — see § "PII patterns" above. Forbidden tokens must NOT
   appear in any commit message, PR title, or PR body.
7. **PII grep on the diff `<prev-tag>..HEAD` is clean.** Tracked
   files only — `git ls-files` × `git show <SHA>:<file>`. Same
   forbidden-token list.

### Tag + release

```bash
# Replace 0.x.y with the actual version
git tag v0.x.y
git push origin v0.x.y

gh release create v0.x.y \
  --title "v0.x.y — short title" \
  --notes "$(cat <<'EOF'
## Highlights

- Bullet of the headline feature
- Bullet of the second-most-important thing

## All changes

(Generated from \`git log <prev-tag>..v0.x.y --oneline\`. Trim trivial
commits, group by category if useful.)

## Upgrade notes

(Anything users have to do manually — re-login, install a new
binary, contract changes, etc. If nothing, write "None.")

## Known limits

(Carry-over warnings from CONTRIBUTING / SKILL.md / ROADMAP.)
EOF
)"
```

### Version bump rules

- **Patch (`v0.x.y` → `v0.x.(y+1)`):** bug fixes only, no new
  features, no contract changes.
- **Minor (`v0.x.y` → `v0.(x+1).0`):** new commands, new fields in
  read output (additive), new flags. Backward-compatible.
- **Major (`0.x.y` → `1.0.0`):** breaking contract changes (e.g.
  removing a field, renaming a command, changing JSON shape in a way
  consumers can't ignore). greentap is currently `0.x` — major bump
  is reserved for a stability commitment.

If a release also rewrote git history on `main` for PII reasons,
note that in the upgrade notes (any consumer with an old clone needs
to re-clone or `git fetch + reset --hard origin/main`).

### Post-tag

- Verify the GitHub release page renders correctly
- Verify `npx skills add psacc/greentap` picks up the new version
  (skills.sh indexing may take a few minutes)
- Update the project memory with anything notable (next session's
  agent benefits from a tight summary of what shipped)

## PR checklist

See `.github/pull_request_template.md`.
