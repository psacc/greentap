# Release Runbook

Authoritative orchestration runbook for cutting a greentap release.

This is the step-by-step **how**. The **rules** it enforces live elsewhere
and are cross-referenced, not duplicated:

- **Merge approval protocol** → `CONTRIBUTING.md` § "Merge approval protocol"
- **E2E gate (real WhatsApp Web roundtrip)** → `CONTRIBUTING.md` § "E2E is mandatory"
- **PII patterns + forbidden tokens** → `CONTRIBUTING.md` § "PII patterns"
- **Pre-tag checklist + version bump rules** → `CONTRIBUTING.md` § "Release procedure"
- **Agentic QA gate** → `docs/QA.md` (authored separately)
- **Release-notes template + privacy style-guide** → `docs/release-notes-template.md`

If anything here ever contradicts `CONTRIBUTING.md`, `CONTRIBUTING.md` wins for
the rule and this file is corrected.

---

## The shape of a release

Two stages, deliberately separated:

1. **Release-prep PR** — carries the version bump and the QA verdict, merges
   into `main` through normal branch protection.
2. **Tag + publish** — from `main` after the prep PR lands; tags, pushes the
   tag, creates the GitHub release with hand-written notes.

Why two stages: branch protection blocks committing at tag time. The version
bump and the QA verdict must already be on `main` before the tag points at a
commit. Tagging is the last step, never the first.

---

## Versioning (semver, `v0.<minor>.<patch>`)

greentap is `0.x` — the public contract is not yet frozen.

| Bump | When | Example |
|------|------|---------|
| **Patch** | Bug fixes only. No new commands, no new flags, no new output fields, no contract changes. | `v0.5.1` → `v0.5.2` |
| **Minor** | Additive only: new command, new flag, new field in read/JSON output. Backward-compatible. | `v0.5.1` → `v0.6.0` |
| **Major** | Reserved for the stability commitment (freezing the CLI + JSON contract). A breaking change — removing/renaming a field or command — only happens here. Not used while `0.x`. | `v0.x.y` → `v1.0.0` |

When in doubt between patch and minor: if a consumer could write new code
against it, it is minor.

---

## Stage 1 — Release-prep PR

Goal: land a `main` commit that already carries the new version and a passing
QA verdict.

### 1. Start from clean `main`

```bash
git checkout main
git pull origin main
git status            # must be clean
make release-check    # version-sync + clean tree + tests + PII scan (see "Release scripts")
```

### 2. Pick the version

Apply the semver table above. Use the full `vX.Y.Z` form everywhere.

### 3. Branch and bump

```bash
git checkout -b chore/release-prep-vX.Y.Z
```

Bump the version in **both** of these — they MUST stay in sync:

- `package.json` (`"version"` field)
- `.claude/skills/greentap/SKILL.md` (the skill's declared version, when the
  frontmatter carries one)

These two are the only sources of truth for "what version is this". If they
drift, `make release-check` fails (see "Release scripts"). Commit:

```bash
git commit -am "chore(release): bump version to X.Y.Z"
```

### 4. Run the PR-time slice of the Pre-tag checklist

These are the items that are meaningful on the branch, before merge. (The full
Pre-tag checklist lives in `CONTRIBUTING.md` § "Release procedure" — the
remaining items are re-verified on `main` in Stage 2.)

- **`make test` green** — unit tests pass. (`npm test` passing is NOT e2e; the
  cumulative E2E gate is a Stage 2 item, per `CONTRIBUTING.md` § "E2E is mandatory".)
- **PII scan clean** — `make pii` over the diff and over every commit message
  since the previous tag. Forbidden-token list lives in `CONTRIBUTING.md` §
  "PII patterns". This applies to doc-only release PRs too.
- **Skill-coherence `COHERENT`** — run the checker (`docs/skill-coherence-checker.md`).
  Any new command or new JSON field added since the previous tag MUST already
  be documented in `SKILL.md`. Verdict must read `COHERENT`.

### 5. Run the Agentic QA gate

Run the agentic QA per `docs/QA.md`. It exercises the user-facing surface and
emits a single-line verdict. Paste that one line verbatim as a comment on the
prep PR, e.g.:

```
QA: pass
QA: pass with N notes
QA: fail — <one-line reason>
```

`QA: fail` blocks the merge. Fix, re-run, re-post the verdict.

### 6. Open the PR

```bash
git push -u origin chore/release-prep-vX.Y.Z
gh pr create --title "chore(release): bump version to X.Y.Z" \
  --body-file .github/pull_request_template.md
```

Fill in the template body. Include the QA verdict line.

### 7. Get explicit, per-PR approval — then merge

