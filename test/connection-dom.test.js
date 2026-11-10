import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectionState, ensureChatList, waitForTransport } from '../lib/client.js';

let browser, page, port, profile, child;
before(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  profile = await mkdtemp(join(tmpdir(), "greentap-synthetic-"));
  child = spawn(chromium.executablePath(), ['--headless', '--no-sandbox', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  const deadline = Date.now() + 10000;
  for (;;) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
    catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  page = browser.contexts()[0].pages()[0];
});
after(async () => { await browser?.close(); if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

test('structural state detection handles loading, hidden markers, QR and ready media', async () => {
  for (const [html, expected] of [
    ['<div>Loading</div>', 'loading'],
    ['<div data-ref="synthetic"><canvas></canvas></div>', 'logged-out'],
    ['<div data-testid="qrcode">Expired code</div>', 'logged-out'],
    ['<div data-testid="link-device-phone-number-code-screen">0000</div>', 'logged-out'],
    ['<div data-ref="synthetic" hidden><canvas></canvas></div>', 'loading'],
    ['<div role="grid" hidden></div>', 'loading'],
    ['<div role="grid" style="height:20px">Chat list</div><canvas></canvas>', 'ready'],
  ]) {
    await page.setContent(html);
    assert.equal(await connectionState(page), expected);
  }
});

test('real DOM loading transitions to ready and QR without a reload', async () => {
  for (const html of ['<div role="grid">Ready</div>', '<div data-ref="synthetic"><canvas></canvas></div>']) {
    await page.setContent('<div>Loading</div>');
    await page.evaluate(html => setTimeout(() => { document.body.innerHTML = html; }, 100), html);
    const operation = ensureChatList(page, { log: () => {} });
    if (html.includes('canvas')) await assert.rejects(operation, /greentap login/);
    else await operation;
  }
});

test('real CLI commands fail quickly on synthetic logged-out CDP page', async () => {
  await page.setContent('<div data-ref="synthetic"><canvas></canvas></div>');
  for (const args of [['whoami'], ['chats'], ['read', 'Synthetic Chat'], ['poll-results', 'Synthetic Chat']]) {
    const start = Date.now();
    await assert.rejects(promisify(execFile)(process.execPath, ['greentap.js', ...args, '--json'], {
      env: { ...process.env, GREENTAP_CDP_URL: `http://127.0.0.1:${port}` },
      timeout: 4000,
    }), error => {
      assert.equal(error.code, 1, error.stderr);
      assert.match(error.stderr, /greentap login.*QR/);
      assert.equal(error.stdout, '');
      return true;
    });
    assert.ok(Date.now() - start < 4000);
    assert.equal(await connectionState(page), 'logged-out');
  }
});

test('transport retries cold establishment and announces only once', async () => {
  let calls = 0;
  const notices = [];
  assert.equal(await waitForTransport(async () => {
    if (++calls < 2) throw new Error('Synthetic startup');
    return 'connected';
  }, { log: message => notices.push(message) }), 'connected');
  assert.equal(calls, 2);
  assert.equal(notices.length, 1);
  await assert.rejects(waitForTransport(async () => { throw new Error('Synthetic failure'); }, { timeoutMs: 0 }), /startup\/reconnect.*Retry/);
});

test('send control selector matches exactly one Send icon in current and legacy footers', async () => {
  const { SEND_BUTTON_XPATH } = await import('../lib/commands.js');
  const svg = (title) => `<span aria-hidden="true"><svg viewBox="0 0 24 24"><title>${title}</title><path></path></svg></span>`;
  const attach = `<button aria-label="Allega">${svg('ic-add')}</button>`;
  const send = (label) => `<button aria-label="${label}">${svg('ic-send-filled')}</button>`;
  for (const [footer, expected] of [
    [`${attach}<div contenteditable="true"><p>Bozza</p></div>${send('Invia')}`, 1],
    [`${attach}${send('Send')}`, 1],
    [`${attach}<button aria-label="Send"><span data-icon="wds-ic-send-filled"></span></button>`, 1],
    [`${attach}${send('Invia')}<button aria-label="Chiudi">${svg('ic-close')}</button>`, 1],
    [`${attach}<button aria-label="Messaggio vocale">${svg('ic-mic-outlined')}</button>`, 0],
    [`${attach}${send('Invia')}${send('Invia')}`, 2],
  ]) {
    await page.setContent(`<div id="main"><footer>${footer}</footer></div>`);
    assert.equal(await page.getByRole('contentinfo').locator(SEND_BUTTON_XPATH).count(), expected, footer);
  }
});
