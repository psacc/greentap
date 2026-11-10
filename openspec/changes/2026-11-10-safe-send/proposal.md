# Safe send after the Send control change

## Why
`greentap send` failed with "Expected one structural Send button after typing;
found 0" while a Send button was visible. The typed text stayed as a draft. A
naive retry would append the same text to that draft.

Live reproduction in the sandbox chat confirmed the cause: WhatsApp Web now
renders the Send icon as `<svg><title>ic-send-filled</title>` with no
`data-icon` attribute. The same build also renames the chat header button, so
the destination check failed, and nests message rows in group containers, so
the E2E off-viewport probe could not be created.

## What changes
- Match the Send control by its icon in both the current and legacy markup.
  Zero or several matches fail before any click.
- Verify the destination by the structural chat title, with the old header
  button check kept as a fallback.
- Refuse a different existing draft. Send an identical leftover draft without
  retyping it.
- Verify a new own message row with the sent text. Report "Not sent" when the
  text is still a draft and "Unverified" when the outcome is unknown.
- Apply the same Send icon match to the E2E media-preview submit and accept
  grouped message rows in the E2E text probe.

## Capabilities and impact
Modifies `send-message`. Affects `send` and the E2E harness only.
