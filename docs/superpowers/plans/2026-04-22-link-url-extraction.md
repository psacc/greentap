# Link URL Extraction Implementation Plan (priority #1, tied with Image Download)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover full URLs for link-preview cards in chat messages. Today, `read --json` returns only the visible text of the preview (domain truncated, path missing). Agents can't follow the link. Fix: resolve hrefs from the DOM and attach them to each message as a `links: [{href, text}]` array.

**Architecture:** Keep the ARIA-based parser unchanged (URLs are not in ARIA text). In `lib/commands.js`, after the parser produces its message list, run a single `page.evaluate` pass that:
1. Walks the message-panel rows in DOM order (same pattern as `findLoadMoreButton`).
2. For each row, extracts every `<a>` href + visible text.
3. Returns a parallel array indexed by row position.

The commands layer then merges: `messages[i].links = hrefsPerRow[i]`. One snapshot, one evaluate — no extra round-trips.

**Tech Stack:** Playwright `page.evaluate`, DOM `querySelectorAll`, existing `parseMessages` output (unchanged).

**Scope boundaries (YAGNI):**
- Only HTTP(S) hrefs. `mailto:`, `tel:`, `wa.me/`, and bare blob URLs are filtered out (or kept with a `scheme` field — decide in Task 2).
- No URL unshortening (no HEAD requests, no bit.ly expansion).
- No OG-metadata fetching — the preview card's title/description are already in the text; agents with a URL can fetch if needed.

---

## Context you need

- Source issue: URL truncation in message link previews. Repro: chat with a Google Doc link — aria shows only `docs.google.com` (truncated), full href missing.
- Why parser is unchanged: ARIA snapshot exposes `link "text"` but the *text* is what's visible (truncated domain). The actual `href` attribute is not in the ARIA representation. DOM inspection via `page.evaluate` is the only reliable source.
- Ordering guarantee: message rows in ARIA appear top-to-bottom in the same order as in the DOM. Indexing the DOM walk by row-position matches the parser output index — provided we filter the DOM walk identically (skip chat-list rows, skip overlays).
- Relevant existing code:
  - `lib/commands.js:111-135` — `findScrollContainer` walks rows not inside `[role="grid"]`. Use the same filter.
  - `lib/commands.js:260-267` — `read(page, chatName, ...)` is where the enrichment plugs in.

## File Structure

- Modify: `lib/commands.js` — add internal helper `collectRowLinks(page)`; call it inside `read` when not in scroll mode (Task 3 decides scroll-mode behavior)
- Modify: `test/parser.test.js` or new `test/links.test.js` — pure unit test for merge logic
- Modify: `.claude/skills/greentap/SKILL.md` — document the `links` field
- Modify: `README.md` — mention enriched output

Does NOT modify: `lib/parser.js`. This keeps the plan fully parallel with the image-download plan.

---

## Task 1: Exploration — confirm DOM structure of link messages

**Files:**
- Create: `scripts/capture-link-snapshot.mjs` (throwaway, not committed)

- [ ] **Step 1: Set up a test chat**

In your test chat (fake personas only), send two messages:
1. A bare URL: `https://example.com/some/long/path?q=1`
2. A URL that WhatsApp expands into a preview card: paste a Google Doc URL and wait for the thumbnail to render.

- [ ] **Step 2: Inspect DOM anchors**

Create `scripts/capture-link-snapshot.mjs` (throwaway):

```javascript
import { connect } from "../lib/client.js";
import { navigateToChat } from "../lib/commands.js";

const { page, localeConfig, disconnect } = await connect();
try {
  await navigateToChat(page, "<Your Test Chat>", localeConfig);
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')]
      .filter(r => !r.closest('[role="grid"]'));
    return rows.slice(-6).map((r, i) => ({
      i,
      textPreview: (r.textContent || "").trim().slice(0, 80),
      anchors: [...r.querySelectorAll('a[href]')].map(a => ({
        href: a.href,
        text: (a.textContent || "").trim().slice(0, 60),
      })),
    }));
  });
  console.log(JSON.stringify(info, null, 2));
} finally { await disconnect(); }
```

