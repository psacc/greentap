/**
 * Pure parsing and formatting functions for greentap.
 * No Playwright or browser dependencies.
 *
 * All parsing is locale-agnostic — uses structural selectors (ARIA roles,
 * positions, icon markers) instead of locale-specific strings.
 * Day names and relative dates are provided via localeConfig from lib/locale.js.
 */

import { buildTimePattern } from "./locale.js";

/**
 * Regex to strip unread badge prefix from chat name gridcell labels.
 * WhatsApp prepends "N unread message(s)" (locale-dependent) to the inner
 * gridcell label when a chat has unread messages. This contaminates the
 * extracted chat name, breaking downstream commands (e.g. `read`) that
 * match by name.
 *
 * Covers: English, Italian, French, German, Spanish, Portuguese, Dutch,
 * Polish, Turkish, Swedish, Danish, Norwegian, Finnish, Czech, Romanian,
 * Ukrainian, Hungarian, Croatian, Slovak, Bulgarian, Indonesian, Malay,
 * Catalan, Russian, Arabic, Hindi, Thai, Vietnamese, Japanese, Korean,
 * Chinese (Simplified/Traditional).
 */
const UNREAD_BADGE_PREFIX = new RegExp(
  "^\\d+\\s+(" +
    // English
    "unread messages?|" +
    // Italian
    "messaggi non letti|messaggio non letto|" +
    // French
    "messages? non lus?|" +
    // German
    "ungelesene Nachrichten?|" +
    // Spanish
    "mensajes? no leídos?|mensajes? sin leer|" +
    // Portuguese
    "mensagens? não lidas?|" +
    // Dutch
    "ongelezen berichten?|" +
    // Polish
    "nieprzeczytane wiadomości|nieprzeczytanych wiadomości|" +
    // Turkish
    "okunmamış mesaj|" +
    // Swedish
    "olästa meddelanden?|" +
    // Danish
    "ulæste beskeder?|" +
    // Norwegian
    "uleste meldinger?|" +
    // Finnish
    "lukematonta? viestiä?|" +
    // Czech
    "nepřečtené zprávy?|nepřečtených zpráv|" +
    // Romanian
    "mesaje necitite|mesaj necitit|" +
    // Ukrainian
    "непрочитаних повідомлень|непрочитане повідомлення|" +
    // Hungarian
    "olvasatlan üzenet(?:ek)?|" +
    // Croatian
    "nepročitanih poruka|nepročitana poruka|" +
    // Slovak
    "neprečítané správy?|neprečítaných správ|" +
    // Bulgarian
    "непрочетени съобщения|непрочетено съобщение|" +
    // Indonesian
    "pesan belum dibaca|" +
    // Malay
    "mesej belum dibaca|" +
    // Catalan
    "missatges? no llegits?|" +
    // Russian
    "непрочитанных сообщений|непрочитанное сообщение|" +
    // Arabic
    "رسائل غير مقروءة|رسالة غير مقروءة|" +
    // Hindi
    "अपठित संदेश|" +
    // Thai
    "ข้อความที่ยังไม่ได้อ่าน|" +
    // Vietnamese
    "tin nhắn chưa đọc|" +
    // Japanese
    "件の未読メッセージ|" +
    // Korean
    "개의 읽지 않은 메시지|" +
    // Chinese (Simplified)
    "条未读消息|" +
    // Chinese (Traditional)
    "則未讀訊息" +
  ")\\s+",
  "i"
);

// Fallback locale config for unit tests with Italian fixtures
const ITALIAN_FALLBACK = {
  dayNames: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
  yesterday: "Ieri",
  today: "Oggi",
  dateRegex: "\\d{2}\\/\\d{2}\\/\\d{4}",
};

/**
 * Parse chat entries from a WhatsApp Web aria snapshot.
 * Finds the first grid element and extracts chat rows from it.
 * @param {string} ariaText
 * @param {object} [localeConfig]
 */
