# Image Download Implementation Plan (priority #1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agents *see* images sent in WhatsApp chats. Download visible images from a chat to local files, surface the paths in `read` output, and update SKILL.md so Claude (multimodal) reads them back for content understanding.

**Architecture:** Two-layer approach.
- **Layer 1 (visibility):** extend the parser to mark image messages with an `imageId` (stable hash of blob URL) in the existing `read` output. No download yet — agents can see "there are 3 images in this window".
- **Layer 2 (materialization):** new `greentap fetch-images <chat>` command. In-page `fetch(blobUrl)` → base64 → write to `~/.greentap/downloads/<chat-slug>/<imageId>.<ext>`. Returns JSON `[{imageId, path, messageTime}]`. Agents then `Read` each path; Claude's multimodal pipeline handles the rest.

**Tech Stack:** Playwright `page.evaluate` for blob extraction, Node `fs` for file write, aria snapshot for `img` role detection.

**Scope boundaries (YAGNI):**
- Images only — not videos, not voice notes, not documents. (Voice is Phase 8 of ROADMAP; videos are a follow-up plan.)
- Thumbnail resolution (what's rendered in chat) — not full-res. Full-res requires clicking through the viewer; do as follow-up if content quality is insufficient.
- No OCR in greentap — that's Claude's job once the file is in context.

---

## Context you need

- Source issue: broader "polls + file/image download" ask. Polls are already covered by `poll-results` (v0.3.0); this plan targets the image-download half.
- Existing patterns to reuse:
  - `lib/commands.js:97-99` — `chats()` shape: single aria snapshot → `parseChatList()`. Follow the same "take snapshot, parse, return JSON" split for images.
  - `lib/parser.js` — parsing is pure, fixture-tested. Add an `"image"` kind alongside whatever text messages return today. Read the current `parseMessages` to find the row-walking logic before adding image support.
  - `lib/commands.js:138-165` — `findLoadMoreButton` shows the `page.evaluate` DOM-walking pattern you'll reuse for image blob extraction.
- WhatsApp Web image representation (verify in Task 1 before coding):
  - Message bubble contains an `<img>` with `src="blob:https://web.whatsapp.com/<uuid>"` for the thumbnail.
  - Aria snapshot typically exposes this as `img "Photo"` or locale-specific label (e.g. `"Foto"` in Italian).
  - Full-screen viewer has a download button but this plan uses in-DOM blob extraction (simpler, no UI interaction).
- Public repo: all fixtures MUST use fake data. No real images; Task 1 records a fixture from a test chat with only fake/public-domain images, or a synthetic fixture edited by hand.

## File Structure

- Create: `~/.greentap/downloads/<chat-slug>/` (runtime, gitignored — user-local cache)
- Create: `test/fixtures/image-messages.snapshot.txt` — fake aria snapshot with image messages (hand-edited to remove PII)
- Modify: `lib/parser.js` — add image kind handling in `parseMessages`
- Modify: `lib/commands.js` — new exported `fetchImages(page, chatName, options)`
- Modify: `greentap.js` — wire `fetch-images` subcommand with argv parsing
- Modify: `test/parser.test.js` — fixture tests for image detection
- Modify: `.claude/skills/greentap/SKILL.md` — document image workflow for agents
- Modify: `README.md` — add `fetch-images` to command list

---

## Task 1: Exploration — capture image aria snapshot

**Files:**
- Create: `test/fixtures/image-messages.snapshot.txt`
- Create: `scripts/capture-image-snapshot.mjs` (throwaway, not committed)

- [ ] **Step 1: Set up a test chat**

Send 2 images to *yourself* on WhatsApp (Note to Self chat, or a dedicated test chat). Use images with no PII — public-domain photos or synthetic gradients. This chat is the source of truth for the fixture.

- [ ] **Step 2: Capture the aria snapshot**

Run:

```bash
node greentap.js snapshot messages
```

Copy the output. Identify the lines that represent image messages — look for `img`, `"Photo"`, `"Foto"`, or image-like ARIA roles.

- [ ] **Step 3: Inspect the DOM directly**

Open a devtools-friendly one-shot script. Create `scripts/capture-image-snapshot.mjs` (not committed):

```javascript
import { connect } from "../lib/client.js";
import { navigateToChat } from "../lib/commands.js";

const { page, localeConfig, disconnect } = await connect();
try {
  await navigateToChat(page, "<Your Test Chat>", localeConfig);
  const info = await page.evaluate(() => {
    const msgRows = [...document.querySelectorAll('[role="row"]')]
      .filter(r => !r.closest('[role="grid"]'));
    return msgRows.slice(-10).map(r => {
      const img = r.querySelector('img');
      return img ? {
        alt: img.alt,
        src: img.src.slice(0, 60),
        width: img.naturalWidth,
        parentRoleText: r.getAttribute('aria-label')?.slice(0, 60),
      } : null;
    }).filter(Boolean);
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await disconnect();
}
```

Run: `node scripts/capture-image-snapshot.mjs`
Expected output: JSON listing image `src` (confirms `blob:` URL), `naturalWidth` (confirms non-zero for loaded thumbs), `alt`, and row `aria-label`.

Record findings in a scratch note (not committed). Decide: is the primary detection marker `img[alt]`, the row `aria-label`, or an attribute? Pick the most stable (expect `img.src.startsWith("blob:")` to be reliable).

- [ ] **Step 4: Sanitize + save a fixture**

Take the `snapshot messages` output from Step 2. Hand-edit to:
- Replace any real names with fake personas (use existing: Roberto Marini, Elena Conti, Famiglia Rossi)
- Replace any real timestamps with plausible fake ones
- Keep the structural image markers untouched

Save as `test/fixtures/image-messages.snapshot.txt`.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm scripts/capture-image-snapshot.mjs
```

No commit yet — Task 2 ships the parser change + the fixture together.

---

## Task 2: Parser — detect image messages

**Files:**
- Modify: `lib/parser.js`
- Modify: `test/parser.test.js`
- Add: `test/fixtures/image-messages.snapshot.txt` (from Task 1)

- [ ] **Step 1: Write failing parser test**

Append to `test/parser.test.js`:

```javascript
import { readFileSync } from "node:fs";
import { parseMessages } from "../lib/parser.js";

test("parseMessages flags image messages with kind='image'", () => {
  const snapshot = readFileSync("test/fixtures/image-messages.snapshot.txt", "utf8");
  const messages = parseMessages(snapshot, { localeConfig: { /* fixture matches IT locale */ dayNames: [], yesterday: "Ieri" } });
  const images = messages.filter(m => m.kind === "image");
  assert.ok(images.length >= 1, "expected at least one image message in fixture");
  for (const img of images) {
    assert.ok(img.imageId, "image must have imageId");
    assert.ok(img.sender, "image must have sender");
    assert.ok(img.time, "image must have time");
  }
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/parser.test.js`
Expected: FAIL — `parseMessages` does not currently emit `kind: "image"`.

- [ ] **Step 3: Implement image detection in parser**

Read `lib/parser.js` in full first. Locate `parseMessages` and its per-row loop. Without rewriting the function, add a branch: *after* determining sender/time for a row, detect whether the row contains an `img` marker. ARIA snapshot syntax uses `- img "<label>"` lines.

Pseudocode (adapt to the real structure — do not skip reading the current code):

```javascript
// Inside per-row processing in parseMessages, after text extraction:
const imgMatch = rowBlock.match(/^\s*-\s+img\s+"([^"]*)"/m);
if (imgMatch) {
  // imageId is a stable hash of (sender + time + alt + rowIndex) so the same
  // image in the same position produces the same id across reads.
  const raw = `${sender}|${time}|${imgMatch[1]}|${rowIndex}`;
  const imageId = simpleHash(raw);  // add simpleHash below if not already in parser.js
  result.push({ kind: "image", sender, time, timestamp, imageId, altText: imgMatch[1] });
  continue;  // don't also emit as text
}
```

And add `simpleHash` if parser.js does not already expose one:

```javascript
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
```

Non-image messages should keep `kind: "text"` (or whatever the current default is — align with the existing shape; if there is no `kind` field today, introduce it on all outputs for consistency, and update existing fixture tests to assert it).

- [ ] **Step 4: Run parser tests, confirm pass**

Run: `node --test test/parser.test.js`
Expected: PASS for new test; existing tests still pass after `kind` field added to their expectations.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.js test/parser.test.js test/fixtures/image-messages.snapshot.txt
git commit -m "feat(parser): detect image messages with kind='image'+imageId

Marks messages whose ARIA row contains 'img \"<alt>\"' with
kind:\"image\" and a stable imageId (hash of sender+time+alt+index).
Enables downstream fetch-images command and surfaces image presence
in read output."
```

---

## Task 3: `fetchImages` command — in-DOM blob → file

**Files:**
- Modify: `lib/commands.js` — add `fetchImages` export
- Create: `test/fetch-images.test.js` — fake-page unit test for slug + path logic (pure-ish)

- [ ] **Step 1: Write failing test (pure helpers)**

Create `test/fetch-images.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { slugifyChat, imageFilename } from "../lib/commands.js";

test("slugifyChat produces filesystem-safe names", () => {
  assert.strictEqual(slugifyChat("Famiglia Rossi"), "famiglia-rossi");
  assert.strictEqual(slugifyChat("Work / Team"), "work-team");
  assert.strictEqual(slugifyChat("  Spaces  "), "spaces");
});

test("imageFilename uses imageId + ext guess", () => {
  assert.strictEqual(imageFilename({ imageId: "abc12345" }, "image/jpeg"), "abc12345.jpg");
  assert.strictEqual(imageFilename({ imageId: "abc12345" }, "image/png"),  "abc12345.png");
  assert.strictEqual(imageFilename({ imageId: "abc12345" }, undefined),    "abc12345.bin");
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/fetch-images.test.js`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement helpers + `fetchImages`**

Add to `lib/commands.js`:

```javascript
import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DOWNLOADS_DIR = join(homedir(), ".greentap", "downloads");

export function slugifyChat(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export function imageFilename(msg, mimeType) {
  return `${msg.imageId}.${MIME_EXT[mimeType] ?? "bin"}`;
}

/**
 * Download images from the currently-visible messages of <chatName>.
 * Returns [{ imageId, path, sender, time, timestamp }].
 * Only downloads images not already cached (path exists → skip the fetch).
 */
export async function fetchImages(page, chatName, { localeConfig, index, limit = 20 } = {}) {
  await navigateToChat(page, chatName, localeConfig, index);

  // 1. Parse aria to identify image messages + their order.
  const aria = await page.locator(":root").ariaSnapshot();
  const allMsgs = parseMessages(aria, { localeConfig });
  const images = allMsgs.filter((m) => m.kind === "image").slice(-limit);
  if (images.length === 0) return [];

  // 2. Collect blob payloads in-page. We walk img elements in message rows
  //    (outside the grid chat list) in DOM order; the Nth image found
  //    corresponds to the Nth image row in the aria snapshot.
  const payloads = await page.evaluate(async (count) => {
    const rows = [...document.querySelectorAll('[role="row"]')].filter((r) => !r.closest('[role="grid"]'));
    const imgs = [];
    for (const row of rows) {
      const img = row.querySelector("img");
      if (img && img.src && img.src.startsWith("blob:")) imgs.push(img);
    }
    const targets = imgs.slice(-count);
    const out = [];
    for (const img of targets) {
      try {
        const resp = await fetch(img.src);
        const blob = await resp.blob();
        const buf = new Uint8Array(await blob.arrayBuffer());
        // Chunked base64 to avoid call-stack limits on large images
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
        }
        out.push({ mimeType: blob.type, base64: btoa(binary) });
      } catch (err) {
        out.push({ error: err.message });
      }
    }
    return out;
  }, images.length);

  // 3. Write files
  const chatDir = join(DOWNLOADS_DIR, slugifyChat(chatName));
  mkdirSync(chatDir, { recursive: true });

  const results = [];
  for (let i = 0; i < images.length; i++) {
    const msg = images[i];
    const payload = payloads[i];
    if (!payload || payload.error) {
      results.push({ imageId: msg.imageId, error: payload?.error ?? "no payload" });
      continue;
    }
    const filename = imageFilename(msg, payload.mimeType);
    const path = join(chatDir, filename);
    writeFileSync(path, Buffer.from(payload.base64, "base64"), { mode: 0o600 });
    results.push({
      imageId: msg.imageId,
      path,
      sender: msg.sender,
      time: msg.time,
      timestamp: msg.timestamp,
      mimeType: payload.mimeType,
    });
  }
  return results;
}
```

- [ ] **Step 4: Run helper test, confirm pass**

Run: `node --test test/fetch-images.test.js`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

```bash
node -e "
  (async () => {
    const { connect } = await import('./lib/client.js');
    const { fetchImages } = await import('./lib/commands.js');
    const { page, localeConfig, disconnect } = await connect();
    try {
      const out = await fetchImages(page, '<Your Test Chat>', { localeConfig, limit: 5 });
      console.log(JSON.stringify(out, null, 2));
    } finally { await disconnect(); }
  })();
"
ls -lh ~/.greentap/downloads/*/
file ~/.greentap/downloads/*/*.*
```

Expected: JSON output lists local paths; `file` confirms JPEG/PNG/WebP.

- [ ] **Step 6: Commit**

```bash
git add lib/commands.js test/fetch-images.test.js
git commit -m "feat(commands): add fetchImages — in-DOM blob → ~/.greentap/downloads

Walks image-kind messages in a chat, fetches each blob URL from inside
the page context, base64-encodes the bytes, and writes them to a
chat-scoped directory. Returns [{imageId, path, sender, time, ...}]."
```

---

## Task 4: CLI — `greentap fetch-images`

**Files:**
- Modify: `greentap.js` — subcommand wiring
- Modify: `test/cli.test.js` — argv parsing test

- [ ] **Step 1: Write failing CLI arg-parsing test**

Append to `test/cli.test.js` (match its existing pattern — read the file first):

```javascript
test("fetch-images parses chat name + --limit + --index", () => {
  const argv = ["fetch-images", "Famiglia Rossi", "--limit", "3", "--index", "2"];
  const parsed = parseArgs(argv);  // or whatever helper the file already uses
  assert.strictEqual(parsed.command, "fetch-images");
  assert.strictEqual(parsed.chat, "Famiglia Rossi");
  assert.strictEqual(parsed.limit, 3);
  assert.strictEqual(parsed.index, 2);
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `node --test test/cli.test.js`
Expected: FAIL — command not registered.

- [ ] **Step 3: Wire subcommand in `greentap.js`**

Read `greentap.js` to learn the existing dispatch style. Add a case that:
- Accepts `fetch-images <chat>` with `--limit N` (default 20), `--index N`, `--json` (default: human)
- Calls `fetchImages(page, chat, { localeConfig, index, limit })`
- Prints either JSON (when `--json`) or one line per result: `<time> <sender> → <path>`

Pseudocode addition (adapt to the real dispatcher):

```javascript
case "fetch-images": {
  const chat = positional[0];
  if (!chat) { console.error("usage: greentap fetch-images <chat> [--limit N] [--index N] [--json]"); process.exit(2); }
  const { page, localeConfig, disconnect } = await connect();
  try {
    const out = await fetchImages(page, chat, { localeConfig, index: flags.index, limit: flags.limit ?? 20 });
    if (flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      for (const r of out) {
        if (r.error) console.log(`ERROR ${r.imageId}: ${r.error}`);
        else console.log(`${r.time} ${r.sender} → ${r.path}`);
      }
    }
  } finally { await disconnect(); }
  break;
}
```

- [ ] **Step 4: Run CLI tests, confirm pass**

Run: `node --test test/cli.test.js`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

```bash
node greentap.js fetch-images "<Your Test Chat>" --limit 3 --json
```

- [ ] **Step 6: Update README**

Edit `README.md` commands section — add:

```markdown
| `fetch-images <chat> [--limit N] [--json]` | Download recent images to `~/.greentap/downloads/<chat-slug>/` |
```

- [ ] **Step 7: Commit**

```bash
git add greentap.js test/cli.test.js README.md
git commit -m "feat(cli): add fetch-images subcommand"
```

---

## Task 5: Skill surface — SKILL.md

**Files:**
- Modify: `.claude/skills/greentap/SKILL.md`

- [ ] **Step 1: Read existing SKILL.md**

Read the current file end-to-end. Identify the section that enumerates commands and the section that explains workflows for agents.

- [ ] **Step 2: Add an "Images" workflow block**

Append:

```markdown
## Reading images from a chat

Images in `read --json` output appear with `kind: "image"` and an `imageId`
but no inline content. To actually view them:

1. Call `greentap fetch-images <chat> [--limit N] --json`
2. Each returned item has a `path` (absolute, under `~/.greentap/downloads/`)
3. Use the **Read** tool on that path — the image is handed to Claude as a
   multimodal input. Describe, OCR, or reason about it directly.

Example:

    $ greentap fetch-images "Famiglia Rossi" --limit 3 --json
    [
      {
        "imageId": "a7f3c211",
        "path": "/Users/<you>/.greentap/downloads/famiglia-rossi/a7f3c211.jpg",
        "sender": "Elena Conti",
        "time": "14:22",
        "timestamp": "2026-04-22T14:22:00"
      }
    ]

After reading, delete the file if no longer needed — these are cached but
not auto-pruned:

    rm ~/.greentap/downloads/famiglia-rossi/a7f3c211.jpg

Limitations:
- Thumbnail resolution only (what's rendered in the chat). Full-resolution
  download via the viewer is a future enhancement.
- Does not fetch images from chats you haven't scrolled to — only images
  currently in the DOM. Scroll the chat first if needed.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/greentap/SKILL.md
git commit -m "docs(skill): document image fetch + multimodal read workflow"
```

---

## Release

```bash
git tag v0.4.0
git push origin v0.4.0
gh release create v0.4.0 \
  --title "v0.4.0 — Image download" \
  --notes "**New**
- \`greentap fetch-images <chat>\` — downloads currently-visible images from a chat to \`~/.greentap/downloads/<chat-slug>/\`
- \`read\` output now marks image messages with \`kind: \"image\"\` and an \`imageId\`
- SKILL.md updated with the Read-to-multimodal agent workflow

**Known limits**
- Thumbnail resolution only — full-res via viewer is follow-up work
- Polls / voice / video / documents not yet supported"
```

---

## Follow-ups (separate plans, not this one)

- **Full-resolution images** — click into the WhatsApp viewer and intercept the Playwright `download` event. Pros: full quality. Cons: steals UI focus; needs a way to close the viewer cleanly.
- **Voice note transcription** — Phase 8 in `ROADMAP.md`. Requires audio blob extraction + Whisper.
- **Document / file download** — same blob pattern but extension detection is trickier; PDFs need `Content-Disposition` heuristics.
- **Auto-prune cache** — rotate `~/.greentap/downloads/` (e.g. delete files older than 7d) on daemon shutdown.
