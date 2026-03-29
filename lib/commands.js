/**
 * Command functions that operate on a Playwright page.
 * Each function accepts a `page` and returns data (no browser lifecycle management).
 *
 * All selectors are locale-agnostic — uses structural ARIA roles and positions
 * instead of locale-specific labels.
 */

import { parseChatList, parseMessages, parseSearchResults } from "./parser.js";

function humanDelay(min = 200, max = 500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForChatList(page) {
  await page.getByRole("grid").first().waitFor({ timeout: 15000 });
}

export async function waitForMessagePanel(page) {
  // Wait for the compose textbox inside contentinfo — reliable indicator that a chat is open.
  await page.getByRole("contentinfo").getByRole("textbox").waitFor({ timeout: 10000 });
}

export async function navigateToChat(page, chatName, localeConfig, index = undefined) {
  // Try visible chat list first — parse aria for exact name match
  const chatGrid = page.getByRole("grid").first();
  if (await chatGrid.isVisible().catch(() => false)) {
    const gridAria = await chatGrid.ariaSnapshot();
    const chats = parseChatList(gridAria, localeConfig);
    const matches = chats.filter((c) => c.name === chatName);
    if (matches.length > 1) {
      if (index === undefined) {
        const list = matches.map((c, i) => `  ${i + 1}. ${c.name} (${c.time}) — ${c.lastMessage}`).join("\n");
        throw new Error(
          `Multiple chats named "${chatName}" found:\n${list}\nUse --index N to select one (1-based).`
        );
      }
      if (!Number.isInteger(index) || index < 1 || index > matches.length) {
        throw new Error(`--index ${index} is out of range (${matches.length} matches for "${chatName}")`);
      }
    }
    const exactMatch = matches.length > 1 ? matches[index - 1] : matches[0];
    if (exactMatch) {
      // Use the full gridcell label (name+time) for precise row selection
      const row = chatGrid.getByRole("row").filter({
        has: page.getByRole("gridcell", { name: exactMatch._gridcellLabel, exact: true }),
      }).first();
      await humanDelay(200, 500);
      await row.click();
      await waitForMessagePanel(page);
      return;
    }
  }

  // Fallback: search (handles archived chats and chats not in visible list).
  // Note: --index disambiguation is not supported here — if duplicate names exist
  // only in search results, the first match is used and a warning is logged.
  const searchBox = page.getByRole("textbox").first();
  await searchBox.click();
  await humanDelay(300, 600);
  await page.keyboard.type(chatName, { delay: 30 });

  try {
    await page.getByRole("grid").first().getByRole("row").filter({ hasText: chatName }).first().waitFor({ timeout: 5000 });
  } catch {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found`);
  }

  // Parse search results for exact name match
  const searchAria = await page.locator(":root").ariaSnapshot();
  const searchResults = parseSearchResults(searchAria, localeConfig);
  const searchMatch = searchResults.find((c) => c.name === chatName);
  if (!searchMatch) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found (no exact match in search results)`);
  }

  const searchGrid = page.getByRole("grid").first();
  const searchRow = searchGrid.getByRole("row").filter({
    has: page.getByRole("gridcell", { name: searchMatch._gridcellLabel, exact: true }),
  }).first();
  if (!(await searchRow.isVisible())) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(`Chat "${chatName}" not found in search results`);
  }

  await humanDelay(200, 500);
  await searchRow.click();
  await waitForMessagePanel(page);
}

export async function chats(page, localeConfig) {
  const aria = await page.locator(":root").ariaSnapshot();
  return parseChatList(aria, localeConfig);
}

