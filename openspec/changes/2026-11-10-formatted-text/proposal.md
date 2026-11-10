# Keep formatted text in read and send verification

## Why
WhatsApp renders `*bold*`, `_italic_`, `~strike~` and `` `code` `` as separate
ARIA nodes (`strong:`, `emphasis:`, `deletion:`, `code:`). The parser kept only
`text:` nodes, so `read` silently dropped formatted words. Send verification
then missed the delivered row and reported a false "Unverified".

## What changes
- `collectRowContent` treats the four formatting roles like `text:`.
- Send verification strips the backtick marker too, like `*`, `_` and `~`.

## Capabilities and impact
Modifies `message-read` and `send-message` verification. No API change.
