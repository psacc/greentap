import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as commands from "../lib/commands.js";

/**
 * Build a fake Playwright `page` that exercises navigateToChat end-to-end
 * without a real browser. The fake page can delay grid visibility to
 * simulate cold CDP connections where the chat grid hasn't painted yet.
 *
 * @param {object} opts
 * @param {number} [opts.gridVisibleAfterMs=0] - Delay before the chat grid
 *   reports visible. If gridVisibleAfterMs > the navigateToChat wait timeout,
 *   the search fallback path runs.
 * @param {string} [opts.gridAria=""] - ARIA snapshot returned by the chat grid
 *   (used when grid path is taken).
 * @param {string} [opts.searchAria=""] - ARIA snapshot returned by page.locator(":root")
 *   AFTER search has been typed (used when fallback path is taken).
 * @param {boolean} [opts.searchThrows=false] - If true, the search results
 *   waitFor rejects, simulating "chat not found" in the search path.
 */
function makeFakePage({
  gridVisibleAfterMs = 0,
  gridAria = "",
  searchAria = "",
  searchThrows = false,
} = {}) {
  const started = Date.now();
  const gridIsVisible = () => Date.now() - started >= gridVisibleAfterMs;
  const calls = { gridClick: 0, searchClick: 0 };

  const gridRow = {
    filter: () => gridRow,
    first: () => gridRow,
    click: async () => {
      calls.gridClick++;
    },
    isVisible: async () => true,
    waitFor: async () => {
      if (searchThrows) throw new Error("timeout waiting for search row");
    },
  };

  const chatGrid = {
    // The production code calls `.waitFor({ state, timeout })` on the grid
    // before deciding grid-vs-search. This fake resolves iff the grid is
    // visible by the deadline; otherwise throws (matching Playwright).
    waitFor: async ({ timeout = 10000 } = {}) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (gridIsVisible()) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("grid waitFor timeout");
    },
    isVisible: async () => gridIsVisible(),
    ariaSnapshot: async () => gridAria,
    getByRole: () => gridRow,
    first: () => chatGrid,
  };

  // Compose textbox (inside contentinfo) — waitForMessagePanel uses this.
  const composeTextbox = {
    waitFor: async () => {},
    click: async () => {},
  };

  // Sidebar search textbox — page.getByRole("textbox").first()
  const searchTextbox = {
    click: async () => {
      calls.searchClick++;
    },
    first: () => searchTextbox,
    waitFor: async () => {},
  };

  const contentinfo = {
    getByRole: () => composeTextbox,
  };

  const page = {
    getByRole: (role) => {
      if (role === "grid") {
        return { first: () => chatGrid };
      }
      if (role === "contentinfo") {
        return contentinfo;
      }
      if (role === "textbox") {
        return { first: () => searchTextbox };
      }
      if (role === "gridcell") {
        return {};
      }
      return { first: () => ({ click: async () => {}, isVisible: async () => true }) };
    },
    locator: () => ({
      ariaSnapshot: async () => searchAria,
    }),
    keyboard: {
      type: async () => {},
      press: async () => {},
    },
    _calls: calls,
  };
  return page;
}

// A complete grid ARIA snippet that parseChatList understands, with two
// Ferragosto rows (different times) and one Elena Conti row for the
// search-fallback duplicate test.
const TWO_FERRAGOSTO_AND_ELENA = `- grid "Risultati della ricerca.":
    - 'row "Ferragosto 10:00 Buongiorno"':
      - 'gridcell "Ferragosto 10:00 Buongiorno"':
        - img
        - gridcell "Ferragosto 10:00"
        - text: Buongiorno
        - gridcell
    - 'row "Ferragosto 11:30 A che ora?"':
      - 'gridcell "Ferragosto 11:30 A che ora?"':
        - img
        - gridcell "Ferragosto 11:30"
        - text: A che ora?
        - gridcell
    - 'row "Elena Conti 14:22 Ciao"':
      - 'gridcell "Elena Conti 14:22 Ciao"':
        - img
        - gridcell "Elena Conti 14:22"
        - text: Ciao
        - gridcell
  - contentinfo:
    - textbox "Scrivi un messaggio"
`;

// Single Roberto Marini row — for grid-path determinism test.
const ROBERTO_GRID = `- grid "Lista delle chat":
    - 'row "Roberto Marini 12:34 Ciao"':
      - 'gridcell "Roberto Marini 12:34 Ciao"':
        - img
        - gridcell "Roberto Marini 12:34"
        - text: Ciao
        - gridcell
  - contentinfo:
    - textbox "Scrivi un messaggio"
`;

describe("navigateToChat: grid determinism (waitFor gate)", () => {
  it("uses grid path when grid becomes visible within the wait window", async () => {
    const page = makeFakePage({
      gridVisibleAfterMs: 300, // well under the 2s wait
      gridAria: ROBERTO_GRID,
    });
    // If grid path is taken, gridRow.click is called; search path would
    // call searchTextbox.click instead.
    await commands.navigateToChat(page, "Roberto Marini", null);
    assert.equal(page._calls.gridClick, 1, "should have clicked a grid row");
    assert.equal(page._calls.searchClick, 0, "should NOT have fallen back to search");
  });

  it("falls back to search when grid never becomes visible within wait window", async () => {
    const page = makeFakePage({
      gridVisibleAfterMs: 10_000, // exceeds any reasonable wait
      gridAria: "",
      searchAria: TWO_FERRAGOSTO_AND_ELENA,
    });
    await commands.navigateToChat(page, "Elena Conti", null);
    assert.equal(page._calls.searchClick, 1, "should have fallen back to search");
  });
});

describe("navigateToChat: --index disambiguation in search fallback", () => {
  it("throws with disambiguation message when multiple exact matches in search results and no --index", async () => {
    const page = makeFakePage({
      gridVisibleAfterMs: 10_000, // force search path
      searchAria: TWO_FERRAGOSTO_AND_ELENA,
    });
    await assert.rejects(
      () => commands.navigateToChat(page, "Ferragosto", null),
      (err) => {
        assert.ok(
          /Multiple chats named "Ferragosto" found/.test(err.message),
          `expected disambiguation message, got: ${err.message}`,
        );
        assert.ok(err.message.includes("--index"), "expected --index hint in message");
        assert.ok(err.message.includes("1."), "expected listing index 1");
        assert.ok(err.message.includes("2."), "expected listing index 2");
        return true;
      },
    );
  });

  it("selects the Nth result when --index is provided in search fallback", async () => {
    const page = makeFakePage({
      gridVisibleAfterMs: 10_000,
      searchAria: TWO_FERRAGOSTO_AND_ELENA,
    });
    await assert.doesNotReject(
      () => commands.navigateToChat(page, "Ferragosto", null, 2),
    );
  });

  it("throws out-of-range error when --index exceeds match count in search fallback", async () => {
    const page = makeFakePage({
      gridVisibleAfterMs: 10_000,
      searchAria: TWO_FERRAGOSTO_AND_ELENA,
    });
    await assert.rejects(
      () => commands.navigateToChat(page, "Ferragosto", null, 99),
      (err) => {
        assert.ok(/out of range/.test(err.message), `expected out-of-range error, got: ${err.message}`);
        return true;
      },
    );
  });
});
