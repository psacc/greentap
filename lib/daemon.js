#!/usr/bin/env node

/**
 * greentap daemon — background process holding a persistent Playwright browser context.
 * Exposes CDP on port 19222 for CLI clients to connect via connectOverCDP.
 *
 * Lifecycle:
 *   - Launches Chrome with persistent context + CDP
 *   - Writes port + PID files atomically
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
} from "fs";

// GREENTAP_DIR and GREENTAP_CDP_PORT env vars exist for test isolation only.
// Production users should never set them — defaults are the documented paths.
const GREENTAP_DIR = process.env.GREENTAP_DIR || join(homedir(), ".greentap");
const USER_DATA_DIR = join(GREENTAP_DIR, "browser-data");
const PORT_FILE = join(GREENTAP_DIR, "daemon.port");
const PID_FILE = join(GREENTAP_DIR, "daemon.pid");
const WA_URL = "https://web.whatsapp.com";
const CDP_PORT = parseInt(process.env.GREENTAP_CDP_PORT || "19222", 10);
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

let context = null;
let idleTimer = null;

function writeAtomic(filePath, content) {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, filePath);
}

function cleanupFiles() {
  // Daemon only cleans port + PID files. Lock file is owned by the client.
  for (const f of [PORT_FILE, PID_FILE]) {
    try {
      unlinkSync(f);
    } catch {
      // already gone
    }
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdown, IDLE_TIMEOUT_MS);
}

async function shutdown() {
  if (idleTimer) clearTimeout(idleTimer);
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

  // Launch persistent context with CDP
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });

  // Navigate to WhatsApp Web
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(WA_URL);

  // Wait for chat list (may take a while on first load)
  try {
    await page.getByRole("grid").first().waitFor({ timeout: 30000 });
  } catch {
    // Chat list didn't appear — session may be expired, but daemon stays up
    // Client will handle recovery on connect
  }

  // Monitor CDP connections via context CDP session
  // Note: context.browser() returns null for launchPersistentContext,
  // so we use the context-level CDP session instead.
  try {
    const cdpSession = await context.newCDPSession(page);
    // Use page-level session to detect target attach/detach
    await cdpSession.send("Target.setDiscoverTargets", { discover: true });
    cdpSession.on("Target.attachedToTarget", () => resetIdleTimer());
    cdpSession.on("Target.detachedFromTarget", () => resetIdleTimer());
  } catch {
    // Fallback: just use the idle timer without CDP events
  }

  // Handle browser crash/disconnect via context close event
  context.on("close", () => {
    cleanupFiles();
    process.exit(1);
  });

  // Handle SIGTERM
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start idle timer
  resetIdleTimer();
}

main().catch((err) => {
  console.error("Daemon failed to start:", err.message);
  cleanupFiles();
  process.exit(1);
});