export async function unread(page, localeConfig) {
  const aria = await page.locator(":root").ariaSnapshot();
  return parseChatList(aria, localeConfig).filter((c) => c.unread);
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

async function findLoadMoreButton(page) {
  // The "load more" button appears at the top of the message area when older
  // messages are available on the phone. It's a plain <button> with long
  // locale-dependent text (e.g. "Clicca qui per vedere i messaggi meno recenti
  // del tuo telefono." in Italian). Structurally: inside the scroll container,
  // before any [role="row"], not inside a row/grid/banner.
  return page.evaluate(() => {
    const scrollEl = document.querySelector('[data-greentap-scroll="1"]');
    if (!scrollEl) return false;

    const firstRow = scrollEl.querySelector('[role="row"]');
    const buttons = scrollEl.querySelectorAll("button");

    for (const btn of buttons) {
      if (btn.closest('[role="row"]') || btn.closest('[role="grid"]') || btn.closest('[role="banner"]')) continue;
      // Must appear before the first message row in DOM order
      if (firstRow && !(btn.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const text = btn.textContent?.trim() || "";
      // The load-more text is always >30 chars; filters out "Scroll to bottom",
      // "end-to-end encrypted", and icon-only buttons
      if (text.length > 30) {
        btn.click();
        return true;
      }
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
        // Before giving up, try clicking the "load more" button
        const clicked = await findLoadMoreButton(page);
        if (clicked) {
          await new Promise((r) => setTimeout(r, 1000));
          stableCount = 0;
          lastFirstKey = null;
          continue;
        }
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

  // Scroll back to bottom so subsequent reads see latest messages
  await page.evaluate(() => {
    const el = document.querySelector('[data-greentap-scroll="1"]');
    if (el) el.scrollTop = el.scrollHeight;
  });

  // Merge: oldest iteration first, dedup
  const merged = new Map();
  for (let i = iterations.length - 1; i >= 0; i--) {
    for (const msg of iterations[i]) {
      const key = dedupKey(msg);
      if (!merged.has(key)) merged.set(key, msg);
    }
  }

  // Post-dedup: remove ghost duplicates from scroll.
  // When a sender button scrolls out of view, later iterations produce messages
  // with empty sender and the sender name embedded in the text. Remove these
  // if a version with a proper sender exists at the same time.
  const result = [...merged.values()];
  const byTime = new Map();
  for (const msg of result) {
    if (!msg.time) continue;
    if (!byTime.has(msg.time)) byTime.set(msg.time, []);
    byTime.get(msg.time).push(msg);
  }
  return result.filter((msg) => {
    if (msg.sender || !msg.time) return true;
    // Empty sender — check if a version with sender exists at the same time
    const sameTime = byTime.get(msg.time);
    return !sameTime.some(
      (other) => other.sender && other !== msg &&
        (msg.text.includes(other.text) || other.text.includes(msg.text))
    );
  });
}

export async function read(page, chatName, { scroll = false, localeConfig, index } = {}) {
  await navigateToChat(page, chatName, localeConfig, index);
  if (scroll) {
    return scrollAndCollect(page);
  }
  const aria = await page.locator(":root").ariaSnapshot();
  return parseMessages(aria);
}

export async function send(page, chatName, message, localeConfig, index) {
  await navigateToChat(page, chatName, localeConfig, index);

  // Verify correct chat opened — find the header button that matches the chat name exactly
  const aria = await page.locator(":root").ariaSnapshot();
  const headerButtons = [...aria.matchAll(/button "([^"]+)"/g)].map((m) => m[1]);
  const chatHeader = headerButtons.find((label) =>
    label === chatName
  );
  if (!chatHeader) {
    throw new Error(`Wrong chat opened. Expected "${chatName}" but no matching header button found.`);
  }

  // Focus compose and type message via keyboard (fill() doesn't trigger WhatsApp's event handlers)
  const compose = page.getByRole("contentinfo").getByRole("textbox");
  await compose.waitFor({ timeout: 5000 });
  await compose.click();
  await humanDelay(300, 600);
  await page.keyboard.type(message, { delay: 30 });

  // Wait for Send button — it replaces the voice message button in contentinfo after typing.
  // The send button is the last button inside contentinfo when text is present.
  await humanDelay(200, 400);
  const contentinfoButtons = page.getByRole("contentinfo").getByRole("button");
  const buttonCount = await contentinfoButtons.count();
  if (buttonCount === 0) {
    throw new Error("No buttons found in compose area after typing.");
  }
  const sendBtn = contentinfoButtons.last();
  await sendBtn.click();

  // Wait for delivery confirmation
  await humanDelay(1000, 2000);

  // Check for send errors — if compose textbox still has text, send failed
  const remainingText = await compose.textContent().catch(() => "");
  if (remainingText && remainingText.trim().length > 0) {
    throw new Error("Message send failed — text still in compose box. Check the app.");
  }

  // Verify message appears in chat via snippet match
  const postSendAria = await page.locator(":root").ariaSnapshot();
  const textOnly = message.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "").trim();
  const msgSnippet = textOnly.length > 40 ? textOnly.slice(0, 40) : textOnly;
  if (msgSnippet && !postSendAria.includes(msgSnippet)) {
    console.error("WARNING: Sent message not found in chat snapshot.");
  }

  console.log(`Sent to ${chatName}.`);
}

export async function search(page, query, localeConfig) {
  // Search box is the first textbox (in sidebar)
  const searchBox = page.getByRole("textbox").first();
  await searchBox.click();
  await humanDelay(300, 600);
  await page.keyboard.type(query, { delay: 30 });

  try {
    // Wait for search results to appear — the grid gets replaced with results
    await page.getByRole("grid").first().getByRole("row").first().waitFor({ timeout: 5000 });
  } catch {
    // No results — will return empty
  }
  await humanDelay(200, 400);

  const aria = await page.locator(":root").ariaSnapshot();

  // Clean up: press Escape twice to exit search
  await page.keyboard.press("Escape");
  await humanDelay(200, 400);
  await page.keyboard.press("Escape");

  return parseSearchResults(aria, localeConfig);
}

export async function snapshot(page, scope, chatName, localeConfig) {
  if (chatName) {
    await navigateToChat(page, chatName, localeConfig);
  }

  const rootAria = await page.locator(":root").ariaSnapshot();

  if (scope === "full") {
    return rootAria;
  }

  const scopes = {
    chats: async () => {
      const grid = page.getByRole("grid").first();
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
