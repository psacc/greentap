# navigateToChat Determinism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate non-deterministic behavior in `navigateToChat` where the chat grid isn't rendered at query time, causing the search fallback to be used even for visible chats — which fails for short/generic names (e.g. `"Foot"`).

**Architecture:** Add a bounded `waitFor(grid)` *before* deciding between "parse grid" vs "search fallback". Treat the grid path as the primary, deterministic route; only fall back to search when the grid is legitimately unavailable (archived chats, not in current viewport after wait).

**Tech Stack:** Playwright ARIA selectors, `getByRole("grid")`, `waitFor({ timeout })`.

---

## Context you need

- Bug observed 2026-03-29: `navigateToChat` calls `chatGrid.isVisible()` with no wait. When the grid hasn't rendered yet (cold connection, tab switch), `isVisible()` returns false → search fallback runs → for short names like `"Foot"` search matches many chats and `find(c => c.name === chatName)` may miss the intended one.
- Current code: `lib/commands.js:25-95`, specifically `isVisible().catch(() => false)` at line 28.
- Search fallback also has no `--index` support (line 58 comment): if duplicates exist only in search results, it silently picks the first.
- Fix direction: replace `isVisible()` with `waitFor({ state: "visible", timeout: 2000 })` to give the grid a real chance to render; only fall through to search on true timeout.

## File Structure

- Modify: `lib/commands.js` — `navigateToChat` (lines 25-95)
- Modify: `test/cli.test.js` (or new `test/navigate.test.js`) — deterministic-path and fallback-path tests with fake `page` doubles
- Optional: extract `navigateToChat` into its own module `lib/navigate.js` if the function grows; decide in Task 3.

---

## Task 1: Test — grid-path used when grid is visible after wait

**Files:**
- Create or modify: `test/navigate.test.js`

- [ ] **Step 1: Write failing test**

Create `test/navigate.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { navigateToChat } from "../lib/commands.js";

// Fake ARIA snapshot for the chat grid. "Roberto Marini" (row) with 1 chat.
// Helper: build a minimal fake `page` that satisfies the selectors
// navigateToChat uses: getByRole("grid").first() → isVisible/ariaSnapshot/getByRole("row").
function makeFakePage({ gridVisibleAfterMs = 0, gridAria = "", searchAria = "", headerAria = "" } = {}) {
  const started = Date.now();
  const gridIsVisible = () => (Date.now() - started) >= gridVisibleAfterMs;

  const row = {
    click: async () => {},
    first: function () { return this; },
    filter: function () { return this; },
  };

  const grid = {
    waitFor: async ({ timeout = 10000 } = {}) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (gridIsVisible()) return;
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error("timeout");
    },
    isVisible: async () => gridIsVisible(),
    ariaSnapshot: async () => gridAria,
    getByRole: (role, opts) => row,
    first: function () { return this; },
  };

  const page = {
    getByRole: (role) => (role === "grid" ? { first: () => grid } : {
      first: () => ({ click: async () => {}, isVisible: async () => true }),
      getByRole: () => row,
    }),
    locator: () => ({ ariaSnapshot: async () => headerAria + searchAria }),
    keyboard: { type: async () => {}, press: async () => {} },
  };
  return page;
}

test("navigateToChat uses grid path when grid becomes visible within wait window", async () => {
  const gridAria = `
- grid:
    - row "Roberto Marini, ultimo messaggio": /* abbreviated fixture */
      - gridcell "Roberto Marini 12:34"
`;
  const page = makeFakePage({ gridVisibleAfterMs: 500, gridAria, headerAria: 'button "Roberto Marini"' });
  // Will fail initially because current navigateToChat uses isVisible() without wait.
  await navigateToChat(page, "Roberto Marini", /* localeConfig */ null);
  // If it reached here without calling the search fallback, the grid path won.
  // We assert by proxy: fake page's search path would throw "Chat not found"
  // since searchAria is empty.
});
```

