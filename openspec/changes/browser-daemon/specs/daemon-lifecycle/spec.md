## ADDED Requirements

### Requirement: Auto-shutdown on idle

The daemon SHALL automatically shut down after 15 minutes of no client connections.

#### Scenario: Idle timeout triggers shutdown

- **WHEN** no client connects for 15 minutes
- **THEN** the daemon SHALL close the browser context
- **AND** remove `~/.greentap/daemon.port`, `daemon.pid`, `daemon.lock`
- **AND** exit the process

#### Scenario: Activity resets idle timer

- **WHEN** a client connects via CDP
- **THEN** the idle timer SHALL reset to 15 minutes

### Requirement: Explicit stop command

#### Scenario: greentap daemon stop

- **WHEN** user runs `greentap daemon stop`
- **THEN** the CLI SHALL send SIGTERM to the daemon PID
- **AND** the daemon SHALL perform clean shutdown (close browser, remove files)

#### Scenario: Stop when no daemon running

- **WHEN** user runs `greentap daemon stop` and no daemon is running
- **THEN** the CLI SHALL print "No daemon running."

### Requirement: Status command

#### Scenario: greentap status with daemon running

- **WHEN** user runs `greentap status` and daemon is running
- **THEN** the CLI SHALL print daemon PID and CDP port

#### Scenario: greentap status with no daemon

- **WHEN** user runs `greentap status` and no daemon is running
- **THEN** the CLI SHALL print "No daemon running."

### Requirement: Crash recovery

#### Scenario: Browser disconnect during operation

- **WHEN** Chrome crashes or disconnects while daemon is running
- **THEN** the daemon SHALL clean up port, PID, and lock files
- **AND** exit with a non-zero code

### Requirement: WhatsApp Web session recovery

#### Scenario: WA disconnects or shows overlay

- **WHEN** a client connects and the page is in a bad state (no chat list grid)
- **THEN** the client SHALL try pressing Escape (dismiss overlays)
- **AND** if still not visible, try `page.reload()`
- **AND** only as last resort, `page.goto(WA_URL)`
- **AND** if recovery fails, throw error suggesting `greentap login`
