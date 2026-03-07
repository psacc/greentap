## ADDED Requirements

### Requirement: Parse messages from aria snapshot
The parser SHALL extract message entries from an aria snapshot, returning an array of objects with: `sender`, `text`, and `time`.

#### Scenario: Parse messages from an open chat
- **WHEN** `parseMessages()` is called with a fixture containing messages
- **THEN** it returns an array where each entry has `sender`, `text`, and `time`

#### Scenario: Empty message panel
- **WHEN** `parseMessages()` is called with an empty string
- **THEN** it returns an empty array

#### Scenario: Aria snapshot without message entries
- **WHEN** `parseMessages()` is called with aria text that contains no message elements
- **THEN** it returns an empty array

### Requirement: Print messages
The parser SHALL provide a `printMessages()` function that formats messages for terminal output.

#### Scenario: Print messages
- **WHEN** `printMessages()` is called with message entries
- **THEN** each line shows `[time] sender: text`

#### Scenario: Print empty messages
- **WHEN** `printMessages()` is called with an empty array
- **THEN** it prints "No messages found."
