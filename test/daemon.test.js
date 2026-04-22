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

// Fixed CDP port the daemon uses. The test below asserts the port file is
// written up front (issue #13) so clients don't time out during Chrome's
// 15-30s cold start.
const EXPECTED_PORT = 19222;

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
