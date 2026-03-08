/**
 * Command functions that operate on a Playwright page.
 * Each function accepts a `page` and returns data (no browser lifecycle management).
 */

import { parseChatList, parseMessages, parseSearchResults } from "./parser.js";

function humanDelay(min = 200, max = 500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForChatList(page) {
  await page.getByRole("grid", { name: "Lista delle chat" }).waitFor({ timeout: 15000 });
}

export async function waitForMessagePanel(page) {
  // Wait for the compose textbox — reliable indicator that a chat is open.
  // The header button pattern varies: "Apri dettagli chat di X", "X ultimo accesso...",
  // "X clicca qui per info contatto/gruppo" — compose box is always present.
  await page.getByRole("textbox", { name: /Scrivi a/ }).waitFor({ timeout: 10000 });
}

export async function navigateToChat(page, chatName) {
  // Try visible chat list first
  const chatGrid = page.getByRole("grid", { name: "Lista delle chat" });
  const row = chatGrid.getByRole("row").filter({ hasText: chatName }).first();
  if (await row.isVisible()) {
    await humanDelay(200, 500);
    await row.click();
    await waitForMessagePanel(page);
    return;
  }

  // Fallback: search (handles archived chats)
  const searchBox = page.getByRole("textbox", { name: "Cerca o avvia una nuova chat" });
  await searchBox.click();
  await humanDelay(300, 600);
  await page.keyboard.type(chatName, { delay: 30 });

  try {
    await page.getByRole("grid", { name: "Risultati della ricerca." }).waitFor({ timeout: 5000 });
  } catch {
    // Clean up search and throw
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found`);
  }

  const searchGrid = page.getByRole("grid", { name: "Risultati della ricerca." });
  const searchRow = searchGrid.getByRole("row").filter({ hasText: chatName }).first();
  if (!(await searchRow.isVisible())) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found in search results`);
  }

  await humanDelay(200, 500);
  await searchRow.click();
  await waitForMessagePanel(page);
}

export async function chats(page) {
  const aria = await page.locator(":root").ariaSnapshot();
  return parseChatList(aria);
}

export async function unread(page) {
  const aria = await page.locator(":root").ariaSnapshot();
  return parseChatList(aria).filter((c) => c.unread);
}

export function dedupKey(msg) {
  return `${msg.sender}|${msg.time}|${(msg.text || "").slice(0, 50)}`;
}

async function findScrollContainer(page) {
  return page.evaluate(() => {
    // Find rows NOT inside a grid (message panel rows, not chat list rows)
    const allRows = document.querySelectorAll('[role="row"]');
    let msgRow = null;
    for (const row of allRows) {
      if (!row.closest('[role="grid"]')) {
        msgRow = row;
        break;
      }
    }
    if (!msgRow) return false;
    // Walk up to find the scrollable container (may be overflow auto or scroll)
    let el = msgRow.parentElement;
    while (el) {
      const ov = getComputedStyle(el).overflowY;
      if (ov === "auto" || ov === "scroll") break;
      el = el.parentElement;
    }
    if (el) {
      el.dataset.greentapScroll = "1";
      return true;
    }
    return false;
  });
}

