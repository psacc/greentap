import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseChatList, printChats, parseMessages, printMessages, parseSearchResults, parsePollMessages } from "../lib/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

function loadFixture(name) {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

describe("parseChatList", () => {
  it("parses main fixture with chats", () => {
    const aria = loadFixture("main-aria.txt");
    const chats = parseChatList(aria);

    assert.ok(chats.length > 0, "should parse at least one chat");

    const first = chats[0];
    assert.ok(first.name.length > 0, "name should not be empty");
    assert.equal(typeof first.unread, "boolean");
    assert.ok(first.time.length > 0, "time should not be empty");
  });

  it("detects unread chats", () => {
    const aria = loadFixture("main-aria.txt");
    const chats = parseChatList(aria);

    const unread = chats.filter((c) => c.unread);
    assert.ok(unread.length >= 1, "should have at least 1 unread chat");

    for (const c of unread) {
      assert.ok(c.unreadCount > 0, "unread count should be positive");
    }
  });

  it("detects read chats", () => {
    const aria = loadFixture("main-aria.txt");
    const chats = parseChatList(aria);

    const read = chats.filter((c) => !c.unread);
    assert.ok(read.length >= 1, "should have at least 1 read chat");
  });

  it("extracts last message text", () => {
    const aria = loadFixture("main-aria.txt");
    const chats = parseChatList(aria);

    const withMsg = chats.filter((c) => c.lastMessage.length > 0);
    assert.ok(withMsg.length > 0, "should have chats with last message");
  });

  it("handles various time formats", () => {
    const aria = loadFixture("main-aria.txt");
    const chats = parseChatList(aria);

    const times = chats.map((c) => c.time).filter(Boolean);
    // Should have HH:MM, day names, and DD/MM/YYYY formats
    const hasHHMM = times.some((t) => /^\d{1,2}:\d{2}$/.test(t));
    const hasDay = times.some((t) => /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|ieri|oggi)$/i.test(t));
    assert.ok(hasHHMM, "should have HH:MM format times");
    assert.ok(hasDay, "should have day name format times");
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseChatList(""), []);
  });

  it("returns empty array for aria without chat grid", () => {
    assert.deepEqual(parseChatList('- document:\n  - heading "Nothing" [level=1]'), []);
  });

  it("strips unread badge prefix from chat names (English)", () => {
    const aria = `- grid "Chat list":
    - row "3 unread messages WE 1 maggio 2025 17:36 Last msg 3 unread messages":
      - gridcell "3 unread messages WE 1 maggio 2025 17:36 Last msg 3 unread messages":
        - img
        - gridcell "3 unread messages WE 1 maggio 2025 17:36"
        - text: Last msg
        - gridcell "3 unread messages": "3"
  - text: end`;
    const chats = parseChatList(aria);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].name, "WE 1 maggio 2025");
    assert.equal(chats[0].unreadCount, 3);
  });

  it("strips unread badge prefix from chat names (Italian)", () => {
    const aria = `- grid "Lista delle chat":
    - row "1 messaggio non letto Test Chat 14:00 Ciao 1 messaggio non letto":
      - gridcell "1 messaggio non letto Test Chat 14:00 Ciao 1 messaggio non letto":
        - img
        - gridcell "1 messaggio non letto Test Chat 14:00"
        - text: Ciao
        - gridcell "1 messaggio non letto": "1"
  - text: end`;
    const chats = parseChatList(aria);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].name, "Test Chat");
    assert.equal(chats[0].unreadCount, 1);
  });

  it("strips unread badge prefix from chat names (French)", () => {
    const aria = `- grid "Liste des discussions":
    - row "5 messages non lus Mon Groupe 09:15 Salut 5 messages non lus":
      - gridcell "5 messages non lus Mon Groupe 09:15 Salut 5 messages non lus":
        - img
        - gridcell "5 messages non lus Mon Groupe 09:15"
        - text: Salut
        - gridcell "5 messages non lus": "5"
  - text: end`;
    const chats = parseChatList(aria);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].name, "Mon Groupe");
    assert.equal(chats[0].unreadCount, 5);
  });

  it("strips Italian plural unread badge prefix", () => {
    const aria = `- grid "Lista delle chat":
    - row "61 messaggi non letti Sport Club 17:28 Msg Chat silenziata messaggio con menzione 61 messaggi non letti":
      - gridcell "61 messaggi non letti Sport Club 17:28 Msg Chat silenziata messaggio con menzione 61 messaggi non letti":
        - img
        - gridcell "61 messaggi non letti Sport Club 17:28"
        - text: Msg
        - gridcell "Chat silenziata messaggio con menzione 61 messaggi non letti": "61"
  - text: end`;
    const chats = parseChatList(aria);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].name, "Sport Club");
    assert.equal(chats[0].unreadCount, 61);
  });
});