Run: `node scripts/capture-link-snapshot.mjs`

Expected observations (verify before proceeding):
- Bare URL message → one `<a>` with full `href` (not truncated).
- Preview-card message → typically *two* anchors: one wrapping the card image/thumbnail, one on the title/domain text. Both point to the same `href`. Plan must de-duplicate within a row (keep one per unique href).

- [ ] **Step 3: Decide URL filtering policy**

Look at the captured hrefs. Note any non-HTTP(S) schemes that appear (`mailto:`, `tel:`, `wa.me/`, image-viewer internal anchors). Decide:
- Keep only `http:` and `https:` (strictest, safest for a minimal viable feature).
- OR keep all and expose `scheme` field (more data, more noise).

Recommend the strict option. Document the choice in the parser helper comment.

- [ ] **Step 4: Delete the throwaway**

```bash
rm scripts/capture-link-snapshot.mjs
```

---

## Task 2: `collectRowLinks` helper + merge into `read`

**Files:**
- Modify: `lib/commands.js`
- Create: `test/links.test.js`

- [ ] **Step 1: Write failing test (pure merge logic)**

Create `test/links.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { mergeLinksIntoMessages } from "../lib/commands.js";

test("mergeLinksIntoMessages attaches links by row index", () => {
  const messages = [
    { sender: "Roberto Marini", time: "10:00", text: "hi" },
    { sender: "Elena Conti",    time: "10:01", text: "see docs.google.com" },
    { sender: "Roberto Marini", time: "10:02", text: "bye" },
  ];
  const linksPerRow = [
    [],
    [{ href: "https://docs.google.com/document/d/abc", text: "docs.google.com" }],
    [],
  ];
  const out = mergeLinksIntoMessages(messages, linksPerRow);
  assert.deepStrictEqual(out[0].links, []);
  assert.strictEqual(out[1].links[0].href, "https://docs.google.com/document/d/abc");
  assert.deepStrictEqual(out[2].links, []);
});

test("mergeLinksIntoMessages tolerates length mismatch (DOM and parser drift by 1)", () => {
  // If DOM has one more row than parser output (or vice versa), merge does
  // not crash: indexing beyond bounds yields [] links on affected messages.
  const messages = [{ sender: "a", time: "1", text: "x" }];
  const linksPerRow = [];
  const out = mergeLinksIntoMessages(messages, linksPerRow);
  assert.deepStrictEqual(out[0].links, []);
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/links.test.js`
Expected: FAIL — helper not exported.

- [ ] **Step 3: Implement helpers**

Add to `lib/commands.js`:

```javascript
/**
 * DOM-side extractor: returns links[][] — one array per message row,
 * in the same order as parseMessages yields rows. Anchors are filtered
 * to http(s) only and de-duplicated per row by href.
 */
export async function collectRowLinks(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')]
      .filter((r) => !r.closest('[role="grid"]'));
    return rows.map((row) => {
      const seen = new Map();
      for (const a of row.querySelectorAll("a[href]")) {
        const href = a.href;
        if (!/^https?:\/\//i.test(href)) continue;
        if (!seen.has(href)) {
          seen.set(href, { href, text: (a.textContent || "").trim() });
        }
      }
      return [...seen.values()];
    });
  });
}

/**
 * Pure merge: assign links[i] onto messages[i]. When lengths differ,
 * messages that lack a corresponding DOM row receive links=[].
 */
export function mergeLinksIntoMessages(messages, linksPerRow) {
  return messages.map((m, i) => ({ ...m, links: linksPerRow[i] ?? [] }));
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `node --test test/links.test.js`
Expected: PASS.

- [ ] **Step 5: Wire into `read`**

Edit `lib/commands.js:260-267`. Replace the existing `read` with:

```javascript
export async function read(page, chatName, { scroll = false, localeConfig, index, withLinks = true } = {}) {
  await navigateToChat(page, chatName, localeConfig, index);
  if (scroll) {
    // Scroll mode: skip link enrichment (rows cycle in/out of the DOM,
    // index correlation across iterations isn't reliable). Revisit as
    // a follow-up if demand warrants.
    return scrollAndCollect(page, localeConfig);
  }
  const aria = await page.locator(":root").ariaSnapshot();
  const messages = parseMessages(aria, { localeConfig });
  if (!withLinks) return messages;

  // Immediately collect DOM links while the same view is still mounted.
  try {
    const linksPerRow = await collectRowLinks(page);
    return mergeLinksIntoMessages(messages, linksPerRow);
  } catch {
    // If DOM walk fails for any reason, fall back to messages without links.
    return mergeLinksIntoMessages(messages, []);
  }
}
```

The `withLinks = true` default means existing callers get enrichment for free. Callers that want the old (cheaper) behavior can pass `{ withLinks: false }`.

- [ ] **Step 6: Backward-compat check for JSON contract tests**

Read `test/cli.test.js` — find any test that asserts on the exact shape of `read --json` output. If any test does `assert.deepStrictEqual(msg, { sender, time, text, ... })` without `links`, update those assertions to include `links: []` (or change to a property-subset check).

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Manual smoke**

```bash
node greentap.js read "<Your Test Chat>" --json | jq '.[] | select(.links | length > 0)'
```

Expected: the message with the Google Doc preview shows a full `docs.google.com/document/d/...` href.

- [ ] **Step 9: Commit**

```bash
git add lib/commands.js test/links.test.js test/cli.test.js
git commit -m "feat(read): extract link hrefs from DOM, merge into message JSON

