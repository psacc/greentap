/**
 * Pure parsing and formatting functions for greentap.
 * No Playwright or browser dependencies.
 */

/**
 * Parse chat entries from a WhatsApp Web aria snapshot.
 * Expects the full page snapshot containing `grid "Lista delle chat"`.
 */
export function parseChatList(ariaText) {
  if (!ariaText) return [];

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

    // Split name and time — time is the last token matching known patterns
    const timePattern = /\s+((?:\d{1,2}:\d{2})|(?:\d{2}\/\d{2}\/\d{4})|(?:Ieri)|(?:Oggi)|(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica))$/;
    const timeMatch = nameTimeStr.match(timePattern);

    let name, time;
    if (timeMatch) {
      time = timeMatch[1];
      name = nameTimeStr.slice(0, timeMatch.index).trim();
    } else {
      time = "";
      name = nameTimeStr.trim();
    }

    // Extract last message from text: nodes (first one after the name gridcell)
    const textNodes = [...rowBody.matchAll(/- text: (.+)/g)];
    const lastMessage = textNodes.length > 0 ? textNodes[0][1].trim() : "";

    // Extract unread count from gridcell with numeric value
    const unreadMatch = rowBody.match(/- gridcell "[^"]*messaggi? non lett[io][^"]*": "(\d+)"/);
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
 * Expects the full page snapshot with a chat open (rows after the chat list grid).
 *
 * Message area structure:
 *   - text: "date separator" (Oggi, Ieri, day names, dates)
 *   - button "Apri dettagli chat di SenderName"   <-- sender context for next row(s)
 *   - row "SenderName MessageText Time Status":
 *       - text: ...
 *   - row "Tu: MessageText Time Status":          <-- own messages
 *       - text: ...
 *   - contentinfo:                                 <-- compose area (end of messages)
 */
export function parseMessages(ariaText) {
  if (!ariaText) return [];

  // Find the message area — after the banner with "Dettagli profilo"
  const bannerIdx = ariaText.indexOf('button "Dettagli profilo"');
  if (bannerIdx < 0) return [];

  const msgArea = ariaText.slice(bannerIdx);
  const lines = msgArea.split("\n");

  const messages = [];
  let currentSender = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track sender from "Apri dettagli chat di X" buttons
    const senderBtn = line.match(/button "Apri dettagli chat di (.+?)"/);
    if (senderBtn) {
      currentSender = senderBtn[1];
      continue;
    }

    // Match message rows (at 2-space indent level)
    // Two formats: - row "label": or - 'row "label"':
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
      // Try extracting from the row label
      const labelTime = rowLabel.match(/(\d{1,2}:\d{2})\s+(?:Letto|Consegnato)/);
      if (labelTime) time = labelTime[1];
    }

    // Filter out time-only nodes, status text, and trailing time in content
    const contentNodes = textNodes
      .filter((t) => !/^\d{1,2}:\d{2}$/.test(t) && !/^(Letto|Consegnato)$/.test(t))
      .map((t) => t.replace(/\s+\d{1,2}:\d{2}$/, "").trim())
      .filter(Boolean);

    // Detect own messages: "Tu:" prefix OR delivery status icon (msg-dblcheck / msg-check)
    const isOwn = rowLabel.startsWith("Tu:") || /img "msg-dblcheck"|img "msg-check"/.test(rowBody);

    let sender, text;

    if (isOwn) {
      sender = "Tu";
      text = contentNodes.join(" ").replace(/\s+/g, " ").trim();
    } else {
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
 * Search results use `grid "Risultati della ricerca."` with the same
 * row/gridcell structure as the chat list — reuses parseChatList logic.
 * Filters out header rows (e.g., row "Chat").
 */
export function parseSearchResults(ariaText) {
  if (!ariaText) return [];

  // Search results grid uses a different name than the chat list grid.
  // Replace it so parseChatList can find it.
  const adapted = ariaText.replace(
    'grid "Risultati della ricerca."',
    'grid "Lista delle chat"'
  );

  return parseChatList(adapted);
}