describe("printChats", () => {
  it("prints empty message for no chats", () => {
    const output = [];
    const origLog = console.log;
    console.log = (msg) => output.push(msg);
    printChats([]);
    console.log = origLog;

    assert.equal(output[0], "No chats found.");
  });

  it("marks unread chats with asterisk", () => {
    const output = [];
    const origLog = console.log;
    console.log = (msg) => output.push(msg);
    printChats([{ name: "Test", time: "14:00", lastMessage: "hi", unread: true, unreadCount: 3 }]);
    console.log = origLog;

    assert.ok(output[0].startsWith("*"), "unread should start with *");
    assert.ok(output[0].includes("[3]"));
  });

  it("marks read chats with space", () => {
    const output = [];
    const origLog = console.log;
    console.log = (msg) => output.push(msg);
    printChats([{ name: "Test", time: "", lastMessage: "", unread: false, unreadCount: 0 }]);
    console.log = origLog;

    assert.ok(output[0].startsWith(" "), "read should start with space");
  });
});

describe("parseMessages", () => {
  it("parses chat fixture with messages", () => {
    const aria = loadFixture("chat-aria.txt");
    const messages = parseMessages(aria);

    assert.ok(messages.length > 0, "should parse at least one message");

    for (const m of messages) {
      assert.ok(m.time.length > 0, `message should have time: ${JSON.stringify(m)}`);
    }
  });

  it("identifies own messages", () => {
    const aria = loadFixture("chat-aria.txt");
    const messages = parseMessages(aria);

    const own = messages.filter((m) => m.sender === "You");
    assert.ok(own.length >= 1, "should have at least 1 own message");
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseMessages(""), []);
  });

  it("returns empty array for aria without messages", () => {
    assert.deepEqual(parseMessages('- document:\n  - heading "Nothing" [level=1]'), []);
  });

  it("attributes own messages with delivery icon (msg-dblcheck)", () => {
    const aria = loadFixture("chat-own-messages-aria.txt");
    const messages = parseMessages(aria);

    const withIcon = messages.find((m) => m.text.includes("Tutto bene"));
    assert.ok(withIcon, "should find 'Tutto bene' message");
    assert.equal(withIcon.sender, "You");
  });

  it("attributes own messages via msg-dblcheck icon", () => {
    const aria = loadFixture("chat-own-messages-aria.txt");
    const messages = parseMessages(aria);

    const noPrefix = messages.find((m) => m.text.includes("Ci vediamo stasera"));
    assert.ok(noPrefix, "should find 'Ci vediamo stasera' message");
    assert.equal(noPrefix.sender, "You", "own message should be attributed to You via icon");

    const noPrefix2 = messages.find((m) => m.text.includes("A che ora"));
    assert.ok(noPrefix2, "should find 'A che ora' message");
    assert.equal(noPrefix2.sender, "You", "own message should be attributed to You via icon");
  });

  it("attributes other person messages correctly", () => {
    const aria = loadFixture("chat-own-messages-aria.txt");
    const messages = parseMessages(aria);

    const other = messages.find((m) => m.text.includes("come stai"));
    assert.ok(other, "should find 'come stai' message");
    assert.equal(other.sender, "Luca Santini");

    const other2 = messages.find((m) => m.text.includes("perfetto"));
    assert.ok(other2, "should find 'perfetto' message");
    assert.equal(other2.sender, "Luca Santini");
  });
});

