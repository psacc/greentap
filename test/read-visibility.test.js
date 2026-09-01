import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

import * as commands from "../lib/commands.js";
import { submitMediaPreview } from "../lib/e2e.js";
import * as parser from "../lib/parser.js";

const fixture = readFileSync(
  new URL("fixtures/visible-message-rows.html", import.meta.url),
  "utf8",
);

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

describe("visible message snapshot", () => {
  it("rejects the snapshot when DOM and ARIA row counts differ", () => {
    const aria = `- document:
  - row "Roberto Marini First fake message 09:00"
  - row "Elena Conti Second fake message 09:01"`;

    const filtered = parser.filterMessageRowsByVisibility(aria, [
      { key: "row-1", visible: true },
    ]);

    assert.equal(filtered, null, "a rerender race must not return ambiguous rows");
  });

  it("default read excludes rendered DOM-buffer rows outside the scroll viewport", async () => {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.locator("#message-scroll").evaluate((element) => {
      element.scrollTop = 80;
    });

    const messages = await commands.read(page, "Visible Rows", {
      withLinks: false,
    });

    assert.deepEqual(
      messages.map((message) => message.text),
      ["Newer fake message"],
    );
    await page.close();
  });

  it("link enrichment excludes links from off-viewport duplicate rows", async () => {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html>
      <div id="main">
        <div role="banner"><button aria-label="Visible Links"></button></div>
        <div id="message-scroll" style="height: 80px; overflow-y: auto">
          <div role="row" aria-label="Roberto Marini Same fake link 09:00" style="height: 80px">
            <a href="https://hidden.example/fake"></a>
            <span role="text">Same fake link</span>
            <span role="text">09:00</span>
            <button aria-label="Message actions"></button>
          </div>
          <div role="row" aria-label="Elena Conti Same fake link 09:01" style="height: 80px">
            <a href="https://visible.example/fake"></a>
            <span role="text">Same fake link</span>
            <span role="text">09:01</span>
            <button aria-label="Message actions"></button>
          </div>
        </div>
        <div role="contentinfo"><div role="textbox" contenteditable="true"></div></div>
      </div>`);
    await page.locator("#message-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const messages = await commands.read(page, "Visible Links");

    assert.equal(messages.length, 1);
    assert.equal(messages[0].links.length, 1);
    assert.equal(messages[0].links[0].href, "https://visible.example/fake");
    await page.close();
  });

  it("rejects a snapshot when stable rows move during ARIA capture", async () => {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.locator("#message-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const locator = page.locator.bind(page);
    const racingPage = {
      locator(selector) {
        const result = locator(selector);
        if (selector !== ":root") return result;
        return {
          async ariaSnapshot() {
            await page.locator("#message-scroll").evaluate((element) => {
              element.scrollTop = element.scrollTop > 0 ? 0 : element.scrollHeight;
            });
            return result.ariaSnapshot();
          },
        };
      },
    };

    await assert.rejects(
      () => commands.captureVisibleMessageAria(racingPage),
      /stable message viewport/,
    );
    await page.close();
  });

  it("rejects same-count row replacement during ARIA capture", async () => {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.locator("#message-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const locator = page.locator.bind(page);
    const racingPage = {
      locator(selector) {
        const result = locator(selector);
        if (selector !== ":root") return result;
        return {
          async ariaSnapshot() {
            await page
              .locator('#message-scroll [role="row"]')
              .nth(1)
              .evaluate((row) => row.replaceWith(row.cloneNode(true)));
            return result.ariaSnapshot();
          },
        };
      },
    };

    await assert.rejects(
      () => commands.captureVisibleMessageAria(racingPage),
      /stable message viewport/,
    );
    await page.close();
  });

  it("read --scroll keeps the full-history path unchanged", async () => {
    const page = await browser.newPage();
    await page.setContent(fixture);
    await page.locator("#message-scroll").evaluate((element) => {
      element.scrollTop = 80;
    });

    const messages = await commands.read(page, "Visible Rows", {
      scroll: true,
      withLinks: false,
    });

    assert.deepEqual(
      messages.map((message) => message.text),
      ["Old fake message", "Visible fake message", "Newer fake message"],
    );
    await page.close();
  });

  it("clicks the exact structural media-preview send control", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div data-testid="media-editor-canvas" style="width: 20px; height: 20px"></div>
      <div data-testid="media-caption-input-container" style="width: 20px; height: 20px"></div>
      <div role="button" id="media-send" style="width: 20px; height: 20px">
        <span data-testid="wds-ic-send-filled"></span>
      </div>`);
    await page.locator("#media-send").evaluate((element) => {
      element.addEventListener("click", () => {
        document.documentElement.dataset.mediaSent = "true";
      });
    });

    await submitMediaPreview(page, { timeout: 500 });

    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.mediaSent),
      "true",
    );
    await page.close();
  });

  it("refuses media submission when an unknown modal is visible", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div data-testid="media-editor-canvas" style="width: 20px; height: 20px"></div>
      <div data-testid="media-caption-input-container" style="width: 20px; height: 20px"></div>
      <div role="button" id="media-send" style="width: 20px; height: 20px">
        <span data-testid="wds-ic-send-filled"></span>
      </div>
      <div role="dialog" aria-modal="true" style="width: 100px; height: 100px">
        <button id="unknown-accept">Unknown action</button>
      </div>`);
    await page.locator("#media-send").evaluate((element) => {
      element.addEventListener("click", () => {
        document.documentElement.dataset.mediaSent = "true";
      });
    });
    await page.locator("#unknown-accept").evaluate((element) => {
      element.addEventListener("click", () => {
        document.documentElement.dataset.unknownAccepted = "true";
      });
    });

    await assert.rejects(
      () => submitMediaPreview(page, { timeout: 500 }),
      /unknown blocking dialog/i,
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        mediaSent:
          document.documentElement.dataset.mediaSent === "true",
        unknownAccepted:
          document.documentElement.dataset.unknownAccepted === "true",
      })),
      { mediaSent: false, unknownAccepted: false },
    );
    await page.close();
  });
});
