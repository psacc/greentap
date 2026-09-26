import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as commands from "../lib/commands.js";

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const NO_POLL = fixture("chat-aria.txt");
const RECENT = fixture("poll-aria.txt");
const OLDER = RECENT.replaceAll("Partita mercoledì 18/03", "Partita mercoledì 11/03");

function pageWithHistory(screens) {
  let position = 0;
  return {
    getByRole: () => ({ last: () => ({ ariaSnapshot: async () => '- banner:\n  - button "Sport Club"' }) }),
    locator: () => ({ ariaSnapshot: async () => screens[Math.min(position, screens.length - 1)] }),
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes("scrollTop = el.scrollHeight")) position = 0;
      else if (src.includes("scrollTop = 0")) position = screens.length - 1;
      else if (src.includes("clientHeight")) position += 1;
      return src.includes("return el.scrollHeight") ? 1000 : true;
    },
  };
}

describe("pollResults", () => {
  it("returns the most recent poll when older history holds another one", async () => {
    const poll = await commands.pollResults(pageWithHistory([RECENT, OLDER]), "Sport Club");
    assert.equal(poll.question, "Partita mercoledì 18/03 21h-22h30");
  });

  it("walks up one screen at a time, so the first poll above the bottom wins", async () => {
    const poll = await commands.pollResults(pageWithHistory([NO_POLL, RECENT, NO_POLL, OLDER]), "Sport Club");
    assert.equal(poll.question, "Partita mercoledì 18/03 21h-22h30");
  });
});
