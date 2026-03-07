#!/usr/bin/env node

/**
 * greentap — WhatsApp Web CLI via Playwright aria snapshots.
 *
 * Commands:
 *   greentap login              — Open browser for QR scan
 *   greentap logout             — Clear session data
 *   greentap chats [--json]     — List all chats
 *   greentap unread [--json]    — List unread chats
 *   greentap read <chat> [--json] — Read messages from a chat
 *   greentap snapshot [SCOPE] [--chat NAME] — Dump raw aria snapshot
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { rmSync } from "fs";
import { parseChatList, printChats, parseMessages, printMessages } from "./lib/parser.js";

const USER_DATA_DIR = join(homedir(), ".greentap", "browser-data");
const WA_URL = "https://web.whatsapp.com";

async function waitForChatList(page) {
  await page.getByRole("grid", { name: "Lista delle chat" }).waitFor({ timeout: 15000 });
}

async function waitForMessagePanel(page) {
  await page.getByRole("button", { name: /Apri dettagli chat di/ }).waitFor({ timeout: 10000 });
}

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

async function cmdChats(json) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);
    await waitForChatList(page);
    const aria = await page.locator(":root").ariaSnapshot();
    return parseChatList(aria);
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printChats(result);
  }
}

async function cmdUnread(json) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);
    await waitForChatList(page);
    const aria = await page.locator(":root").ariaSnapshot();
    return parseChatList(aria).filter((c) => c.unread);
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printChats(result);
  }
}

async function cmdRead(chatName, json) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);
    await waitForChatList(page);

    const chatGrid = page.getByRole("grid", { name: "Lista delle chat" });
    const row = chatGrid.getByRole("row").filter({ hasText: chatName }).first();
    if (!(await row.isVisible())) {
      throw new Error(`Chat "${chatName}" not found in chat list`);
    }
    await row.click();
    await waitForMessagePanel(page);

    const aria = await page.locator(":root").ariaSnapshot();
    return parseMessages(aria);
  });

  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printMessages(result);
  }
}

async function cmdSnapshot(scope, chatName) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);

    await waitForChatList(page);

    // If a chat name is specified, click into it first
    if (chatName) {
      const chatGrid = page.getByRole("grid", { name: "Lista delle chat" });
      const row = chatGrid.getByRole("row").filter({ hasText: chatName }).first();
      if (await row.isVisible()) {
        await row.click();
        await waitForMessagePanel(page);
      } else {
        throw new Error(`Chat "${chatName}" not found in chat list`);
      }
    }

    const rootAria = await page.locator(":root").ariaSnapshot();

    if (scope === "full") {
      return rootAria;
    }

    // Try scoped snapshots via aria roles/names
    const scopes = {
      chats: async () => {
        const grid = page.getByRole("grid", { name: "Lista delle chat" });
        if (await grid.isVisible()) {
          return await grid.ariaSnapshot();
        }
        return "Chat list not found. Full snapshot:\n" + rootAria;
      },
      messages: async () => {
        const panel = page.getByRole("application");
        if (await panel.isVisible()) {
          return await panel.ariaSnapshot();
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
    case "chats":
      await cmdChats(args.includes("--json"));
      break;
    case "unread":
      await cmdUnread(args.includes("--json"));
      break;
    case "read": {
      const chatName = args.slice(1).filter((a) => a !== "--json")[0];
      if (!chatName) {
        console.error("Usage: greentap read <chat> [--json]");
        process.exit(1);
      }
      await cmdRead(chatName, args.includes("--json"));
      break;
    }
    case "snapshot": {
      const chatIdx = args.indexOf("--chat");
      const snapshotChat = chatIdx >= 0 ? args[chatIdx + 1] : null;
      const remaining = args.slice(1).filter((_, i) => {
        const absI = i + 1;
        return absI !== chatIdx && absI !== chatIdx + 1;
      });
      await cmdSnapshot(remaining[0] || "full", snapshotChat);
      break;
    }
    default:
      console.log(`Usage: greentap <command> [options]

Commands:
  login                          Open browser for QR scan
  logout                         Clear session data
  chats [--json]                 List all chats
  unread [--json]                List unread chats
  read <chat> [--json]           Read messages from a chat
  snapshot [SCOPE] [--chat NAME] Dump aria snapshot (full|chats|messages|compose)`);
  }
} catch (err) {
  console.error(`greentap error: ${err.message}`);
  process.exit(1);
}
