import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCdpUrl } from "../lib/client.js";

// GREENTAP_CDP_URL names a daemon this process does not own. Chromium's
// DevTools HTTP endpoint answers 500 to any Host header that is not an IP
// literal or "localhost" (measured against chrome-headless-shell 1208), so the
// name has to become an address before the connection is made — and the two
// forms Chromium DOES accept must be left exactly as they are, or a working
// local endpoint is rewritten into a broken one.
describe("resolveCdpUrl", () => {
  it("leaves an IPv4 literal alone, port and all", async () => {
    assert.equal(await resolveCdpUrl("http://10.89.0.9:19223"), "http://10.89.0.9:19223/");
  });

  it("leaves localhost alone — Chromium accepts it by name", async () => {
    assert.equal(await resolveCdpUrl("http://localhost:19222"), "http://localhost:19222/");
  });

  it("rewrites a hostname to its address and keeps the port", async () => {
    // Any name is fine as long as it resolves; the point is that the HOST
    // changed to something Chromium will accept and the port survived.
    const out = await resolveCdpUrl("http://localhost.:19223");
    const u = new URL(out);
    assert.equal(u.port, "19223");
    assert.notEqual(u.hostname, "localhost.");
    assert.match(u.hostname, /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-f:]+\])$/);
  });

  it("fails loudly on a name that does not resolve", async () => {
    await assert.rejects(() => resolveCdpUrl("http://no-such-host.invalid:19223"));
  });
});
