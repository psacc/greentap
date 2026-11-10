# message-read (delta)

## ADDED Requirements

### Requirement: Formatted text
The parser SHALL include `strong`, `emphasis`, `deletion` and `code` nodes in
message `text` and `body`, in document order.

#### Scenario: Bold word in a message
- **WHEN** a row holds `strong: grassetto` followed by `text: Ciao`
- **THEN** the message text is "grassetto Ciao"
