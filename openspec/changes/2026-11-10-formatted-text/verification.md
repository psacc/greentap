# Verification

- Before: a sandbox message `*grassetto* ...` was read back without
  "grassetto", and `send` reported "Unverified" although one row was delivered.
- Live snapshot showed `emphasis:`, `deletion:`, `code:` and `strong:` nodes.
- After: `read` returned the full text; a send using all four markers printed
  "Sent to greentap-sandbox.".
- Full `GREENTAP_E2E=1 node greentap.js e2e`: 5/5 stages passed; image legible.
- `npm test`: 297 pass, 0 fail. Code and security reviews: no blockers; times inside formatted runs are kept (review advisory applied).