describe("printMessages", () => {
  it("prints empty message for no messages", () => {
    const output = [];
    const origLog = console.log;
    console.log = (msg) => output.push(msg);
    printMessages([]);
    console.log = origLog;

    assert.equal(output[0], "No messages found.");
  });

  it("prints messages with time and sender", () => {
    const output = [];
    const origLog = console.log;
    console.log = (msg) => output.push(msg);
    printMessages([{ sender: "Alice", text: "hello", time: "14:00" }]);
    console.log = origLog;

    assert.ok(output[0].includes("[14:00]"));
    assert.ok(output[0].includes("Alice:"));
    assert.ok(output[0].includes("hello"));
  });
});

describe("parseMessages — timestamps", () => {
  // now = Tuesday 2026-03-31 (DOW=2)
  const NOW = new Date(2026, 2, 31);

  // Italian locale config — passed explicitly per localization rules (Tier 3, no silent fallback)
  const ITALIAN_TEST_LOCALE = {
    dayNames: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    yesterday: "Ieri",
    today: "Oggi",
    dateRegex: "\\d{2}\\/\\d{2}\\/\\d{4}",
  };

  it("adds timestamp field to all messages", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    assert.ok(messages.length > 0, "should parse messages");
    for (const m of messages) {
      assert.ok("timestamp" in m, `message should have timestamp field: ${JSON.stringify(m)}`);
    }
  });

  it("preserves time field for backward compatibility", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    for (const m of messages) {
      assert.ok(m.time.length > 0, `message should still have time field: ${JSON.stringify(m)}`);
    }
  });

  it("produces correct timestamp from DD/MM/YYYY separator", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    // Absolute dates don't need localeConfig — testing without it here to verify
    const messages = parseMessages(aria, { now: NOW });
    const msg = messages.find((m) => m.text.includes("Prima di tutto"));
    assert.ok(msg, "should find 'Prima di tutto' message");
    assert.equal(msg.timestamp, "2026-03-18 10:00");
  });

  it("produces correct timestamp from Ieri separator", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    const msg = messages.find((m) => m.text.includes("Come va?"));
    assert.ok(msg, "should find 'Come va?' message");
    assert.equal(msg.timestamp, "2026-03-30 09:30");
  });

  it("produces correct timestamp from Ieri separator for own messages", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    const msg = messages.find((m) => m.text.includes("Benissimo"));
    assert.ok(msg, "should find 'Benissimo' message");
    assert.equal(msg.timestamp, "2026-03-30 11:00");
  });

  it("produces correct timestamp from Oggi separator", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    const msg = messages.find((m) => m.text.includes("Ci vediamo stasera"));
    assert.ok(msg, "should find 'Ci vediamo stasera' message");
    assert.equal(msg.timestamp, "2026-03-31 14:00");
    assert.equal(msg.sender, "You");
  });

  it("produces correct timestamp from day-name separator (domenica)", () => {
    const aria = loadFixture("chat-multiday-aria.txt");
    // now=2026-03-31 (Tuesday DOW=2): domenica (Sunday DOW=0) → 2 days back → 2026-03-29
    const messages = parseMessages(aria, { now: NOW, localeConfig: ITALIAN_TEST_LOCALE });
    const msg = messages.find((m) => m.text.includes("Fine settimana"));
    assert.ok(msg, "should find 'Fine settimana' message");
    assert.equal(msg.timestamp, "2026-03-29 18:00");
  });

  it("resolves same-weekday day separator to 7 days back (|| 7 branch)", () => {
    // now = Monday 2026-03-30 (DOW=1), separator = "lunedì" (Monday, targetDow=1)
    // daysBack = (1-1+7)%7 = 0 → || 7 → 7 days back → 2026-03-23
    const nowMonday = new Date(2026, 2, 30);
    const ariaLunedi = `- document:
  - banner:
    - button "Dettagli profilo":
      - img
  - text: lunedì
  - row "Roberto Marini Ciao 09:00":
    - text: Roberto Marini Ciao 09:00
  - contentinfo:
    - textbox "Scrivi"`;
    const messages = parseMessages(ariaLunedi, { now: nowMonday, localeConfig: ITALIAN_TEST_LOCALE });
    assert.ok(messages.length > 0, "should parse message");
    assert.equal(messages[0].timestamp, "2026-03-23 09:00");
  });

  it("timestamp is empty string when no date separator seen", () => {
    const ariaNoSep = `- document:
  - banner:
    - button "Dettagli profilo":
      - img
  - row "Solo 12:00 Consegnato":
    - text: Solo 12:00
    - img "msg-dblcheck"
  - contentinfo:
    - textbox "Scrivi"`;
    const messages = parseMessages(ariaNoSep, { now: NOW });
    assert.ok(messages.length > 0, "should parse at least one message");
    assert.equal(messages[0].timestamp, "", "timestamp should be empty with no date separator");
  });

  it("produces timestamp without now when separator is absolute date (production path smoke)", () => {
    // DD/MM/YYYY doesn't depend on current date — validates the no-now production path
    const ariaAbsolute = `- document:
  - banner:
    - button "Dettagli profilo":
      - img
  - text: 18/03/2026
  - row "Roberto Marini Ciao 10:00":
    - text: Roberto Marini Ciao 10:00
  - contentinfo:
    - textbox "Scrivi"`;
    const messages = parseMessages(ariaAbsolute); // no now, no localeConfig
    assert.ok(messages.length > 0, "should parse message");
    assert.equal(messages[0].timestamp, "2026-03-18 10:00");
  });
});

