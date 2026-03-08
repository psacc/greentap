import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "path";
import { homedir } from "os";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "fs";

// We test the exported functions by importing them, but need to mock the filesystem.
// Since client.js uses hardcoded paths under ~/.greentap/, we test the daemon status
// and stop logic using a real temp directory approach — we'll write/read actual files
// but to the real ~/.greentap/ path (which already exists on the dev machine).

// For unit tests, we test the pure logic functions by calling the exported API
// and checking behavior against real filesystem state.

import { daemonStatus, stopDaemon } from "../lib/client.js";

const GREENTAP_DIR = join(homedir(), ".greentap");
const PORT_FILE = join(GREENTAP_DIR, "daemon.port");
const PID_FILE = join(GREENTAP_DIR, "daemon.pid");
const LOCK_FILE = join(GREENTAP_DIR, "daemon.lock");

// Save and restore daemon files around tests
let savedPort = null;
let savedPid = null;

function saveFiles() {
  try { savedPort = readFileSync(PORT_FILE, "utf8"); } catch { savedPort = null; }
  try { savedPid = readFileSync(PID_FILE, "utf8"); } catch { savedPid = null; }
}

function restoreFiles() {
  if (savedPort !== null) writeFileSync(PORT_FILE, savedPort); else try { rmSync(PORT_FILE); } catch {}
  if (savedPid !== null) writeFileSync(PID_FILE, savedPid); else try { rmSync(PID_FILE); } catch {}
  try { rmSync(LOCK_FILE); } catch {}
}

function writeTestFiles(port, pid) {
  mkdirSync(GREENTAP_DIR, { recursive: true });
  if (port !== undefined) writeFileSync(PORT_FILE, String(port));
  if (pid !== undefined) writeFileSync(PID_FILE, String(pid));
}

function cleanTestFiles() {
  for (const f of [PORT_FILE, PID_FILE, LOCK_FILE]) {
    try { rmSync(f); } catch {}
  }
}

describe("daemonStatus", () => {
  beforeEach(() => {
    saveFiles();
    cleanTestFiles();
  });
  afterEach(() => {
    restoreFiles();
  });

  it("returns not running when no files exist", () => {
    const status = daemonStatus();
    assert.equal(status.running, false);
  });

  it("returns not running when only port file exists", () => {
    writeTestFiles(19222, undefined);
    const status = daemonStatus();
    assert.equal(status.running, false);
  });

  it("returns not running when PID is dead", () => {
    // PID 99999999 is almost certainly not running
    writeTestFiles(19222, 99999999);
    const status = daemonStatus();
    assert.equal(status.running, false);
    // Should also clean up stale files
    assert.equal(existsSync(PORT_FILE), false);
    assert.equal(existsSync(PID_FILE), false);
  });

  it("returns running when PID is alive (current process)", () => {
    writeTestFiles(19222, process.pid);
    const status = daemonStatus();
    assert.equal(status.running, true);
    assert.equal(status.pid, process.pid);
    assert.equal(status.port, 19222);
  });
});

describe("stopDaemon", () => {
  beforeEach(() => {
    saveFiles();
    cleanTestFiles();
  });
  afterEach(() => {
    restoreFiles();
  });

  it("returns false when no daemon is running", () => {
    assert.equal(stopDaemon(), false);
  });

  it("returns false and cleans up for dead PID", () => {
    writeTestFiles(19222, 99999999);
    assert.equal(stopDaemon(), false);
    assert.equal(existsSync(PORT_FILE), false);
  });
});
