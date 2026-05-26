import { test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";

// Isolate from the real ~/.greentap BEFORE importing the client module: the
// GREENTAP_DIR const is read at import time, so the env must be set first.
const TMP = mkdtempSync(join(tmpdir(), "greentap-ctl-"));
process.env.GREENTAP_DIR = TMP;
const { daemonStatus, stopDaemon } = await import("../lib/client.js");

const PID_FILE = join(TMP, "daemon.pid");
const PORT_FILE = join(TMP, "daemon.port");

/** A harmless long-lived child whose PID we can probe and SIGTERM. */
function spawnDummy() {
  return spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], {
    stdio: "ignore",
  });
}

/** Spawn + kill + await exit → a PID that is guaranteed dead. */
async function deadPid() {
  const c = spawnDummy();
  const pid = c.pid;
  await new Promise((resolve) => {
    c.on("exit", resolve);
    c.kill("SIGKILL");
  });
  return pid;
}

function writeDaemonFiles(pid, port) {
  writeFileSync(PID_FILE, String(pid));
  if (port !== undefined) writeFileSync(PORT_FILE, String(port));
}

function clearDaemonFiles() {
  for (const f of [PID_FILE, PORT_FILE]) {
    try {
      rmSync(f, { force: true });
    } catch {
      // ignore
    }
  }
}

before(() => clearDaemonFiles());
after(() => {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

test("daemonStatus: not running when no pid/port files exist", () => {
  clearDaemonFiles();
  assert.deepStrictEqual(daemonStatus(), { running: false });
});

test("daemonStatus: not running when pid file present but port missing", () => {
  clearDaemonFiles();
  writeFileSync(PID_FILE, String(process.pid)); // alive pid, but no port file
  assert.deepStrictEqual(daemonStatus(), { running: false });
});

test("daemonStatus: running for a live pid + port", () => {
  clearDaemonFiles();
  const child = spawnDummy();
  try {
    writeDaemonFiles(child.pid, 19987);
    const status = daemonStatus();
    assert.strictEqual(status.running, true);
    assert.strictEqual(status.pid, child.pid);
    assert.strictEqual(status.port, 19987);
  } finally {
    child.kill("SIGKILL");
  }
});

test("daemonStatus: dead pid → not running, and stale files are cleaned", async () => {
  clearDaemonFiles();
  const pid = await deadPid();
  writeDaemonFiles(pid, 19987);
  assert.deepStrictEqual(daemonStatus(), { running: false });
  assert.ok(!existsSync(PID_FILE), "stale pid file should be removed");
  assert.ok(!existsSync(PORT_FILE), "stale port file should be removed");
});

test("daemonStatus: a negative pid file is treated as not-running (no process-group probe)", () => {
  clearDaemonFiles();
  writeDaemonFiles(-1, 19987); // corrupted pid; -1 would mean "process group"
  assert.deepStrictEqual(daemonStatus(), { running: false });
});

test("daemonStatus: a non-numeric pid file is treated as not-running", () => {
  clearDaemonFiles();
  writeFileSync(PID_FILE, "not-a-pid");
  writeFileSync(PORT_FILE, "19987");
  assert.deepStrictEqual(daemonStatus(), { running: false });
});

test("stopDaemon: never signals a process group for a negative pid", () => {
  clearDaemonFiles();
  writeDaemonFiles(-1, 19987);
  assert.strictEqual(stopDaemon(), false); // must NOT reach process.kill(-1, SIGTERM)
});

test("stopDaemon: returns false when no daemon is running", () => {
  clearDaemonFiles();
  assert.strictEqual(stopDaemon(), false);
});

test("stopDaemon: dead pid → false, and stale files are cleaned", async () => {
  clearDaemonFiles();
  const pid = await deadPid();
  writeDaemonFiles(pid, 19987);
  assert.strictEqual(stopDaemon(), false);
  assert.ok(!existsSync(PID_FILE), "stale pid file should be removed");
});

test("stopDaemon: live pid → true and the process receives SIGTERM", async () => {
  clearDaemonFiles();
  const child = spawnDummy();
  const exited = new Promise((resolve) => child.on("exit", (_code, signal) => resolve(signal)));
  writeDaemonFiles(child.pid, 19987);

  assert.strictEqual(stopDaemon(), true);

  // The dummy installs no SIGTERM handler, so default disposition terminates it.
  const signal = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000)),
  ]);
  if (signal === "TIMEOUT") {
    child.kill("SIGKILL");
    assert.fail("stopDaemon should have terminated the live daemon process via SIGTERM");
  }
  assert.strictEqual(signal, "SIGTERM", "process should be terminated by SIGTERM");
});