export function parseChatList(ariaText, localeConfig) {
  if (!ariaText) return [];

  const locale = localeConfig || ITALIAN_FALLBACK;
  const timePattern = buildTimePattern(locale);

  const chats = [];
  // Match each row in the chat list grid
  // Two formats: - row "label": or - 'row "label"':
  const rowRegex = /- (?:')?row "(.+?)"(?:')?:\n([\s\S]*?)(?=\n    - (?:')?row "|\n  - text:|\n  - button|\n  - contentinfo)/g;

  let match;
  while ((match = rowRegex.exec(ariaText)) !== null) {
    const rowBody = match[2];

    // Extract name + time from the inner gridcell (second gridcell, the one with just name+time)
    const nameTimeMatch = rowBody.match(/- gridcell "(.+?)"\n/);
    if (!nameTimeMatch) continue;

    const nameTimeStr = nameTimeMatch[1];

    const timeMatch = nameTimeStr.match(timePattern);

    let name, time;
    if (timeMatch) {
      // First non-null capture group is the time value
      time = timeMatch.slice(1).find((g) => g !== undefined);
      name = nameTimeStr.slice(0, timeMatch.index).trim();
    } else {
      time = "";
      name = nameTimeStr.trim();
    }

    // Strip unread badge prefix (e.g. "3 unread messages ", "1 messaggio non letto ")
    name = name.replace(UNREAD_BADGE_PREFIX, "");

    // Extract last message from text: nodes (first one after the name gridcell)
    const textNodes = [...rowBody.matchAll(/- text: (.+)/g)];
    const lastMessage = textNodes.length > 0 ? textNodes[0][1].trim() : "";

    // Extract unread count — gridcell with numeric value (locale-agnostic).
    // In current WhatsApp aria, only unread-count gridcells have numeric values.
    const unreadMatch = rowBody.match(/- gridcell "[^"]*": "(\d+)"/);
    const unread = unreadMatch ? parseInt(unreadMatch[1], 10) : 0;

    chats.push({ name, time, lastMessage, unread: unread > 0, unreadCount: unread, _gridcellLabel: nameTimeStr });
  }

  return chats;
}

/**
 * Print chat entries to stdout.
 */
export function printChats(chats) {
  if (chats.length === 0) {
    console.log("No chats found.");
    return;
  }
  for (const c of chats) {
    const marker = c.unread ? "*" : " ";
    const time = c.time ? ` (${c.time})` : "";
    const count = c.unreadCount > 0 ? ` [${c.unreadCount}]` : "";
    console.log(`${marker} ${c.name}${time}${count}`);
    if (c.lastMessage) console.log(`    ${c.lastMessage}`);
  }
}

/**
 * Resolve a date separator label to a Date object.
 * Handles: "Oggi"/"Today" (relative today), "Ieri"/"Yesterday" (relative yesterday),
 * DD/MM/YYYY absolute dates, and locale day names (most recent past weekday).
 *
 * @param {string} text - The separator label text
 * @param {object} locale - Locale config (dayNames, today, yesterday)
 * @param {Date} now - Current date (for testability)
 * @returns {Date|null}
 */
function parseDateSeparator(text, locale, now) {
  const today = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  // Locale-string matching only when a localeConfig is explicitly provided.
  // Without it, we skip today/yesterday/day-name resolution to avoid silent wrong-locale matches.
  if (locale) {
    if (text.toLowerCase() === locale.today.toLowerCase()) return new Date(today);

    if (text.toLowerCase() === locale.yesterday.toLowerCase()) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return d;
    }
  }

  // Absolute date: DD/MM/YYYY (European format used in Italian and most locales).
  // Structural match — no locale needed.
  const dmyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
  }

  if (locale) {
    // Day name: find most recent past weekday.
    // dayNames[0]=Monday … dayNames[6]=Sunday → JS DOW: Mon=1 … Sun=0
    // daysBack=0 (same weekday as today) → use 7: WhatsApp shows "Oggi" for today, never a day name.
    const dayIdx = locale.dayNames.findIndex((d) => d.toLowerCase() === text.toLowerCase());
    if (dayIdx !== -1) {
      const targetDow = (dayIdx + 1) % 7;
      const daysBack = ((today.getDay() - targetDow + 7) % 7) || 7;
      const d = new Date(today);
      d.setDate(d.getDate() - daysBack);
      return d;
    }
  }

  return null;
}

/**
 * Format a date + HH:MM time as "YYYY-MM-DD HH:MM".
 * Returns `null` if either argument is missing — callers must treat
 * "no timestamp" as a distinct value, not as the empty string. The
 * empty-string sentinel was a footgun: agents check `if (msg.timestamp)`
 * which would hide both genuine "no date" and accidental empty strings.
 * @param {Date|null} date
 * @param {string} time
 * @returns {string|null}
 */