async function scrollAndCollect(page) {
  const found = await findScrollContainer(page);
  if (!found) throw new Error("Could not find scrollable message container");

  const iterations = [];
  let stableCount = 0;
  let lastFirstKey = null;
  let exitReason = "max_iterations";
  const startTime = Date.now();
  const MAX_ITERATIONS = 50;
  const TIMEOUT_MS = 30000;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      exitReason = "timeout";
      break;
    }

    const aria = await page.locator(":root").ariaSnapshot();
    const msgs = parseMessages(aria);
    iterations.push(msgs);

    const firstKey = msgs.length > 0 ? dedupKey(msgs[0]) : null;
    if (firstKey && firstKey === lastFirstKey) {
      stableCount++;
      if (stableCount >= 3) {
        exitReason = "stable";
        break;
      }
    } else {
      stableCount = 1;
      lastFirstKey = firstKey;
    }

    // Scroll up
    await page.evaluate(() => {
      const el = document.querySelector('[data-greentap-scroll="1"]');
      if (el) el.scrollTop = 0;
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  if (exitReason === "timeout") {
    console.error("WARNING: Scroll timeout reached. Returning partial results.");
  } else if (exitReason === "max_iterations") {
    console.error("WARNING: Max scroll iterations reached. Returning partial results.");
  }

  // Merge: oldest iteration first, dedup
  const merged = new Map();
  for (let i = iterations.length - 1; i >= 0; i--) {
    for (const msg of iterations[i]) {
      const key = dedupKey(msg);
      if (!merged.has(key)) merged.set(key, msg);
    }
  }
  return [...merged.values()];
}

export async function read(page, chatName, { scroll = false } = {}) {
  await navigateToChat(page, chatName);
  if (scroll) {
    return scrollAndCollect(page);
  }
  const aria = await page.locator(":root").ariaSnapshot();
  return parseMessages(aria);
}

export async function send(page, chatName, message) {
  await navigateToChat(page, chatName);

  // Verify correct chat opened
  const aria = await page.locator(":root").ariaSnapshot();
  const headerMatch = aria.match(/button "(.+?) clicca qui per info (?:gruppo|contatto)"/);
  if (!headerMatch || !headerMatch[1].toLowerCase().includes(chatName.toLowerCase())) {
    const actual = headerMatch ? headerMatch[1] : "unknown";
    throw new Error(`Wrong chat opened. Expected "${chatName}", got "${actual}"`);
  }

  // Focus compose and type message via keyboard (fill() doesn't trigger WhatsApp's event handlers)
  const compose = page.getByRole("textbox", { name: /Scrivi a/ });
  await compose.waitFor({ timeout: 5000 });
  await compose.click();
  await humanDelay(300, 600);
  await page.keyboard.type(message, { delay: 30 });

  // Wait for Send button and click
  const sendBtn = page.getByRole("button", { name: "Invia", exact: true });
  await sendBtn.waitFor({ timeout: 5000 });
  await humanDelay(200, 400);
  await sendBtn.click();

  // Wait for delivery confirmation
  await humanDelay(1000, 2000);

  const postSendAria = await page.locator(":root").ariaSnapshot();

  // Check for send errors
  if (postSendAria.includes("Si è verificato un errore")) {
    throw new Error("Message send failed — WhatsApp reported an error. Check the app.");
  }

  // Strip emoji for snippet match (emoji become img tags in aria)
  const textOnly = message.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "").trim();
  const msgSnippet = textOnly.length > 40 ? textOnly.slice(0, 40) : textOnly;
  if (msgSnippet && !postSendAria.includes(msgSnippet)) {
    console.error("WARNING: Sent message not found in chat snapshot.");
  }

  console.log(`Sent to ${chatName}.`);
}

export async function search(page, query) {
  const searchBox = page.getByRole("textbox", { name: "Cerca o avvia una nuova chat" });
  await searchBox.click();
  await humanDelay(300, 600);
  await page.keyboard.type(query, { delay: 30 });

  try {
    await page.getByRole("grid", { name: "Risultati della ricerca." }).waitFor({ timeout: 5000 });
  } catch {
    // No results grid — will return empty
  }
  await humanDelay(200, 400);

  const aria = await page.locator(":root").ariaSnapshot();

  // Clean up: press Escape twice to exit search
  await page.keyboard.press("Escape");
  await humanDelay(200, 400);
  await page.keyboard.press("Escape");

  return parseSearchResults(aria);
}

export async function snapshot(page, scope, chatName) {
  if (chatName) {
    await navigateToChat(page, chatName);
  }

  const rootAria = await page.locator(":root").ariaSnapshot();

  if (scope === "full") {
    return rootAria;
  }

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
}
