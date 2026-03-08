## MODIFIED Requirements

### Requirement: Send a message
The send command SHALL use structural selectors for the compose textbox and send button.

#### Scenario: Compose textbox found
- **WHEN** the CLI navigates to a chat to send a message
- **THEN** it SHALL find the compose textbox inside `contentinfo` by role (single textbox in footer)

#### Scenario: Send button found
- **WHEN** the CLI is ready to send the typed message
- **THEN** it SHALL detect the send button as the button that replaced the voice message button in `contentinfo` after typing

#### Scenario: Send error detection
- **WHEN** the CLI attempts to send a message
- **THEN** it SHALL detect failure by checking if the compose textbox still contains text after the send action
