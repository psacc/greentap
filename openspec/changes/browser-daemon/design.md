## Context

Currently every greentap command calls `withBrowser()` which runs
`chromium.launchPersistentContext()` → work → `context.close()`. This takes 3-5s per
invocation, mostly Chrome startup + WhatsApp Web load.

Key discovery: `launchPersistentContext` with `--remote-debugging-port` exposes
a CDP endpoint. Clients can then use `chromium.connectOverCDP()` to get the same
context and pages — full Playwright API, no custom IPC needed.

## Goals / Non-Goals

**Goals:**
- Per-command latency < 500ms when daemon is running
- Zero-config: first command auto-starts daemon, idle timeout auto-stops it
- Explicit `daemon stop` and `status` commands
- Clean shutdown: PID file, port file cleanup, no orphan Chrome processes

**Non-Goals:**
- Multi-user / multi-session support
- Remote access (daemon is localhost only)
- Custom IPC protocol (use Playwright's native CDP transport)

## Decisions

### IPC: Chrome DevTools Protocol via Playwright

**Why:** `launchPersistentContext` with `--remote-debugging-port=PORT` exposes a CDP
endpoint. Clients connect with `chromium.connectOverCDP('http://localhost:PORT')` and
get the full Playwright API — same context, same pages. No JSON-RPC, no socket
framing, no message serialization to build.

Client `browser.close()` only disconnects the client — Chrome stays alive.

**Alternative rejected:** `browserType.launchServer()` + `connect()` — Playwright's native
server mode has full-fidelity WS protocol, but explicitly blocks `--user-data-dir`. We need
persistent context for the WhatsApp session. Tested: Playwright throws
`"Pass userDataDir to launchPersistentContext instead"` when args include `--user-data-dir`.

**Alternative rejected:** Custom Unix socket + JSON-RPC — unnecessary complexity
now that we confirmed CDP works with persistent contexts.

**Fidelity note:** Playwright docs warn that `connectOverCDP` offers "significantly lower
fidelity" than the native protocol. Tested in practice: `ariaSnapshot`, `locator`,
`getByRole`, `keyboard.type`, `evaluate`, `waitForSelector` all work correctly over CDP.
The warning applies to edge cases irrelevant to our use case.

### CDP port: fixed at 19222

**Why:** `--remote-debugging-port=0` auto-assigns a port, but discovering it requires
`lsof` or process scanning — fragile and platform-specific. A fixed port (19222) is
simpler: daemon writes it to `daemon.port` for consistency, client reads it, done.
Single-user localhost tool, port conflicts are unlikely. If 19222 is taken, daemon
fails fast with a clear error.

**Alternative rejected:** Port 0 + discovery via `lsof -p PID` — unnecessary complexity
for a personal single-instance tool.

### Daemon: forked Node process

**Why:** `child_process.fork()` with `detached: true`, `unref()`, and `stdio: 'ignore'`.
The daemon script (`lib/daemon.js`):
1. Launches `launchPersistentContext` with `--remote-debugging-port=19222`
2. Writes port to `~/.greentap/daemon.port`
3. Writes PID to `~/.greentap/daemon.pid`
4. Navigates to WhatsApp Web, waits for chat list
5. Starts idle timer

### Idle timeout: 15 minutes

**Why:** Covers typical interactive sessions with margin. Timer resets each time
a client connects (daemon can detect connections via CDP events or a simple
heartbeat file touch).

### Connection flow

```
CLI command (e.g. greentap chats)
  │
  ├─ Read ~/.greentap/daemon.port
  │   ├─ Exists → connectOverCDP(http://localhost:PORT)
  │   │   ├─ Success → get page → execute command → disconnect
  │   │   └─ Fail → stale file, clean up, fall through
  │   └─ Missing
  │       ├─ Check browser-data/ exists (has session?)
  │       │   └─ No → "Run greentap login first"
  │       ├─ Acquire exclusive lock (~/.greentap/daemon.lock)
  │       ├─ Fork daemon process
  │       ├─ Wait for daemon.port file to appear (poll, max 15s)
  │       ├─ Release lock
  │       └─ connectOverCDP → execute command → disconnect
  │
  └─ Print result / exit
```

### Daemon lifecycle

```
Daemon starts
  │
  ├─ Ensure ~/.greentap/ is mode 0700
  ├─ Launch Chrome: launchPersistentContext(browser-data, {
  │     args: ['--remote-debugging-port=19222']
  │   })
  ├─ Write 19222 to ~/.greentap/daemon.port (atomic: .tmp + rename)
  ├─ Write PID to ~/.greentap/daemon.pid (atomic: .tmp + rename)
  ├─ Navigate to web.whatsapp.com
  ├─ Wait for chat list grid
  ├─ Start idle timer (15 min)
  │
  ├─ Idle timer reset: daemon detects CDP client connect/disconnect events
  │   (Chrome emits Target.attachedToTarget / detachedFromTarget)
  │
  └─ On idle timeout OR SIGTERM:
      ├─ Close browser context (kills Chrome)
      ├─ Remove port file, PID file, lock file
      └─ Exit
```

### Command serialization

Playwright's CDP transport handles one command at a time per page. Since each
CLI invocation connects, uses the page, and disconnects, and typical CLI usage
is sequential, we don't need an explicit queue. If two clients connect
simultaneously, Playwright's internal protocol handles ordering.

For safety: each command should verify page state (chat list visible) before
executing, which implicitly waits for any prior navigation to complete.

### File permissions

- `~/.greentap/` directory: `0700`
- `daemon.port`: `0600`, written atomically
- `daemon.pid`: `0600`, written atomically
- `daemon.lock`: exclusive lock via `flock()` (auto-releases on crash) to prevent startup races

## Risks / Trade-offs

- **CDP port exposed on localhost** → Only accessible to local processes with
  same user permissions (port bound to 127.0.0.1 by default). Combined with
  `~/.greentap/` dir at `0700`, port number is not discoverable by other users.

- **WhatsApp Web disconnects after long idle** → Daemon should detect failure
  on client connect (page in bad state). Try `page.reload()`; if session expired,
  return error suggesting `greentap login`.

- **Chrome crash / OOM** → Daemon catches browser `disconnected` event, cleans
  up files, and exits. Next CLI invocation auto-starts fresh.

- **Stale port file after crash** → Client reads port, tries `connectOverCDP`,
  gets connection refused. Cleans up stale files and starts fresh daemon (under lock).

- **RAM usage (~200-400MB)** → Acceptable for personal Mac. Auto-shutdown limits exposure.

- **Page state between commands** → Each command checks chat list grid. Try
  Escape (dismiss overlays) → `page.reload()` → `page.goto(WA_URL)` as escalation.

- **Lazy start with no session** → If `browser-data/` is empty, skip daemon
  auto-start; tell user to run `greentap login` first.
