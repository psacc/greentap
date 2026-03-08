## ADDED Requirements

### Requirement: Parse chat entries from aria snapshot
The parser SHALL extract chat entries from an aria snapshot, returning an array of objects with: `name`, `lastMessage`, `time`, `unread` (boolean), and `unreadCount` (number, 0 when read).

#### Scenario: Parse chats with mixed read/unread
- **WHEN** `parseChatList()` is called with a fixture containing both read and unread chats
- **THEN** it returns an array where each entry has `name`, `lastMessage`, `time`, and correct `unread` status

#### Scenario: Empty chat list
- **WHEN** `parseChatList()` is called with an empty string
- **THEN** it returns an empty array

#### Scenario: Aria snapshot without chat entries
- **WHEN** `parseChatList()` is called with aria text that contains no chat list elements
- **THEN** it returns an empty array

### Requirement: Print chat list
The parser SHALL provide a `printChats()` function that formats chat entries for terminal output, marking unread chats with an asterisk.

#### Scenario: Print unread chats
- **WHEN** `printChats()` is called with an unread chat entry
- **THEN** the output line starts with `*`

#### Scenario: Print empty chat list
- **WHEN** `printChats()` is called with an empty array
- **THEN** it prints "No chats found."
