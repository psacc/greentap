## ADDED Requirements

### Requirement: Read with scroll flag
The `read` command SHALL accept a `--scroll` flag that scrolls up through the entire chat history, collecting all messages. The flag MAY appear in any position after the command name. Without `--scroll`, behavior is unchanged (viewport only).

#### Scenario: Read with scroll
- **WHEN** user runs `greentap read "Alice" --scroll`
- **THEN** the CLI SHALL scroll up through the entire chat history
- **THEN** stdout displays all collected messages in chronological order as `[HH:MM] Sender: text`

#### Scenario: Read with scroll and JSON
- **WHEN** user runs `greentap read "Alice" --scroll --json`
- **THEN** stdout contains a JSON array of all collected messages with `sender`, `text`, and `time` fields

#### Scenario: Scroll flag position is flexible
- **WHEN** user runs `greentap read --scroll "Alice"`
- **THEN** the CLI SHALL treat "Alice" as the chat name and enable scroll mode
