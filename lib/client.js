/**
 * greentap client — connects to the daemon via CDP, or auto-starts one.
 *
 * Usage:
 *   const { page, disconnect } = await connect();
 *   // ... use page ...
 *   await disconnect();
 */

import { chromium } from "playwright";
import { join, dirname } from "path";
import { homedir } from "os";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "fs";

const GREENTAP_DIR = join(homedir(), ".greentap");
const PORT_FILE = join(GREENTAP_DIR, "daemon.port");
const PID_FILE = join(GREENTAP_DIR, "daemon.pid");
const LOCK_FILE = join(GREENTAP_DIR, "daemon.lock");
const BROWSER_DATA_DIR = join(GREENTAP_DIR, "browser-data");
const WA_URL = "https://web.whatsapp.com";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = join(__dirname, "daemon.js");

function readPort() {
  try {
    return parseInt(readFileSync(PORT_FILE, "utf8").trim(), 10);
  } catch {
    return null;
  }
}

function readPid() {
  try {
    return parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
  } catch {
    return null;
  }
}

function hasSession() {
  try {
    const entries = readdirSync(BROWSER_DATA_DIR);
    return entries.length > 0;
  } catch {
    return false;
  }
}

function cleanupStaleFiles() {
  for (const f of [PORT_FILE, PID_FILE, LOCK_FILE]) {
    try {
      unlinkSync(f);
    } catch {
      // already gone
    }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire a lockfile. Uses O_EXCL for atomic creation + PID for staleness detection.
 * If the lock is held by a dead process, it's cleaned up and re-acquired.
 */
function acquireLockSync() {
  // Write our PID to the lockfile atomically
  try {
    writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  // Lock exists — check if holder is alive
  try {
    const holderPid = parseInt(readFileSync(LOCK_FILE, "utf8").trim(), 10);
    if (holderPid && isProcessAlive(holderPid)) {
      return false; // lock is legitimately held
    }
  } catch {
    // can't read lock — try to take it
  }

  // Stale lock — remove and retry
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // race condition, another process may have removed it
  }
  try {
    writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // best effort
  }
}

async function tryConnect(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
    timeout: 5000,
  });
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error("No context found on daemon");
  }
  const page = context.pages()[0];
  if (!page) {
    await browser.close();
    throw new Error("No page found on daemon");
  }
  return { browser, page };
}

async function startDaemon() {
  const child = fork(DAEMON_SCRIPT, [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Poll for port file (max 15s)
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const port = readPort();
    if (port) return port;
  }
  throw new Error("Daemon failed to start within 15s");
}

async function ensureChatList(page) {
  const grid = page.getByRole("grid", { name: "Lista delle chat" });

  // Quick check
  try {
    await grid.waitFor({ timeout: 3000 });
    return;
  } catch {
    // not visible, try recovery
  }

  // Escape (dismiss overlays)
  await page.keyboard.press("Escape");
  try {
    await grid.waitFor({ timeout: 3000 });
    return;
  } catch {
    // still not visible
  }

  // Reload
  await page.reload();
  try {
    await grid.waitFor({ timeout: 10000 });
    return;
  } catch {
    // still not visible
  }

  // Last resort: navigate
  await page.goto(WA_URL);
  try {
    await grid.waitFor({ timeout: 15000 });
    return;
  } catch {
    throw new Error("WhatsApp session not responding. Run `greentap login` to re-authenticate.");
  }
}

/**
 * Connect to the daemon, auto-starting if needed.
 * Returns { page, disconnect }.
 */
export async function connect() {
  // Guard: no session
  if (!hasSession()) {
    throw new Error("No session. Run `greentap login` first.");
  }

  // Try existing daemon
  let port = readPort();
  if (port) {
    try {
      const { browser, page } = await tryConnect(port);
      await ensureChatList(page);
      return {
        page,
        disconnect: () => browser.close(),
      };
    } catch {
      // Stale port file
      cleanupStaleFiles();
    }
  }

  // Start daemon under lock
  // Poll for lock acquisition (another CLI may be starting the daemon)
  const lockDeadline = Date.now() + 20000;
  let gotLock = false;
  while (Date.now() < lockDeadline) {
    gotLock = acquireLockSync();
    if (gotLock) break;

    // Another process holds the lock — wait and check if daemon appeared
    await new Promise((r) => setTimeout(r, 500));
    port = readPort();
    if (port) {
      // Daemon started by another process
      const { browser, page } = await tryConnect(port);
      await ensureChatList(page);
      return { page, disconnect: () => browser.close() };
    }
  }

  if (!gotLock) {
    throw new Error("Could not acquire daemon lock within 20s");
  }

  try {
    // Double-check: daemon may have started while we waited
    port = readPort();
    if (!port) {
      port = await startDaemon();
    }
  } finally {
    releaseLock();
  }

  const { browser, page } = await tryConnect(port);
  await ensureChatList(page);
  return {
    page,
    disconnect: () => browser.close(),
  };
}

/**
 * Stop the daemon by sending SIGTERM to its PID.
 * Returns true if daemon was stopped, false if none was running.
 */
export function stopDaemon() {
  const pid = readPid();
  if (!pid) return false;

  if (!isProcessAlive(pid)) {
    cleanupStaleFiles();
    return false;
  }

  process.kill(pid, "SIGTERM");
  return true;
}

/**
 * Get daemon status info.
 * Returns { running, pid, port } or { running: false }.
 */
export function daemonStatus() {
  const pid = readPid();
  const port = readPort();

  if (!pid || !port) return { running: false };

  if (!isProcessAlive(pid)) {
    cleanupStaleFiles();
    return { running: false };
  }

  return { running: true, pid, port };
}
