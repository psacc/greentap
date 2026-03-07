import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseChatList, printChats, parseMessages, printMessages } from "../lib/parser.js";

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
    const hasDay = times.some((t) => /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|Ieri|Oggi)$/.test(t));
    assert.ok(hasHHMM, "should have HH:MM format times");
    assert.ok(hasDay, "should have day name format times");
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseChatList(""), []);
  });

  it("returns empty array for aria without chat grid", () => {
    assert.deepEqual(parseChatList('- document:\n  - heading "Nothing" [level=1]'), []);
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

    const own = messages.filter((m) => m.sender === "Tu");
    assert.ok(own.length >= 1, "should have at least 1 own message");
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseMessages(""), []);
  });

  it("returns empty array for aria without messages", () => {
    assert.deepEqual(parseMessages('- document:\n  - heading "Nothing" [level=1]'), []);
  });

  it("attributes own messages with Tu: prefix", () => {
    const aria = loadFixture("chat-own-messages-aria.txt");
    const messages = parseMessages(aria);

    const withTuPrefix = messages.find((m) => m.text.includes("Tutto bene"));
    assert.ok(withTuPrefix, "should find 'Tutto bene' message");
    assert.equal(withTuPrefix.sender, "Tu");
  });

  it("attributes own messages without Tu: prefix via msg-dblcheck", () => {
    const aria = loadFixture("chat-own-messages-aria.txt");
    const messages = parseMessages(aria);

    const noPrefix = messages.find((m) => m.text.includes("Ci vediamo stasera"));
    assert.ok(noPrefix, "should find 'Ci vediamo stasera' message");
    assert.equal(noPrefix.sender, "Tu", "own message without Tu: prefix should be attributed to Tu");

    const noPrefix2 = messages.find((m) => m.text.includes("A che ora"));
    assert.ok(noPrefix2, "should find 'A che ora' message");
    assert.equal(noPrefix2.sender, "Tu", "own message without Tu: prefix should be attributed to Tu");
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
