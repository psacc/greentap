import { test } from "node:test";
import assert from "node:assert";
import { mergeLinksIntoMessages } from "../lib/commands.js";

test("mergeLinksIntoMessages attaches links by text-substring match", () => {
  const messages = [
    { sender: "Roberto Marini", time: "10:00", text: "hi" },
    { sender: "Elena Conti",    time: "10:01", text: "see docs.google.com" },
    { sender: "Roberto Marini", time: "10:02", text: "bye" },
  ];
  const linkRows = [
    {
      links: [{ href: "https://docs.google.com/document/d/abc", text: "docs.google.com" }],
      rowText: "Elena Conti 10:01 see docs.google.com docs.google.com",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.deepStrictEqual(out[0].links, []);
  assert.strictEqual(out[1].links[0].href, "https://docs.google.com/document/d/abc");
  assert.deepStrictEqual(out[2].links, []);
});

test("mergeLinksIntoMessages ignores extra DOM rows (date separators) and still finds the link", () => {
  // Real-world case: DOM has a date separator row between messages that
  // the parser filters out. The link row for msg 2 sits after the
  // separator row. Index-zip would misalign. Text-match survives.
  const messages = [
    { sender: "Roberto Marini", time: "10:00", text: "hi" },
    { sender: "Elena Conti",    time: "10:01", text: "link payload unique-marker-abc" },
  ];
  const linkRows = [
    // Only one link-bearing row; text match claims it for msg 1.
    {
      links: [{ href: "https://example.com/unique-marker-abc", text: "example.com" }],
      rowText: "Elena Conti 10:01 link payload unique-marker-abc example.com/unique-marker-abc",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.deepStrictEqual(out[0].links, []);
  assert.strictEqual(out[1].links[0].href, "https://example.com/unique-marker-abc");
});

test("mergeLinksIntoMessages gives [] when no link rows exist", () => {
  const messages = [{ sender: "a", time: "1", text: "x" }];
  const linkRows = [];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.deepStrictEqual(out[0].links, []);
});

test("mergeLinksIntoMessages doesn't claim the same link row twice", () => {
  // Two parser messages with overlapping text shouldn't both inherit the
  // same link row; whichever matches first wins and the other gets [].
  const messages = [
    { sender: "a", time: "10:00", text: "check https://example.com/x" },
    { sender: "b", time: "10:01", text: "check https://example.com/x" },
  ];
  const linkRows = [
    {
      links: [{ href: "https://example.com/x", text: "example.com/x" }],
      rowText: "a 10:00 check https://example.com/x",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.strictEqual(out[0].links[0].href, "https://example.com/x");
  assert.deepStrictEqual(out[1].links, []);
});

test("mergeLinksIntoMessages handles empty message text safely", () => {
  const messages = [{ sender: "system", time: "10:00", text: "" }];
  const linkRows = [
    {
      links: [{ href: "https://example.com/", text: "example.com" }],
      rowText: "some row content without the time",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.deepStrictEqual(out[0].links, []);
});

test("mergeLinksIntoMessages falls back to time match for URL-only messages (empty text)", () => {
  // WA renders URL-only messages with empty ARIA text. The only signal
  // left is the timestamp, which WA duplicates at the end of each row.
  const messages = [
    { sender: "You", time: "12:50", text: "some text" },
    { sender: "You", time: "12:51", text: "" }, // URL-only, no text
  ];
  const linkRows = [
    {
      links: [{ href: "https://example.com/plain", text: "example.com/plain" }],
      rowText: "some text 12:5012:50 msg-dblcheck",
    },
    {
      links: [{ href: "https://example.com/url-only", text: "example.com/url-only" }],
      rowText: "https://example.com/url-only 12:5112:51 msg-dblcheck",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.strictEqual(out[0].links[0].href, "https://example.com/plain");
  assert.strictEqual(out[1].links[0].href, "https://example.com/url-only");
});

test("mergeLinksIntoMessages preserves monotone ordering across multiple URL-only messages at same minute", () => {
  // Two URL-only messages at the same minute — greedy monotone match
  // maps the first linkRow to the first message, second to second.
  const messages = [
    { sender: "You", time: "12:50", text: "" },
    { sender: "You", time: "12:50", text: "" },
  ];
  const linkRows = [
    {
      links: [{ href: "https://a.example/1", text: "a.example/1" }],
      rowText: "https://a.example/1 12:5012:50",
    },
    {
      links: [{ href: "https://b.example/2", text: "b.example/2" }],
      rowText: "https://b.example/2 12:5012:50",
    },
  ];
  const out = mergeLinksIntoMessages(messages, linkRows);
  assert.strictEqual(out[0].links[0].href, "https://a.example/1");
  assert.strictEqual(out[1].links[0].href, "https://b.example/2");
});
