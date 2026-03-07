## ADDED Requirements

### Requirement: Persistent browser via daemon process

The system SHALL maintain a background Node process that holds a Playwright
persistent browser context with WhatsApp Web loaded, accessible via Unix socket
at `~/.greentap/daemon.sock`.

#### Scenario: Daemon starts and accepts connections

- **WHEN** the daemon process starts
- **THEN** it SHALL launch Chrome with `launchPersistentContext`
- **AND** navigate to `web.whatsapp.com`
- **AND** wait for the chat list grid to appear
- **AND** create a Unix socket server at `~/.greentap/daemon.sock`
- **AND** write its PID to `~/.greentap/daemon.pid`

#### Scenario: CLI command connects to running daemon

- **WHEN** a CLI command executes and `~/.greentap/daemon.sock` exists and is connectable
- **THEN** the command SHALL send a JSON-RPC request over the socket
- **AND** receive the result without launching a new browser

#### Scenario: Lazy start when no daemon running

- **WHEN** a CLI command executes and no daemon is running (socket doesn't exist or connection refused)
- **THEN** the CLI SHALL fork a new daemon process (detached)
- **AND** wait for the socket to become connectable (max 15s)
- **AND** then send the command

### Requirement: JSON-RPC command protocol

The daemon SHALL accept JSON-RPC messages over the Unix socket.

#### Scenario: Command request and response

- **WHEN** a client sends `{ "method": "<command>", "params": { ... } }`
- **THEN** the daemon SHALL execute the command on its persistent page
- **AND** return `{ "result": <data> }` on success
- **OR** return `{ "error": "<message>" }` on failure

#### Scenario: Supported methods

- **WHEN** the method is one of: `chats`, `unread`, `read`, `send`, `search`, `snapshot`
- **THEN** the daemon SHALL execute the corresponding command logic
