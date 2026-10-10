import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureChatList } from '../lib/client.js';

function syntheticPage(states) {
  let index = 0;
  return {
    locator: () => ({ count: async () => 0 }),
    evaluate: async () => states[Math.min(index++, states.length - 1)],
    waitForTimeout: async () => {},
  };
}

for (const command of ['whoami', 'chats', 'read', 'poll-results']) {
  test(`${command}: QR/logout fails promptly at the shared connection gate`, async () => {
    const start = Date.now();
    await assert.rejects(ensureChatList(syntheticPage(['logged-out'])), /greentap login/);
    assert.ok(Date.now() - start < 1000);
  });
}

test('ready state returns without a loading notice', async () => {
  const notices = [];
  await ensureChatList(syntheticPage(['ready']), { log: message => notices.push(message) });
  assert.deepEqual(notices, []);
});

test('cold start waits, reports loading, and then succeeds', async () => {
  const notices = [];
  await ensureChatList(syntheticPage(['loading', 'loading', 'ready']), { log: message => notices.push(message) });
  assert.equal(notices.length, 1);
  assert.match(notices[0], /loading/);
});

test('cold start becoming logged out fails with login guidance', async () => {
  await assert.rejects(ensureChatList(syntheticPage(['loading', 'logged-out']), { log: () => {} }), /greentap login/);
});

test('loading timeout does not claim logout or CDP failure', async () => {
  await assert.rejects(ensureChatList(syntheticPage(['loading']), { timeoutMs: 0, log: () => {} }), /still loading.*retry/i);
});

test('navigation context races remain loading and can recover', async () => {
  const page = syntheticPage(['ready']);
  const probe = page.evaluate;
  let first = true;
  page.evaluate = async () => {
    if (first) { first = false; throw new Error('Execution context was destroyed'); }
    return probe();
  };
  await ensureChatList(page, { log: () => {} });
});

test('reload timeout retains actionable loading guidance', async () => {
  const page = syntheticPage(['loading']);
  page.waitForTimeout = async () => { await new Promise(resolve => setTimeout(resolve, 15)); };
  page.reload = async () => { const error = new Error('Synthetic navigation timeout'); error.name = 'TimeoutError'; throw error; };
  await assert.rejects(ensureChatList(page, { timeoutMs: 100, log: () => {} }), /still loading.*Retry/);
});