Per the **iron-clad merge protocol** (`CONTRIBUTING.md` § "Merge approval
protocol"):

- Every merge needs explicit maintainer approval, **per-PR and per-session**.
  The maintainer must say "merge it" (or equivalent) for *this* PR, *this*
  session. A generic "procedi" / "continue" does NOT authorize a merge — it
  authorizes work up to `gh pr create`, then stop and ping.
- `gh pr merge --admin` / any branch-protection bypass is **FORBIDDEN** unless
  the maintainer explicitly says "use admin" for this specific PR.
- When in doubt: ping and wait.

Only after that explicit OK, merge the prep PR.

---

## Stage 2 — Tag + publish

Goal: tag the `main` commit that carries the version bump, then publish.

### 8. Re-verify `main`

```bash
git checkout main
git pull origin main
make release-check
```

Then re-verify the **full** Pre-tag checklist on `main` HEAD per
`CONTRIBUTING.md` § "Release procedure". In particular:

- **`main` is clean**, all PRs intended for this release are merged.
- **`make test` green on `main` HEAD.**
- **Cumulative E2E green on `main` HEAD** — `GREENTAP_E2E=1 node greentap.js e2e`
  must exit `0` AND the stage(s) exercising what shipped must actually run (not
  skipped). Per-PR e2e catches each change in isolation; this re-run catches the
  cumulative state of `main`. Full gate, scope, pass criteria, and the
  multimodal image check are in `CONTRIBUTING.md` § "E2E is mandatory".
- **Skill coherence `COHERENT`** and **PII scan clean** on `main` HEAD.

If any item is red, the release is **blocked** until fixed (the fix is itself a
new PR through Stage 1's protocol).

### 9. Tag (gated on maintainer OK)

Tagging and pushing the tag is part of "publishing" — treat the maintainer's
"merge it" for the prep PR as covering the *merge only*. Confirm the maintainer
also wants the tag pushed for *this* version, this session, before pushing.

```bash
make tag VERSION=vX.Y.Z      # verifies version-sync + clean main, then tags + pushes
```

Verify the tag points at the intended commit SHA before continuing.

### 10. Create the GitHub release

Write the notes by hand using `docs/release-notes-template.md` (privacy
style-guide is part of that file). Do **not** ship raw `--generate-notes`
output — it may surface a flat PR list and is a starting point only.

```bash
# Draft the body into a local file first (gitignored / /tmp — never committed).
gh release create vX.Y.Z \
  --title "vX.Y.Z — <short title>" \
  --notes-file /tmp/vX.Y.Z-notes.md
```

### 11. Post-tag verification

- GitHub release page renders correctly, hand-written notes visible:
  `gh release view vX.Y.Z`
- `npx skills add psacc/greentap` picks up the new version (skills.sh indexing
  may lag a few minutes).
- Update project memory with a tight summary of what shipped.

---

## Release scripts

These commands are assumed to exist (built separately — do not implement them
here). This section is the spec of what each must verify.

| Command | Must verify |
|---------|-------------|
| `make test` | Runs the unit suite (`node:test`). Exits non-zero on any failure. This is NOT e2e — it does not touch WhatsApp Web. |
| `make pii` | Runs the PII scan over the working tree / diff and over every commit message since the previous tag, against the forbidden-token list in `CONTRIBUTING.md` § "PII patterns". Exits non-zero if any forbidden token is found. Tracked files only. |
| `make release-check` | Composite gate: (1) **version-sync** — `package.json` version equals the `SKILL.md` declared version; (2) **clean tree** — no uncommitted/untracked changes; (3) **tests** — runs `make test`; (4) **PII scan** — runs `make pii`. Exits non-zero if any sub-check fails. Does NOT run e2e (that is a separate, machine-local gate). |
| `make tag VERSION=vX.Y.Z` | Re-checks version-sync and a clean `main`, then creates the `vX.Y.Z` tag on the current `main` commit and pushes it to origin. Refuses to tag if version-sync fails or the tag already exists. |

`make release-check` is the fast local pre-flight for both stages. The E2E gate
is intentionally **not** folded into it — e2e is machine-local, slow, and gated
separately in `CONTRIBUTING.md` § "E2E is mandatory".

---

## Quick reference

```
Stage 1 (PR):   clean main → branch chore/release-prep-vX.Y.Z
              → bump package.json + SKILL.md (in sync)
              → make test green, make pii clean, skill-coherence COHERENT
              → run docs/QA.md, paste verdict on PR
              → gh pr create → EXPLICIT per-PR maintainer OK → merge

Stage 2 (tag):  main green + cumulative E2E green (CONTRIBUTING.md)
              → maintainer OK to push tag
              → make tag VERSION=vX.Y.Z
              → gh release create with docs/release-notes-template.md notes
              → verify release page + skills.sh + update memory
```
