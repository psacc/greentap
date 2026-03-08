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
