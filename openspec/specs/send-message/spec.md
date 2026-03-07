# send-message Specification

## Purpose
TBD - created by archiving change phase2-actions. Update Purpose after archive.
## Requirements
### Requirement: Send a text message
The CLI SHALL provide a `greentap send <chat> <message>` command that navigates to a chat and sends a text message.

#### Scenario: Successful send
- **WHEN** user runs `greentap send "Family Group" "Hello world"`
- **THEN** the CLI navigates to the chat, types the message, clicks Send, verifies delivery, and prints "Sent to Family Group."

#### Scenario: Chat not found
- **WHEN** user runs `greentap send "NonExistent" "Hello"`
- **THEN** stderr displays an error message and exit code is 1

#### Scenario: Send verification failure
- **WHEN** the compose box is not empty after clicking Send
- **THEN** stderr displays a warning that the message may not have been sent

### Requirement: Post-send verification
After sending, the CLI SHALL verify the message was delivered by checking that the compose box is empty and the message text appears in the chat.

#### Scenario: Compose box cleared
- **WHEN** Send button is clicked
- **THEN** the CLI waits up to 5 seconds for the compose textbox to be empty

#### Scenario: Message appears in chat
- **WHEN** send is verified
- **THEN** the CLI takes an aria snapshot and confirms the sent message text appears in the last own-message row

### Requirement: Chat verification before send
Before typing a message, the CLI SHALL verify the correct chat is open by checking the message panel header.

#### Scenario: Correct chat open
- **WHEN** a chat row is clicked and the message panel loads
- **THEN** the CLI verifies the `button "Apri dettagli chat di X"` contains the target chat name before proceeding

#### Scenario: Wrong chat opened
- **WHEN** the message panel header does not match the target chat name
- **THEN** the CLI exits with an error and does NOT send the message

