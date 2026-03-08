## ADDED Requirements

### Requirement: Full page aria snapshot
The CLI SHALL provide `greentap snapshot` (or `greentap snapshot full`) to dump the complete aria snapshot of the WhatsApp Web page to stdout.

#### Scenario: Full snapshot
- **WHEN** user runs `greentap snapshot full` with an active session
- **THEN** the full aria snapshot text is printed to stdout

### Requirement: Scoped aria snapshots
The CLI SHALL support scoped snapshots: `greentap snapshot chats`, `greentap snapshot messages`, `greentap snapshot compose`.

#### Scenario: Chat list scope
- **WHEN** user runs `greentap snapshot chats`
- **THEN** only the aria snapshot of the chat list panel is printed

#### Scenario: Messages scope
- **WHEN** user runs `greentap snapshot messages`
- **THEN** only the aria snapshot of the message panel is printed

#### Scenario: Compose scope
- **WHEN** user runs `greentap snapshot compose`
- **THEN** only the aria snapshot of the compose textbox is printed

#### Scenario: Scope not found fallback
- **WHEN** user runs a scoped snapshot but the target element is not found (e.g., no chat open)
- **THEN** a "not found" message is printed followed by the full snapshot as fallback

### Requirement: Snapshot with chat context
The CLI SHALL support `greentap snapshot [SCOPE] --chat NAME` to open a specific chat before capturing the snapshot. This is a development/fixture-capture tool.

#### Scenario: Snapshot with chat open
- **WHEN** user runs `greentap snapshot full --chat "Alice"`
- **THEN** the CLI clicks into the chat matching "Alice" in the chat list, waits for messages to load, then prints the full aria snapshot

#### Scenario: Chat not found
- **WHEN** user runs `greentap snapshot full --chat "NonExistent"` and no chat matches
- **THEN** the CLI prints an error message and exits with code 1
