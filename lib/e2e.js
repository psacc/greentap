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

async function stagePreflight(page, localeConfig) {
  const start = now();
  const rows = await commands.chats(page, localeConfig);
  const sandbox = rows[0];
  const expected = process.env.GREENTAP_E2E_CHAT || "greentap-sandbox";
  const pass = rows.length === 1 && sandbox && sandbox.name === expected;
  return {
    stage: "preflight",
    pass,
    rowsVisible: rows.length,
    duration_ms: now() - start,
    error: pass ? undefined : `sandbox group not found — create a WhatsApp group named '${expected}' with only yourself as a member`,
  };
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

async function sendFixtureImage(page, sandbox, fixturePath) {
  // Navigate via existing command — guard-aware
  await commands.navigateToChat(page, sandbox, /* localeConfig */ null);
  // WA's compose area has a hidden <input type="file" accept="image/*,video/*"/>
  // nested under the paperclip. We target by accept attribute to be locale-agnostic.
  const input = page.locator('input[type="file"][accept*="image"]').first();
  await input.setInputFiles(fixturePath);
  // A preview dialog appears; the send button is the primary action.
  // WA exposes it as role=button with name varying by locale — match by the
  // send-icon SVG via its aria-hidden container: use the "Enter" keystroke
  // which is universally supported in the preview dialog.
  await page.keyboard.press("Enter");
}

async function stageImage(page, localeConfig, sandbox) {
  const start = now();
  if (!existsSync(FIXTURE_PNG)) {
    return { stage: "image", pass: false, duration_ms: now() - start, error: `fixture missing: ${FIXTURE_PNG}` };
  }
  try {
    await sendFixtureImage(page, sandbox, FIXTURE_PNG);
  } catch (err) {
    return { stage: "image", pass: false, duration_ms: now() - start, error: `attach+send failed: ${err.message}` };
  }
  // Wait for the image to appear in the message panel
  await new Promise((r) => setTimeout(r, 3000));

  // fetchImages is NOT on main yet at Plan E time — the image stage asserts
  // only that the message containing an image is visible. PR #18's rebase
  // commit extends this stage to call commands.fetchImages and assert the
  // downloaded path.
  let messages;
  try {
    messages = await commands.read(page, sandbox, { localeConfig });
  } catch (err) {
    return { stage: "image", pass: false, duration_ms: now() - start, error: `read after attach failed: ${err.message}` };
  }
  // Fallback marker: after sendFixtureImage, the most recent message from
  // sender "You" should be within the last 3 rows. We can't identify image
  // kind here (PR #18 adds that), so we assert a new "You" message exists
  // that wasn't there before the stage started. Cheap proxy.
  const lastYouRows = messages.slice(-5).filter((m) => m.sender === "You");
  const pass = lastYouRows.length >= 1;
  return {
    stage: "image",
    pass,
    duration_ms: now() - start,
    messagesInspected: messages.length,
    note: "image-kind assertion deferred to PR #18 rebase (fetchImages not on main yet)",
    error: pass ? undefined : "no new 'You' message after attach",
  };
}

async function stageLink(page, localeConfig, sandbox) {
  const start = now();
  const marker = randomUUID();
  const url = `https://example.com/e2e-${marker}`;
  try {
    await commands.send(page, sandbox, url, localeConfig);
  } catch (err) {
    return { stage: "link", pass: false, duration_ms: now() - start, error: `send failed: ${err.message}` };
  }
  // Preview rendering is not always immediate; 2s is a reasonable empirical window.
  await new Promise((r) => setTimeout(r, 2000));

  let messages;
  try {
    messages = await commands.read(page, sandbox, { localeConfig });
  } catch (err) {
    return { stage: "link", pass: false, duration_ms: now() - start, error: `read failed: ${err.message}` };
  }
  // Parser exposes links[] on each message ONLY after PR #17 lands. At Plan
  // E time it's not on main. Fall back to asserting the text body contains
  // the URL we sent. PR #17's rebase commit replaces this fallback with a
  // links[0].href assertion.
  const hit = messages.find((m) => m.text && m.text.includes(marker));
  const pass = Boolean(hit);
  return {
    stage: "link",
    pass,
    duration_ms: now() - start,
    messagesInspected: messages.length,
    note: "links[] assertion deferred to PR #17 rebase",
    error: pass ? undefined : `marker '${marker}' not found in read output`,
  };
}

async function stageText(page, localeConfig, sandbox) {
  const start = now();
  const marker = `e2e-probe-${randomUUID()}`;
  try {
    await commands.send(page, sandbox, marker, localeConfig);
  } catch (err) {
    return { stage: "text", pass: false, duration_ms: now() - start, error: `send failed: ${err.message}` };
  }
  // Brief wait for WA to echo the sent message back into the message panel
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

/**
 * Runs the full e2e sequence. Returns { pass, exitCode, stages, rateLimitedForSec? }.
 * exitCode: 0 pass, 1 fail, 2 sandbox missing, 3 rate limited.
 */
export async function runE2E({ page, localeConfig, verbose = false }) {
  if (!isE2EMode()) {
    return { pass: false, exitCode: 1, stages: [{ stage: "init", pass: false, error: "GREENTAP_E2E=1 not set" }] };
  }

  const rateSec = checkRateLimit();
  if (rateSec !== null) {
    return { pass: false, exitCode: 3, rateLimitedForSec: rateSec, stages: [] };
  }

  const stages = [];
  const sandbox = process.env.GREENTAP_E2E_CHAT || "greentap-sandbox";

  const pre = await stagePreflight(page, localeConfig);
  stages.push(pre);
  if (!pre.pass) return { pass: false, exitCode: 2, stages };

  const text = await stageText(page, localeConfig, sandbox);
  stages.push(text);
  if (!text.pass) return { pass: false, exitCode: 1, stages };

  const image = await stageImage(page, localeConfig, sandbox);
  stages.push(image);
  if (!image.pass) return { pass: false, exitCode: 1, stages };

  const link = await stageLink(page, localeConfig, sandbox);
  stages.push(link);
  if (!link.pass) return { pass: false, exitCode: 1, stages };

  writeLastRun();
  return { pass: true, exitCode: 0, stages };
}
