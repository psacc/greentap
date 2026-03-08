## ADDED Requirements

### Requirement: chats --json returns valid JSON array of chat objects
The `chats` command with `--json` flag SHALL output a valid JSON array where each element has: `name` (string), `time` (string), `lastMessage` (string), `unread` (boolean), `unreadCount` (number).

#### Scenario: chats --json output shape
- **WHEN** `chats` command is called with `--json` flag
- **THEN** stdout MUST be valid JSON
- **THEN** each element MUST have fields: name, time, lastMessage, unread, unreadCount

#### Scenario: unread chats have positive unreadCount
- **WHEN** `chats` returns items with `unread: true`
- **THEN** those items MUST have `unreadCount > 0`

### Requirement: unread --json returns filtered chat array
The `unread` command with `--json` flag SHALL output a valid JSON array containing only chats with `unread: true`.

#### Scenario: unread --json contains only unread chats
- **WHEN** `unread` command is called with `--json` flag
- **THEN** every element in the array MUST have `unread: true`

### Requirement: read --json returns valid JSON array of message objects
The `read` command with `--json` flag SHALL output a valid JSON array where each element has: `sender` (string), `text` (string), `time` (string).

#### Scenario: read --json output shape
- **WHEN** `read` command is called with a chat name and `--json` flag
- **THEN** stdout MUST be valid JSON
- **THEN** each element MUST have fields: sender, text, time

### Requirement: search --json returns valid JSON array of result objects
The `search` command with `--json` flag SHALL output a valid JSON array where each element has: `name` (string). Optional fields: `lastMessage`, `unread`, `unreadCount`.

#### Scenario: search --json output shape
- **WHEN** `search` command is called with a query and `--json` flag
- **THEN** stdout MUST be valid JSON
- **THEN** each element MUST have field: name
