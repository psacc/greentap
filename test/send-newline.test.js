import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as commands from "../lib/commands.js";

/**
 * Build a fake Playwright `page` for exercising `send()` end-to-end
 * without a real browser. The fake records every `keyboard.type` and
 * `keyboard.press` call in arrival order, so tests can assert on the
 * exact key-press pattern emitted for multi-line messages.
 *
 * The page is wired so that:
 *   - The chat header banner already shows the target chat (fast-path
 *     in navigateToChat returns immediately, no grid/search interaction).
 *   - The post-send aria check sees the message text, so the verification
 *     warning does not fire.
 *   - The compose `textContent()` returns "" after send, so the "still in
 *     compose box" failure does not fire.
 *
 * @param {string} chatName - Name displayed in the header banner.
 * @param {string} expectedAriaSnippet - Snippet to embed in the post-send
 *   aria so the snippet-match check passes (default: chatName).
 */
function makeSendFakePage(chatName, expectedAriaSnippet = chatName) {
  const calls = [];
  // The post-send aria must contain a snippet of the typed message so the
  // snippet-match warning does not fire. Build a snapshot that contains
  // both the chat header (matched by the header-button regex) and the
  // typed text once the message is "delivered".
  const ariaText =
    `- banner:\n  - button "${chatName}"\n` +
    `- contentinfo:\n  - textbox "Type a message"\n` +
    `- text: "${expectedAriaSnippet}"\n`;

  const composeTextbox = {
    waitFor: async () => {},
    click: async () => {},
    textContent: async () => "",
  };

  const sendButton = {
    click: async () => {
      calls.push({ kind: "sendBtnClick" });
    },
  };

  const contentinfoButtons = {
    count: async () => 1,
    last: () => sendButton,
  };

  const contentinfo = {
    getByRole: (role) => {
      if (role === "textbox") return composeTextbox;
      if (role === "button") return contentinfoButtons;
      return composeTextbox;
    },
  };

  // Fast-path returns immediately when this banner exposes the chat name.
  const bannerLocator = {
    first: () => bannerLocator,
    last: () => bannerLocator,
    ariaSnapshot: async () => `- banner:\n  - button "${chatName}"`,
  };

  const page = {
    getByRole: (role) => {
      if (role === "contentinfo") return contentinfo;
      if (role === "banner") return bannerLocator;
      // Other roles (grid, textbox, gridcell) shouldn't be touched once
      // the fast-path fires, but provide stubs in case they are.
      return {
        first: () => ({
          waitFor: async () => {},
          click: async () => {},
          isVisible: async () => false,
          ariaSnapshot: async () => "",
        }),
        last: () => ({}),
      };
    },
    locator: () => ({
      ariaSnapshot: async () => ariaText,
    }),
    keyboard: {
      type: async (text, _opts) => {
        calls.push({ kind: "type", text });
      },
      press: async (key) => {
        calls.push({ kind: "press", key });
      },
    },
    evaluate: async () => null,
    _calls: calls,
  };
  return page;
}

