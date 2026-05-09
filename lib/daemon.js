#!/usr/bin/env node

/**
 * greentap daemon — background process holding a persistent Playwright browser context.
 * Exposes CDP on port 19222 for CLI clients to connect via connectOverCDP.
 *
 * Lifecycle:
 *   - Writes port + PID files atomically (before launch, so clients can
 *     wait for CDP without a race — see #13)
 *   - Launches Chromium (bundled with Playwright) with persistent context + CDP
 *   - Navigates to WhatsApp Web, waits for chat list
 *   - Monitors CDP connections to reset idle timer
 *   - Shuts down after 15min idle, SIGTERM, or browser crash
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  chmodSync,
  utimesSync,
  statSync,
} from "fs";

// GREENTAP_DIR and GREENTAP_CDP_PORT env vars exist for test isolation only.
// Production users should never set them — defaults are the documented paths.
const GREENTAP_DIR = process.env.GREENTAP_DIR || join(homedir(), ".greentap");
const USER_DATA_DIR = join(GREENTAP_DIR, "browser-data");
const PORT_FILE = join(GREENTAP_DIR, "daemon.port");
const PID_FILE = join(GREENTAP_DIR, "daemon.pid");
const HEARTBEAT_FILE = join(GREENTAP_DIR, "daemon.heartbeat");
const WA_URL = "https://web.whatsapp.com";
const CDP_PORT_DEFAULT = 19222;
const CDP_PORT = (() => {
  const raw = process.env.GREENTAP_CDP_PORT;
  if (!raw) return CDP_PORT_DEFAULT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return CDP_PORT_DEFAULT;
  return n;
})();
// GREENTAP_IDLE_TIMEOUT_MS / GREENTAP_HEARTBEAT_INTERVAL_MS exist for tests only.
const IDLE_TIMEOUT_MS = (() => {
  const raw = process.env.GREENTAP_IDLE_TIMEOUT_MS;
  if (!raw) return 15 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000;
})();
const HEARTBEAT_INTERVAL_MS = (() => {
  const raw = process.env.GREENTAP_HEARTBEAT_INTERVAL_MS;
  if (!raw) return 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 60 * 1000;
})();

let context = null;
let heartbeatTicker = null;

function writeAtomic(filePath, content) {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, filePath);
}

function cleanupFiles() {
  // Daemon only cleans port + PID + heartbeat files. Lock file is owned by the client.
  for (const f of [PORT_FILE, PID_FILE, HEARTBEAT_FILE]) {
    try {
      unlinkSync(f);
    } catch {
      // already gone
    }
  }
}

function touchHeartbeat() {
  // Update heartbeat mtime to "now". Create the file if missing.
  try {
    const now = new Date();
    utimesSync(HEARTBEAT_FILE, now, now);
  } catch {
    try {
      writeFileSync(HEARTBEAT_FILE, "", { mode: 0o600 });
    } catch {
      // best effort
    }
  }
}

function checkHeartbeat() {
  // Idle = no client touched the heartbeat file recently. The CDP-event-based
  // reset in the original implementation was a no-op (Target.attachedToTarget
  // never fires for external connectOverCDP clients on a session that only
  // called setDiscoverTargets), so the daemon died after exactly
  // IDLE_TIMEOUT_MS regardless of activity. Filesystem heartbeat is
  // protocol-agnostic and observable from tests.
  let mtimeMs;
  try {
    mtimeMs = statSync(HEARTBEAT_FILE).mtimeMs;
  } catch {
    // Heartbeat missing — recreate at "now" so we don't shut down on a
    // transient disk hiccup, but log so it's diagnosable.
    console.error("[daemon] heartbeat file missing; recreating");
    touchHeartbeat();
    return;
  }
  const ageMs = Date.now() - mtimeMs;
  if (ageMs >= IDLE_TIMEOUT_MS) {
    shutdown();
  }
}

async function shutdown() {
  if (heartbeatTicker) clearInterval(heartbeatTicker);
  try {
    if (context) await context.close();
  } catch {
    // browser may already be gone
  }
  cleanupFiles();
  process.exit(0);
}

async function main() {
  // Ensure ~/.greentap/ exists with 0700
  mkdirSync(GREENTAP_DIR, { recursive: true, mode: 0o700 });
  chmodSync(GREENTAP_DIR, 0o700);

  // Write port + PID files BEFORE launching Chrome. Port is a known constant
  // (CDP_PORT = 19222); clients tryConnect() will retry until the CDP server
  // is actually listening. Fixes #13 where clients timed out during cold
  // start (15-30s) because the port file appeared only after launch.
  writeAtomic(PORT_FILE, String(CDP_PORT));
  writeAtomic(PID_FILE, String(process.pid));
  touchHeartbeat();

  // Start the idle-poll ticker BEFORE launching Chrome. This way the daemon
  // still self-exits on idle even if Chrome cold-start hangs (it normally
  // takes 15-30s, which is fine; a true hang would otherwise leave a zombie).
  heartbeatTicker = setInterval(checkHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Launch persistent context with CDP.
  // Uses Playwright's bundled Chromium (no `channel: "chrome"`) to avoid
  // CDP port conflicts with the user's own Chrome and to pin the browser
  // version. Fixes #14.
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });

  // Navigate to WhatsApp Web
  const page = context.pages()[0] || (await context.newPage());

  // Bundled Chromium advertises `HeadlessChrome/...` in its User-Agent.
  // WhatsApp Web rejects that with "update your browser" and never loads
  // the chat UI. Strip the `Headless` marker via CDP so the UA looks
  // like a regular Chrome release. Harmless when already non-headless.
  try {
    const uaCdp = await context.newCDPSession(page);
    const currentUA = await page.evaluate(() => navigator.userAgent);
    if (currentUA.includes("HeadlessChrome")) {
      await uaCdp.send("Network.setUserAgentOverride", {
        userAgent: currentUA.replace("HeadlessChrome", "Chrome"),
      });
    }
  } catch (err) {
    // If CDP override fails, WA may still reject headless; the chat-list
    // waitFor below will timeout and the daemon stays up so the client
    // can surface the issue. Log the failure so it's diagnosable — without
    // this, the symptom is a confusing 30s grid-waitFor timeout 10 lines
    // below with no hint at the root cause.
    // (Scope: the override targets only this page's Network domain.
    // Greentap's single-page model makes that sufficient; a multi-page
    // refactor would need the override at every new page.)
    console.error("[daemon] UA override failed:", err?.message);
  }

  await page.goto(WA_URL);

  // Wait for chat list (may take a while on first load)
  try {
    await page.getByRole("grid").first().waitFor({ timeout: 30000 });
  } catch {
    // Chat list didn't appear — session may be expired, but daemon stays up
    // Client will handle recovery on connect
  }

  // Handle browser crash/disconnect via context close event
  context.on("close", () => {
    cleanupFiles();
    process.exit(1);
  });

  // Handle SIGTERM
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Idle detection ticker was started before launchPersistentContext so the
  // daemon self-exits even on a Chrome hang. Clients touch HEARTBEAT_FILE on
  // each connect (see lib/client.js); daemon shuts down when the last touch
  // is older than IDLE_TIMEOUT_MS.
}

main().catch((err) => {
  console.error("Daemon failed to start:", err.message);
  cleanupFiles();
  process.exit(1);
});
