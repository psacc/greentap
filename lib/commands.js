/**
 * Command functions that operate on a Playwright page.
 * Each function accepts a `page` and returns data (no browser lifecycle management).
 *
 * All selectors are locale-agnostic — uses structural ARIA roles and positions
 * instead of locale-specific labels.
 */

import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseChatList, parseMessages, parseSearchResults, parsePollMessages, UNKNOWN_SENDER } from "./parser.js";
import { assertE2EAllowed, filterToSandbox, isE2EMode } from "./e2e-guard.js";

/** Downloads cache root. Per-chat subdir, 0o600 file mode — user-local only. */
const DOWNLOADS_DIR = join(homedir(), ".greentap", "downloads");

/** Known image mime → file extension mapping. Fallback is ".bin". */
const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Convert a chat name into a filesystem-safe slug.
 * Lowercases, replaces any non-alphanumeric run with a hyphen, and trims
 * leading/trailing hyphens. Returns "" if the input has no alphanumerics.
 * Exported for unit testing.
 * @param {string} name
 * @returns {string}
 */
export function slugifyChat(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a filename for a downloaded image.
 * Uses the message's imageId as basename and maps mime type to extension.
 * Exported for unit testing.
 * @param {{imageId: string}} msg
 * @param {string|undefined} mimeType
 * @returns {string}
 */
export function imageFilename(msg, mimeType) {
  return `${msg.imageId}.${MIME_EXT[mimeType] ?? "bin"}`;
}

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
  assertE2EAllowed(chatName);

  // Fast-path: already in the target chat. When a chat is open, the chat
  // header exposes a button whose aria label is either the chat name
  // (direct messages) or the chat name followed by a locale-specific
  // suffix (e.g. "greentap-sandbox clicca qui per info gruppo" for
  // groups, in Italian). If that header is present, skip navigation.
  //
  // Without this fast-path, callers like `read()`, `send()`, and
  // `fetchImages()` re-enter navigateToChat after each other and hit a
  // pre-existing bug: `page.getByRole("grid").first()` picks up the
  // message-panel grid (not the chat list) when a chat is already open,
  // falls through to the search fallback, and search types into the
  // compose textbox instead of the search box. Net effect: "Chat not
  // found" even though the chat is visible and active.
  //
  // IMPORTANT: scope the aria read to the LAST `role="banner"` on the
  // page. A full-page aria scan false-positives on poll authors,
  // forwarded-message authors, and reply-quote labels — all render as
  // `button "<name>"` inside the message panel. WA Web's layout puts
  // the sidebar banners (tabs, app header) first and the chat header
  // banner last, so `.last()` is the chat header.
  try {
    const headerAria = await page
      .getByRole("banner")
      .last()
      .ariaSnapshot({ timeout: 500 });
    const escaped = chatName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headerRe = new RegExp(`button "${escaped}(?: [^"]*)?"`);
    if (headerRe.test(headerAria)) return;
  } catch {
    // If aria read fails (no banner, timeout, Playwright error), fall
    // through to the normal grid-or-search path. Graceful degradation —
    // correctness is preserved, only the fast-path optimization is lost.
  }

  // Try visible chat list first — parse aria for exact name match.
  // Wait up to 2s for the grid to render before falling back to search.
  // Without this wait, a freshly-opened daemon or post-reload state may see
  // isVisible()=false even when the grid is about to paint, causing a spurious
  // search fallback. For short/generic names (e.g. "Foot") that fallback can
  // match many rows and silently pick the wrong chat.
  const chatGrid = page.getByRole("grid").first();
  const gridReady = await chatGrid
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (gridReady) {
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
    // Substring suggestion: when the grid has no exact match but DOES have
    // chats whose names start with or contain the query, surface them as
    // candidates. Match semantics are still exact (intentional — partial
    // matching is ambiguous on short queries like "Foot"), but the error
    // tells the user what to type to disambiguate.
    if (matches.length === 0) {
      const partials = chats.filter(
        (c) => c.name !== chatName && c.name.toLowerCase().includes(chatName.toLowerCase()),
      );
      if (partials.length > 0) {
        const list = partials
          .slice(0, 10)
          .map((c, i) => `  ${i + 1}. ${c.name} (${c.time}) — ${c.lastMessage ?? ""}`)
          .join("\n");
        throw new Error(
          `Chat "${chatName}" not found (no exact match in chat list). Did you mean one of:\n${list}\nUse the full name (and --index N if it's still ambiguous).`,
        );
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
  // Supports --index disambiguation the same way the grid path does.
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

  // Parse search results for exact name matches (may be >1)
  const searchAria = await page.locator(":root").ariaSnapshot();
  const searchResults = parseSearchResults(searchAria, localeConfig);
  const searchMatches = searchResults.filter((c) => c.name === chatName);
  if (searchMatches.length === 0) {
    // Surface partial matches in the search panel as candidates so the user
    // can disambiguate without re-typing variants. Match semantics stay
    // exact (we don't auto-select on partial matches — that's how short
    // queries like "Foot" silently picked the wrong chat in the past).
    const partials = searchResults.filter(
      (c) => c.name !== chatName && c.name.toLowerCase().includes(chatName.toLowerCase()),
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    if (partials.length > 0) {
      const list = partials
        .slice(0, 10)
        .map((c, i) => `  ${i + 1}. ${c.name} (${c.time}) — ${c.lastMessage ?? ""}`)
        .join("\n");
      throw new Error(
        `Chat "${chatName}" not found (no exact match in search results). Did you mean one of:\n${list}\nUse the full name (and --index N if it's still ambiguous).`,
      );
    }
    throw new Error(`Chat "${chatName}" not found (no exact match in search results)`);
  }
  if (searchMatches.length > 1 && index === undefined) {
    const list = searchMatches
      .map((c, i) => `  ${i + 1}. ${c.name} (${c.time}) — ${c.lastMessage ?? ""}`)
      .join("\n");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(
      `Multiple chats named "${chatName}" found:\n${list}\nUse --index N to select one (1-based).`,
    );
  }
  if (
    searchMatches.length > 1 &&
    (!Number.isInteger(index) || index < 1 || index > searchMatches.length)
  ) {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    throw new Error(
      `--index ${index} is out of range (${searchMatches.length} matches for "${chatName}")`,
    );
  }
  const searchMatch = searchMatches.length > 1 ? searchMatches[index - 1] : searchMatches[0];

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
  return filterToSandbox(parseChatList(aria, localeConfig));
}

export async function unread(page, localeConfig) {
  const aria = await page.locator(":root").ariaSnapshot();
  return filterToSandbox(parseChatList(aria, localeConfig).filter((c) => c.unread));
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

async function scrollAndCollect(page, localeConfig) {
  const found = await findScrollContainer(page);
  if (!found) throw new Error("Could not find scrollable message container");

  const iterations = [];
  let stableCount = 0;
  let lastFirstKey = null;
  let exitReason = "max_iterations";
  const startTime = Date.now();
  // Capture a single `now` for the entire scroll session — every iteration's
  // relative-date resolution ("Ieri" / "Yesterday") MUST anchor to the same
  // moment. Otherwise a scroll that crosses local midnight would split a
  // single conversation across two calendar days.
  const readNow = new Date();
  const MAX_ITERATIONS = 50;
  const TIMEOUT_MS = 30000;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      exitReason = "timeout";
      break;
    }

    const aria = await page.locator(":root").ariaSnapshot();
    const msgs = parseMessages(aria, { localeConfig, now: readNow });
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
  // with the sender resolved to UNKNOWN_SENDER and the sender name embedded in
  // the text. Remove these if a version with a proper sender exists at the
  // same time. The parser guarantees `sender` is always populated; the
  // ghost-sender signal is `sender === UNKNOWN_SENDER`.
  const result = [...merged.values()];
  const byTime = new Map();
  for (const msg of result) {
    if (!msg.time) continue;
    if (!byTime.has(msg.time)) byTime.set(msg.time, []);
    byTime.get(msg.time).push(msg);
  }
  return result.filter((msg) => {
    const isGhost = !msg.sender || msg.sender === UNKNOWN_SENDER;
    if (!isGhost || !msg.time) return true;
    // Ghost sender — check if a non-ghost version exists at the same time
    const sameTime = byTime.get(msg.time);
    return !sameTime.some(
      (other) => other.sender && other.sender !== UNKNOWN_SENDER && other !== msg &&
        (msg.text.includes(other.text) || other.text.includes(msg.text))
    );
  });
}

/**
 * DOM-side extractor: returns ONLY the rows that contain at least one
 * http(s) link. Each returned element is `{ links, rowText }` — the
 * row's anchor list plus its textContent so the merge step can align
 * by content rather than by index.
 *
 * Filtering policy: strict http(s) only. mailto:, tel:, wa.me/ deep-links,
 * and internal blob:/about: anchors are dropped to keep the payload
 * focused on URLs agents can actually follow.
 *
 * Why not return per-row links indexed by position? Because the parser
 * drops non-message DOM rows (date separators, encryption banner, system
 * notifications) that the DOM walker does not. Index alignment drifts
 * in the presence of those rows. Returning only link-bearing rows and
 * merging by text substring is robust to any number of interspersed
 * non-message rows.
 */
export async function collectRowLinks(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')]
      .filter((r) => !r.closest('[role="grid"]'));
    const out = [];
    for (const row of rows) {
      const seen = new Map();
      for (const a of row.querySelectorAll("a[href]")) {
        const href = a.href;
        if (!/^https?:\/\//i.test(href)) continue;
        if (!seen.has(href)) {
          seen.set(href, { href, text: (a.textContent || "").trim() });
        }
      }
      if (seen.size > 0) {
        out.push({
          links: [...seen.values()],
          rowText: (row.textContent || "").trim(),
        });
      }
    }
    return out;
  });
}

/**
 * Merge link rows (`[{links, rowText}]`) onto parser messages.
 *
 * Parser messages and linkRows are both emitted in chronological order,
 * but linkRows is a subset (only rows with http(s) anchors). Algorithm:
 * for each linkRow in order, advance through the message array until we
 * find a message that matches; claim it and move on. A linkRow that
 * matches no remaining message is silently dropped.
 *
 * Match signal, in order of preference:
 *   1. `msg.text` non-empty and contained in `linkRow.rowText`
 *      — normal case (text message with a link inline).
 *   2. `msg.text === ""` and `msg.time` contained in `linkRow.rowText`
 *      — WA renders URL-only messages with empty ARIA text; the
 *      timestamp (repeated twice in the row) is the only structural
 *      signal we have to align them.
 *
 * Greedy monotone: once we assign linkRow k to message j, the next
 * linkRow can only be assigned to messages at index > j. This
 * prevents double-claiming when multiple messages share the same
 * minute or when the rowText prefix is ambiguous.
 */
export function mergeLinksIntoMessages(messages, linkRows) {
  const out = messages.map((m) => ({ ...m, links: [] }));
  if (linkRows.length === 0) return out;

  let msgIdx = 0;
  for (const linkRow of linkRows) {
    while (msgIdx < out.length) {
      const msg = out[msgIdx];
      const matchByText =
        msg.text && msg.text.length > 0 && linkRow.rowText.includes(msg.text);
      const matchByTime =
        (!msg.text || msg.text.length === 0) &&
        msg.time &&
        linkRow.rowText.includes(msg.time);
      if (matchByText || matchByTime) {
        msg.links = linkRow.links;
        msgIdx++;
        break;
      }
      msgIdx++;
    }
    if (msgIdx >= out.length) break;
  }
  return out;
}

export async function read(page, chatName, { scroll = false, localeConfig, index, withLinks = true } = {}) {
  assertE2EAllowed(chatName);
  await navigateToChat(page, chatName, localeConfig, index);
  if (scroll) {
    // Scroll mode: skip link enrichment (rows cycle in/out of the DOM,
    // index correlation across iterations isn't reliable). Revisit as
    // a follow-up if demand warrants.
    return scrollAndCollect(page, localeConfig);
  }
  const aria = await page.locator(":root").ariaSnapshot();
  // Capture `now` at read time so relative-date separators ("Ieri" / "Yesterday")
  // resolve deterministically against the snapshot's read moment, not against
  // a slightly-later parse moment that could fall on the next calendar day.
  const messages = parseMessages(aria, { localeConfig, now: new Date() });
  if (!withLinks) return messages;

  // Immediately collect DOM links while the same view is still mounted.
  try {
    const linksPerRow = await collectRowLinks(page);
    return mergeLinksIntoMessages(messages, linksPerRow);
  } catch (err) {
    // If DOM walk fails for any reason, fall back to messages without links.
    // Log the cause so "no links" is distinguishable from "DOM walk crashed".
    console.error("[read] collectRowLinks failed:", err?.message);
    return mergeLinksIntoMessages(messages, []);
  }
}

export async function send(page, chatName, message, localeConfig, index) {
  assertE2EAllowed(chatName);
  await navigateToChat(page, chatName, localeConfig, index);

  // Verify correct chat opened — find a header button whose label is the
  // chat name, or starts with the chat name followed by a space. Group
  // chats have a locale-specific suffix (e.g. "clicca qui per info gruppo"
  // in Italian) appended to the name in the chat header button label.
  const aria = await page.locator(":root").ariaSnapshot();
  const headerButtons = [...aria.matchAll(/button "([^"]+)"/g)].map((m) => m[1]);
  const chatHeader = headerButtons.find(
    (label) => label === chatName || label.startsWith(chatName + " "),
  );
  if (!chatHeader) {
    throw new Error(`Wrong chat opened. Expected "${chatName}" but no matching header button found.`);
  }

  // Focus compose and type message via keyboard (fill() doesn't trigger WhatsApp's event handlers)
  const compose = page.getByRole("contentinfo").getByRole("textbox");
  await compose.waitFor({ timeout: 5000 });
  await compose.click();
  await humanDelay(300, 600);

  // Multi-line handling: a literal "\n" in the typed string is treated by
  // WhatsApp Web as a submit-equivalent inside the compose textbox, which
  // would fan out a 3-line message into 3 separate bubbles. The intended
  // "newline within a single message" key is Shift+Enter. So we split the
  // message on newline boundaries, type each segment, and press
  // Shift+Enter between segments. Normalize CRLF to LF first so messages
  // pasted from Windows-style sources behave the same. The final Enter
  // submission happens via the Send button click below — keep both paths
  // in sync.
  const segments = message.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].length > 0) {
      await page.keyboard.type(segments[i], { delay: 30 });
    }
    if (i < segments.length - 1) {
      await page.keyboard.press("Shift+Enter");
    }
  }

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

export async function pollResults(page, chatName, { localeConfig, index } = {}) {
  assertE2EAllowed(chatName);
  await navigateToChat(page, chatName, localeConfig, index);

  const found = await findScrollContainer(page);
  if (!found) throw new Error("Could not find scrollable message container");

  let polls = [];
  let stableCount = 0;
  let lastFirstKey = null;
  const startTime = Date.now();
  const MAX_ITERATIONS = 50;
  const TIMEOUT_MS = 30000;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) break;

    const aria = await page.locator(":root").ariaSnapshot();
    const found_polls = parsePollMessages(aria);
    if (found_polls.length > 0) {
      // Keep scanning up for older polls in case multiple are visible;
      // after the first batch, track stability and return when nothing new appears.
      polls = found_polls;
    }

    // Check scroll stability (same first message = can't go further).
    // No locale/now needed here — we only key on sender|time|text snippets,
    // never on the resolved timestamp.
    const msgs = parseMessages(aria);
    const firstKey = msgs.length > 0 ? dedupKey(msgs[0]) : null;
    if (firstKey && firstKey === lastFirstKey) {
      stableCount++;
      if (stableCount >= 3) {
        const clicked = await findLoadMoreButton(page);
        if (clicked) {
          await new Promise((r) => setTimeout(r, 1000));
          stableCount = 0;
          lastFirstKey = null;
          continue;
        }
        break;
      }
    } else {
      stableCount = 1;
      lastFirstKey = firstKey;
    }

    // If we already have polls and we've scrolled past the visible area
    // once (i > 0), the most recent poll is already captured — stop early
    // to avoid scanning the entire history unnecessarily.
    if (polls.length > 0 && i > 0) break;

    // Scroll up to look for more recent polls further back in history
    await page.evaluate(() => {
      const el = document.querySelector("[data-greentap-scroll=\"1\"]");
      if (el) el.scrollTop = 0;
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  // Scroll back to bottom
  await page.evaluate(() => {
    const el = document.querySelector("[data-greentap-scroll=\"1\"]");
    if (el) el.scrollTop = el.scrollHeight;
  });

  // Return the most recent poll (last in list = lowest in snapshot = most recent)
  return polls.length > 0 ? polls[polls.length - 1] : null;
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

  return filterToSandbox(parseSearchResults(aria, localeConfig));
}

/**
 * Download recent images from a chat to local files.
 *
 * Navigates to <chatName>, parses the aria snapshot for image-kind messages,
 * and extracts each image blob in-page via `fetch(blobUrl)` → base64 → file.
 * Files land at ~/.greentap/downloads/<chat-slug>/<imageId>.<ext> with 0o600
 * mode.
 *
 * By default only the currently-visible chat window is scanned. In an active
 * group, recent images may already have scrolled out of the visible buffer;
 * pass `scroll: true` to scroll up first so older image rows are loaded into
 * the DOM before blob extraction. Empty results emit a diagnostic on stderr
 * (`stderr: true` is the default) so the caller can distinguish "no images"
 * from "limit too low / scrolled out / blob URL missing".
 *
 * Returns one result per image-message, in DOM order:
 * `[{ imageId, path, sender, time, timestamp, mimeType }]`.
 * Failed downloads surface as `{ imageId, error }`.
 *
 * @param {import("playwright").Page} page
 * @param {string} chatName
 * @param {object} [options]
 * @param {object} [options.localeConfig]
 * @param {number} [options.index] - 1-based disambiguation for duplicate names
 * @param {number} [options.limit=20] - Cap on images fetched (most recent)
 * @param {boolean} [options.scroll=false] - Scroll up to load older images
 *   before extraction (mirrors `read --scroll`).
 * @param {boolean} [options.stderr=true] - Emit diagnostics to stderr when
 *   parsing/extraction yields zero downloads.
 * @returns {Promise<Array<object>>}
 */
export async function fetchImages(
  page,
  chatName,
  { localeConfig, index, limit = 20, scroll = false, stderr = true } = {},
) {
  assertE2EAllowed(chatName);
  await navigateToChat(page, chatName, localeConfig, index);

  // Optional scroll-back. We don't use the parsed messages from the scroll
  // iterations directly — the blob URLs we fetch below come from the current
  // DOM, and the final scrollAndCollect step lands the view back at the
  // bottom. Scrolling primarily serves to coax WA into materialising older
  // image rows into the DOM (lazy-virtualised list); some blob URLs may
  // still be revoked once the row scrolls out of view.
  if (scroll) {
    await scrollAndCollect(page, localeConfig);
  }

  // 1. Parse aria to identify image messages + their order within the row area.
  const aria = await page.locator(":root").ariaSnapshot();
  // Pass `now` so any relative-date separator above the image rows resolves
  // deterministically against the read moment.
  const allMsgs = parseMessages(aria, { localeConfig, now: new Date() });
  const allImages = allMsgs.filter((m) => m.kind === "image");
  const images = allImages.slice(-limit);
  if (images.length === 0) {
    if (stderr) {
      console.error(
        `[fetch-images] no image-kind messages in the ${
          scroll ? "scrolled" : "visible"
        } chat window for "${chatName}" (parsed ${allMsgs.length} messages, ${
          allImages.length
        } images). Try ${scroll ? "increasing --limit" : "--scroll"} or sending a fresh image.`,
      );
    }
    return [];
  }

  // 2. Collect blob payloads in-page. We walk message rows (rows NOT
  //    inside the chat-list grid) in DOM order. Each image message row
  //    contains two `<img>` siblings: a low-res `data:` placeholder
  //    (~100px wide) and a `blob:` full thumbnail (~600px wide). Neither
  //    is wrapped in a `<button>` element — the previous implementation
  //    assumed `<button>` wrappers with 2+ `<img>` children and found
  //    nothing, so fetchImages was silently broken.
  //
  //    Fix: for each row, pick any `<img src^="blob:">`. Fallback to a
  //    CSS `background-image: url("blob:...")` scan in case WA moves the
  //    URL off the `<img>` element. One URL per row, preserving DOM
  //    order. Slice(-count) to match parser's slice(-limit) semantics.
  const payloads = await page.evaluate(async (count) => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'))
      .filter((r) => !r.closest('[role="grid"]'));

    // One blob URL per row. Only consider <img> elements whose src is a
    // blob: URL — this excludes the data: placeholder (which has the
    // same 100px naturalWidth as an unloaded blob and would otherwise
    // win the tiebreaker before decode completes), plus emoji images,
    // delivery-status icons (msg-dblcheck), and avatars.
    // Among candidate blob imgs, keep the one with the highest
    // naturalWidth (the full thumbnail vs any preview sibling).
    const imageTargets = [];
    for (const row of rows) {
      let best = null;
      let bestWidth = -1;
      for (const img of row.querySelectorAll("img")) {
        if (!img.src || !img.src.startsWith("blob:")) continue;
        const w = img.naturalWidth || 0;
        if (w > bestWidth) {
          best = img.src;
          bestWidth = w;
        }
      }
      if (best) imageTargets.push(best);
    }

    // Match parser slice(-count) semantics: keep the most recent `count`.
    const targets = imageTargets.slice(-count);

    const out = [];
    for (const url of targets) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          out.push({ error: `fetch status ${resp.status}` });
          continue;
        }
        const blob = await resp.blob();
        const buf = new Uint8Array(await blob.arrayBuffer());
        // Chunked base64 to avoid String.fromCharCode.apply stack limits
        // on large thumbnails.
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
        }
        out.push({ mimeType: blob.type, base64: btoa(binary) });
      } catch (err) {
        out.push({ error: err && err.message ? err.message : String(err) });
      }
    }
    return out;
  }, images.length);

  // 3. Write files. Chat-scoped directory, per-user cache.
  const chatDir = join(DOWNLOADS_DIR, slugifyChat(chatName));
  mkdirSync(chatDir, { recursive: true });

  // Diagnostic: parser saw image rows but no blob URLs landed in the DOM
  // walk. Most common cause is WA having revoked the blobs because the row
  // scrolled out of view between aria capture and DOM read; scroll mode
  // helps but isn't a guarantee. Surface this so the caller doesn't get
  // silent empty results.
  if (stderr && payloads.length === 0) {
    console.error(
      `[fetch-images] parser found ${images.length} image rows but the DOM walk found 0 blob: URLs. ` +
        `WA may have revoked the thumbnails. Re-run with --scroll, or open the chat in the daemon's browser to keep images warm.`,
    );
  }

  const results = [];
  for (let i = 0; i < images.length; i++) {
    const msg = images[i];
    const payload = payloads[i];
    if (!payload || payload.error) {
      results.push({ imageId: msg.imageId, error: payload?.error ?? "no payload" });
      continue;
    }
    const filename = imageFilename(msg, payload.mimeType);
    const filepath = join(chatDir, filename);
    writeFileSync(filepath, Buffer.from(payload.base64, "base64"), { mode: 0o600 });
    results.push({
      imageId: msg.imageId,
      path: filepath,
      sender: msg.sender,
      time: msg.time,
      timestamp: msg.timestamp,
      mimeType: payload.mimeType,
    });
  }
  return results;
}