describe("parseSearchResults", () => {
  it("parses search results fixture", () => {
    const aria = loadFixture("search-aria.txt");
    const results = parseSearchResults(aria);

    assert.ok(results.length >= 1, "should parse at least one result");
    const famiglia = results.find((r) => r.name.includes("Famiglia Rossi"));
    assert.ok(famiglia, "should find Famiglia Rossi");
  });

  it("detects unread in search results", () => {
    const aria = loadFixture("search-aria.txt");
    const results = parseSearchResults(aria);

    const unread = results.filter((r) => r.unread);
    assert.ok(unread.length >= 1, "should have at least 1 unread result");
    assert.ok(unread[0].unreadCount > 0);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseSearchResults(""), []);
  });

  it("returns empty array for aria without search grid", () => {
    assert.deepEqual(parseSearchResults('- document:\n  - heading "Nothing" [level=1]'), []);
  });
});

describe("parseMessages — image detection", () => {
  const ITALIAN_TEST_LOCALE = {
    dayNames: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    yesterday: "Ieri",
    today: "Oggi",
    dateRegex: "\\d{2}\\/\\d{2}\\/\\d{4}",
  };

  it("flags image messages with kind='image'", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const images = messages.filter((m) => m.kind === "image");
    assert.ok(images.length >= 1, `expected at least one image message, got messages: ${JSON.stringify(messages, null, 2)}`);
  });

  it("image messages have required fields (imageId, sender, time, kind)", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const images = messages.filter((m) => m.kind === "image");
    for (const img of images) {
      assert.equal(typeof img.imageId, "string", "imageId should be string");
      assert.ok(img.imageId.length > 0, "imageId should be non-empty");
      assert.equal(typeof img.sender, "string", "sender should be string");
      assert.equal(typeof img.time, "string", "time should be string");
      assert.equal(img.kind, "image");
    }
  });

  it("imageIds are stable across repeated parses (same fixture → same ids)", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const first = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE }).filter((m) => m.kind === "image");
    const second = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE }).filter((m) => m.kind === "image");
    assert.equal(first.length, second.length);
    for (let i = 0; i < first.length; i++) {
      assert.equal(first[i].imageId, second[i].imageId, `image ${i} imageId should match across parses`);
    }
  });

  it("imageIds are unique within a snapshot", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const images = messages.filter((m) => m.kind === "image");
    const ids = images.map((m) => m.imageId);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `expected unique imageIds, got: ${ids.join(", ")}`);
  });

  it("attributes own image messages to 'You' via msg-dblcheck", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const own = messages.filter((m) => m.kind === "image" && m.sender === "You");
    assert.ok(own.length >= 1, `expected at least one own image message, got: ${JSON.stringify(messages.filter((m) => m.kind === "image"), null, 2)}`);
  });

  it("attributes other-sender image messages to the sender name", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const images = messages.filter((m) => m.kind === "image");
    const fromOther = images.filter((m) => m.sender && m.sender !== "You");
    assert.ok(fromOther.length >= 1, "expected at least one image from another sender");
    // Our fixture has Elena Conti + Roberto Marini
    const senders = new Set(fromOther.map((m) => m.sender));
    assert.ok(senders.has("Elena Conti") || senders.has("Roberto Marini"), `expected a fake persona sender, got: ${[...senders].join(", ")}`);
  });

  it("non-image messages keep kind='text'", () => {
    const aria = loadFixture("image-messages.snapshot.txt");
    const messages = parseMessages(aria, { localeConfig: ITALIAN_TEST_LOCALE });
    const texts = messages.filter((m) => m.kind === "text");
    assert.ok(texts.length >= 1, "expected at least one text message");
  });

  it("detects image messages in the real chat-aria fixture", () => {
    // Regression: chat-aria.txt contains 3 real image rows (Roberto x2, Sara x2) with fake personas
    const aria = loadFixture("chat-aria.txt");
    const messages = parseMessages(aria);
    const images = messages.filter((m) => m.kind === "image");
    assert.ok(images.length >= 1, `expected at least one image in chat-aria.txt, got ${images.length}`);
  });
});

