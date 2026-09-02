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
import { createServer, connect as netConnect } from "net";
import { stripHeadlessUA } from "./browser.js";
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
// GREENTAP_CDP_SERVE ("host:port") forwards this daemon's CDP endpoint to an
// address other callers can reach — one browser, one linked device, several
// clients that cannot each launch their own. Unset by default: CDP is
// unauthenticated full control of a logged-in WhatsApp session, so it stays on
// loopback unless somebody asks for otherwise, and the caller is responsible
// for the address being a private one — a container network that publishes
// nothing to the host is the intended shape; a public interface is not.
//
// It is a FORWARDER rather than a wider bind because Chromium will not do the
// bind. MEASURED 2026-09-02, chrome-headless-shell 1208: launched with
// `--remote-debugging-port=19222 --remote-debugging-address=0.0.0.0` it listens
// on 127.0.0.1 and nothing else. The flag is accepted and ignored, so a version
// of this that just passed it through would report success and serve nobody.
//
// A different PORT, not a different address on the same one: 127.0.0.1:P is
// already bound by the browser, and 0.0.0.0:P collides with it.
const CDP_SERVE = (() => {
  const raw = process.env.GREENTAP_CDP_SERVE;
  if (!raw) return null;
  const i = raw.lastIndexOf(":");
  const port = parseInt(raw.slice(i + 1), 10);
  if (i < 1 || !Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`[daemon] ignoring malformed GREENTAP_CDP_SERVE ${JSON.stringify(raw)}; want host:port`);
    return null;
  }
  return { host: raw.slice(0, i), port };
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
let cdpForwarder = null;

/**
 * Pipe `host:port` to the browser's loopback CDP endpoint. See CDP_SERVE.
 *
 * A failure here is logged and NOT fatal: the daemon is still serving every
 * local client correctly, and killing it would take the shared browser down for
 * a facility nobody may be using.
 */
function serveCdp({ host, port }, target) {
  const srv = createServer((sock) => {
    const up = netConnect(target, "127.0.0.1");
    // Both halves must be torn down together, or a client that vanishes leaves
    // an open CDP connection against a browser that lives for weeks.
    const bin = () => { sock.destroy(); up.destroy(); };
    sock.on("error", bin);
    up.on("error", bin);
    sock.on("close", bin);
    up.on("close", bin);
    sock.pipe(up);
    up.pipe(sock);
  });
  srv.on("error", (err) => console.error("[daemon] CDP forwarder failed:", err.message));
  srv.listen(port, host, () =>
    console.error(`[daemon] CDP forwarded ${host}:${port} -> 127.0.0.1:${target}`),
  );
  return srv;
}

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
  if (cdpForwarder) cdpForwarder.close();
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
  if (CDP_SERVE) cdpForwarder = serveCdp(CDP_SERVE, CDP_PORT);

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
  //
  // Shared with headless login (lib/browser.js) rather than copied: the two
  // drive the same profile, so a divergence pairs a session this daemon
  // cannot then use.
  {
    const uaErr = await stripHeadlessUA(context, page);
    if (uaErr) {
      // If CDP override fails, WA may still reject headless; the chat-list
      // waitFor below will timeout and the daemon stays up so the client
      // can surface the issue. Log the failure so it's diagnosable — without
      // this, the symptom is a confusing 30s grid-waitFor timeout 10 lines
      // below with no hint at the root cause.
      // (Scope: the override targets only this page's Network domain.
      // Greentap's single-page model makes that sufficient; a multi-page
      // refactor would need the override at every new page.)
      console.error("[daemon] UA override failed:", uaErr);
    }
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
