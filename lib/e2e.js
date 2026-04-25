/**
 * greentap e2e — round-trip verification against the sandbox chat.
 *
 * Invoked via `GREENTAP_E2E=1 node greentap.js e2e`. Runs ordered stages;
 * first failure aborts. Output is structural JSON (counts, paths, bool)
 * — no message content is logged.
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import * as commands from "./commands.js";
import { isE2EMode } from "./e2e-guard.js";

const GREENTAP_DIR = join(homedir(), ".greentap");
const LAST_RUN_FILE = join(GREENTAP_DIR, "e2e-last-run");
const RATE_LIMIT_MS = 60_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PNG = join(__dirname, "..", "test", "fixtures", "e2e", "sample.png");

function now() { return Date.now(); }

/**
 * Pre-flight: confirm the sandbox group is reachable by navigating to it.
 *
 * Earlier approaches via `chats()` (viewport-bound) or `search()` (its
 * `textbox.first()` falls onto the compose textbox when a chat is
 * already open) were both unreliable. Instead, just call `navigateToChat`
 * directly — its R5 fast-path is a no-op if we're already in the
 * sandbox, otherwise its grid-or-search logic handles cold state. If
 * navigation succeeds, the sandbox exists and is open; if it throws
 * "Chat not found", preflight fails with the same error path.
 *
 * Side effect: stages 2-4 begin with the sandbox chat already open.
 * That's fine — `send`/`read`/`fetchImages` are now re-entrant safe.
 */
async function stagePreflight(page, localeConfig) {
  const start = now();
  const sandbox = process.env.GREENTAP_E2E_CHAT || "greentap-sandbox";
  try {
    await commands.navigateToChat(page, sandbox, localeConfig);
    return {
      stage: "preflight",
      pass: true,
      duration_ms: now() - start,
    };
  } catch (err) {
    return {
      stage: "preflight",
      pass: false,
      duration_ms: now() - start,
      error:
        `sandbox '${sandbox}' not reachable: ${err.message}. ` +
        `Ensure a WhatsApp group named '${sandbox}' exists with only the maintainer as member.`,
    };
  }
}

function checkRateLimit() {
  if (process.env.GREENTAP_E2E_SKIP_RATE_LIMIT === "1") return null;
  if (!existsSync(LAST_RUN_FILE)) return null;
  try {
    const last = parseInt(readFileSync(LAST_RUN_FILE, "utf8").trim(), 10);
    if (!Number.isFinite(last)) return null;
    const ago = now() - last;
    if (ago < RATE_LIMIT_MS) {
      return Math.ceil((RATE_LIMIT_MS - ago) / 1000);
    }
  } catch { /* ignore */ }
  return null;
}

function writeLastRun() {
  mkdirSync(GREENTAP_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(LAST_RUN_FILE, String(now()), { mode: 0o600 });
}

/**
 * Hard-reset the page state. WA's image-preview overlay can linger after
 * setInputFiles/Enter and intercept clicks on the compose box for the
 * next stage. Pressing Escape repeatedly is unreliable — Escape can open
 * unintended menus (verified empirically: 5x Escape from clean state
 * opens 1 dialog). page.reload() is heavier (~3s) but gives a clean,
 * authenticated chat-list state from which navigateToChat works
 * deterministically.
 */
async function resetPageState(page) {
  try {
    await page.reload();
    // Wait for chat list grid to be back. 15s upper bound covers cold
    // WA loads; in steady state it's <2s.
    await page.getByRole("grid").first().waitFor({ timeout: 15000 });
  } catch { /* fall through; the next stage will surface the error */ }
}

/**
 * Attach the fixture image and send.
 *
 * Earlier attempts called setInputFiles on the first
 * `input[type="file"][accept*="image"]` in the page — that turned out
 * to be the STICKER input, not the photo input. The fixture would be
 * sent as an animated sticker rather than a photo.
 *
 * Correct flow:
 *   1. Click "Allega" — the first button in contentinfo's compose toolbar.
 *   2. The attach menu pops up with 8 items: Documento, Foto e video,
 *      Fotocamera, Audio, Contatto, Sondaggio, Evento, Nuovo sticker.
 *      Item 1 (icon `ic-filter-filled`) is "Photos & Videos". Picking
 *      by icon name (visible in the menuitem's textContent) is
 *      locale-agnostic and avoids accidentally selecting Nuovo sticker
 *      (icon `wds-ic-sticker-*`).
 *   3. Clicking that menuitem fires a native filechooser. Playwright
 *      intercepts via `page.waitForEvent("filechooser")`. setFiles on
 *      the chooser populates the photo preview dialog.
 *   4. Enter submits the preview.
 */
async function sendFixtureImage(page, sandbox, fixturePath, localeConfig) {
  await commands.navigateToChat(page, sandbox, localeConfig);

  // Open the attach menu.
  const allegaButton = page
    .getByRole("contentinfo")
    .getByRole("button")
    .first();
  await allegaButton.click({ timeout: 5000 });
  await new Promise((r) => setTimeout(r, 500));

  // Find the "Photos & Videos" menuitem by icon name (locale-agnostic).
  // ic-filter-filled is unique to that item in current WA Web; stickers
  // use wds-ic-sticker-*, document uses ic-description-*, etc.
  // Assert uniqueness — if WA ever adds a second menuitem with the same
  // icon, fail loudly rather than silently picking the first match
  // (could be the wrong one).
  const photosMatch = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    const indices = items
      .map((m, i) => (/ic-filter-filled/.test(m.textContent || "") ? i : -1))
      .filter((i) => i >= 0);
    return { indices, total: items.length };
  });
  if (photosMatch.indices.length === 0) {
    throw new Error(
      "Photos & Videos menuitem (icon ic-filter-filled) not found in attach menu",
    );
  }
  if (photosMatch.indices.length > 1) {
    throw new Error(
      `ic-filter-filled matched ${photosMatch.indices.length} menuitems (expected 1) — WA UI may have changed; refusing to guess`,
    );
  }
  const photosIdx = photosMatch.indices[0];

  // Set up the filechooser intercept BEFORE clicking — the click fires
  // the event synchronously.
  const fcPromise = page.waitForEvent("filechooser", { timeout: 8000 });
  await page.getByRole("menuitem").nth(photosIdx).click();
  const fileChooser = await fcPromise;
  await fileChooser.setFiles(fixturePath);

  // Preview dialog mounts; Enter submits (locale-agnostic).
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 1500));
}

