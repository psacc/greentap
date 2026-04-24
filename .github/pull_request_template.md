## Summary

<!-- What changed and why. One or two sentences. -->

## Plan / spec

<!-- Link to docs/superpowers/plans/<file>.md or docs/superpowers/specs/<file>.md if applicable -->

## Test plan

- [ ] `npm test` passes locally
- [ ] PII check: no real names, numbers, or chat content in new fixtures
- [ ] If the diff touches `lib/` or `test/fixtures/`:
  - [ ] `GREENTAP_E2E=1 node greentap.js e2e` passes locally
  - [ ] The `sample.png` downloaded in stage 4 shows the text `GREENTAP-E2E` when viewed

## Review

- [ ] `/review-code` run locally; blockers fixed
- [ ] `/review-security` run locally; blockers fixed
