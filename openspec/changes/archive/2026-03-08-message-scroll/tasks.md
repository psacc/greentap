## 1. Core Scroll Logic

- [x] 1.1 Add `findScrollContainer(page)` function in `lib/commands.js` — uses `page.evaluate()` to walk up from `[role="row"]` to find element with `overflowY: auto`
- [x] 1.2 Add `scrollAndCollect(page)` function in `lib/commands.js` — scroll loop with dedup Map, top detection (3x stability), safety limits (50 iterations, 30s timeout)
- [x] 1.3 Add `dedupKey(msg)` helper — returns `${sender}|${time}|${text.slice(0, 50)}`

## 2. CLI Integration

- [x] 2.1 Update `read()` in `lib/commands.js` to accept `{ scroll }` option — calls `scrollAndCollect(page)` when true, otherwise current single-snapshot behavior
- [x] 2.2 Update `greentap.js` arg parsing to detect `--scroll` flag on `read` command — filter `--scroll` from args (like `--json`), pass `{ scroll: true }` to `read()`. Handle flag in any position.

## 3. Tests

- [x] 3.1 Unit test `dedupKey()` — correct key format, handles empty text, handles emoji-only text
- [x] 3.2 Unit test dedup merge logic — overlapping message sets produce correct chronological output without duplicates
- [x] 3.3 CLI arg parsing test — `read "Name" --scroll` passes scroll option correctly

## 4. Documentation

- [x] 4.1 Update `~/.claude/skills/greentap/SKILL.md` — add `--scroll` flag to `read` command docs
- [x] 4.2 Update `ROADMAP.md` — mark scroll task complete in Phase 5
