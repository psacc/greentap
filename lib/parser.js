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
    // The strict 2-text-children check below filters out non-quote
    // buttons (image attachments, reactions) and non-quote links.
    const containerMatch = lines[i].match(
      /^( +)- (?:generic|button "[^"]*"|link "[^"]*"):\s*$/,
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

    // Quote block signature: exactly two `text:` direct children. This
    // strictness is what makes broadening to button/link containers
    // safe — image-attachment buttons have ≥2 `img:` children, reaction
    // buttons have one img, none have exactly two text children.
    if (children.length === 2 && children.every((c) => c.startsWith("text: "))) {
      return {
        quotedSender: stripTildePrefix(children[0].slice("text: ".length).trim()),
        quotedText: children[1].slice("text: ".length).trim(),
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
        currentSender = stripTildePrefix(senderBtn[1]);
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
          // Strip WA's "~" prefix used for senders not in viewer's contacts.
          currentSender = stripTildePrefix(name);
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

    // Detect own messages via delivery status icons (locale-agnostic)
    const isOwn = /img "msg-dblcheck"|img "msg-check"/.test(rowBody);

    // Filter out time-only nodes and trailing time in content
    const contentNodes = textNodes
      .filter((t) => !/^\d{1,2}:\d{2}$/.test(t))
      .map((t) => t.replace(/\s+\d{1,2}:\d{2}$/, "").trim())
      .filter(Boolean);

    let sender, text;

    if (isOwn) {
      sender = "You";
      text = contentNodes.join(" ").replace(/\s+/g, " ").trim();
    } else {
      // In 1:1 chats, the other person's row label starts with "SenderName: message"
      // In group chats, currentSender is set from sender buttons between rows
      if (!currentSender) {
        const labelSender = rowLabel.match(/^(.+?):\s/);
        if (labelSender) {
          currentSender = stripTildePrefix(labelSender[1]);
        }
      }
      sender = currentSender;
      // Row body often starts with "SenderName RestOfMessage" — strip the
      // sender prefix so `text` is just the message content. Tilde-prefixed
      // forms ("~Name") may appear when the contact is not in the viewer's
      // address book; sender was tilde-stripped above, so we must strip both
      // bare and tilde-prefixed forms from the body.
      const joined = contentNodes.join(" ").replace(/\s+/g, " ").trim();
      const tildeSender = sender ? `~${sender}` : "";
      if (sender && joined.startsWith(tildeSender + " ")) {
        text = joined.slice(tildeSender.length).trim();
      } else if (sender && joined === tildeSender) {
        text = "";
      } else if (sender && joined.startsWith(sender + " ")) {
        text = joined.slice(sender.length).trim();
      } else if (sender && joined.startsWith(sender)) {
        text = joined.slice(sender.length).trim();
      } else {
        text = joined;
      }
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

    // Quoted-reply detection (structural, locale-independent). When the row
    // contains a nested 2-text container, treat it as a quote-card:
    //   quoted_sender = first text, quoted_text = second text,
    //   body = full text minus the quoted bleed (best-effort string strip).
    // The original `text` field stays as the full bleed for backward compat.
    const quote = extractQuoteBlock(rowBody);
    let quotedSender = null;
    let quotedText = null;
    let body = text;
    if (quote) {
      quotedSender = quote.quotedSender;
      quotedText = quote.quotedText;
      // Strip the quoted prefix from body. The two strings may appear
      // back-to-back (separated by a single space) at the start of `text`
      // after our sender-prefix strip above. The quoted-sender carries an
      // optional WA "~" prefix in the raw text; quotedSender was tilde-
      // stripped at extraction time, so try both bare and tilde-prefixed
      // variants. Best-effort: remove the first matching prefix.
      const leadingBare = `${quotedSender} ${quotedText}`.replace(/\s+/g, " ").trim();
      const leadingTilde = `~${quotedSender} ${quotedText}`.replace(/\s+/g, " ").trim();
      if (body.startsWith(leadingTilde)) {
        body = body.slice(leadingTilde.length).trim();
      } else if (body.startsWith(leadingBare)) {
        body = body.slice(leadingBare.length).trim();
      } else if (body.startsWith(quotedText)) {
        body = body.slice(quotedText.length).trim();
      }
    }

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
