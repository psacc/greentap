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
 *   greentap status             — Show daemon status
 *   greentap daemon stop        — Stop the daemon
 */

import { chromium } from "playwright";
import { join } from "path";
import { homedir } from "os";
import { rmSync } from "fs";
import { printChats, printMessages } from "./lib/parser.js";
import * as commands from "./lib/commands.js";
import { connect, stopDaemon, daemonStatus } from "./lib/client.js";

const USER_DATA_DIR = join(homedir(), ".greentap", "browser-data");
const WA_URL = "https://web.whatsapp.com";

async function withDaemon(fn) {
  const { page, disconnect } = await connect();
  try {
    return await fn(page);
  } finally {
    await disconnect();
  }
}

async function cmdLogin() {
  // Login bypasses daemon — launches headed browser directly
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(WA_URL);
  console.log("Browser opened. Scan QR code to log in.");
  console.log("Close the browser window when done.");
  await new Promise((resolve) => {
    context.on("close", resolve);
    page.on("close", () => {
      if (context.pages().length === 0) context.close();
    });
  });
}

async function cmdLogout() {
  // Stop daemon before clearing data
  if (stopDaemon()) {
    // Poll until daemon PID is dead (max 10s)
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const status = daemonStatus();
      if (!status.running) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log("Daemon stopped.");
  }
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  console.log("Logged out. Browser data cleared.");
}

async function cmdChats(json) {
  const result = await withDaemon((page) => commands.chats(page));
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printChats(result);
  }
}

async function cmdUnread(json) {
  const result = await withDaemon((page) => commands.unread(page));
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printChats(result);
  }
}

async function cmdRead(chatName, json) {
  const result = await withDaemon((page) => commands.read(page, chatName));
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    printMessages(result);
  }
}

async function cmdSend(chatName, message) {
  await withDaemon((page) => commands.send(page, chatName, message));
}

async function cmdSearch(query, json) {
  const result = await withDaemon((page) => commands.search(page, query));
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.length === 0) {
      console.log("No results found.");
    } else {
      for (const r of result) {
        console.log(`  ${r.name}`);
        if (r.lastMessage) console.log(`    ${r.lastMessage}`);
      }
    }
  }
}

async function cmdSnapshot(scope, chatName) {
  const result = await withDaemon((page) => commands.snapshot(page, scope, chatName));
  console.log(result);
}

function cmdStatus() {
  const status = daemonStatus();
  if (status.running) {
    console.log(`Daemon running. PID: ${status.pid}, CDP port: ${status.port}`);
  } else {
    console.log("No daemon running.");
  }
}

function cmdDaemonStop() {
  if (stopDaemon()) {
    console.log("Daemon stopping...");
  } else {
    console.log("No daemon running.");
  }
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
    case "status":
      cmdStatus();
      break;
    case "daemon":
      if (args[1] === "stop") {
        cmdDaemonStop();
      } else {
        console.log("Usage: greentap daemon stop");
      }
      break;
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
  snapshot [SCOPE] [--chat NAME] Dump aria snapshot (full|chats|messages|compose)
  status                         Show daemon status
  daemon stop                    Stop the daemon`);
  }
  // Force exit — CDP disconnect leaves Playwright's event loop alive
  process.exit(0);
} catch (err) {
  console.error(`greentap error: ${err.message}`);
  process.exit(1);
}
