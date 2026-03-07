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
 *   greentap send <chat> <message> — Send a message to a chat
 *   greentap search <query> [--json] — Search chats
 *   greentap snapshot [SCOPE] [--chat NAME] — Dump raw aria snapshot
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { rmSync } from "fs";
import { parseChatList, printChats, parseMessages, printMessages, parseSearchResults } from "./lib/parser.js";

const USER_DATA_DIR = join(homedir(), ".greentap", "browser-data");
const WA_URL = "https://web.whatsapp.com";

function humanDelay(min = 200, max = 500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChatList(page) {
  await page.getByRole("grid", { name: "Lista delle chat" }).waitFor({ timeout: 15000 });
}

async function waitForMessagePanel(page) {
  await page.getByRole("button", { name: /Apri dettagli chat di/ }).first().waitFor({ timeout: 10000 });
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
    await humanDelay(200, 500);
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

async function cmdSend(chatName, message) {
  await withBrowser(async (page) => {
    await page.goto(WA_URL);
    await waitForChatList(page);

    // Navigate to chat
    const chatGrid = page.getByRole("grid", { name: "Lista delle chat" });
    const row = chatGrid.getByRole("row").filter({ hasText: chatName }).first();
    if (!(await row.isVisible())) {
      throw new Error(`Chat "${chatName}" not found in chat list`);
    }
    await humanDelay(200, 500);
    await row.click();
    await waitForMessagePanel(page);

    // Verify correct chat opened
    // Groups: button "<name> clicca qui per info gruppo"
    // 1:1: button "<name> clicca qui per info contatto"
    const aria = await page.locator(":root").ariaSnapshot();
    const headerMatch = aria.match(/button "(.+?) clicca qui per info (?:gruppo|contatto)"/);
    if (!headerMatch || !headerMatch[1].toLowerCase().includes(chatName.toLowerCase())) {
      const actual = headerMatch ? headerMatch[1] : "unknown";
      throw new Error(`Wrong chat opened. Expected "${chatName}", got "${actual}"`);
    }

    // Find compose textbox and type message
    const compose = page.getByRole("textbox", { name: /Scrivi a/ });
    await compose.waitFor({ timeout: 5000 });
    await humanDelay(300, 600);
    await compose.fill(message);

    // Wait for Send button and click
    const sendBtn = page.getByRole("button", { name: "Invia" });
    await sendBtn.waitFor({ timeout: 5000 });
    await humanDelay(200, 400);
    await sendBtn.click();

    // Post-send verification: wait for compose to be empty
    await humanDelay(500, 1000);
    try {
      await compose.waitFor({ timeout: 5000 });
      const value = await compose.textContent();
      if (value && value.trim().length > 0) {
        console.error("WARNING: Message may not have been sent. Compose still contains text.");
        return;
      }
    } catch {
      // Compose box may have been replaced — that's fine
    }

    // Verify message appears in chat
    const postSendAria = await page.locator(":root").ariaSnapshot();
    const msgSnippet = message.length > 40 ? message.slice(0, 40) : message;
    if (!postSendAria.includes(msgSnippet)) {
      console.error("WARNING: Sent message not found in chat snapshot.");
    }

    console.log(`Sent to ${chatName}.`);
  });
}

async function cmdSearch(query, json) {
  const result = await withBrowser(async (page) => {
    await page.goto(WA_URL);
    await waitForChatList(page);

    // Click search textbox and type query
    const searchBox = page.getByRole("textbox", { name: "Cerca o avvia una nuova chat" });
    await searchBox.click();
    await humanDelay(300, 600);
    await searchBox.fill(query);

    // Wait for search results grid to appear
    try {
      await page.getByRole("grid", { name: "Risultati della ricerca." }).waitFor({ timeout: 5000 });
    } catch {
      // No results grid — will return empty
    }
    await humanDelay(200, 400);

    // Take snapshot and parse results
    const aria = await page.locator(":root").ariaSnapshot();

    // Clean up: press Escape twice to exit search
    await page.keyboard.press("Escape");
    await humanDelay(200, 400);
    await page.keyboard.press("Escape");

    return aria;
  });

  // Parse search results from the aria snapshot
  // Search results appear in a listbox or similar structure — parse what we get
  const parsed = parseSearchResults(result);

  if (json) {
    console.log(JSON.stringify(parsed));
  } else {
    if (parsed.length === 0) {
      console.log("No results found.");
    } else {
      for (const r of parsed) {
        console.log(`  ${r.name}`);
        if (r.lastMessage) console.log(`    ${r.lastMessage}`);
      }
    }
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
    case "send": {
      const sendArgs = args.slice(1);
      if (sendArgs.length < 2) {
        console.error("Usage: greentap send <chat> <message>");
        process.exit(1);
      }
      await cmdSend(sendArgs[0], sendArgs.slice(1).join(" "));
      break;
    }
    case "search": {
      const searchQuery = args.slice(1).filter((a) => a !== "--json").join(" ");
      if (!searchQuery) {
        console.error("Usage: greentap search <query> [--json]");
        process.exit(1);
      }
      await cmdSearch(searchQuery, args.includes("--json"));
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
  send <chat> <message>          Send a message to a chat
  search <query> [--json]        Search chats
  snapshot [SCOPE] [--chat NAME] Dump aria snapshot (full|chats|messages|compose)`);
  }
} catch (err) {
  console.error(`greentap error: ${err.message}`);
  process.exit(1);
}
