import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { ensureChatList } from "../lib/client.js";

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

async function newPageWithKnownInformationalModal() {
  const page = await browser.newPage();
  await page.setContent(`
    <div role="grid" style="width: 100px; height: 100px"></div>
    <input role="textbox">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style="position: fixed; inset: 0; z-index: 1; background: white"
    >
      <div data-testid="confirm-popup" data-animate-modal-body="true">
        <h1 id="modal-title" data-testid="popup-title">
          <svg viewBox="0 0 88 88" width="88" height="88"></svg>
          <button type="button" style="width: 24px; height: 24px">
            <svg viewBox="0 0 24 24"></svg>
          </button>
        </h1>
        <div data-testid="popup-contents" style="position: absolute; top: 120px; left: 16px">
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <button
            type="button"
            style="width: 48px; height: 24px"
            onclick="window.knownModalAccepted = true; this.closest('[role=dialog]').remove()"
          ></button>
        </div>
      </div>
    </div>
  `);
  return page;
}

async function newPageWithUnknownConfirmationModal() {
  const page = await browser.newPage();
  await page.setContent(`
    <div role="grid" style="width: 100px; height: 100px"></div>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unknown-modal-title"
      style="position: fixed; inset: 0; z-index: 1; background: white"
    >
      <div data-testid="confirm-popup">
        <h1 id="unknown-modal-title" data-testid="popup-title">
          <svg viewBox="0 0 88 88" width="88" height="88"></svg>
          <button type="button"><svg viewBox="0 0 24 24"></svg></button>
        </h1>
        <div data-testid="popup-contents">
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <svg viewBox="0 0 24 24"></svg>
          <button
            type="button"
            onclick="window.unknownModalAccepted = true; this.closest('[role=dialog]').remove()"
          ></button>
        </div>
      </div>
    </div>
  `);
  return page;
}

describe("ensureChatList modal recovery", () => {
  it("dismisses the known informational modal before accepting a visible chat grid", async () => {
    const page = await newPageWithKnownInformationalModal();

    await ensureChatList(page);

    await page.getByRole("textbox").click({ timeout: 500 });
    assert.equal(await page.evaluate(() => window.knownModalAccepted), true);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.close();
  });

  it("refuses an unknown blocking dialog without accepting it", async () => {
    const page = await newPageWithUnknownConfirmationModal();

    await assert.rejects(
      () => ensureChatList(page),
      /unknown blocking WhatsApp modal.*daemon stop.*login/i,
    );

    assert.notEqual(await page.evaluate(() => window.unknownModalAccepted), true);
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.close();
  });

  it("dismisses the known informational modal after reload recovery", async () => {
    const page = await browser.newPage();
    let requestCount = 0;
    await page.route("https://example.test/chat", async (route) => {
      requestCount += 1;
      await route.fulfill({
        contentType: "text/html",
        body: requestCount === 1
          ? "<html><body></body></html>"
          : `<html><body>
              <div role="grid" style="width: 100px; height: 100px"></div>
              <input role="textbox">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="reload-modal-title"
                style="position: fixed; inset: 0; z-index: 1; background: white"
              >
                <div data-testid="confirm-popup" data-animate-modal-body="true">
                  <h1 id="reload-modal-title" data-testid="popup-title">
                    <svg viewBox="0 0 88 88" width="88" height="88"></svg>
                    <button type="button"><svg viewBox="0 0 24 24"></svg></button>
                  </h1>
                  <div data-testid="popup-contents" style="position: absolute; top: 120px; left: 16px">
                    <svg viewBox="0 0 24 24"></svg>
                    <svg viewBox="0 0 24 24"></svg>
                    <svg viewBox="0 0 24 24"></svg>
                    <svg viewBox="0 0 24 24"></svg>
                    <button
                      type="button"
                      style="width: 48px; height: 24px"
                      onclick="window.knownModalAccepted = true; this.closest('[role=dialog]').remove()"
                    ></button>
                  </div>
                </div>
              </div>
            </body></html>`,
      });
    });
    await page.goto("https://example.test/chat");

    await ensureChatList(page);

    await page.getByRole("textbox").click({ timeout: 500 });
    assert.equal(await page.evaluate(() => window.knownModalAccepted), true);
    assert.equal(requestCount, 2);
    await page.close();
  });
});
