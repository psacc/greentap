<!--
===================================================================
DO NOT MERGE without maintainer's explicit per-PR approval
+ a passing e2e run that EXERCISES the feature this PR adds
(no skipped stages for the feature under test).

"Approval" = maintainer says "merge it" for THIS PR, in the CURRENT
session. A generic "procedi" does NOT authorize a merge. `--admin`
bypass is FORBIDDEN unless the maintainer explicitly says "use admin"
for this specific PR.

Full rules: CONTRIBUTING.md → "Merge approval protocol" and
"E2E is mandatory — local, not CI".
===================================================================
-->

## Summary

<!-- What changed and why. One or two sentences. -->

## Plan / spec

<!-- Link to docs/superpowers/plans/<file>.md or docs/superpowers/specs/<file>.md if applicable -->

## Test plan

- [ ] `npm test` passes locally
- [ ] PII check: no real names, numbers, or chat content in new fixtures
- [ ] **If the diff touches `lib/commands.js`, `lib/parser.js`, `lib/daemon.js`, `lib/client.js`, `lib/locale.js`, or `test/fixtures/**`:**
  - [ ] `GREENTAP_E2E=1 node greentap.js e2e` passes locally (exit 0)
  - [ ] The stage that exercises THIS PR's feature actually RAN — it was NOT skipped (confirm by reading the stage list in stdout)
  - [ ] If this PR adds image download: the downloaded image was Read()-verified multimodally and the text `GREENTAP-E2E` is legible in the pixels
  - [ ] If e2e cannot run for any reason (daemon blocked, sandbox issue, preflight bug): this PR does NOT merge until the blocker is fixed

## Review

- [ ] `/review-code` run locally; blockers fixed
- [ ] `/review-security` run locally; blockers fixed

## Merge authorization

- [ ] Maintainer has, in the CURRENT session, explicitly approved merging THIS specific PR
- [ ] No `--admin` bypass is being used (or: maintainer explicitly authorized `--admin` for this PR)
