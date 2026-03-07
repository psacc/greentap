## 1. Daemon process

- [ ] 1.1 Create `lib/daemon.js` — standalone Node script that launches persistent context, navigates to WA, creates Unix socket server at `~/.greentap/daemon.sock`, writes PID file
- [ ] 1.2 Implement JSON-RPC handler: parse `{ method, params }` from socket, dispatch to command functions, return `{ result }` or `{ error }`
- [ ] 1.3 Implement idle timer (15min) — reset on each client command, clean shutdown on expiry
- [ ] 1.4 Handle browser disconnect event — clean up PID/socket and exit
- [ ] 1.5 Page state reset: before each command, verify chat list grid is visible; if not, navigate to WA_URL and wait

## 2. CLI client

- [ ] 2.1 Create `lib/client.js` — connect to daemon socket, send JSON-RPC, receive response
- [ ] 2.2 Implement lazy start: if socket connection fails, fork `lib/daemon.js` detached, poll for socket (max 15s), then connect
- [ ] 2.3 Handle stale PID file: check if PID process is alive, clean up if dead

## 3. Refactor command functions

- [ ] 3.1 Extract command logic from `greentap.js` into reusable functions that accept a `page` parameter (instead of creating their own browser)
- [ ] 3.2 Update `greentap.js` to route commands through daemon client instead of `withBrowser()`
- [ ] 3.3 Keep `login` command using direct headed browser launch (bypass daemon)
- [ ] 3.4 Make `logout` stop the daemon before clearing browser data

## 4. New CLI commands

- [ ] 4.1 `greentap status` — connect to daemon, print PID/uptime/idle or "No daemon running"
- [ ] 4.2 `greentap daemon stop` — send shutdown command via socket, confirm exit
- [ ] 4.3 `greentap daemon start` — explicit start (optional, for pre-warming)

## 5. Testing

- [ ] 5.1 Unit test JSON-RPC protocol (parse/serialize)
- [ ] 5.2 Unit test stale PID detection and cleanup logic
- [ ] 5.3 E2E test: start daemon → run command → verify result → stop daemon
- [ ] 5.4 E2E test: idle timeout triggers clean shutdown
