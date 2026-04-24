import { test } from "node:test";
import assert from "node:assert";
import { mergeLinksIntoMessages } from "../lib/commands.js";

test("mergeLinksIntoMessages attaches links by row index", () => {
  const messages = [
    { sender: "Roberto Marini", time: "10:00", text: "hi" },
    { sender: "Elena Conti",    time: "10:01", text: "see docs.google.com" },
    { sender: "Roberto Marini", time: "10:02", text: "bye" },
  ];
  const linksPerRow = [
    [],
    [{ href: "https://docs.google.com/document/d/abc", text: "docs.google.com" }],
    [],
  ];
  const out = mergeLinksIntoMessages(messages, linksPerRow);
  assert.deepStrictEqual(out[0].links, []);
  assert.strictEqual(out[1].links[0].href, "https://docs.google.com/document/d/abc");
  assert.deepStrictEqual(out[2].links, []);
});

test("mergeLinksIntoMessages tolerates length mismatch (DOM and parser drift by 1)", () => {
  // If DOM has one more row than parser output (or vice versa), merge does
  // not crash: indexing beyond bounds yields [] links on affected messages.
  const messages = [{ sender: "a", time: "1", text: "x" }];
  const linksPerRow = [];
  const out = mergeLinksIntoMessages(messages, linksPerRow);
  assert.deepStrictEqual(out[0].links, []);
});
