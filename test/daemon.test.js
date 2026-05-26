import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fork } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = join(__dirname, "..", "lib", "daemon.js");
const DAEMON_SOURCE = readFileSync(DAEMON_SCRIPT, "utf8");

test("daemon writes port file before Chrome launch finishes", async () => {
  // Isolate from the user's real ~/.greentap/ by overriding the base dir.
  // The daemon honors GREENTAP_DIR as a test/override hook.
  const tmpDir = mkdtempSync(join(tmpdir(), "greentap-test-"));
  const portFile = join(tmpDir, "daemon.port");
  const pidFile = join(tmpDir, "daemon.pid");

  // Unique CDP port per-test to avoid colliding with anything else on the box.
  // The daemon honors GREENTAP_CDP_PORT for the same reason.
  const testPort = 19333;

  const child = fork(DAEMON_SCRIPT, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      GREENTAP_DIR: tmpDir,
      GREENTAP_CDP_PORT: String(testPort),
    },
  });

  try {
    // Poll for the port file for up to 2s. Chrome cold-start takes 15-30s,
    // so if the file appears within 2s the write must have happened before
    // launchPersistentContext returned — which is the behavior we want.
    const deadline = Date.now() + 2000;
    let found = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      if (existsSync(portFile)) {
        found = true;
        break;
      }
    }

    assert.strictEqual(
      found,
      true,
      "port file should exist within 2s (before Chrome launch completes)",
    );

    const port = parseInt(readFileSync(portFile, "utf8").trim(), 10);
    assert.strictEqual(port, testPort, "port file should contain the CDP port");

    // PID file should also be written up front.
    assert.ok(existsSync(pidFile), "pid file should exist alongside port file");
  } finally {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // already gone
    }
    // Small grace period for the child to actually exit before we rm the dir
    // (Chromium may still be spawning; SIGKILL the group is best-effort here).
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // no process group or already gone
    }
    await new Promise((r) => setTimeout(r, 200));
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort — browser-data subdir may still be in use
    }
  }
});

test("daemon source writes port file before launchPersistentContext", () => {
  // Belt-and-braces static check: the port file write must appear in the
  // source text *before* the launchPersistentContext call. This guards
  // against regressions even on CI where forking the daemon is undesirable.
  const portWriteIdx = DAEMON_SOURCE.indexOf("writeAtomic(PORT_FILE");
  const launchIdx = DAEMON_SOURCE.indexOf("launchPersistentContext");

  assert.ok(portWriteIdx > 0, "daemon must call writeAtomic(PORT_FILE, ...)");
  assert.ok(launchIdx > 0, "daemon must call launchPersistentContext");
  assert.ok(
    portWriteIdx < launchIdx,
    `port file write (idx ${portWriteIdx}) must precede launchPersistentContext (idx ${launchIdx})`,
  );
});

test("daemon idle reset is heartbeat-file based, not CDP-event based", () => {
  // Regression guard for the bug Neko surfaced 2026-05-09: the original
  // implementation listened on Target.attachedToTarget / detachedFromTarget on
  // a CDP session that only called Target.setDiscoverTargets. Those events
  // never fire for external connectOverCDP clients, so the idle timer never
  // reset — daemon died after exactly 15min regardless of activity. Replaced
  // with a heartbeat file that the client touches on every connect (see
  // lib/client.js touchHeartbeat()).
  const sourceNoComments = DAEMON_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.strictEqual(
    /Target\.(attachedToTarget|detachedFromTarget|setDiscoverTargets)/.test(
      sourceNoComments,
    ),
    false,
    "daemon.js must not rely on CDP Target.* events for idle reset (they never fire for connectOverCDP clients)",
  );
  assert.ok(
    /HEARTBEAT_FILE/.test(sourceNoComments),
    "daemon.js must use a heartbeat file for idle detection",
  );
  assert.ok(
    /setInterval\(\s*checkHeartbeat/.test(sourceNoComments),
    "daemon.js must poll the heartbeat file via setInterval",
  );
});

test("daemon shuts down when heartbeat is older than IDLE_TIMEOUT_MS", async () => {
  // End-to-end check: spawn daemon with a very short timeout, never touch
  // the heartbeat, and verify the daemon exits on its own. This proves the
  // idle path actually fires (the original implementation would have stayed
  // up because the broken CDP listener never reset the timer either way —
  // but with the fix, "no heartbeat ever" still leads to shutdown).
  const tmpDir = mkdtempSync(join(tmpdir(), "greentap-test-"));
  const pidFile = join(tmpDir, "daemon.pid");
  const testPort = 19334;

  const child = fork(DAEMON_SCRIPT, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      GREENTAP_DIR: tmpDir,
      GREENTAP_CDP_PORT: String(testPort),
      GREENTAP_IDLE_TIMEOUT_MS: "500",
      GREENTAP_HEARTBEAT_INTERVAL_MS: "100",
    },
  });

  try {
    // Wait for PID file to appear (daemon started).
    const startDeadline = Date.now() + 3000;
    while (Date.now() < startDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      if (existsSync(pidFile)) break;
    }
    assert.ok(existsSync(pidFile), "daemon should have started");

    // Wait for the daemon to self-exit (idle timeout + a few poll cycles).
    // We don't touch the heartbeat, so the daemon should shut down once
    // checkHeartbeat sees the initial-touch mtime age exceed 500ms. Allow
    // a generous deadline because Chrome launch is in flight and shutdown
    // has to clean up port/pid files before the process exits.
    const exitDeadline = Date.now() + 15000;
    let exited = false;
    while (Date.now() < exitDeadline) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        process.kill(child.pid, 0);
      } catch {
        exited = true;
        break;
      }
    }
    assert.ok(exited, "daemon should self-exit after idle timeout elapses");
    assert.ok(
      !existsSync(pidFile),
      "daemon should clean up pid file on idle shutdown",
    );
  } finally {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // already gone
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // no group
    }
    await new Promise((r) => setTimeout(r, 200));
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

test("daemon does not pin channel:'chrome' — uses bundled Chromium (#14)", () => {
  // Static check: the `channel: "chrome"` option must be absent from
  // launchPersistentContext. Using bundled Chromium isolates greentap's
  // browser from the user's system Chrome (no CDP port conflicts, no
  // version drift).
  //
  // Strip line and block comments first so explanatory text mentioning
  // `channel: "chrome"` in docstrings doesn't trip the assertion.
  const sourceNoComments = DAEMON_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/\/\/[^\n]*/g, ""); // line comments

  // Matches any whitespace/quoting variant:
  //   channel: "chrome"
  //   channel:'chrome'
  //   channel :  "chrome"
  const channelPattern = /channel\s*:\s*['"]chrome['"]/;
  assert.strictEqual(
    channelPattern.test(sourceNoComments),
    false,
    "daemon.js must not pin channel:'chrome' — should use bundled Chromium",
  );
});
