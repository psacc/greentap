# message-read Specification

## Purpose
TBD - created by archiving change phase1-readonly-cli. Update Purpose after archive.
## Requirements
### Requirement: Read messages from a chat
The CLI SHALL provide a `greentap read <chat>` command that opens a chat by name and displays its messages with sender, text, and time.

#### Scenario: Read messages in human-readable format
- **WHEN** user runs `greentap read "Alice"`
- **THEN** the CLI opens the chat matching "Alice", and stdout displays messages as `[HH:MM] Sender: text`

#### Scenario: Read messages in JSON format
- **WHEN** user runs `greentap read "Alice" --json`
- **THEN** stdout contains a JSON array of message objects with `sender`, `text`, and `time` fields

#### Scenario: Chat not found
- **WHEN** user runs `greentap read "NonExistent"`
- **THEN** stderr displays `Chat "NonExistent" not found in chat list` and exit code is 1

#### Scenario: No messages found
- **WHEN** user runs `greentap read "Alice"` and the message area is empty
- **THEN** stdout displays "No messages found."

### Requirement: Own-message attribution
The parser SHALL correctly attribute own messages in 1:1 chats, including messages that lack the `Tu:` prefix.

#### Scenario: Own message with Tu prefix
- **WHEN** a message row label starts with `Tu:`
- **THEN** the message sender SHALL be `"Tu"`

#### Scenario: Own message without Tu prefix in 1:1 chat
- **WHEN** a message row does not start with `Tu:` and the sender does not match the chat partner name (from `button "Apri dettagli chat di X"`)
- **THEN** the message sender SHALL be `"Tu"`

#### Scenario: Other person's message in 1:1 chat
- **WHEN** a message row's content starts with the chat partner name
- **THEN** the message sender SHALL be the chat partner name

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

