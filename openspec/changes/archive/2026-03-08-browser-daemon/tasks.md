## 1. Refactor command functions (prerequisite)

- [x] 1.1 Extract command logic from `greentap.js` into reusable functions that accept a `page` parameter (instead of creating their own browser)
- [x] 1.2 Keep `login` command using direct headed browser launch (bypass daemon)

## 2. Daemon process

- [x] 2.1 Create `lib/daemon.js` — launches `launchPersistentContext` with `--remote-debugging-port=19222`, writes port + PID files atomically, navigates to WA, waits for chat list
- [x] 2.2 Ensure `~/.greentap/` dir is `0700`, port/PID files are `0600`
- [x] 2.3 Implement idle timer (15min) — reset on CDP client connect/disconnect events, clean shutdown on expiry
- [x] 2.4 Handle browser `disconnected` event — clean up files and exit
- [x] 2.5 Handle SIGTERM — clean shutdown

## 3. CLI client

- [x] 3.1 Create `lib/client.js` — read `daemon.port`, `connectOverCDP`, return `{ browser, context, page }`; on disconnect call `browser.close()` (doesn't kill Chrome)
- [x] 3.2 Implement lazy start with exclusive lock: acquire `daemon.lock` via `flock()`, fork `lib/daemon.js` detached with `stdio: 'ignore'`, poll for `daemon.port` (max 15s), release lock
- [x] 3.3 Handle stale port file: if `connectOverCDP` fails, clean up files, start fresh daemon (under lock)
- [x] 3.4 Guard: skip daemon auto-start if `~/.greentap/browser-data/` is empty — print "Run greentap login first"
- [x] 3.5 Page state check: after connecting, verify chat list grid visible; try Escape → reload → goto as escalation

## 4. Wire up CLI

- [x] 4.1 Update `greentap.js` to route commands through `lib/client.js` instead of `withBrowser()`
- [x] 4.2 Make `logout` send SIGTERM to daemon PID before clearing browser data
- [x] 4.3 `greentap status` — read PID/port files, check process alive, print info or "No daemon running"
- [x] 4.4 `greentap daemon stop` — send SIGTERM to daemon PID, wait for exit

## 5. Testing

- [x] 5.1 Unit test client connection logic (stale port, missing port, lock)
- [ ] 5.2 E2E test: start daemon → connect → verify page accessible → stop daemon
- [ ] 5.3 E2E test: idle timeout triggers clean shutdown
