## Why

`greentap read` only shows messages visible in the viewport (~27-50 messages). WhatsApp Web uses virtual scrolling — only a small DOM window exists at any time. Users need to read full conversation history, not just the latest viewport.

## What Changes

- Add `--scroll` flag to the `read` command to scroll up through the entire chat
- Implement scroll loop: programmatic `scrollTop` manipulation via `page.evaluate()`, collecting and deduplicating messages across scroll positions
- Detect top-of-chat via first-message text stability (same first message for 3 consecutive iterations)
- Safety limits: max 50 iterations, 30-second timeout
- Without `--scroll`, `read` behaves exactly as before (viewport only, fast)

## Capabilities

### New Capabilities
- `message-scroll`: Scroll-based message collection with deduplication and top-of-chat detection

### Modified Capabilities
- `message-read`: Add `--scroll` flag support — new CLI argument that triggers scroll collection instead of single-snapshot read

## Impact

- `lib/commands.js`: `read()` gains `options.scroll` parameter, new `scrollAndCollect()` helper
- `greentap.js`: Parse `--scroll` flag and pass to `read()`
- `test/cli.test.js`: New tests for scroll dedup logic and `--scroll` arg parsing
- `~/.claude/skills/greentap/SKILL.md`: Document `--scroll` flag
- No new dependencies, no new files
