import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as commands from "../lib/commands.js";

function makeSendFakePage(
  chatName,
  expectedAriaSnippet = chatName,
  {
    previewCloseAfterSend = false,
    draft = "",
    draftMedia = 0,
    sendButtonCount = 1,
    delivers = true,
    draftSurvivesClick = false,
    existingOwn = false,
    openTitles = [],
  } = {},
) {
  const calls = [];
  let typed = draft;
  let clicked = false;
  const header = `- document:\n  - banner:\n    - button "${chatName}"\n`;
  const ownRow =
    `  - row "${expectedAriaSnippet} 10:35":\n` +
    `    - text: ${expectedAriaSnippet}\n` +
    `    - button "10:35":\n` +
    `      - text: 10:35\n` +
    `      - img "wds-ic-read"\n`;
  const ariaText = () =>
    header + (existingOwn ? ownRow : "") + (clicked && delivers ? ownRow : "") + `  - contentinfo:\n    - textbox "Type a message"\n`;

  const composeTextbox = {
    waitFor: async () => {},
    click: async () => {},
    evaluate: async () => ({
      text: clicked && !draftSurvivesClick ? "" : typed,
      media: clicked && !draftSurvivesClick ? 0 : draftMedia,
    }),
  };

  const sendButton = {
    count: async () => sendButtonCount,
    click: async () => {
      calls.push({ kind: "sendBtnClick" });
      clicked = true;
    },
  };

  const contentinfo = {
    getByRole: () => composeTextbox,
    locator: (selector) => {
      calls.push({ kind: "sendSelector", selector, previewCloseAfterSend });
      return sendButton;
    },
  };

  const bannerLocator = {
    first: () => bannerLocator,
    last: () => bannerLocator,
    ariaSnapshot: async () => `- banner:\n  - button "${chatName}"`,
  };

  const page = {
    getByRole: (role) => {
      if (role === "contentinfo") return contentinfo;
      if (role === "banner") return bannerLocator;
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
    locator: (selector) =>
      selector.includes("conversation-info-header-chat-title")
        ? { count: async () => openTitles.length, evaluate: async () => openTitles[0] }
        : { ariaSnapshot: async () => ariaText() },
    keyboard: {
      type: async (text, _opts) => {
        calls.push({ kind: "type", text });
        typed += text;
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

  it("clicks Send when a link-preview close button follows it", async () => {
    const page = makeSendFakePage(
      "Roberto Marini",
      "https://example.com",
      { previewCloseAfterSend: true },
    );

    await commands.send(
      page,
      "Roberto Marini",
      "https://example.com",
      null,
      undefined,
    );

    assert.equal(
      page._calls.filter((call) => call.kind === "sendBtnClick").length,
      1,
    );
    assert.match(
      page._calls.find((call) => call.kind === "sendSelector").selector,
      /ic-send-filled/,
    );
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

  it("rejects an empty message before navigating, typing or clicking", async () => {
    const page = makeSendFakePage("Roberto Marini", "Ciao");
    await assert.rejects(commands.send(page, "Roberto Marini", " \n "), /^Error: Not sent: the message is empty/);
    assert.equal(page._calls.length, 0);
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

describe("send: drafts, Send control and verification", () => {
  const sends = (page) => page._calls.filter((c) => c.kind === "sendBtnClick").length;
  const types = (page) => page._calls.filter((c) => c.kind === "type").length;

  it("refuses a different existing draft without typing or clicking", async () => {
    const page = makeSendFakePage("Elena Conti", "Ciao", { draft: "Bozza diversa" });
    await assert.rejects(commands.send(page, "Elena Conti", "Ciao"), /^Error: Not sent: .*different draft/);
    assert.equal(types(page), 0);
    assert.equal(sends(page), 0);
  });

  it("refuses an emoji draft it cannot compare", async () => {
    const page = makeSendFakePage("Elena Conti", "Ciao", { draft: "Ciao", draftMedia: 1 });
    await assert.rejects(commands.send(page, "Elena Conti", "Ciao"), /different draft/);
    assert.equal(sends(page), 0);
  });

  it("sends an identical leftover draft once without appending it again", async () => {
    const page = makeSendFakePage("Elena Conti", "riga uno", { draft: "riga uno\nriga due" });
    await commands.send(page, "Elena Conti", "riga uno\nriga due");
    assert.equal(types(page), 0);
    assert.equal(sends(page), 1);
  });

  for (const count of [0, 2]) {
    it(`fails without clicking when ${count} Send controls match`, async () => {
      const page = makeSendFakePage("Elena Conti", "Ciao", { sendButtonCount: count });
      await assert.rejects(
        commands.send(page, "Elena Conti", "Ciao"),
        new RegExp(`Not sent: expected one structural Send button, found ${count}`),
      );
      assert.equal(sends(page), 0);
    });
  }

  it("verifies an emoji message by its text part", async () => {
    const page = makeSendFakePage("Elena Conti", "Buongiorno");
    await commands.send(page, "Elena Conti", "Buongiorno 🌞");
    assert.equal(sends(page), 1);
  });

  it("reports a draft that survived the click as not sent", async () => {
    const page = makeSendFakePage("Elena Conti", "Ciao", { delivers: false, draftSurvivesClick: true });
    await assert.rejects(commands.send(page, "Elena Conti", "Ciao"), /^Error: Not sent: Send was clicked but the text is still a draft/);
    assert.equal(sends(page), 1);
  });

  it("reports a cleared compose without an outgoing row as unverified, clicking once", async () => {
    const page = makeSendFakePage("Elena Conti", "Ciao", { delivers: false });
    await assert.rejects(commands.send(page, "Elena Conti", "Ciao"), /^Error: Unverified: .*do not retry blindly/);
    assert.equal(sends(page), 1);
  });

  it("does not count an older identical own message as the new send", async () => {
    const page = makeSendFakePage("Elena Conti", "Ciao", { delivers: false, existingOwn: true });
    await assert.rejects(commands.send(page, "Elena Conti", "Ciao"), /Unverified/);
    const delivered = makeSendFakePage("Elena Conti", "Ciao", { existingOwn: true });
    await commands.send(delivered, "Elena Conti", "Ciao");
  });

  it("checks the structural chat title when WhatsApp exposes it", async () => {
    const ok = makeSendFakePage("Famiglia Rossi", "Ciao", { openTitles: ["Famiglia Rossi"] });
    await commands.send(ok, "Famiglia Rossi", "Ciao");
    assert.equal(sends(ok), 1);

    for (const openTitles of [["Roberto Marini"], ["Famiglia Rossi", "Famiglia Rossi"]]) {
      const wrong = makeSendFakePage("Famiglia Rossi", "Ciao", { openTitles });
      await assert.rejects(commands.send(wrong, "Famiglia Rossi", "Ciao"), /Wrong chat opened/);
      assert.equal(types(wrong), 0);
      assert.equal(sends(wrong), 0);
    }
  });

  it("verifies messages whose rendered row keeps mid-line emoji or drops formatting markers", async () => {
    for (const [message, rendered] of [
      ["Ciao 🌞 amico", "Ciao 🌞 amico"],
      ["*Grassetto* qui", "Grassetto qui"],
      ["_corsivo_ ~barrato~ `codice` *grassetto* fine", "corsivo barrato codice grassetto fine"],
    ]) {
      const page = makeSendFakePage("Elena Conti", rendered);
      await commands.send(page, "Elena Conti", message);
      assert.equal(sends(page), 1, message);
    }
  });
});
