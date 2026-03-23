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

    chats.push({ name, time, lastMessage, unread: unread > 0, unreadCount: unread });
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
 * Parse messages from a WhatsApp Web aria snapshot.
 * Uses structural selectors — message rows are rows NOT inside a grid.
 * Own messages detected via delivery status icons (msg-dblcheck / msg-check).
 *
 * @param {string} ariaText
 * @param {object} [options]
 * @param {string} [options.senderButtonPrefix] - Locale-specific prefix for sender buttons
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

  const messages = [];
  let currentSender = "";

  // Auto-detect sender button prefix from first sender button encountered
  const senderPrefix = options.senderButtonPrefix || null;

  for (let i = msgStartIdx; i < lines.length; i++) {
    const line = lines[i];

    // Track sender from buttons between message rows
    // These buttons have a locale-dependent prefix + sender name
    // Pattern: button "PREFIX SenderName" with optional img child
    if (senderPrefix) {
      const prefixRegex = new RegExp(`button "${senderPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(.+?)"`);
      const senderBtn = line.match(prefixRegex);
      if (senderBtn) {
        currentSender = senderBtn[1];
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
          // Use extracted name (or full label as fallback for unlisted locales)
          currentSender = name;
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
          currentSender = labelSender[1];
        }
      }
      sender = currentSender;
      // Row body often starts with "SenderName RestOfMessage"
      // Remove the sender prefix if present
      const joined = contentNodes.join(" ").replace(/\s+/g, " ").trim();
      if (sender && joined.startsWith(sender + " ")) {
        text = joined.slice(sender.length).trim();
      } else if (sender && joined.startsWith(sender)) {
        text = joined.slice(sender.length).trim();
      } else {
        text = joined;
      }
    }

    if (!text && !time) continue;

    messages.push({ sender, text, time });
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
