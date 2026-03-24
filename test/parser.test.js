import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseChatList, printChats, parseMessages, printMessages, parseSearchResults } from "../lib/parser.js";

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
