import { describe, it, mock } from "node:test";
import dnsPromises from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
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
    // Verify the rewrite without requiring the host running unit tests to
    // have external DNS access. No actual CDP connection is made here.
    const mockedLookup = mock.method(dnsPromises, "lookup", async (hostname) => {
      assert.equal(hostname, "synthetic-daemon.test");
      return { address: "127.0.0.1", family: 4 };
    });
    syncBuiltinESMExports();
    try {
      assert.equal(await resolveCdpUrl("http://synthetic-daemon.test:19223"), "http://127.0.0.1:19223/");
    } finally {
      mockedLookup.mock.restore();
      syncBuiltinESMExports();
    }
  });

  it("fails loudly on a name that does not resolve", async () => {
    await assert.rejects(() => resolveCdpUrl("http://no-such-host.invalid:19223"));
  });
});

function cli(cdpUrl, command = "status") {
  const entry = fileURLToPath(new URL("../greentap.js", import.meta.url));
  return new Promise((resolve) => {
    execFile("node", [entry, command], { env: { ...process.env, GREENTAP_CDP_URL: cdpUrl, RES_OPTIONS: "attempts:1 timeout:1" } }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, out: stdout + stderr }),
    );
  });
}

describe("status with GREENTAP_CDP_URL", () => {
  it("reports the remote daemon, not the absent local one", async () => {
    const server = createServer((req, res) => res.end(req.url === "/json/version" ? '{"Browser":"Chrome"}' : ""));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const { code, out } = await cli(url);
      assert.equal(code, 0);
      assert.match(out, new RegExp(`Remote daemon reachable at ${url}`));
    } finally {
      server.close();
    }
  });

  it("exits non-zero when the remote daemon cannot be reached", async () => {
    const { code, out } = await cli("http://no-such-host.invalid:19223");
    assert.notEqual(code, 0);
    assert.match(out, /Remote daemon NOT reachable at http:\/\/no-such-host\.invalid:19223/);
  });
});

describe("a command with an unresolvable GREENTAP_CDP_URL", () => {
  it("fails at once and names the host, instead of retrying for 30s", async () => {
    const started = Date.now();
    const { code, out } = await cli("http://no-such-host.invalid:19223", "whoami");
    assert.notEqual(code, 0);
    assert.match(out, /Cannot resolve no-such-host\.invalid: (?:ENOTFOUND|EAI_AGAIN)/);
    assert.ok(Date.now() - started < 10000);
  });
});