ARIA snapshots only carry visible link text (truncated domains). This
adds a DOM walk via page.evaluate to recover full href values for each
message row, merged as \`links: [{href, text}]\` on the read output.
http(s) only, de-duplicated per row. Scroll mode unchanged for now."
```

---

## Task 3: Skill surface + README

**Files:**
- Modify: `.claude/skills/greentap/SKILL.md`
- Modify: `README.md`

- [ ] **Step 1: Update SKILL.md**

Find the `read` section. Append:

```markdown
### Link URLs in `read --json`

Each message includes a `links` array with full hrefs recovered from the
DOM (the ARIA text is often a truncated domain). Example:

    {
      "sender": "Elena Conti",
      "time": "10:01",
      "text": "see the latest draft here",
      "links": [
        {
          "href": "https://docs.google.com/document/d/1xyzAbC...",
          "text": "docs.google.com"
        }
      ]
    }

Only `http://` and `https://` URLs are exposed. Link enrichment runs in
non-scroll mode only — `read --scroll` currently omits the `links` field
from older messages.
```

- [ ] **Step 2: Update README**

Find the `read` row in the commands table. Append a note:

```markdown
> `read --json` now includes a `links` array on each message with full URLs
> recovered from the DOM (not just the truncated text).
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/greentap/SKILL.md README.md
git commit -m "docs(skill): document links[] field in read output"
```

---

## Release

Ship alongside the image-download feature (same minor release):

```bash
git tag v0.4.0  # if not already tagged by the image plan
git push origin v0.4.0
gh release create v0.4.0 \
  --title "v0.4.0 — Images + link URLs" \
  --notes "**New**
- \`read --json\` now returns a \`links: [{href, text}]\` array per message — full URLs recovered from the DOM instead of the truncated ARIA text
- \`greentap fetch-images <chat>\` — download currently-visible images (see image-download plan)

**Known limits**
- Link enrichment is off in \`read --scroll\` mode (DOM churn during scroll makes row-index correlation unreliable)
- http(s) only — mailto / tel / other schemes excluded"
```

> If Plan D (image download) ships first, retag its release as v0.3.2 and this one as v0.4.0. If they ship together (recommended), one tag covers both.

---

## Follow-ups (separate plans, not this one)

- **Links in scroll mode** — requires correlating DOM anchors with merged-dedup-by-time messages. Non-trivial; do only if a user hits it.
- **OG-metadata fetch** — `greentap enrich-link <url>` pulls title/description/image via server-side fetch. Separate because it's a different security domain (outbound HTTP to arbitrary hosts).
- **Link schemes beyond http(s)** — surface `mailto:` and `wa.me/` if users ask. Guard behind a flag.
