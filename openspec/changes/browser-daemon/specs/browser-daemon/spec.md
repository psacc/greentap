## ADDED Requirements

### Requirement: Persistent browser via daemon process

The system SHALL maintain a background Node process that holds a Playwright
persistent browser context with Chrome DevTools Protocol exposed on localhost.

#### Scenario: Daemon starts and exposes CDP

- **WHEN** the daemon process starts
- **THEN** it SHALL launch Chrome with `launchPersistentContext` and `--remote-debugging-port=0`
- **AND** ensure `~/.greentap/` directory is mode `0700`
- **AND** write the allocated port to `~/.greentap/daemon.port` atomically (mode `0600`)
- **AND** write its PID to `~/.greentap/daemon.pid` atomically (mode `0600`)
- **AND** navigate to `web.whatsapp.com`
- **AND** wait for the chat list grid to appear

#### Scenario: CLI command connects via CDP

- **WHEN** a CLI command executes and `~/.greentap/daemon.port` exists
- **THEN** the command SHALL read the port and call `chromium.connectOverCDP`
- **AND** get the persistent context and page via Playwright's native API
- **AND** execute the command directly on the page
- **AND** disconnect (without closing Chrome)

#### Scenario: Lazy start when no daemon running

- **WHEN** a CLI command executes and no daemon is running (port file missing or connection refused)
- **THEN** the CLI SHALL acquire an exclusive lock on `~/.greentap/daemon.lock`
- **AND** fork a new daemon process (detached, `stdio: 'ignore'`)
- **AND** wait for `daemon.port` file to appear (max 15s)
- **AND** release the lock
- **AND** connect via CDP and execute the command

#### Scenario: Stale port file

- **WHEN** a CLI command reads `daemon.port` but `connectOverCDP` fails
- **THEN** it SHALL remove the stale port and PID files
- **AND** start a fresh daemon (under lock)