async function stageText(page, localeConfig, sandbox) {
  const start = now();
  const marker = `e2e-probe-${randomUUID()}`;
  try {
    await commands.send(page, sandbox, marker, localeConfig);
  } catch (err) {
    return { stage: "text", pass: false, duration_ms: now() - start, error: `send failed: ${err.message}` };
  }
  await new Promise((r) => setTimeout(r, 1500));
  let messages;
  try {
    messages = await commands.read(page, sandbox, { localeConfig });
  } catch (err) {
    return { stage: "text", pass: false, duration_ms: now() - start, error: `read failed: ${err.message}` };
  }
  const hit = messages.find((m) => m.text && m.text.includes(marker));
  const pass = Boolean(hit && hit.sender === "You");
  return {
    stage: "text",
    pass,
    duration_ms: now() - start,
    messagesInspected: messages.length,
    error: pass ? undefined : `marker '${marker}' not round-tripped`,
  };
}

async function stageImage(page, localeConfig, sandbox) {
  const start = now();
  if (!existsSync(FIXTURE_PNG)) {
    return {
      stage: "image",
      pass: false,
      duration_ms: now() - start,
      error: `fixture missing: ${FIXTURE_PNG}`,
    };
  }

  // Snapshot the imageId set BEFORE the send so we can detect the new
  // arrival rather than just "any image exists" (which would let an
  // attached-but-not-sent fixture pass on top of stale chat history).
  let beforeIds = new Set();
  try {
    const beforeAria = await page.locator(":root").ariaSnapshot();
    const beforeMsgs = (await import("./parser.js")).parseMessages(beforeAria, { localeConfig });
    beforeIds = new Set(
      beforeMsgs.filter((m) => m.kind === "image").map((m) => m.imageId),
    );
  } catch { /* if parser snapshot fails, fall back to "any image" check */ }

  try {
    await sendFixtureImage(page, sandbox, FIXTURE_PNG, localeConfig);
  } catch (err) {
    return {
      stage: "image",
      pass: false,
      duration_ms: now() - start,
      error: `attach+send failed: ${err.message}`,
    };
  }
  await new Promise((r) => setTimeout(r, 3000));

  // Re-parse to find the newly added image message.
  let newImageId = null;
  try {
    const afterAria = await page.locator(":root").ariaSnapshot();
    const afterMsgs = (await import("./parser.js")).parseMessages(afterAria, { localeConfig });
    const newImg = afterMsgs
      .filter((m) => m.kind === "image" && !beforeIds.has(m.imageId))
      .pop();
    newImageId = newImg?.imageId ?? null;
  } catch { /* fall through; downloads check below covers the case */ }

  if (!newImageId) {
    return {
      stage: "image",
      pass: false,
      duration_ms: now() - start,
      error:
        "no new image-kind message detected after attach+send — likely the file input did not submit (preview overlay stuck or wrong input targeted)",
    };
  }

  let downloads;
  try {
    downloads = await commands.fetchImages(page, sandbox, {
      localeConfig,
      limit: 1,
    });
  } catch (err) {
    return {
      stage: "image",
      pass: false,
      duration_ms: now() - start,
      newImageId,
      error: `fetchImages failed: ${err.message}`,
    };
  }
  // Match the just-sent image by imageId. fetchImages with limit:1
  // returns the most-recent image-kind message, so it should match.
  const top = downloads.find((d) => d.imageId === newImageId) ?? downloads[0];
  const pass = Boolean(
    top && top.path && !top.error && top.imageId === newImageId,
  );
  return {
    stage: "image",
    pass,
    duration_ms: now() - start,
    newImageId,
    imagePath: top?.path ?? null,
    mimeType: top?.mimeType ?? null,
    // Surfaced for the agent caller: after stage passes, the runtime
    // operator (or supervising agent) is expected to Read() the path
    // and confirm the fixture text is legible. CONTRIBUTING.md docs
    // this as the multimodal verification step.
    multimodalCheck: pass
      ? "Read the imagePath and confirm 'GREENTAP-E2E' is legible"
      : null,
    error: pass
      ? undefined
      : top?.error ?? "fetched image does not match newImageId",
  };
}

