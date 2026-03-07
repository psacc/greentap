## ADDED Requirements

### Requirement: Auto-shutdown on idle

The daemon SHALL automatically shut down after 15 minutes of no client commands.

#### Scenario: Idle timeout triggers shutdown

- **WHEN** no client connects for 15 minutes
- **THEN** the daemon SHALL close the browser context
- **AND** remove `~/.greentap/daemon.sock`
- **AND** remove `~/.greentap/daemon.pid`
- **AND** exit the process

#### Scenario: Activity resets idle timer

- **WHEN** a client sends a command
- **THEN** the idle timer SHALL reset to 15 minutes

### Requirement: Explicit stop command

#### Scenario: greentap daemon stop

- **WHEN** user runs `greentap daemon stop`
- **THEN** the CLI SHALL send a shutdown signal to the daemon via socket
- **AND** the daemon SHALL perform clean shutdown (close browser, remove PID/socket)

#### Scenario: Stop when no daemon running

- **WHEN** user runs `greentap daemon stop` and no daemon is running
- **THEN** the CLI SHALL print "No daemon running."

### Requirement: Status command

#### Scenario: greentap status with daemon running

- **WHEN** user runs `greentap status` and daemon is running
- **THEN** the CLI SHALL print daemon PID, uptime, and idle time

#### Scenario: greentap status with no daemon

- **WHEN** user runs `greentap status` and no daemon is running
- **THEN** the CLI SHALL print "No daemon running."

### Requirement: Crash recovery

#### Scenario: Stale PID file from crashed daemon

- **WHEN** a CLI command finds `daemon.pid` but the process is not alive
- **THEN** it SHALL remove the stale PID and socket files
- **AND** start a fresh daemon

#### Scenario: Browser disconnect during operation

- **WHEN** Chrome crashes or disconnects while daemon is running
- **THEN** the daemon SHALL clean up PID and socket files
- **AND** exit with a non-zero code

### Requirement: Page state reset between commands

The daemon SHALL ensure the page is in a usable state before executing each command.

#### Scenario: Navigate back to chat list if needed

- **WHEN** a command is received and the chat list grid is not visible
- **THEN** the daemon SHALL navigate to `web.whatsapp.com` and wait for the chat list
- **AND** then execute the command
