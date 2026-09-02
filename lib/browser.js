/**
 * Browser helpers shared by the daemon and the headless login flow.
 *
 * greentap normally links an account with `login`, which opens a headed window
 * for the QR scan. A container has no display and no way to open one, so a
 * headless box needs the QR as a FILE: `login --headless --qr-png <path>`
 * renders it, keeps it current across WhatsApp's refreshes, and exits 0 once
 * the account is linked.
 */

import { chromium } from "playwright";
import { mkdirSync, renameSync } from "fs";
import { dirname } from "path";

const WA_URL = "https://web.whatsapp.com";

/**
 * Bundled Chromium advertises `HeadlessChrome/...` in its User-Agent, and
 * WhatsApp Web answers that with "update your browser" and never renders — not
 * the chat list, and not the QR either. Strip the marker via CDP.
 *
 * Shared by the daemon and by headless login: they drive the same profile with
 * the same browser, so a divergence here is a login that pairs a session the
 * daemon then cannot use.
 *
 * @returns {Promise<string|null>} the failure message, or null on success.
 */
export async function stripHeadlessUA(context, page) {
  try {
    const cdp = await context.newCDPSession(page);
    const currentUA = await page.evaluate(() => navigator.userAgent);
    if (currentUA.includes("HeadlessChrome")) {
      await cdp.send("Network.setUserAgentOverride", {
        userAgent: currentUA.replace("HeadlessChrome", "Chrome"),
      });
    }
    return null;
  } catch (err) {
    return err?.message ?? String(err);
  }
}

/**
 * The QR canvas plus a quiet zone. A QR code needs white margin around it to
 * scan; WhatsApp's canvas is the code alone, so screenshotting the element
 * gives a picture a phone often refuses. Clip the page instead, padded.
 */
async function qrClip(page, pad = 32) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) return null;
  const vp = page.viewportSize() ?? { width: 1280, height: 900 };
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    box,
    clip: {
      x,
      y,
      width: Math.min(vp.width - x, box.width + 2 * pad),
      height: Math.min(vp.height - y, box.height + 2 * pad),
    },
  };
}

/**
 * WhatsApp expires each QR after ~60s and replaces it with a reload button
 * drawn over the canvas. Nobody is at the keyboard here, so click it.
 *
 * Found by GEOMETRY rather than by label: greentap is locale-independent by
 * design (the account picks the UI language, not the caller), and the overlay
 * is the only button rendered on top of the code.
 */
async function clickQrReload(page, box) {
  const buttons = page.getByRole("button");
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = buttons.nth(i);
    const bb = await b.boundingBox().catch(() => null);
    if (!bb) continue;
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    if (cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height) {
      await b.click({ timeout: 3000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/**
 * Link an account without a display.
 *
 * Writes the current QR to `qrPng` and REWRITES it every poll, so a reader that
 * copies the file always has the live code. The write is a rename over a
 * temp file in the same directory: a scp racing the screenshot would otherwise
 * ship half a PNG, which reads as "the QR does not scan".
 *
 * Resolves when the chat list appears — the same signal the daemon waits for,
 * so "logged in" means the same thing to both.
 *
 * @param {{ userDataDir: string, qrPng: string, timeoutMs?: number,
 *           pollMs?: number, log?: (s: string) => void }} opts
 */
export async function headlessLogin({
  userDataDir,
  qrPng,
  timeoutMs = 15 * 60 * 1000,
  pollMs = 3000,
  log = () => {},
}) {
  mkdirSync(dirname(qrPng), { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    const uaErr = await stripHeadlessUA(context, page);
    if (uaErr) log(`UA override failed: ${uaErr} — WhatsApp may refuse to render`);
    await page.goto(WA_URL);

    const grid = page.getByRole("grid").first();
    const deadline = Date.now() + timeoutMs;
    let shots = 0;
    while (Date.now() < deadline) {
      if (await grid.isVisible().catch(() => false)) {
        // Close through the finally below: launchPersistentContext flushes the
        // profile on close, and a process.exit here would lose the pairing it
        // just earned.
        log(`linked after ${shots} QR frame(s)`);
        return { linked: true, frames: shots };
      }
      const q = await qrClip(page).catch(() => null);
      if (q) {
        // `.tmp` so a reader copying the file never gets half a PNG — and an
        // explicit type, because Playwright infers the format from the
        // extension and refuses one it does not know.
        const tmp = `${qrPng}.tmp`;
        await page.screenshot({ path: tmp, type: "png", clip: q.clip });
        renameSync(tmp, qrPng);
        shots++;
        if (shots === 1) log(`QR written to ${qrPng} — rewritten every ${pollMs}ms`);
        await clickQrReload(page, q.box);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return { linked: false, frames: shots };
  } finally {
    await context.close();
  }
}
