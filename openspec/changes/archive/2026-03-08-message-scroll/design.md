## Context

WhatsApp Web uses virtual scrolling in the message panel — only ~27-50 DOM rows exist at any time, recycled as the user scrolls. A live spike (Phase 5 exploration) confirmed:

- `page.evaluate()` with `el.scrollTop = 0` works for programmatic scrolling
- `mouse.wheel()` and `keyboard.press('PageUp')` do NOT work
- The scrollable container can be found by walking up from `[role="row"]` elements checking `getComputedStyle(el).overflowY === 'auto'`
- After scrolling, aria snapshot reflects the new viewport (older messages appear, recent ones disappear)
- Top-of-chat is detectable when the first message text is stable across consecutive iterations

## Goals / Non-Goals

**Goals:**
- Collect all messages in a chat by scrolling from bottom to top
- Deduplicate messages from overlapping virtual scroll windows
- Detect when top-of-chat is reached and stop
- Maintain backwards compatibility — `read` without `--scroll` unchanged

**Non-Goals:**
- `--limit N` (scroll until N messages) — add later if needed
- Progress indicator during scroll
- Scroll in chat list or search results
- Bidirectional scroll (only upward from current position)

## Decisions

### 1. Scroll mechanism: `page.evaluate()` + `scrollTop`

**Choice:** Find scrollable container via DOM traversal, set `scrollTop = 0` to jump to top of current buffer, let WhatsApp load older messages.

**Alternatives considered:**
- `mouse.wheel()` — no effect on WhatsApp's message panel (spike confirmed)
- `keyboard.press('PageUp')` — navigates away from chat entirely
- Incremental `scrollTop -= N` — unnecessary complexity, jumping to 0 forces WhatsApp to load the next batch

**Rationale:** Only working approach found in spike. Simple, reliable.

### 2. Scrollable container discovery

```javascript
// Walk up from a message row to find the scroll container
const rows = document.querySelectorAll('[role="row"]');
let el = rows[0]?.parentElement;
while (el && getComputedStyle(el).overflowY !== 'auto') el = el.parentElement;
```

**Rationale:** WhatsApp's DOM structure is obfuscated (random class names). Role-based selectors + computed style check is resilient to class name changes.

### 3. Deduplication key: `sender|time|textPrefix`

**Choice:** `${sender}|${time}|${text.slice(0, 50)}` as Map key.

**Alternatives considered:**
- Time only — not unique (multiple messages per minute)
- Text only — not unique ("ok", "si", emoji-only)
- Full text — unnecessary, prefix is sufficient

**Rationale:** Sender+time+50-char prefix is unique enough for personal-use volumes. False dedup on identical messages same minute from same sender is acceptable (extremely rare, and those would appear as one message anyway).

### 4. Collection strategy: per-iteration arrays, oldest-first merge

Each scroll iteration returns messages in top-to-bottom (chronological) order. Later iterations show older messages.

```
Iteration 1 (bottom): [msg50, msg51, ..., msg77]
Iteration 2 (middle): [msg23, msg24, ..., msg52]
Iteration 3 (top):    [msg1, msg2, ..., msg27]
```

Strategy: store each iteration's parsed messages as an array. After all iterations complete, reverse the array of arrays (so oldest-first) and merge into a single `Map<dedupKey, message>`. For each message, skip if key already exists. Map preserves insertion order, so final `[...map.values()]` is chronological.

```
Processing order: iteration3, iteration2, iteration1
→ Map: msg1, msg2, ..., msg27, msg28, ..., msg52, msg53, ..., msg77
```

### 5. Top detection: first-message stability

**Choice:** If the first message in the snapshot is identical (same dedup key) for 3 consecutive iterations, we're at the top.

**Alternative:** Check for `scrollTop === 0` after scroll — but WhatsApp continuously loads content, so scrollTop may not reliably stay at 0.

**Rationale:** Spike confirmed this works. 3 iterations provides confidence against transient loading states.

### 6. Safety limits

- **Max iterations:** 50 (~1500 messages at ~30/viewport)
- **Overall timeout:** 30 seconds
- If limits hit, return collected messages with a stderr warning

### 7. API design

```bash
greentap read "Name" --scroll        # Scroll to top, collect all messages
greentap read "Name" --scroll --json # Same, JSON output
greentap read "Name"                 # Unchanged — viewport only
```

`read()` signature change: `read(page, chatName, { scroll = false } = {})`

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| WhatsApp changes scroll container structure | Container finder walks DOM dynamically — resilient to class changes |
| Very long chats exceed timeout | 30s timeout + max 50 iterations; return partial with warning |
| Dedup key collision | 50-char prefix + sender + time is sufficient; exact collisions are benign |
| Scroll delay too short (messages not loaded) | 500ms wait between iterations; increase if flaky |
| Virtual scroll window size varies | Dedup handles any overlap size |
