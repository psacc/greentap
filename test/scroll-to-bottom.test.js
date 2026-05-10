import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as commands from "../lib/commands.js";

/**
 * Build a fake Playwright page that records evaluate/snapshot calls and
 * lets the test program the result of each evaluate invocation.
 *
 * `findScrollContainer` and the two scrollTop pins all go through
 * `page.evaluate(fn)`. The fake exposes the call sequence so tests can
 * assert WHEN scroll-to-bottom happened relative to ariaSnapshot.
 */
function makeFakePage({ findScrollResult = true } = {}) {
  const calls = [];
  const page = {
    evaluate: async (fn) => {
      // First call comes from findScrollContainer — record + return programmed
      // result. Subsequent calls are the scrollTop pins; just record them.
      const src = fn.toString();
      if (src.includes("dataset.greentapScroll")) {
        calls.push("findScrollContainer");
        return findScrollResult;
      }
      if (src.includes("scrollHeight")) {
        calls.push("scrollPin");
        return undefined;
      }
      calls.push("evaluate:other");
      return undefined;
    },
    locator: () => ({
      ariaSnapshot: async () => {
        calls.push("ariaSnapshot");
        return "";
      },
    }),
  };
  return { page, calls };
}

describe("ensureScrolledToBottom", () => {
  it("locates scroll container, then pins scrollTop twice with a settle in between", async () => {
    const { page, calls } = makeFakePage({ findScrollResult: true });
    const ok = await commands.ensureScrolledToBottom(page, 10); // tiny settle for tests
    assert.equal(ok, true, "should return true when container found");
    assert.deepEqual(calls, ["findScrollContainer", "scrollPin", "scrollPin"]);
  });

  it("returns false (no-op) when scroll container is not found — graceful degradation", async () => {
    const { page, calls } = makeFakePage({ findScrollResult: false });
    const ok = await commands.ensureScrolledToBottom(page, 10);
    assert.equal(ok, false, "should return false when container missing");
    // Only the locate call should have happened — no scroll pins attempted.
    assert.deepEqual(calls, ["findScrollContainer"]);
  });

  it("waits for the requested settle window between the two pins", async () => {
    const { page } = makeFakePage({ findScrollResult: true });
    const t0 = Date.now();
    await commands.ensureScrolledToBottom(page, 200);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 180, `should wait ~200ms, waited ${elapsed}ms`);
  });
});
