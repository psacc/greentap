# Verification

- Red-first helper tests reproduced the missing readiness behavior.
- The original CLI at baseline 00ba507 was also reproduced against an isolated
  synthetic QR page: whoami, chats, read and poll-results each exceeded four
  seconds without login guidance and were terminated by the test harness.
  Current CLI tests against the same structural QR fixture exit 1 with login/QR
  guidance within four seconds. This is real CLI execution against fabricated
  DOM, not live WhatsApp reproduction or E2E.
- Ten readiness helper tests pass, including navigation-context races and
  actionable reload timeout handling.
- Four synthetic Chromium tests pass: actual structural DOM markers, loading
  transitions, transport retry, and real CLI execution of whoami/chats/read/
  poll-results against an isolated QR page. Each CLI fails within four seconds,
  keeps stdout empty and reports login/QR guidance on stderr.
- Browser download was blocked by HTTP 403. Synthetic validation used a
  temporary registry-delivered Chromium 153 binary; no dependency was added.
- Full `npm test`: **283 tests passed, zero failed, zero skipped** after
  supplying the temporary browser's fontconfig and libraries and bypassing the
  HTTP proxy for loopback CDP. No browser or system access configuration was
  changed. The temporary browser differs from the supported bundled version;
  repeat the suite with that version in the normal verification environment.
- DNS rewrite coverage now uses a scoped, restored lookup mock. CLI DNS failure
  tests accept both ENOTFOUND and the already-supported EAI_AGAIN, and bound
  resolver retries in the test subprocess environment. They still invoke the
  real CLI and require a named resolution error within ten seconds.
- PII worktree scan is clean (structural-only; identity tokens unavailable).
- Code review and security review: no remaining blockers. Advisory: remote
  transport diagnostics could retain endpoint context; transport and readiness
  budgets are separate and can total roughly 60 seconds.
- Required live WhatsApp E2E was attempted with
  `GREENTAP_E2E=1 node greentap.js e2e`: exit 1,
  "No session. Run `greentap login` first." **No E2E stage ran.** There is no
  configured remote CDP URL or local authenticated profile. Read-only endpoint
  probes found no local daemon and could not resolve the historically named
  remote daemon. No account state, pairing or shared browser was modified.
- Live validation remains a merge gate, not a claim satisfied by synthetic
  tests. The delivery runner should arrange exclusive access to an existing
  authenticated environment, run the committed branch's real CLI readiness
  path and full E2E, and confirm the modal stage (which invokes ensureChatList)
  and subsequent roundtrip stages execute and pass. Do not log out or re-pair
  the shared device to reproduce the QR fixture.

Local implementation and review are complete; required live evidence is still
pending, so this change is not merge-ready. No push, PR, merge, release, primary-checkout
update, or shared-device mutation was performed.
