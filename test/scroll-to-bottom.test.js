import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as commands from "../lib/commands.js";

/**
 * Build a fake Playwright page that records evaluate/snapshot calls and
 * lets the test program the `scrollHeight` returned by each scroll pin.
 *
 * `findScrollContainer` and the scrollTop pins all go through
 * `page.evaluate(fn)`. The scroll-pin evaluate now RETURNS scrollHeight so
 * ensureScrolledToBottom can loop until the height stabilizes; the fake feeds
 * a programmed sequence of heights to drive that loop.
 */
function makeFakePage({ findScrollResult = true, heights = null } = {}) {
  const calls = [];
  let pinIdx = 0;
  const page = {
    evaluate: async (fn) => {
      const src = fn.toString();
      // findScrollContainer probes for the dataset marker.
      if (src.includes("dataset.greentapScroll")) {
        calls.push("findScrollContainer");
        return findScrollResult;
      }
      // scroll pins read/return scrollHeight.
      if (src.includes("scrollHeight")) {
        calls.push("scrollPin");
        if (heights) {
          const h = pinIdx < heights.length ? heights[pinIdx] : heights[heights.length - 1];
          pinIdx++;
          return h;
        }
        return 100; // constant height → stabilizes on the 2nd pass
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

const pins = (calls) => calls.filter((c) => c === "scrollPin").length;

describe("ensureScrolledToBottom", () => {
  it("locates the container, scrolls until scrollHeight is stable, then a final pin", async () => {
    // Constant height → stable on the 2nd pass: pass0 (-1→100), pass1 (100===100 break),
    // plus the final re-anchor pin = 3 scroll pins total.
    const { page, calls } = makeFakePage({ findScrollResult: true });
    const ok = await commands.ensureScrolledToBottom(page, 5);
    assert.equal(ok, true, "should return true when container found");
    assert.equal(calls[0], "findScrollContainer");
    assert.equal(pins(calls), 3, "two stabilizing passes + one final pin");
    assert.ok(!calls.includes("ariaSnapshot"), "must not snapshot — that's the caller's job");
  });

  it("keeps scrolling while scrollHeight grows (virtualized rows materializing below)", async () => {
    // Heights grow then settle: 100,200,300,300 → loop pins at 100,200,300,300
    // (breaks when 300===300), then one final pin = 5 scroll pins.
    const { page, calls } = makeFakePage({ heights: [100, 200, 300, 300] });
    await commands.ensureScrolledToBottom(page, 5);
    assert.equal(pins(calls), 5, "scrolls through each growth step, then final pin");
  });

  it("is bounded — a forever-growing (live) chat stops after MAX_PASSES, never hangs", async () => {
    // Height grows on every pass and never stabilizes.
    const { page, calls } = makeFakePage({ heights: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] });
    await commands.ensureScrolledToBottom(page, 1);
    // MAX_PASSES (6) loop pins + 1 final pin = 7. Must not exceed this.
    assert.equal(pins(calls), 7, "bounded at MAX_PASSES loop iterations + final pin");
  });

  it("returns false (no-op) when scroll container is not found — graceful degradation", async () => {
    const { page, calls } = makeFakePage({ findScrollResult: false });
    const ok = await commands.ensureScrolledToBottom(page, 5);
    assert.equal(ok, false, "should return false when container missing");
    assert.deepEqual(calls, ["findScrollContainer"], "no scroll attempted");
  });

  it("settles between passes so freshly materialized rows render before the caller snapshots", async () => {
    // Constant height stabilizes in 2 passes; with settle=150 that's 2×150 plus
    // the final 300ms render settle → comfortably over one settle window.
    const { page } = makeFakePage({ findScrollResult: true });
    const t0 = Date.now();
    await commands.ensureScrolledToBottom(page, 150);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 280, `should wait through settles, waited ${elapsed}ms`);
  });
});
