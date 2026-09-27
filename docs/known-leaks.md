# Known leaks

Per `CONTRIBUTING.md` § "PII patterns": a PII leak found in commits **already
inside a tagged release** is **not** rewritten (rewriting published history is
a one-way door with audit-trail cost). Instead it is documented here — SHA +
content category only, never the leaked content itself — and prevention is
applied going forward.

This file intentionally contains **no PII**. It records *that* a leak
happened, its category and scope, and the remediation — not the leaked values.

---

## 2026-04-27 — PII in GitHub release notes

- **What:** Personally-identifying content appeared in a greentap GitHub
  **release note** (release-description text on the GitHub Releases page), in
  the v0.4.0 → v0.5.0 timeframe. Release-note text lives in GitHub's release
  API, not in the git tree, so this was not a commit-content leak.
- **Category:** maintainer identity / chat-derived content (exact values not
  reproduced here).
- **Scope:** GitHub Releases page only.
- **Root cause:** unreviewed batch push + manual-grep-only PII defense (a CoE
  was filed for the broader 4/27 "5 unreviewed commits to public repo" lapse).
- **Remediation:** release notes corrected. Prevention added 2026-05-26:
  automated PII scanner + pre-commit hook (`scripts/pii-scan.sh`,
  `scripts/install-hooks.sh`), release-notes privacy template
  (`docs/release-notes-template.md`), and the QA PII allow/forbid table
  (`docs/QA.md`).
- **Backup tags (local-only, NOT on public origin — verified 2026-05-26):**
  `pii-leak-backup-2026-04-27`, `pre-oss-rewrite`. These preserve pre-rewrite
  state for recovery and must never be pushed to origin.

---

## REMEDIATED 2026-05-26 — `pre-swift-removal` tag on public origin

> Status: **remediated 2026-05-26.** Tag deleted from `origin` and locally
> (maintainer authorized deleting all non-semver / non-release tags). The
> related local-only backups `pre-oss-rewrite` and `pii-leak-backup-2026-04-27`
> were deleted in the same pass. Residual risk: GitHub may retain the unreferenced
> objects until garbage-collection, and any prior clone/fork/cache/index is
> outside our control — deletion reduces but does not guarantee removal.

- **What:** The tag `pre-swift-removal` (commit `b2bb0c1`, 2026-03-08 01:17) is
  present on the **public** `origin`. It **predates** the fixture-anonymization
  commit `7bbb746` ("anonymize fixtures and remove openspec archives for OSS
  prep", 2026-03-08 14:36) — confirmed: `7bbb746` is **not** an ancestor of the
  tag. The tag's tree still contains `test/fixtures/` (4 files).
- **Implication:** the tag likely exposes **pre-anonymization** fixture data
  (real chat content / names / numbers) publicly, reachable via
  `git fetch origin tag pre-swift-removal` or the tag page on GitHub.
- **Recommended remediation (needs maintainer OK — deleting a public tag is a
  visible, hard-to-fully-reverse action):**
  1. Confirm the pre-anonymization fixtures actually contained PII (review
     locally, do not paste content).
  2. If so: delete the tag on origin (`git push origin :refs/tags/pre-swift-removal`)
     and locally; consider whether any other ref keeps those commits reachable.
  3. Note that the data may already be cloned/cached/indexed elsewhere —
     deletion reduces but does not guarantee removal of public exposure.

---

## OBSERVATION — first names in committed fixture message bodies

> Status: **observation, 2026-05-26.** Not confirmed as PII; for review.

- **What:** Current `test/fixtures/main-aria.txt` / `chat-aria.txt` message
  *bodies* contain first names (e.g. in French-language sample messages).
  Group names, phone numbers (all-zeros synthetic), and links (REDACTED /
  example.com) appear anonymized, but body text retains given names.
- **Question for review:** are these invented or residual real first names? If
  residual, they are in tagged releases (v0.x) → document-don't-rewrite per
  policy, and scrub in a future fixture refresh.
- **Action:** routed to the QA pilot + code/security review for a judgment;
  no history rewrite without maintainer decision.

---

## 2026-09-27 — chat-derived fixture data and private-deployment references

- **What:** A post-release audit of v0.8.0/v0.8.1 found test fixtures and
  tests whose "fake" names, group names, message text and poll data were
  close copies of real chats, including names that were on the fake-persona
  allowlist but match real people. It also found references to the
  maintainer's private deployment: a container-network IP in a test, an
  agent-tool name in an error message, persona names in code comments, and
  deployment details in PR bodies and comments.
- **Category:** chat-derived content, private-setup references (exact values
  not reproduced here).
- **Scope:** tracked files in tags up to and including `v0.8.1` (introduced
  in `56eff97`, `00ba507` and `9d962da`, plus older fixture content that
  predates `v0.7.2`), the body of commit `5068a9a`, and the bodies/comments
  of PRs #53 and #58 and issue #44.
- **Remediation:** HEAD scrubbed. Fixtures and tests use synthetic data, the
  allowlist entries that match real people were removed from
  `CONTRIBUTING.md`, the test IP is a TEST-NET address, and the PR/issue text
  was edited. Tagged history is not rewritten, per the rule above.
- **Not scrubbed:** the `CLAUDE.md` block synced from the maintainer's
  workspace conventions and the `ROADMAP.md` pointer to that workspace. They
  name a private repository path, not people. They stay until the
  maintainer decides.
