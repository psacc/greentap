## ADDED Requirements

### Requirement: List all chats
The CLI SHALL provide a `greentap chats` command that lists all chats from the WhatsApp Web chat list with name, time, last message preview, and unread status.

#### Scenario: List chats in human-readable format
- **WHEN** user runs `greentap chats`
- **THEN** stdout displays each chat with unread marker (`*`/` `), name, time, unread count, and last message preview

#### Scenario: List chats in JSON format
- **WHEN** user runs `greentap chats --json`
- **THEN** stdout contains a JSON array of chat objects with `name`, `time`, `lastMessage`, `unread`, and `unreadCount` fields

#### Scenario: No chats found
- **WHEN** user runs `greentap chats` and the chat list is empty
- **THEN** stdout displays "No chats found."

### Requirement: Filter unread chats
The CLI SHALL provide a `greentap unread` command that lists only chats with unread messages.

#### Scenario: Show unread chats
- **WHEN** user runs `greentap unread`
- **THEN** stdout displays only chats where `unread` is true, in human-readable format

#### Scenario: Show unread chats in JSON
- **WHEN** user runs `greentap unread --json`
- **THEN** stdout contains a JSON array of only unread chat objects

#### Scenario: No unread chats
- **WHEN** user runs `greentap unread` and no chats have unread messages
- **THEN** stdout displays "No chats found."