function formatTimestamp(date, time) {
  if (!date || !time) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d} ${time}`;
}

/**
 * Non-cryptographic 32-bit string hash (FNV-like with imul).
 * Used for stable, compact image IDs derived from message-row identity.
 * Returns a zero-padded 8-char lowercase hex string.
 * @param {string} str
 * @returns {string}
 */
export function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Detect whether a message row body contains at least one image attachment.
 *
 * Structural, locale-independent heuristic: image messages in WhatsApp Web
 * aria snapshots appear as a `button "<locale-specific label>":` block whose
 * immediate children are two or more `- img` lines. This distinguishes them
 * from emoji reaction buttons (which wrap a single img) and from delivery
 * status icons (which are bare `img "msg-check"`/`msg-dblcheck` lines, not
 * inside a button).
 *
 * @param {string} rowBody - Indented row body text (children of the row).
 * @returns {number} Number of image buttons detected (0 = not an image row).
 */
function countImageButtons(rowBody) {
  // Split body into top-level child blocks. A "block" is a `- <whatever>` line
  // at 4-space indent (direct row children) followed by deeper-indented lines.
  const lines = rowBody.split("\n");
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Row children are at 4-space indent in the snapshot (row is at 2-space).
    const btnMatch = line.match(/^    - button "[^"]*":\s*$/);
    if (!btnMatch) continue;

    // Collect this button's children (at 6+ space indent until we dedent back).
    const children = [];
    for (let j = i + 1; j < lines.length; j++) {
      const child = lines[j];
      if (/^      \S/.test(child)) {
        children.push(child.trim());
      } else if (/^    \S/.test(child) || /^  \S/.test(child) || child === "") {
        break;
      }
    }

    // Image buttons have children that are exclusively `img` entries (with or
    // without alt), and at least two of them. Reaction buttons wrap exactly
    // one img (the reaction emoji); they must NOT match.
    if (children.length < 2) continue;
    const allImg = children.every((c) => /^- img(\s|$|")/.test(c));
    if (allImg) count++;
  }
  return count;
}

/**
 * Sentinel used when a message's sender cannot be resolved from the row's
 * own ARIA structure or from the carried-over previous-row sender.
 * Always-populated invariant: `sender` is never an empty string.
 */
export const UNKNOWN_SENDER = "(unknown)";

/**
 * Strip WhatsApp's "not in your contacts" tilde prefix from a sender name.
 *
 * WhatsApp Web renders senders saved in the group but absent from the
 * viewer's address book as "~Display Name". The tilde is presentation
 * cruft — it's part of WA's UI, not the contact's identity. Leaving it in
 * `sender` produces noisy values like "~userc" that:
 *   - don't match clean contact names downstream (Todoist, Neko summaries)
 *   - break exact-match comparisons against other-source contact lists
 *   - leak into the JSON contract as a presentation artifact
 *
 * Strip a single leading `~` (with any trailing whitespace) — never strip
 * mid-string tildes (rare but possible in display names).
 *
 * @param {string} name
 * @returns {string}
 */
function stripTildePrefix(name) {
  if (!name) return name;
  // WA renders the prefix as either "~Name" or "~ Name" depending on layout.
  return name.replace(/^~\s*/, "");
}

/**
 * Strip WhatsApp's "probable contact match" prefix from a sender name.
 *
 * When WA's contact-vs-phone heuristic is uncertain — typically an
 * incoming message from a phone number that resembles a saved contact —
 * the sender label gets a leading word like "Forse" (Italian: "maybe"),
 * "Maybe" (English), "Peut-être" (French) etc. The prefix is presentation
 * cruft that leaks into our `sender` JSON field and degrades downstream
 * matching against contact lists.
 *
 * Strip the leading word + space when it matches a known locale form.
 * Conservative — we don't drop "Forse" mid-string (could be part of a
 * legitimate display name).
 *
 * @param {string} name
 * @returns {string}
 */
function stripProbableMatchPrefix(name) {
  if (!name) return name;
  // Italian, English, French, German, Spanish, Portuguese, Dutch, Polish,
  // Catalan. Word-boundary anchored at start; trailing whitespace required
  // so we don't accidentally strip names like "Forsemann".
  return name.replace(
    /^(?:Forse|Maybe|Peut-être|Vielleicht|Quizás|Quizá|Talvez|Misschien|Może|Potser)\s+/i,
    "",
  );
}

/**
 * Strip WhatsApp's trailing phone number from a sender name.
 *
 * For contacts NOT saved in the viewer's address book, WhatsApp appends the
 * raw international phone number to the display name in the sender button's
 * accessible name ("Apri dettagli chat di Marco Bianchi +39 555 0100 200").
 * The number is presentation cruft that:
 *   - pollutes the `sender` identity field (wrong attribution value)
 *   - leaks PII (a real phone number) into the JSON contract
 *   - breaks exact-match comparisons against clean contact lists downstream
 *
 * Strip a trailing `+<digits/spaces>` phone token ONLY when a non-phone name
 * precedes it. A truly nameless contact renders as just the phone number —
 * that IS its identity, so leave it intact rather than collapsing to empty.
 *
 * @param {string} name
 * @returns {string}
 */
function stripTrailingPhone(name) {
  if (!name) return name;
  // Require: some non-whitespace name text, whitespace, then a phone token
  // (leading "+", then ≥7 digits possibly separated by spaces). Anchored to
  // the end so we only ever drop a trailing number, never mid-string digits.
  const m = name.match(/^(.*\S)\s+\+\d[\d\s]{5,}\d$/);
  return m ? m[1].trim() : name;
}

/**
 * Canonicalize a raw sender/quoted-sender label into a clean contact name.
 * Applies, in order: WA "~" not-in-contacts prefix → locale "probable match"
 * word (Forse/Maybe/…) → trailing phone number. Single entry point so every
 * sender extraction site (sender button, row label, quote card) stays
 * consistent.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanSenderName(raw) {
  return stripTrailingPhone(stripProbableMatchPrefix(stripTildePrefix(raw)));
}

/**
 * Strip a leading sender-name label from a joined message string.
 *
 * WhatsApp renders the author's name as the first node of a group message
 * bubble, in one of three forms: bare ("Marco Bianchi"), tilde for
 * not-in-contacts ("~Marco Bianchi"), or tilde+space ("~ Marco Bianchi").
 * We strip whichever prefix matches so the message text doesn't begin with
 * the author's own name. `sender` is already canonicalized (tilde/phone
 * stripped), so we reconstruct the raw variants from it.
 *
 * @param {string} joined - The space-joined message text.
 * @param {string} sender - The canonical sender name.
 * @returns {string}
 */
function stripSenderPrefix(joined, sender) {
  if (!sender) return joined;
  for (const v of [`~${sender}`, `~ ${sender}`, sender]) {
    if (joined === v) return "";
    if (joined.startsWith(v + " ")) return joined.slice(v.length).trim();
  }
  // Legacy fallback: bare prefix with no following space (preserved behavior).
  if (joined.startsWith(sender)) return joined.slice(sender.length).trim();
  return joined;
}

/**
 * Collect a message row's content tokens in document order, interleaving text
 * with emoji.
 *
 * Emoji are rendered as `img "<glyph>"` nodes (the accessible name IS the emoji
 * character), so a text-node-only pass silently drops them — a message that is
 * just "👍" reads as empty, and "Mi piace 😅 molto" loses the emoji. We restore
 * them by walking the row body line-by-line and emitting emoji imgs alongside
 * text nodes, preserving order.
 *
 * Which emoji count as message content is the crux: only DIRECT-CHILD imgs
 * (4-space indent — direct children of the row) are the message's own emoji.
 * Nested imgs are NOT content: contact avatars, reaction emoji (inside a
 * `button "reazione …"`), and quoted-message emoji (inside the quote card,
 * already carried by quoted_text) all live deeper and must be excluded.
 * Emoji are distinguished from system icon ids (`wds-ic-*`, `msg-*`, `ic-*`,
 * `wa-*`) structurally: an emoji glyph contains a non-ASCII codepoint; icon ids
 * are pure ASCII.
 *
 * @param {string[]} bodyLines - The row's body lines, original indentation kept.
 * @param {boolean} directTextOnly - true → only 4-space text nodes (for `body`,
 *   excludes nested quote-bleed text); false → text at any depth (for the
 *   legacy `text` field that retains the bleed). Emoji are always direct-only.
 * @returns {string[]} ordered content tokens (time nodes removed)
 */
function collectRowContent(bodyLines, directTextOnly) {
  const out = [];
  for (const line of bodyLines) {
    const tm = line.match(/^( *)- text: (.+)$/);
    if (tm) {
      if (directTextOnly && tm[1].length !== 4) continue;
      if (/^\d{1,2}:\d{2}$/.test(tm[2].trim())) continue; // standalone time
      const v = tm[2].replace(/\s+\d{1,2}:\d{2}$/, "").trim(); // trailing time
      if (v) out.push(v);
      continue;
    }
    const im = line.match(/^( *)- img "(.+?)"$/);
    if (im && im[1].length === 4 && /[^\x00-\x7F]/.test(im[2])) {
      out.push(im[2]); // direct-child emoji glyph
    }
  }
  return out;
}

/**
 * Detect a quoted-reply block inside a row body.
 *
 * WhatsApp Web renders a quote-reply as a sibling container at the same
 * level as the row's other direct children. The container's exact ARIA
 * role varies:
 *   - `generic:` — historical default (still seen in some snapshots)
 *   - `button "<locale label>":` — current default; the quote-card is
 *     clickable to scroll the conversation to the original message
 *   - `link "<...>":` — also observed in some WA Web layouts
 *
 * Inside the container we always find exactly two `text:` grandchildren:
 * quoted-sender first, then a snippet of the quoted message. The reply
 * body lives as sibling `text:` nodes outside the quote container.
 *
 * Structural detector — no locale strings involved. The strict signature
 * (exactly two text children, no other element types) keeps button/link
 * containers from false-positiving on unrelated 2-text content (e.g. date
 * + time pairs in a forwarded-message header).
 *
 * The row body is captured with original indentation: direct row children
 * sit at 4-space indent, so a quote-card container is at indent 4 and its
 * inner `text:` lines are at indent 6.
 *
 * Returns `{ quotedSender, quotedText }` if a quote block is found,
 * or `null` otherwise.
 *
 * @param {string} rowBody
 * @returns {{quotedSender: string, quotedText: string} | null}
 */
function extractQuoteBlock(rowBody) {
  const lines = rowBody.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Match any of the container shapes WA uses for quote-cards:
    //   `generic:` (no label)
    //   `button "...":` / `link "...":` (with a locale-specific aria label)
    //   `gridcell:` and bare `button:` (no label) — observed in some
    //     snapshots where WA omits the aria label on the quote container.
    // The strict 2-text-children check below (plus the HH:MM/date decorative
    // guard) filters out non-quote buttons (image attachments, reactions),
    // non-quote links, and decorative date+time gridcells.
    const containerMatch = lines[i].match(
      /^( +)- (?:generic|gridcell|button|link|button "[^"]*"|link "[^"]*"):\s*$/,
    );
    if (!containerMatch) continue;
    const baseIndent = containerMatch[1].length;

    // Collect this container's direct child lines. A direct child has
    // indent === baseIndent + 2 (one more level deep).
    const childIndent = baseIndent + 2;
    const childPrefix = " ".repeat(childIndent) + "- ";
    const children = [];
    let scannedAnyChild = false;
    for (let j = i + 1; j < lines.length; j++) {
      const child = lines[j];
      if (child.startsWith(childPrefix)) {
        children.push(child.slice(childPrefix.length));
        scannedAnyChild = true;
      } else if (child.length > 0 && /^\s/.test(child)) {
        const lead = child.match(/^( +)/)[1].length;
        if (lead <= baseIndent) break; // dedented out / sibling
        // deeper indent than childIndent — grandchild, ignore
      } else {
        break;
      }
    }
    if (!scannedAnyChild) continue;

    // Quote block signature: exactly two direct children where the FIRST is a
    // `text:` node (the quoted sender) and the SECOND is the quoted message —
    // delivered in one of two shapes:
    //   (a) `text: <quoted text>`         — older / plain-text quotes
    //   (b) `button "<quoted text>"[:]`   — current WA Web: the quoted bubble
    //        is a clickable button whose accessible name IS the quoted text
    //        (and which itself nests text/img children when the quote has
    //        emoji). `link "<…>"` is treated the same.
    // This strictness keeps the broadened container set safe — image-attachment
    // buttons have ≥2 `img:` children, reaction buttons have one img child,
    // none have this text-then-(text|labeled-button) pair.
    if (children.length === 2 && children[0].startsWith("text: ")) {
      const first = children[0].slice("text: ".length).trim();
      let second = null;
      if (children[1].startsWith("text: ")) {
        second = children[1].slice("text: ".length).trim();
      } else {
        // Labeled button/link/generic/gridcell → use the accessible name.
        const labelMatch = children[1].match(
          /^(?:button|link|generic|gridcell) "(.+?)":?\s*$/,
        );
        if (labelMatch) second = labelMatch[1].trim();
      }
      if (second === null) continue;
      // Decorative-container guard: a container whose second child is a bare
      // time (HH:MM) or whose first child is a date is NOT a quote-card (e.g. a
      // forwarded-message header or a date/time chip). A real quote-card's
      // second child is the quoted message text.
      const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s);
      const isDate = (s) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s);
      if (isTime(second) || isDate(first)) continue;
      return {
        quotedSender: cleanSenderName(first),
        quotedText: second,
      };
    }
  }
  return null;
}

/**
 * Parse messages from a WhatsApp Web aria snapshot.
 * Uses structural selectors — message rows are rows NOT inside a grid.
 * Own messages detected via delivery status icons (msg-dblcheck / msg-check).
 *
 * Output invariants:
 * - `sender` is never an empty string. Resolution chain: own-message ("You")
 *   → row-local cues (sender prefix in row label) → previous-row's sender
 *   (group continuation) → `UNKNOWN_SENDER` ("(unknown)").
 * - When the row contains a quoted-reply block, `quoted_sender`,
 *   `quoted_text`, and `body` are populated; otherwise `quoted_sender` and
 *   `quoted_text` are `null` and `body === text`. The `text` field always
 *   contains the full row text (including any quoted-bleed) for backward
 *   compatibility with existing callers.
 *
 * @param {string} ariaText
 * @param {object} [options]
 * @param {string} [options.senderButtonPrefix] - Locale-specific prefix for sender buttons
 * @param {object} [options.localeConfig] - Locale config for date separator detection
 * @param {Date}   [options.now] - Current date override (for testing)
 */
export function parseMessages(ariaText, options = {}) {
  if (!ariaText) return [];

  // Find the message area — rows after the second banner (chat header).
  // The second banner contains "Dettagli profilo" or equivalent locale button.
  // Structural approach: find the first `- row` that is NOT inside a grid.
  // We need a banner as boundary — find the last banner before message rows.
  const lines = ariaText.split("\n");

  // Find start of message area: look for a banner containing a button followed by rows outside grid
  let msgStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    // Match rows at 2-space indent level that are NOT inside a grid
    const rowMatch = lines[i].match(/^  - (?:')?row "(.+?)"(?:')?:/);
    if (rowMatch) {
      // Check if this row is inside a grid by looking backwards for the nearest grid or banner
      let insideGrid = false;
      for (let j = i - 1; j >= 0; j--) {
        if (/^  - grid /.test(lines[j])) {
          insideGrid = true;
          break;
        }
        if (/^  - banner/.test(lines[j]) || /^  - contentinfo/.test(lines[j])) {
          break;
        }
      }
      if (!insideGrid) {
        // Found first message row — start from a few lines before to catch sender buttons
        msgStartIdx = Math.max(0, i - 20);
        break;
      }
    }
  }

  if (msgStartIdx < 0) return [];

  const dateSepLocale = options.localeConfig || null;
  const now = options.now || null;

  const messages = [];
  let currentSender = "";
  // Freshness flag for the fresh-sender rule (Bug 1). Set true when a sender
  // button is parsed for the upcoming row; reset to false after a row
  // consumes it. When a row carries a quote block but its own sender was NOT
  // freshly confirmed (no sender button since the previous row, no own-icon,
  // and the row label does not start with the carried sender), we must not
  // attribute the reply to the stale carried sender (often the quoted
  // person) — emit UNKNOWN_SENDER instead.
  let senderConfirmedForRow = false;
  let currentDate = null;

  // Auto-detect sender button prefix from first sender button encountered
  const senderPrefix = options.senderButtonPrefix || null;

  for (let i = msgStartIdx; i < lines.length; i++) {
    const line = lines[i];

    // Date separators are bare `text:` nodes at 2-space indent between message rows
    // (same level as `row`, `button`, `contentinfo`). There is no ARIA role for them;
    // 2-space indent is the only structural signal available in the snapshot format.
    const dateSepMatch = line.match(/^  - text: (.+)$/);
    if (dateSepMatch) {
      const parsed = parseDateSeparator(dateSepMatch[1].trim(), dateSepLocale, now);
      if (parsed) currentDate = parsed;
      continue;
    }

    // Track sender from buttons between message rows
    // These buttons have a locale-dependent prefix + sender name
    // Pattern: button "PREFIX SenderName" with optional img child
    if (senderPrefix) {
      const prefixRegex = new RegExp(`button "${senderPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(.+?)"`);
      const senderBtn = line.match(prefixRegex);
      if (senderBtn) {
        currentSender = cleanSenderName(senderBtn[1]);
        senderConfirmedForRow = true;
        continue;
      }
    } else {
      // Auto-detect: any button at message-area indent level that contains a person name
      // The sender button pattern: `button "...SenderName..."` followed by lines with img
      // Use a heuristic: button between rows that has an img child on next line
      const btnMatch = line.match(/^  - button "(.+?)"(?::.*)?$/);
      if (btnMatch) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
        // Sender buttons have an img child (contact photo)
        if (/^\s+- img/.test(nextLine)) {
          // Extract sender name — it's the button label minus any known prefix
          // Try common prefix patterns across locales
          const label = btnMatch[1];
          const prefixPatterns = [
            /^Apri dettagli chat di\s+/,  // Italian
            /^Open chat details for\s+/,   // English
            /^Ouvrir les détails du chat de\s+/, // French
            /^Chat-Details öffnen für\s+/, // German
            /^Abrir detalles del chat de\s+/, // Spanish
          ];
          let name = label;
          for (const p of prefixPatterns) {
            const m = label.match(p);
            if (m) {
              name = label.slice(m[0].length);
              break;
            }
          }
          // Use extracted name (or full label as fallback for unlisted locales).
          // Strip WA's "~" prefix used for senders not in viewer's contacts,
          // and the locale-specific "probable contact match" prefix
          // ("Forse" / "Maybe" / "Peut-être" / …) that WA inserts when its
          // phone-to-contact heuristic is uncertain.
          currentSender = cleanSenderName(name);
          senderConfirmedForRow = true;
          continue;
        }
      }
    }

    // Match message rows (at 2-space indent level)
    const rowMatch = line.match(/^  - (?:')?row "(.+?)"(?:')?:/);
    if (!rowMatch) continue;

    const rowLabel = rowMatch[1];

    // Collect the row body (indented lines after the row)
    const bodyLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^    /.test(lines[j])) {
        bodyLines.push(lines[j]);
      } else {
        break;
      }
    }
    const rowBody = bodyLines.join("\n");

    // Extract text nodes from body
    const textNodes = [...rowBody.matchAll(/- text: (.+)/g)].map((m) => m[1].trim());

    // Extract time (HH:MM) — may be a standalone node or at end of text
    let time = "";
    const timeNode = textNodes.find((t) => /^\d{1,2}:\d{2}$/.test(t));
    if (timeNode) {
      time = timeNode;
    } else {
      // Time at end of row label — trailing HH:MM
      const trailingTime = rowLabel.match(/\b(\d{1,2}:\d{2})(?:\s|$)/);
      if (trailingTime) time = trailingTime[1];
    }

    // Detect own messages via delivery-status (receipt) icons — locale-agnostic
    // Tier-2 markers that only appear on messages YOU sent. WhatsApp Web
    // migrated the icon naming from `msg-check`/`msg-dblcheck` to the `wds-ic-*`
    // design-system set (observed 2026-06-20: `wds-ic-read`). We match BOTH the
    // legacy and current families so fixtures and live snapshots both resolve.
    // Without this, own messages fall through to the carried/label sender and
    // get mis-attributed to the self-label (e.g. Italian "Tu") instead of "You".
    const isOwn =
      /img "(?:msg-dblcheck|msg-check|wds-ic-check|wds-ic-dblcheck|wds-ic-read)"/.test(
        rowBody,
      );

    // `text` (legacy contract): text at ANY depth (retains the quoted bleed for
    // backward compatibility) interleaved with the row's own direct-child emoji.
    const allContentNodes = collectRowContent(bodyLines, false);

    // `body` (clean reply): DIRECT-CHILD text only (4-space) — text nested in a
    // quote container (quoted sender/text) lives deeper and is excluded, so the
    // reply body never inherits the quoted bleed — interleaved with the row's
    // own direct-child emoji. For non-quote rows the text sets are identical, so
    // `body === text` (a contract guaranteed by tests).
    const directContentNodes = collectRowContent(bodyLines, true);

    // Raw direct-child text nodes (sender label included, no time filter) — used
    // only to confirm the carried sender on continuation quote rows below.
    const directTextNodesRaw = bodyLines
      .filter((l) => /^    - text: /.test(l))
      .map((l) => l.replace(/^ {4}- text: /, "").trim());

    let sender;
    if (isOwn) {
      sender = "You";
    } else {
      // In 1:1 chats, the other person's row label starts with "SenderName: message".
      // In group chats, currentSender is set from sender buttons between rows.
      if (!currentSender) {
        const labelSender = rowLabel.match(/^(.+?):\s/);
        if (labelSender) {
          currentSender = cleanSenderName(labelSender[1]);
        }
      }
      sender = currentSender;
    }

    // Always-populated sender invariant. If sender is still empty after the
    // own/group/1:1 detection above, fall back to the last successfully
    // emitted message's sender (group continuation pattern: WhatsApp
    // suppresses the sender button on consecutive messages from the same
    // author). If no prior message exists, use UNKNOWN_SENDER. Never empty.
    if (!sender) {
      const prev = messages[messages.length - 1];
      sender = prev && prev.sender ? prev.sender : UNKNOWN_SENDER;
    }

    // Build text + body. Strip the leading sender-name label from both (only
    // for non-own, resolved senders — "You"/(unknown) never appear as a body
    // prefix). Identical strip on both keeps body===text for non-quote rows.
    const buildField = (nodes) => {
      const joined = nodes.join(" ").replace(/\s+/g, " ").trim();
      return !isOwn && sender && sender !== UNKNOWN_SENDER
        ? stripSenderPrefix(joined, sender)
        : joined;
    };
    const text = buildField(allContentNodes);
    const body = buildField(directContentNodes);

    // Quoted-reply detection (structural, locale-independent). The quoted
    // sender + quoted text are captured into quoted_sender / quoted_text;
    // `body` already excludes the quoted bleed (direct-child nodes only), so
    // no string-stripping is needed. `text` keeps the bleed for backward compat.
    const quote = extractQuoteBlock(rowBody);
    let quotedSender = null;
    let quotedText = null;
    if (quote) {
      quotedSender = quote.quotedSender;
      quotedText = quote.quotedText;

      // Fresh-sender rule (Bug 1): a quote-reply row whose own sender was NOT
      // freshly confirmed is dangerous to attribute — `currentSender` may be
      // stale and is frequently the QUOTED person (their name appears in the
      // quote-card just above the reply bubble). Trust the carried sender only
      // when it was set by a sender button for this row, the message is own,
      // the row label visibly starts with the carried sender, OR the row's own
      // first text node (the in-bubble sender label) confirms it — the last
      // case keeps legitimate group continuations from collapsing to
      // (unknown) once quote detection is live. Otherwise emit UNKNOWN_SENDER
      // rather than confidently mis-attributing the reply.
      if (!isOwn && !senderConfirmedForRow) {
        const firstDirect = directTextNodesRaw[0] || "";
        const labelConfirms =
          currentSender &&
          (rowLabel.startsWith(currentSender) ||
            cleanSenderName(firstDirect) === currentSender);
        if (!labelConfirms) {
          sender = UNKNOWN_SENDER;
        }
      }
    }

    // The freshness signal is single-row scoped: a sender button confirms
    // only the next row. Reset it now that this row has consumed it.
    senderConfirmedForRow = false;

    // Detect image attachments in this row (structural, locale-independent).
    // A row may contain BOTH images and text caption — emit one "image" entry
    // per image button, then fall through to emit the text (if any) as a
    // separate "text" message so captions remain searchable.
    const imageButtonCount = countImageButtons(rowBody);
    if (imageButtonCount > 0) {
      const timestamp = formatTimestamp(currentDate, time);
      for (let k = 0; k < imageButtonCount; k++) {
        // imageId derives from the row's structural identity (sender+time+
        // rowLabel+index-within-row). Stable across repeated parses of the
        // same snapshot; changes when the row moves or content updates.
        const imageId = simpleHash(`${sender}|${time}|${rowLabel}|${k}`);
        messages.push({
          kind: "image",
          sender,
          text: "",
          time,
          timestamp,
          imageId,
          quoted_sender: null,
          quoted_text: null,
          body: "",
        });
      }
      // If the row also has caption text, fall through and emit it as a text
      // message below. Otherwise skip to the next row.
      if (!text) continue;
    }

    if (!text && !time) continue;

    messages.push({
      kind: "text",
      sender,
      text,
      time,
      timestamp: formatTimestamp(currentDate, time),
      quoted_sender: quotedSender,
      quoted_text: quotedText,
      body,
    });
  }

  return messages;
}

/**
 * Print messages to stdout.
 */
export function printMessages(messages) {
  if (messages.length === 0) {
    console.log("No messages found.");
    return;
  }
  for (const m of messages) {
    const time = m.time ? `[${m.time}]` : "";
    const sender = m.sender ? `${m.sender}: ` : "";
    console.log(`${time} ${sender}${m.text}`);
  }
}

// Locale-specific markers used inside poll rows.
// "Select an option" prompt that follows the question text in the poll row body.
const POLL_SELECT_MARKERS = [
  "Seleziona un'opzione", // Italian
  "Select an option",      // English
  "Sélectionner une option", // French
  "Seleccionar una opción",  // Spanish
  "Selecionar uma opção",    // Portuguese
];

/**
 * Parse WhatsApp native poll messages from an aria snapshot.
 *
 * Poll rows are identified by the presence of checkbox elements in the row body.
 * Each checkbox has the form "OptionName N votes_word" (locale-dependent).
 *
 * Returns an array of poll objects, ordered as they appear in the snapshot
 * (typically oldest-first when reading top-to-bottom).
 *
 * @param {string} ariaText
 * @returns {Array<{question: string, options: Array<{label: string, votes: number}>, time: string, sender: string}>}
 */
export function parsePollMessages(ariaText) {
  if (!ariaText) return [];

  const polls = [];
  const lines = ariaText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const rowMatch = lines[i].match(/^  - (?:')?row "(.+?)"(?:')?:/);
    if (!rowMatch) continue;

    const rowLabel = rowMatch[1];

    // Collect row body (lines indented more than 2 spaces)
    const bodyLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^    /.test(lines[j])) bodyLines.push(lines[j]);
      else break;
    }
    const rowBody = bodyLines.join("\n");

    // Poll rows contain checkboxes — regular messages never have checkboxes
    if (!rowBody.includes("- checkbox \"")) continue;

    // Extract all text nodes from the row body
    const textNodes = [...rowBody.matchAll(/- text: (.+)/g)].map((m) => m[1].trim());

    // Question: in the text node that contains the "select an option" marker
    let question = null;
    for (const textNode of textNodes) {
      for (const marker of POLL_SELECT_MARKERS) {
        if (textNode.includes(marker)) {
          question = textNode.slice(0, textNode.indexOf(marker)).trim();
          break;
        }
      }
      if (question !== null) break;
    }

    // Fallback: extract question from row label
    // Row label pattern: "... TIME QUESTION [Opzioni più votate|Most voted options|...]: ..."
    if (question === null) {
      // Try to find the question between the time and the "voted options" phrase
      const labelMatch = rowLabel.match(/\d{1,2}:\d{2}\s+(.+?)\s+(?:Opzioni più votate|Most voted options|Options les plus)/);
      if (labelMatch) question = labelMatch[1].trim();
    }

    // Extract options and vote counts from checkbox labels.
    // Checkbox label format: "OptionName N voti" (IT) / "OptionName N votes" (EN) etc.
    // The vote count is always the last number before the trailing word.
    const checkboxes = [...rowBody.matchAll(/- checkbox "(.+?)"/g)];
    const options = [];
    for (const cb of checkboxes) {
      const cbLabel = cb[1];
      // Match: everything up to last run of digits + optional trailing word
      const countMatch = cbLabel.match(/^(.+?)\s+(\d+)(?:\s+\w+)?$/);
      if (countMatch) {
        options.push({ label: countMatch[1].trim(), votes: parseInt(countMatch[2], 10) });
      } else {
        options.push({ label: cbLabel, votes: 0 });
      }
    }

    // Extract time
    const time = textNodes.find((t) => /^\d{1,2}:\d{2}$/.test(t)) || "";

    // Extract sender from the button at the top of the row body
    // Pattern: button "SenderName" with nested text
    const senderBtnMatch = rowBody.match(/- button "([^"]+)":\n\s+- text:/);
    const sender = senderBtnMatch ? senderBtnMatch[1].trim() : "";

    polls.push({ question: question || "(unknown)", options, time, sender });
  }

  return polls;
}

/**
 * Parse search results from a WhatsApp Web aria snapshot.
 * Search results use a separate grid with the same row/gridcell structure as the chat list.
 * Locale-agnostic: finds the second grid on the page (first is chat list, second is results).
 * @param {string} ariaText
 * @param {object} [localeConfig]
 */
export function parseSearchResults(ariaText, localeConfig) {
  if (!ariaText) return [];

  // Find grids in the snapshot. In a live snapshot: first = chat list, last = search results.
  // In a fixture: may only have the search results grid.
  const gridRegex = /- grid "[^"]*":/g;
  const gridPositions = [];
  let gridMatch;
  while ((gridMatch = gridRegex.exec(ariaText)) !== null) {
    gridPositions.push(gridMatch.index);
  }

  if (gridPositions.length === 0) return [];

  // Use the last grid — in live snapshots it's the search results (second grid),
  // in fixtures it may be the only grid
  const searchGridIdx = gridPositions[gridPositions.length - 1];
  const searchArea = ariaText.slice(searchGridIdx);

  return parseChatList(searchArea, localeConfig);
}