describe("parsePollMessages", () => {
  it("parses poll from fixture", () => {
    const aria = loadFixture("poll-aria.txt");
    const polls = parsePollMessages(aria);

    assert.ok(polls.length >= 1, "should find at least one poll");
  });

  it("extracts poll question", () => {
    const aria = loadFixture("poll-aria.txt");
    const polls = parsePollMessages(aria);
    const poll = polls[0];

    assert.ok(poll.question.length > 0, "question should not be empty");
    assert.ok(poll.question.includes("Partita"), "question should contain poll title");
  });

  it("extracts poll options with vote counts", () => {
    const aria = loadFixture("poll-aria.txt");
    const polls = parsePollMessages(aria);
    const poll = polls[0];

    assert.equal(poll.options.length, 2, "should have 2 options");

    const presente = poll.options.find((o) => o.label === "Presente");
    assert.ok(presente, "should have Presente option");
    assert.equal(presente.votes, 8, "Presente should have 8 votes");

    const assente = poll.options.find((o) => o.label === "Assente");
    assert.ok(assente, "should have Assente option");
    assert.equal(assente.votes, 2, "Assente should have 2 votes");
  });

  it("extracts poll time", () => {
    const aria = loadFixture("poll-aria.txt");
    const polls = parsePollMessages(aria);
    const poll = polls[0];

    assert.equal(poll.time, "14:00");
  });

  it("extracts poll sender", () => {
    const aria = loadFixture("poll-aria.txt");
    const polls = parsePollMessages(aria);
    const poll = polls[0];

    assert.ok(poll.sender.includes("Roberto"), "sender should be Roberto Marini");
  });

  it("returns empty array for snapshot without polls", () => {
    const aria = loadFixture("main-aria.txt");
    const polls = parsePollMessages(aria);
    assert.deepEqual(polls, []);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parsePollMessages(""), []);
  });
});