async function stageLink(page, localeConfig, sandbox) {
  const start = now();
  const marker = randomUUID();
  const url = `https://example.com/e2e-${marker}`;
  try {
    await commands.send(page, sandbox, url, localeConfig);
  } catch (err) {
    return {
      stage: "link",
      pass: false,
      duration_ms: now() - start,
      error: `send failed: ${err.message}`,
    };
  }
  // Preview rendering not always immediate.
  await new Promise((r) => setTimeout(r, 2000));

  let messages;
  try {
    messages = await commands.read(page, sandbox, {
      localeConfig,
      withLinks: true,
    });
  } catch (err) {
    return {
      stage: "link",
      pass: false,
      duration_ms: now() - start,
      error: `read failed: ${err.message}`,
    };
  }
  const hit = messages.find(
    (m) =>
      m.links && m.links.some((l) => l.href && l.href.includes(marker)),
  );
  const pass = Boolean(hit);
  // Surface the actual matching href, not just links[0] — if a message
  // has multiple links the marker could be at a higher index.
  const matchingHref =
    hit && hit.links.find((l) => l.href.includes(marker))?.href;
  return {
    stage: "link",
    pass,
    duration_ms: now() - start,
    messagesInspected: messages.length,
    hrefFound: matchingHref ?? null,
    error: pass
      ? undefined
      : `marker '${marker}' not found in any message's links[]`,
  };
}

/**
 * Runs the full e2e sequence. Returns { pass, exitCode, stages, rateLimitedForSec? }.
 * exitCode: 0 pass, 1 fail, 2 sandbox missing, 3 rate limited.
 */
export async function runE2E({ page, localeConfig }) {
  if (!isE2EMode()) {
    return {
      pass: false,
      exitCode: 1,
      stages: [{ stage: "init", pass: false, error: "GREENTAP_E2E=1 not set" }],
    };
  }

  const rateSec = checkRateLimit();
  if (rateSec !== null) {
    return { pass: false, exitCode: 3, rateLimitedForSec: rateSec, stages: [] };
  }

  const stages = [];
  const sandbox = process.env.GREENTAP_E2E_CHAT || "greentap-sandbox";

  // Reset page to a known clean state. Previous CLI invocations may
  // have left attachment previews, search overlays, or menus open.
  await resetPageState(page);

  const pre = await stagePreflight(page, localeConfig);
  stages.push(pre);
  if (!pre.pass) return { pass: false, exitCode: 2, stages };

  const text = await stageText(page, localeConfig, sandbox);
  stages.push(text);
  if (!text.pass) return { pass: false, exitCode: 1, stages };

  const image = await stageImage(page, localeConfig, sandbox);
  stages.push(image);
  if (!image.pass) return { pass: false, exitCode: 1, stages };

  // After image stage, WA leaves the attachment-preview overlay state
  // partially mounted (verified: Escape opens unintended dialogs from
  // clean state, so we can't dismiss). Reload page → clean compose.
  await resetPageState(page);

  const link = await stageLink(page, localeConfig, sandbox);
  stages.push(link);
  if (!link.pass) return { pass: false, exitCode: 1, stages };

  writeLastRun();
  return { pass: true, exitCode: 0, stages };
}
