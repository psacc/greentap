import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import * as commands from "../lib/commands.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const CLI_PATH = join(__dirname, "..", "greentap.js");

function runCli(...args) {
  return new Promise((resolve) => {
    execFile("node", [CLI_PATH, ...args], { timeout: 5000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

function loadFixture(name) {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

function makeMockPage(fixtureFile) {
  const ariaText = loadFixture(fixtureFile);
  return {
    locator: () => ({
      ariaSnapshot: async () => ariaText,
    }),
    getByRole: () => ({
      waitFor: async () => {},
      filter: () => ({
        first: () => ({
          isVisible: async () => true,
          click: async () => {},
        }),
      }),
      click: async () => {},
      fill: async () => {},
      first: () => ({
        isVisible: async () => true,
        ariaSnapshot: async () => ariaText,
      }),
    }),
    keyboard: {
      type: async () => {},
      press: async () => {},
    },
  };
}

// --- JSON Contract Tests ---

describe("JSON contract: chats", () => {
  it("returns array of chat objects with correct fields", async () => {
    const page = makeMockPage("main-aria.txt");
    const result = await commands.chats(page);

    assert.ok(Array.isArray(result), "should return an array");
    assert.ok(result.length > 0, "should have at least one chat");

    for (const chat of result) {
      assert.equal(typeof chat.name, "string", "name should be string");
      assert.equal(typeof chat.time, "string", "time should be string");
      assert.equal(typeof chat.lastMessage, "string", "lastMessage should be string");
      assert.equal(typeof chat.unread, "boolean", "unread should be boolean");
      assert.equal(typeof chat.unreadCount, "number", "unreadCount should be number");
    }
  });

  it("unread chats have positive unreadCount", async () => {
    const page = makeMockPage("main-aria.txt");
    const result = await commands.chats(page);
    const unread = result.filter((c) => c.unread);

    for (const chat of unread) {
      assert.ok(chat.unreadCount > 0, `unread chat "${chat.name}" should have unreadCount > 0`);
    }
  });

  it("JSON.stringify produces valid JSON", async () => {
    const page = makeMockPage("main-aria.txt");
    const result = await commands.chats(page);
    const json = JSON.stringify(result);
    assert.doesNotThrow(() => JSON.parse(json));
  });
});

describe("JSON contract: unread", () => {
  it("returns only unread chats", async () => {
    const page = makeMockPage("main-aria.txt");
    const result = await commands.unread(page);

    assert.ok(Array.isArray(result));
    for (const chat of result) {
      assert.equal(chat.unread, true, `chat "${chat.name}" should be unread`);
      assert.ok(chat.unreadCount > 0);
    }
  });
});

describe("JSON contract: read (parseMessages)", () => {
  it("returns array of message objects with correct fields", async () => {
    const ariaText = loadFixture("chat-aria.txt");
    // Directly test parseMessages since read() requires navigation
    const { parseMessages } = await import("../lib/parser.js");
    const result = parseMessages(ariaText);

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);

    for (const msg of result) {
      assert.equal(typeof msg.sender, "string", "sender should be string");
      assert.equal(typeof msg.text, "string", "text should be string");
      assert.equal(typeof msg.time, "string", "time should be string");
    }
  });

  it("JSON.stringify produces valid JSON", async () => {
    const { parseMessages } = await import("../lib/parser.js");
    const result = parseMessages(loadFixture("chat-aria.txt"));
    const json = JSON.stringify(result);
    assert.doesNotThrow(() => JSON.parse(json));
  });
});

describe("JSON contract: search (parseSearchResults)", () => {
  it("returns array of result objects with correct fields", async () => {
    const { parseSearchResults } = await import("../lib/parser.js");
    const result = parseSearchResults(loadFixture("search-aria.txt"));

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);

    for (const r of result) {
      assert.equal(typeof r.name, "string", "name should be string");
      // Optional fields should be correct type if present
      if (r.lastMessage !== undefined) assert.equal(typeof r.lastMessage, "string");
      if (r.unread !== undefined) assert.equal(typeof r.unread, "boolean");
      if (r.unreadCount !== undefined) assert.equal(typeof r.unreadCount, "number");
    }
  });

  it("returns empty array for no results", async () => {
    const { parseSearchResults } = await import("../lib/parser.js");
    assert.deepEqual(parseSearchResults(""), []);
  });
});

// --- Arg Parsing Tests ---

describe("CLI arg parsing: read", () => {
  it("exits 1 with usage when no chat name given", async () => {
    const { code, stderr } = await runCli("read");
    assert.equal(code, 1);
    assert.ok(stderr.includes("Usage: greentap read"), `stderr should contain usage, got: ${stderr}`);
  });
});

describe("CLI arg parsing: send", () => {
  it("exits 1 with usage when no arguments given", async () => {
    const { code, stderr } = await runCli("send");
    assert.equal(code, 1);
    assert.ok(stderr.includes("Usage: greentap send"), `stderr should contain usage, got: ${stderr}`);
  });

  it("exits 1 with usage when only chat name given", async () => {
    const { code, stderr } = await runCli("send", "ChatName");
    assert.equal(code, 1);
    assert.ok(stderr.includes("Usage: greentap send"), `stderr should contain usage, got: ${stderr}`);
  });
});

describe("CLI arg parsing: search", () => {
  it("exits 1 with usage when no query given", async () => {
    const { code, stderr } = await runCli("search");
    assert.equal(code, 1);
    assert.ok(stderr.includes("Usage: greentap search"), `stderr should contain usage, got: ${stderr}`);
  });
});

describe("CLI arg parsing: unknown command", () => {
  it("shows usage help and exits 0", async () => {
    const { code, stdout } = await runCli("foobar");
    assert.equal(code, 0);
    assert.ok(stdout.includes("Usage: greentap"), `stdout should contain usage, got: ${stdout}`);
  });
});

// --- Scroll Tests ---

describe("dedupKey", () => {
  it("returns correct key format", () => {
    const key = commands.dedupKey({ sender: "Alice", time: "10:30", text: "Hello world" });
    assert.equal(key, "Alice|10:30|Hello world");
  });

  it("handles empty text", () => {
    const key = commands.dedupKey({ sender: "Alice", time: "10:30", text: "" });
    assert.equal(key, "Alice|10:30|");
  });

  it("handles undefined text", () => {
    const key = commands.dedupKey({ sender: "Alice", time: "10:30" });
    assert.equal(key, "Alice|10:30|");
  });

  it("truncates text to 50 chars", () => {
    const longText = "a".repeat(100);
    const key = commands.dedupKey({ sender: "Bob", time: "11:00", text: longText });
    assert.equal(key, `Bob|11:00|${"a".repeat(50)}`);
  });

  it("handles emoji-only text", () => {
    const key = commands.dedupKey({ sender: "Alice", time: "10:30", text: "😀🎉" });
    assert.equal(key, "Alice|10:30|😀🎉");
  });
});

describe("scroll dedup merge", () => {
  it("deduplicates overlapping message sets in chronological order", () => {
    // Simulate 3 scroll iterations (newest first, then older)
    const iter1 = [
      { sender: "Alice", time: "10:03", text: "msg3" },
      { sender: "Bob", time: "10:04", text: "msg4" },
      { sender: "Alice", time: "10:05", text: "msg5" },
    ];
    const iter2 = [
      { sender: "Bob", time: "10:01", text: "msg1" },
      { sender: "Alice", time: "10:02", text: "msg2" },
      { sender: "Alice", time: "10:03", text: "msg3" }, // overlap with iter1
    ];

    // Merge oldest-first, dedup (same logic as scrollAndCollect)
    const iterations = [iter1, iter2];
    const merged = new Map();
    for (let i = iterations.length - 1; i >= 0; i--) {
      for (const msg of iterations[i]) {
        const key = commands.dedupKey(msg);
        if (!merged.has(key)) merged.set(key, msg);
      }
    }
    const result = [...merged.values()];

    assert.equal(result.length, 5);
    assert.equal(result[0].text, "msg1");
    assert.equal(result[1].text, "msg2");
    assert.equal(result[2].text, "msg3");
    assert.equal(result[3].text, "msg4");
    assert.equal(result[4].text, "msg5");
  });

  it("preserves messages with same time but different sender", () => {
    const iter1 = [
      { sender: "Alice", time: "10:00", text: "hello" },
      { sender: "Bob", time: "10:00", text: "hello" },
    ];

    const merged = new Map();
    for (const msg of iter1) {
      const key = commands.dedupKey(msg);
      if (!merged.has(key)) merged.set(key, msg);
    }
    const result = [...merged.values()];

    assert.equal(result.length, 2);
  });
});

describe("CLI arg parsing: read --scroll", () => {
  it("exits 1 with usage when only --scroll given (no chat name)", async () => {
    const { code, stderr } = await runCli("read", "--scroll");
    assert.equal(code, 1);
    assert.ok(stderr.includes("Usage: greentap read"), `stderr should contain usage, got: ${stderr}`);
  });

  it("filters --scroll from chat name extraction", () => {
    // Simulate the arg parsing from greentap.js
    const args = ["read", "--scroll", "Alice", "--json"];
    const chatName = args.slice(1).filter((a) => a !== "--json" && a !== "--scroll")[0];
    assert.equal(chatName, "Alice");
  });

  it("detects --scroll flag in any position", () => {
    const args1 = ["read", "Alice", "--scroll"];
    const args2 = ["read", "--scroll", "Alice"];
    assert.ok(args1.includes("--scroll"));
    assert.ok(args2.includes("--scroll"));
  });
});

describe("CLI arg parsing: send message joining", () => {
  // We can't test actual send without a browser, but we can verify
  // the arg joining logic by checking greentap.js source behavior:
  // sendArgs.slice(1).join(" ") joins "hello" "world" into "hello world"
  it("joins multiple message args with spaces", () => {
    // Simulate the arg joining from greentap.js line 177
    const args = ["ChatName", "hello", "world"];
    const sendArgs = args;
    const message = sendArgs.slice(1).join(" ");
    assert.equal(message, "hello world");
  });
});
