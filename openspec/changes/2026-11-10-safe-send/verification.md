# Verification

Live runs used the branch code against the shared remote daemon, in the
`greentap-sandbox` chat only, with `GREENTAP_E2E=1`.

- Baseline (installed `4bb0b5e`): `send` exited 1 with "found 0" and left the
  text as a draft next to a visible Send button.
- Live DOM: the Send button holds `<svg><title>ic-send-filled</title>` and no
  `data-icon`; the chat title is `[data-testid="conversation-info-header-chat-title"]`.
- Draft guard: a different message was refused; the existing 40-character
  draft stayed unchanged.
- Resume: sending the identical draft text printed "Sent to greentap-sandbox.";
  `read --json` showed exactly one own row with that text; the compose box was empty.
- First E2E runs exposed two harness gaps with the same build: grouped message
  rows broke the text-stage probe, and the media-preview Send used the old
  icon marker. Both are fixed in this change.
- Final `GREENTAP_E2E=1 node greentap.js e2e`, after the review fixes: modal,
  preflight, text, image and link stages all passed (exit 0). The downloaded
  image showed legible "GREENTAP-E2E".
- A sandbox send with an emoji mid-line printed "Sent to greentap-sandbox."
  and produced exactly one own row with that text.
- `npm test`: 296 pass, 0 fail. `npm run pii`: clean (structural scan).

## Reviews
- Code review blocker fixed: verification normalises emoji, formatting markers
  and whitespace on both sides. Also applied: empty messages are rejected,
  draft comparison collapses whitespace instead of removing it, emoji-draft
  advice no longer promises a resume, the E2E clone must contain its source row.
- Security review: no blockers.
- Open advisories: the parser drops `strong:` nodes; the legacy header
  fallback keeps its prefix match; verification counts rows in the rendered
  window, so a long chat can yield a false "Unverified".
