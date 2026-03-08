## MODIFIED Requirements

### Requirement: Read messages from a chat
The CLI SHALL use locale-agnostic selectors to find the message area and parse messages.

#### Scenario: Message area detection
- **WHEN** the aria snapshot contains row elements
- **THEN** the parser SHALL identify message rows as rows NOT inside a grid element (structural boundary)

#### Scenario: Sender detection from button
- **WHEN** a button between message rows contains an img child
- **THEN** the parser SHALL extract the sender name from the button label using an auto-detected or learned prefix

#### Scenario: Own message detection
- **WHEN** a message row contains `img "msg-dblcheck"` or `img "msg-check"`
- **THEN** the message sender SHALL be `"You"` (universal constant)

#### Scenario: Own message delivery status
- **WHEN** a message row contains a delivery status icon (`msg-dblcheck` or `msg-check`)
- **THEN** the parser SHALL use the icon presence for own-message detection, not locale-specific status text
