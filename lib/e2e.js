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

  // Text round-trip — further stages land in Task 4
  writeLastRun();
  return { pass: true, exitCode: 0, stages };
}