describe("send: multi-line newline handling", () => {
  it("single-line message: 1 type, 0 Shift+Enter, no fan-out", async () => {
    const page = makeSendFakePage("Roberto Marini", "Ciao");
    await commands.send(page, "Roberto Marini", "Ciao", null, undefined);

    const types = page._calls.filter((c) => c.kind === "type");
    const shiftEnters = page._calls.filter(
      (c) => c.kind === "press" && c.key === "Shift+Enter",
    );

    assert.equal(types.length, 1, "should have exactly 1 type call");
    assert.equal(types[0].text, "Ciao");
    assert.equal(shiftEnters.length, 0, "no Shift+Enter for single-line");
  });

  it("3-line message: 3 type calls, 2 Shift+Enter between segments", async () => {
    const page = makeSendFakePage("Roberto Marini", "line1");
    await commands.send(
      page,
      "Roberto Marini",
      "line1\nline2\nline3",
      null,
      undefined,
    );

    // Walk the call sequence: each non-final segment must be followed by
    // a Shift+Enter before the next segment is typed.
    const seq = page._calls.filter(
      (c) => c.kind === "type" || (c.kind === "press" && c.key === "Shift+Enter"),
    );

    assert.deepEqual(
      seq,
      [
        { kind: "type", text: "line1" },
        { kind: "press", key: "Shift+Enter" },
        { kind: "type", text: "line2" },
        { kind: "press", key: "Shift+Enter" },
        { kind: "type", text: "line3" },
      ],
      "should interleave types and Shift+Enter in the right order",
    );

    // Final submit goes through the Send button click, not via Enter on
    // the keyboard — guard that path so a regression to "type the whole
    // string + Enter" can't slip through.
    const enters = page._calls.filter(
      (c) => c.kind === "press" && c.key === "Enter",
    );
    assert.equal(enters.length, 0, "must not press a bare Enter (would submit early)");
    const sendClicks = page._calls.filter((c) => c.kind === "sendBtnClick");
    assert.equal(sendClicks.length, 1, "Send button should be clicked exactly once");
  });

  it("CRLF line endings are normalized to a single newline", async () => {
    const page = makeSendFakePage("Roberto Marini", "alpha");
    await commands.send(
      page,
      "Roberto Marini",
      "alpha\r\nbeta",
      null,
      undefined,
    );

    const seq = page._calls.filter(
      (c) => c.kind === "type" || (c.kind === "press" && c.key === "Shift+Enter"),
    );

    assert.deepEqual(seq, [
      { kind: "type", text: "alpha" },
      { kind: "press", key: "Shift+Enter" },
      { kind: "type", text: "beta" },
    ]);
  });

  it("blank line in the middle still produces a single bubble (empty segment skipped, Shift+Enter preserved)", async () => {
    // "a\n\nb" — the empty middle segment must NOT be typed (would be a
    // no-op anyway) but the boundaries must still emit two Shift+Enter
    // presses to preserve the visual blank line.
    const page = makeSendFakePage("Roberto Marini", "a");
    await commands.send(page, "Roberto Marini", "a\n\nb", null, undefined);

    const seq = page._calls.filter(
      (c) => c.kind === "type" || (c.kind === "press" && c.key === "Shift+Enter"),
    );

    assert.deepEqual(seq, [
      { kind: "type", text: "a" },
      { kind: "press", key: "Shift+Enter" },
      { kind: "press", key: "Shift+Enter" },
      { kind: "type", text: "b" },
    ]);
  });

  it("empty message does not crash and types nothing", async () => {
    // Empty message is a degenerate input — the function should not
    // explode. The Send button click happens regardless; WhatsApp Web's
    // own UI will no-op it, but we guard against a JS crash here.
    const page = makeSendFakePage("Roberto Marini", "");
    await assert.doesNotReject(() =>
      commands.send(page, "Roberto Marini", "", null, undefined),
    );
    const types = page._calls.filter((c) => c.kind === "type");
    const shiftEnters = page._calls.filter(
      (c) => c.kind === "press" && c.key === "Shift+Enter",
    );
    assert.equal(types.length, 0, "no type call for empty input");
    assert.equal(shiftEnters.length, 0, "no Shift+Enter for empty input");
  });

  it("trailing newline does not emit a phantom empty type call", async () => {
    // "hi\n" splits to ["hi", ""]. The empty trailing segment must be
    // skipped (no zero-length type) but a Shift+Enter must still be
    // emitted between them.
    const page = makeSendFakePage("Roberto Marini", "hi");
    await commands.send(page, "Roberto Marini", "hi\n", null, undefined);

    const seq = page._calls.filter(
      (c) => c.kind === "type" || (c.kind === "press" && c.key === "Shift+Enter"),
    );

    assert.deepEqual(seq, [
      { kind: "type", text: "hi" },
      { kind: "press", key: "Shift+Enter" },
    ]);
  });
});
