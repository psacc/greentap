## MODIFIED Requirements

### Requirement: Browser connection strategy

The `withBrowser` helper SHALL connect to an existing daemon when available,
falling back to direct browser launch for `login` command only.

#### Scenario: Command uses daemon when available

- **WHEN** any command except `login` executes
- **THEN** it SHALL attempt to connect to the daemon via Unix socket
- **AND** if daemon is not running, auto-start it
- **AND** execute the command via daemon IPC

#### Scenario: Login command bypasses daemon

- **WHEN** user runs `greentap login`
- **THEN** it SHALL launch a headed browser directly (not through daemon)
- **AND** the daemon SHALL NOT be started or used

#### Scenario: Logout stops daemon

- **WHEN** user runs `greentap logout`
- **THEN** it SHALL stop the daemon if running
- **AND** then clear `~/.greentap/browser-data/`

#### Scenario: No session exists

- **WHEN** any command executes and `~/.greentap/browser-data/` is empty or missing
- **THEN** it SHALL NOT auto-start the daemon
- **AND** print "No session. Run `greentap login` first."
