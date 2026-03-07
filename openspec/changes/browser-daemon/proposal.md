## Why

Every greentap command pays a 3-5s startup tax to launch Chrome and load WhatsApp Web.
For interactive use (check unread → read chat → send reply) this means 10-15s of waiting
across 3 commands. A persistent browser process would reduce per-command latency to ~200ms.

## What Changes

- New daemon process that keeps Chrome + WhatsApp Web alive between commands
- CLI commands connect to the running daemon instead of launching a new browser
- Lazy start: first command auto-launches the daemon if not running
- Auto-shutdown after idle timeout to reclaim resources
- `greentap status` command to check daemon state
- `greentap daemon stop` to explicitly kill the daemon

## Capabilities

### New Capabilities
- `browser-daemon`: Persistent browser process with Unix socket IPC, lazy start, and idle auto-shutdown
- `daemon-lifecycle`: Start, stop, status commands and auto-shutdown behavior

### Modified Capabilities
- `browser-wait`: Commands connect to existing daemon instead of launching new browser

## Impact

- `greentap.js`: `withBrowser()` changes from launch/close to connect/disconnect
- New file: `lib/daemon.js` — daemon process, socket server, idle timer
- PID and socket files at `~/.greentap/daemon.pid`, `~/.greentap/daemon.sock`
- Chrome process stays resident (~200-400MB RAM when idle)
- Playwright `launchPersistentContext` must be held by daemon (not per-command)
