# Daemon Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two independent daemon reliability issues: (1) client timeout during cold start, (2) CDP port conflicts + lack of browser isolation.

**Architecture:** Write the port file *before* launching Chromium (port is a fixed constant 19222, so we know it upfront); remove `channel: "chrome"` so the daemon uses Playwright's bundled Chromium instead of the user's system Chrome.

**Tech Stack:** Node.js ESM, Playwright `launchPersistentContext`, CDP over TCP port 19222.

---

## Context you need

- [Issue #13](https://github.com/psacc-labs/greentap/issues/13): `lib/daemon.js:88` writes `daemon.port` only *after* `chromium.launchPersistentContext()` returns (15–30s cold start). Client in `lib/client.js:147-153` polls for the port file with a 15s deadline and times out.
- [Issue #14](https://github.com/psacc-labs/greentap/issues/14): `lib/daemon.js:78` uses `channel: "chrome"` (system Chrome). This causes version drift and CDP port conflicts when the user also runs Chrome normally.
- Both changes live in `lib/daemon.js`. Apply sequentially to avoid internal conflicts.
- After Task 2, the persistent profile at `~/.greentap/browser-data/` may need re-login (Chrome ↔ Chromium profile format differs). Document in release notes.

## File Structure

- Modify: `lib/daemon.js` — port file write order + remove `channel`
- Modify: `test/daemon.test.js` — create if absent, add integration test for port-file-before-launch
- Modify: `README.md` — note re-login may be required after v0.3.2
- Modify: `ROADMAP.md` — risk row "WhatsApp rejects bundled Chromium" — update after verification

---

## Task 1: Write port file before Chrome launch

**Files:**
- Modify: `lib/daemon.js:70-89`
- Test: `test/daemon.test.js` (new file)

- [ ] **Step 1: Write failing test**

Create `test/daemon.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PORT_FILE = join(homedir(), ".greentap", "daemon.port");

test("daemon writes port file before Chrome launch finishes", async () => {
  // This test asserts post-condition: after daemon starts (up to 2s),
  // the port file exists even if Chrome is still launching.
  // Precondition: daemon not running, port file absent.
  // Run manually: `node lib/daemon.js &` then within 2s check existsSync(PORT_FILE).
  // Automated variant: fork daemon, poll for file within 2s, assert success, SIGTERM.
  const { fork } = await import("child_process");
  const child = fork("lib/daemon.js", [], { detached: true, stdio: "ignore" });
  try {
    const deadline = Date.now() + 2000;
    let found = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      if (existsSync(PORT_FILE)) { found = true; break; }
    }
    assert.strictEqual(found, true, "port file should exist within 2s");
    const port = parseInt(readFileSync(PORT_FILE, "utf8").trim(), 10);
    assert.strictEqual(port, 19222);
  } finally {
    try { process.kill(child.pid, "SIGTERM"); } catch {}
  }
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `node --test test/daemon.test.js`
Expected: FAIL — port file appears after Chrome launch (typically 15-30s), not within 2s deadline.

- [ ] **Step 3: Move port file write above `launchPersistentContext`**

Edit `lib/daemon.js`. Replace lines 70-89 (the start of `main()` up to and including the `writeAtomic(PID_FILE, ...)` line) with:

```javascript
async function main() {
  // Ensure ~/.greentap/ exists with 0700
  mkdirSync(GREENTAP_DIR, { recursive: true, mode: 0o700 });
  chmodSync(GREENTAP_DIR, 0o700);

  // Write port + PID files BEFORE launching Chrome. Port is a known constant
  // (CDP_PORT = 19222); clients tryConnect() will retry until the CDP server
  // is actually listening. Fixes #13 where clients timed out during cold
  // start (15-30s) because the port file appeared only after launch.
  writeAtomic(PORT_FILE, String(CDP_PORT));
  writeAtomic(PID_FILE, String(process.pid));

  // Launch persistent context with CDP
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
```

- [ ] **Step 4: Verify `client.js` tryConnect already retries**

Read `lib/client.js:122-137` — `tryConnect` uses `chromium.connectOverCDP` with 5s timeout. This is called once; if CDP isn't listening yet, it throws. The outer loop in `connect()` does NOT retry `tryConnect` on failure — it calls `cleanupStaleFiles()` and starts a new daemon. This means: with the fix, the first `tryConnect` may still fail during cold start.

Therefore, also patch `lib/client.js`. Replace lines 206-221 (the "Try existing daemon" block) with:

```javascript
  // Try existing daemon (with CDP-listening retry for cold start)
  let port = readPort();
  if (port) {
    const pid = readPid();
    const daemonAlive = pid && isProcessAlive(pid);
    const deadline = Date.now() + (daemonAlive ? 30000 : 5000);
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        const { browser, page } = await tryConnect(port);
        await ensureChatList(page);
        const localeConfig = await detectLocale(page);
        return {
          page,
          disconnect: () => browser.close(),
          localeConfig,
        };
      } catch (err) {
        lastErr = err;
        if (!daemonAlive) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    // Stale port file (or daemon stuck)
    cleanupStaleFiles();
  }
```

- [ ] **Step 5: Run test, confirm pass**

Run: `node --test test/daemon.test.js`
Expected: PASS within 2s.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Manual smoke test**

```bash
node greentap.js daemon stop
rm -f ~/.greentap/daemon.port ~/.greentap/daemon.pid
time node greentap.js status
```

Expected: first call succeeds in <5s on warm daemon, <35s on cold start (no spurious "Daemon failed to start within 15s").

- [ ] **Step 8: Commit**

```bash
git add lib/daemon.js lib/client.js test/daemon.test.js
git commit -m "fix(daemon): write port file before Chrome launch (#13)

Clients waited up to 15s for the port file, but launchPersistentContext
takes 15-30s on cold start. Write the port file up front (port is the
fixed constant 19222) and let tryConnect retry while Chrome warms up."
```

---

## Task 2: Remove `channel: "chrome"` to use bundled Chromium

**Files:**
- Modify: `lib/daemon.js:78`
- Modify: `package.json` — add postinstall to ensure Chromium is present (optional — decide in Step 3)
- Modify: `README.md` — installation note
- Test: manual — WhatsApp Web must render + allow login

- [ ] **Step 1: Verify Playwright bundled Chromium is installed**

Run: `npx playwright install chromium`
Expected: "chromium <version> is already installed" or successful install.

- [ ] **Step 2: Back up existing session**

Existing `~/.greentap/browser-data/` was created by system Chrome. Profile format may not be compatible with bundled Chromium. Back up before swapping:

```bash
mv ~/.greentap/browser-data ~/.greentap/browser-data.chrome-backup
```

- [ ] **Step 3: Remove `channel` option**

Edit `lib/daemon.js`. Delete line 78:

```javascript
    channel: "chrome",
```

Resulting block:

```javascript
  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [
      "--disable-blink-features=AutomationControlled",
      `--remote-debugging-port=${CDP_PORT}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
```

- [ ] **Step 4: Stop existing daemon and re-login**

```bash
node greentap.js daemon stop
node greentap.js login
# scan QR
```

Expected: login succeeds; headless check — WhatsApp Web accepts bundled Chromium. If WA blocks with "update your browser" banner, revert this task and open a follow-up issue for user-agent spoofing.

- [ ] **Step 5: Smoke test read-only commands**

```bash
node greentap.js chats --json | head -20
node greentap.js unread --json
```

Expected: output JSON with real chat data (verify no errors in output).

- [ ] **Step 6: Run test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Update README**

Edit `README.md`. In the Installation section, add after the existing `npm install` instructions:

```markdown
> **v0.3.2+ note:** greentap now uses Playwright's bundled Chromium (was system Chrome). The Chromium binary is installed via `npx playwright install chromium` (run automatically by `npm install`). If you upgraded from an earlier version, you will need to re-scan the QR code via `greentap login` since browser profile data is not portable between Chrome and Chromium.
```

- [ ] **Step 8: Update ROADMAP risk table**

Edit `ROADMAP.md` line 41. Change:

```
| WhatsApp rejects bundled Chromium | Medium | Use system Chrome (`channel: "chrome"`), headless mode |
```

to:

```
| WhatsApp rejects bundled Chromium | Verified OK as of 2026-04 | Bundled Chromium tested with headless + automation-controlled disabled |
```

- [ ] **Step 9: Commit**

```bash
git add lib/daemon.js README.md ROADMAP.md
git commit -m "fix(daemon): use bundled Chromium instead of system Chrome (#14)

Eliminates CDP port conflicts with the user's own Chrome, removes version
drift risk, and isolates greentap's browser profile. Users upgrading from
v0.3.1 will need to re-login (profile formats differ)."
```

- [ ] **Step 10: Cleanup backup**

After a day of successful use:

```bash
rm -rf ~/.greentap/browser-data.chrome-backup
```

---

## Release

After both tasks merge:

```bash
git tag v0.3.2
git push origin v0.3.2
gh release create v0.3.2 \
  --title "v0.3.2 — Daemon hardening" \
  --notes "**Fixes**
- Daemon port file written before Chrome launch — eliminates 15s client timeout on cold start (#13)
- Switch from system Chrome to bundled Chromium — no CDP port conflicts, profile isolation (#14)

**Upgrade note:** re-run \`greentap login\` after upgrading (Chrome and Chromium use different profile formats)."
```