/**
 * Identify the WhatsApp account currently logged into the browser.
 *
 * Returns `{ name, phone }` — either field may be `null` if it could not be
 * detected. Both being `null` is graceful degradation, not an error.
 *
 * Algorithm (locale-agnostic):
 *   1. Locate the sidebar profile button by DOM signal — it's the only
 *      `<button>` whose child `<img>` has a `whatsapp.net` source (the
 *      account's profile picture). The button's aria-label is locale-
 *      specific ("Tu" / "You") so we ignore it.
 *   2. Click it. WhatsApp Web opens a settings menu where the FIRST
 *      `heading [level=2]` is the account's display name.
 *   3. Click the first `listitem` button inside that menu — opens the
 *      "Edit profile" pane. There, the phone number appears as a `text:`
 *      node prefixed with a locale-specific label (e.g. "Phone +1…"
 *      / "Telefono +XX…"). We extract via regex on `+\d` patterns — the
 *      phone is the only `+digits` text in the pane.
 *   4. Press Escape twice to close both panes — restores the chat list
 *      view that other commands assume.
 *
 * Failures degrade quietly: if any DOM step fails, the corresponding field
 * is `null`. We always attempt to close panes.
 */
export async function whoami(page) {
  let name = null;
  let phone = null;
  let openedPanes = 0;

  try {
    // Step 1 — find profile button by DOM signal.
    const profileBtnFound = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button[aria-label]')];
      for (const b of buttons) {
        const img = b.querySelector("img");
        if (img && img.src && img.src.includes(".whatsapp.net")) {
          b.click();
          return true;
        }
      }
      return false;
    });

    if (!profileBtnFound) {
      console.error("[whoami] profile button not found in sidebar; account identity could not be detected.");
      return { name: null, phone: null };
    }
    openedPanes++;
    await new Promise((r) => setTimeout(r, 800));

    // Step 2 — display name = first level-2 heading after first banner.
    // We scan the whole aria; the *first* level-2 heading is the user's
    // display name (the sidebar header above the settings menu).
    // The "WhatsApp" wordmark heading also exists but appears later inside
    // a nested banner block.
    const ariaMenu = await page.locator(":root").ariaSnapshot();
    const headingMatch = ariaMenu.match(/- heading "([^"]+)" \[level=2\]/);
    if (headingMatch) {
      const candidate = headingMatch[1].trim();
      // Filter out the "WhatsApp" wordmark heading — it's the only known
      // non-name level-2 heading on this view.
      if (candidate.toLowerCase() !== "whatsapp") {
        name = candidate;
      }
    }

    // Step 3 — drill into "Edit profile" pane to find phone.
    try {
      const firstListItem = page.getByRole("listitem").first();
      const profileBtn = firstListItem.getByRole("button").first();
      await profileBtn.click({ timeout: 3000 });
      openedPanes++;
      await new Promise((r) => setTimeout(r, 800));

      const ariaProfile = await page.locator(":root").ariaSnapshot();
      // Phone is a `text:` node with a leading "+" then digits/spaces/dashes.
      // Restrict to the first 50 lines or so to avoid matching phone numbers
      // in chat content (e.g. system messages "X ha aggiunto +XX …").
      const profileLines = ariaProfile.split("\n").slice(0, 60);
      for (const line of profileLines) {
        const m = line.match(/- text:\s*\S+\s*(\+\d[\d\s\-]{6,})\s*$/);
        if (m) {
          phone = m[1].trim();
          break;
        }
      }
      // Fallback: bare phone with no preceding label
      if (!phone) {
        for (const line of profileLines) {
          const m = line.match(/- text:\s*(\+\d[\d\s\-]{6,})\s*$/);
          if (m) {
            phone = m[1].trim();
            break;
          }
        }
      }
    } catch (err) {
      console.error("[whoami] could not open profile pane:", err?.message);
    }
  } finally {
    // Always try to close panes so the caller's chat-list state is restored.
    for (let i = 0; i < openedPanes; i++) {
      try {
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        // ignore
      }
    }
  }

  return { name, phone };
}

export async function snapshot(page, scope, chatName, localeConfig) {
  if (isE2EMode() && !chatName) {
    throw new Error("E2E mode: snapshot requires a chat name (got none)");
  }
  if (chatName) assertE2EAllowed(chatName);
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
