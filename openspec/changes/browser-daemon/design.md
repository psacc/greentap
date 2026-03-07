## Context

Currently every greentap command calls `withBrowser()` which runs
`chromium.launchPersistentContext()` → work → `context.close()`. This takes 3-5s per
invocation, mostly Chrome startup + WhatsApp Web load.

Playwright's `launchPersistentContext()` returns a `BrowserContext` (not `Browser`),
so `chromium.launchServer()` + `connectOverCDP()` won't work directly — the daemon
must hold the context itself and expose commands over IPC.

## Goals / Non-Goals

**Goals:**
- Per-command latency < 500ms when daemon is running
- Zero-config: first command auto-starts daemon, idle timeout auto-stops it
- Explicit `daemon stop` and `status` commands
- Clean shutdown: PID file, socket cleanup, no orphan Chrome processes

**Non-Goals:**
- Multi-user / multi-session support
- Remote access (daemon is localhost only)
- Keeping WhatsApp Web page navigated to a specific chat between commands

## Decisions

### IPC: Unix domain socket with JSON-RPC

**Why:** Simple, fast, no extra dependencies. Node `net` module handles it natively.
Named pipes are cross-platform but we only need macOS. HTTP would work but adds
overhead and complexity.

**Alternative considered:** WebSocket via `launchServer()` — can't use because
`launchPersistentContext` doesn't support server mode.

### Daemon: forked Node process

**Why:** `child_process.fork()` with `detached: true` + `unref()`. The daemon is a
standalone Node script (`lib/daemon.js`) that holds the browser context and listens
on the socket. CLI commands send JSON-RPC messages and receive results.

**Alternative considered:** Background shell process (`&`) — harder to manage lifecycle,
no clean IPC.

### Idle timeout: 15 minutes

**Why:** Covers typical interactive sessions (check → read → send: 2-5 min) with margin.
Long enough to not restart mid-workflow, short enough to not waste RAM overnight.
Timer resets on each command.

**Alternative considered:** Configurable via env var — YAGNI for personal use.
Can add later if needed.

### Connection flow

```
CLI command (e.g. greentap chats)
  │
  ├─ Try connect to ~/.greentap/daemon.sock
  │   ├─ Success → send command → receive result
  │   └─ Fail (ECONNREFUSED / ENOENT)
  │       ├─ Fork daemon process
  │       ├─ Wait for socket to appear (poll, max 10s)
  │       └─ Connect → send command → receive result
  │
  └─ Print result / exit
```

### Daemon lifecycle

```
Daemon starts
  │
  ├─ Write PID to ~/.greentap/daemon.pid
  ├─ Launch Chrome with launchPersistentContext()
  ├─ Navigate to web.whatsapp.com
  ├─ Wait for chat list grid
  ├─ Create Unix socket server at ~/.greentap/daemon.sock
  ├─ Start idle timer (15 min)
  │
  ├─ On client connection:
  │   ├─ Reset idle timer
  │   ├─ Execute command on the existing page
  │   └─ Return JSON result
  │
  └─ On idle timeout OR SIGTERM:
      ├─ Close browser context
      ├─ Remove PID file
      ├─ Remove socket file
      └─ Exit
```

### Command protocol (JSON-RPC over socket)

Request: `{ "method": "chats", "params": { "json": true } }`
Response: `{ "result": [...] }` or `{ "error": "message" }`

Each command maps to the existing `cmd*` functions, but operating on the
daemon's persistent page instead of launching a new browser.

## Risks / Trade-offs

- **WhatsApp Web disconnects after long idle** → Daemon should detect "use your phone"
  overlay and re-navigate. If session expired, report error and suggest `greentap login`.

- **Chrome crash / OOM** → Daemon should catch browser disconnect event, clean up
  PID/socket, and exit. Next CLI invocation will auto-start a fresh daemon.

- **Stale PID file after crash** → On startup, check if PID is alive before connecting.
  If PID file exists but process is dead, clean up and start fresh.

- **RAM usage (~200-400MB)** → Acceptable for personal Mac use. Auto-shutdown at 15min
  limits exposure.

- **Page state between commands** → Each command should ensure the page is in a known
  state (main chat list view) before executing. Navigate to WA_URL if needed, or at
  minimum wait for chat list grid.
