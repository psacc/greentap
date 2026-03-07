#!/usr/bin/env node

/**
 * greentap — WhatsApp Web CLI via Playwright aria snapshots.
 *
 * Phase 0 (spike):
 *   greentap login             — Open browser for QR scan
 *   greentap logout            — Clear session data
 *   greentap snapshot [SCOPE]  — Dump aria snapshot (full | chats | messages | compose)
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { rmSync } from "fs";

const USER_DATA_DIR = join(homedir(), ".greentap", "browser-data");
const WA_URL = "https://web.whatsapp.com";

async function withBrowser(fn, { headless = true } = {}) {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}

async function cmdLogin() {
  await withBrowser(
    async (page, context) => {
      await page.goto(WA_URL);
      console.log("Browser opened. Scan QR code to log in.");
      console.log("Close the browser window when done.");
      await new Promise((resolve) => {
        context.on("close", resolve);
        page.on("close", () => {
          if (context.pages().length === 0) context.close();
        });
      });
    },
    { headless: false }
  );
}

async function cmdLogout() {
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  console.log("Logged out. Browser data cleared.");
}

async function cmdSnapshot(scope, chatName) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);

    // Wait for the app to load (side panel with chat list)
    await page.waitForTimeout(5000);

    // If a chat name is specified, click into it first
    if (chatName) {
      const chatGrid = page.getByRole("grid", { name: "Lista delle chat" });
      const row = chatGrid.getByRole("row").filter({ hasText: chatName }).first();
      if (await row.isVisible()) {
        await row.click();
        await page.waitForTimeout(2000);
      } else {
        console.error(`Chat "${chatName}" not found in chat list`);
        process.exit(1);
      }
    }

    const rootAria = await page.locator(":root").ariaSnapshot();

    if (scope === "full") {
      return rootAria;
    }

    // Try scoped snapshots via aria roles/names
    const scopes = {
      chats: async () => {
        const panel = page.getByRole("list").first();
        if (await panel.isVisible()) {
          return await panel.ariaSnapshot();
        }
        return "Chat list not found. Full snapshot:\n" + rootAria;
      },
      messages: async () => {
        const msgPanel = page.getByRole("log").first();
        if (await msgPanel.isVisible()) {
          return await msgPanel.ariaSnapshot();
        }
        // Fallback: look for application role
        const app = page.getByRole("application");
        if (await app.isVisible()) {
          return await app.ariaSnapshot();
        }
        return "Message panel not found. Full snapshot:\n" + rootAria;
      },
      compose: async () => {
        const box = page.getByRole("textbox");
        if (await box.first().isVisible()) {
          return await box.first().ariaSnapshot();
        }
        return "Compose box not found. Full snapshot:\n" + rootAria;
      },
    };

    if (scopes[scope]) {
      return await scopes[scope]();
    }

    return rootAria;
  });

  console.log(result);
}

// --- Main ---
try {
  const args = process.argv.slice(2);
  const command = args[0] || "snapshot";

  switch (command) {
    case "login":
      await cmdLogin();
      break;
    case "logout":
      await cmdLogout();
      break;
    case "snapshot": {
      const chatIdx = args.indexOf("--chat");
      const chatName = chatIdx >= 0 ? args[chatIdx + 1] : null;
      // scope is first arg after "snapshot" that isn't --chat or its value
      const remaining = args.slice(1).filter((_, i) => {
        const absI = i + 1; // offset since we sliced
        return absI !== chatIdx && absI !== chatIdx + 1;
      });
      await cmdSnapshot(remaining[0] || "full", chatName);
      break;
    }
    default:
      console.log("Usage: greentap [login|logout|snapshot [full|chats|messages|compose] [--chat NAME]]");
  }
} catch (err) {
  console.error(`greentap error: ${err.message}`);
  process.exit(1);
}
