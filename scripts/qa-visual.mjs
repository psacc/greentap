#!/usr/bin/env node
/**
 * qa-visual.mjs — capture a high-DPI screenshot of the conversation pane for
 * the agent-governed visual QA gate (see TESTING.md).
 *
 * It connects to the running greentap daemon over CDP and screenshots whatever
 * chat is currently open. The intended flow (per TESTING.md) is:
 *
 *   1. node greentap.js read "<chat>" --json > /tmp/gtqa/read.json   # opens the chat
 *   2. node scripts/qa-visual.mjs --out /tmp/gtqa                      # screenshots it
 *   3. an agent compares the screenshot bands against read.json
 *
 * This is a DEV/QA helper, not part of the shipped CLI surface — it lives in
 * scripts/ (not lib/) precisely so it carries no e2e obligation and stays a
 * reversible tool. It reads only; it never sends or mutates the chat.
 *
 * Output (under --out, default ./qa-visual-out):
 *   main-2x.png    full conversation pane at deviceScaleFactor 2
 *   band-1.png …   horizontal slices for legibility (macOS only, via `sips`)
 *
 * PII: the screenshot contains real chat content. Treat --out as scratch,
 * keep it out of git (it is not under a tracked path), and never attach raw
 * screenshots to a public PR — the QA report carries structural findings only.
 *
 * Flags:
 *   --out <dir>       output directory (default ./qa-visual-out)
 *   --port <n>        CDP port (default: ~/.greentap/daemon.port, else 19222)
 *   --bands <n>       number of legibility slices to cut (default 3, 0 = none)
 *   --scale <n>       deviceScaleFactor (default 2)
 */
import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { execFileSync } from "child_process";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function resolvePort() {
  const explicit = arg("port", null);
  if (explicit) return parseInt(explicit, 10);
  try {
    const p = readFileSync(join(homedir(), ".greentap", "daemon.port"), "utf8").trim();
    if (p) return parseInt(p, 10);
  } catch {
    // fall through to default
  }
  return 19222;
}

const outDir = arg("out", "./qa-visual-out");
const port = resolvePort();
const scale = parseInt(arg("scale", "2"), 10);
const bands = parseInt(arg("bands", "3"), 10);

mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
const ctx = browser.contexts()[0];
if (!ctx) {
  console.error("qa-visual: no browser context on the daemon. Run `greentap status`.");
  process.exit(1);
}
const page = ctx.pages()[0];
if (!page) {
  console.error("qa-visual: no page on the daemon.");
  process.exit(1);
}

const client = await ctx.newCDPSession(page);
await client.send("Emulation.setDeviceMetricsOverride", {
  width: 1100,
  height: 1300,
  deviceScaleFactor: scale,
  mobile: false,
});
await page.waitForTimeout(600);

const mainPath = join(outDir, "main-2x.png");
const main = page.locator("#main");
if (!(await main.count())) {
  console.error(
    "qa-visual: no #main conversation pane — is a chat open? " +
      "Run `greentap read \"<chat>\" --json` first.",
  );
  await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await browser.close();
  process.exit(1);
}
await main.first().screenshot({ path: mainPath });
console.log(`wrote ${mainPath}`);

// Optional legibility slices via macOS `sips` (best-effort; skipped elsewhere).
if (bands > 0) {
  try {
    const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", mainPath], {
      encoding: "utf8",
    });
    const w = parseInt(/pixelWidth: (\d+)/.exec(dims)?.[1], 10);
    const h = parseInt(/pixelHeight: (\d+)/.exec(dims)?.[1], 10);
    if (w && h) {
      const bandH = Math.floor(h / bands) + 60;
      for (let i = 0; i < bands; i++) {
        const offset = Math.max(0, Math.floor((i * h) / bands) - 30);
        const p = join(outDir, `band-${i + 1}.png`);
        execFileSync("sips", [
          "-c", String(Math.min(bandH, h - offset)), String(w),
          mainPath, "--cropOffset", String(offset), "0", "--out", p,
        ], { stdio: "ignore" });
        console.log(`wrote ${p}`);
      }
    }
  } catch {
    console.log("qa-visual: band slicing skipped (sips unavailable — macOS only).");
  }
}

await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
await browser.close();
if (existsSync(mainPath)) process.exit(0);