Note: if `parseChatList` can't read this abbreviated fixture, reuse an anonymized full fixture from `test/fixtures/` and wrap it in the fake page. The test's goal is to prove the code path — not parser correctness.

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/navigate.test.js`
Expected: FAIL (grid not visible at query time → current code falls to search → throws).

## Task 2: Replace `isVisible()` check with bounded `waitFor`

**Files:**
- Modify: `lib/commands.js:25-30`

- [ ] **Step 1: Edit `navigateToChat`**

Replace lines 25-30 of `lib/commands.js`. Current:

```javascript
export async function navigateToChat(page, chatName, localeConfig, index = undefined) {
  // Try visible chat list first — parse aria for exact name match
  const chatGrid = page.getByRole("grid").first();
  if (await chatGrid.isVisible().catch(() => false)) {
```

New:

```javascript
export async function navigateToChat(page, chatName, localeConfig, index = undefined) {
  // Try visible chat list first — parse aria for exact name match.
  // Wait up to 2s for the grid to render before falling back to search.
  // Without this wait, a freshly-opened daemon may see isVisible()=false
  // even when the grid is about to paint, causing spurious search fallback.
  const chatGrid = page.getByRole("grid").first();
  const gridReady = await chatGrid.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);
  if (gridReady) {
```

- [ ] **Step 2: Run previous test, confirm pass**

Run: `node --test test/navigate.test.js`
Expected: PASS (500ms visibility delay is well within 2000ms wait).

- [ ] **Step 3: Add test for true-fallback case**

Append to `test/navigate.test.js`:

```javascript
test("navigateToChat falls back to search when grid never appears", async () => {
  const page = makeFakePage({
    gridVisibleAfterMs: 10000,  // grid "never" shows within 2s wait
    searchAria: `- grid:\n  - row:\n    - gridcell "Elena Conti 14:22"\n`,
    headerAria: 'button "Elena Conti"',
  });
  // Fake page's search path must not throw
  await navigateToChat(page, "Elena Conti", null);
  // Reaches here only if search path succeeded
});
```

- [ ] **Step 4: Run suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/commands.js test/navigate.test.js
git commit -m "fix(navigate): wait up to 2s for chat grid before search fallback

When the chat grid hasn't rendered yet (cold CDP connection, post-reload),
isVisible() returned false immediately and the search fallback kicked in.
For short or generic chat names, search matches many rows and picks the
wrong one. Waiting up to 2s for the grid gives the primary, deterministic
path a real chance before resorting to search."
```

---

## Task 3: Propagate `--index` disambiguation into search fallback

**Files:**
- Modify: `lib/commands.js:56-95` (search fallback branch)

- [ ] **Step 1: Write failing test**

Append to `test/navigate.test.js`:

```javascript
test("search fallback supports --index when multiple exact matches", async () => {
  // Two chats with identical name, only visible via search.
  const searchAria = `
- grid:
    - row:
      - gridcell "Ferragosto 10:00"
    - row:
      - gridcell "Ferragosto 11:30"
`;
  const page = makeFakePage({
    gridVisibleAfterMs: 10000,
    searchAria,
    headerAria: 'button "Ferragosto"',
  });

  // Without --index, must throw with a disambiguation message:
  await assert.rejects(
    () => navigateToChat(page, "Ferragosto", null),
    /Multiple chats named "Ferragosto" found/,
  );

  // With --index, must select the Nth result:
  await navigateToChat(page, "Ferragosto", null, 2);
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/navigate.test.js`
Expected: FAIL — current code picks the first match silently.

- [ ] **Step 3: Apply disambiguation logic in search branch**

Replace lines 72-90 of `lib/commands.js`. Current:

```javascript
  // Parse search results for exact name match
  const searchAria = await page.locator(":root").ariaSnapshot();
  const searchResults = parseSearchResults(searchAria, localeConfig);
  const searchMatch = searchResults.find((c) => c.name === chatName);
  if (!searchMatch) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found (no exact match in search results)`);
  }

  const searchGrid = page.getByRole("grid").first();
  const searchRow = searchGrid.getByRole("row").filter({
    has: page.getByRole("gridcell", { name: searchMatch._gridcellLabel, exact: true }),
  }).first();
```

New:

```javascript
  // Parse search results for exact name matches (may be >1)
  const searchAria = await page.locator(":root").ariaSnapshot();
  const searchResults = parseSearchResults(searchAria, localeConfig);
  const searchMatches = searchResults.filter((c) => c.name === chatName);
  if (searchMatches.length === 0) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found (no exact match in search results)`);
  }
  if (searchMatches.length > 1 && index === undefined) {
    const list = searchMatches.map((c, i) => `  ${i + 1}. ${c.name} (${c.time}) — ${c.lastMessage ?? ""}`).join("\n");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(
      `Multiple chats named "${chatName}" found:\n${list}\nUse --index N to select one (1-based).`,
    );
  }
  if (searchMatches.length > 1 && (!Number.isInteger(index) || index < 1 || index > searchMatches.length)) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`--index ${index} is out of range (${searchMatches.length} matches for "${chatName}")`);
  }
  const searchMatch = searchMatches.length > 1 ? searchMatches[index - 1] : searchMatches[0];

  const searchGrid = page.getByRole("grid").first();
  const searchRow = searchGrid.getByRole("row").filter({
    has: page.getByRole("gridcell", { name: searchMatch._gridcellLabel, exact: true }),
  }).first();
```

- [ ] **Step 4: Run test, confirm pass**

Run: `node --test test/navigate.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite + smoke test**

```bash
npm test
node greentap.js send "SomeRareName" "hello" --index 1  # sanity-check CLI still parses --index for send
```

- [ ] **Step 6: Commit**

```bash
git add lib/commands.js test/navigate.test.js
git commit -m "feat(navigate): support --index in search fallback

Previously, if duplicate chat names existed only in search results
(not in the visible chat list), the first match was silently chosen.
Now duplicates raise the same disambiguation error as the grid path."
```

---

## Release

```bash
git tag v0.3.3
git push origin v0.3.3
gh release create v0.3.3 \
  --title "v0.3.3 — navigateToChat determinism" \
  --notes "**Fixes**
- Wait up to 2s for chat grid before falling back to search — eliminates non-deterministic routing on cold connections
- \`--index N\` now works when duplicate chats appear only in search results (previously first match was silently chosen)"
```
