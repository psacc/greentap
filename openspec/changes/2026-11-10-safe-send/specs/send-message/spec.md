# send-message (delta)

## MODIFIED Requirements

### Requirement: Chat verification before send
Before typing, the CLI SHALL verify exactly one open chat whose structural
title equals the target name, falling back to the header button label when no
structural title exists.

#### Scenario: Wrong or ambiguous chat
- **WHEN** the structural title differs from the target, or several titles exist
- **THEN** the CLI exits 1 with "Wrong chat opened" and types and clicks nothing

### Requirement: Existing draft
The CLI SHALL NOT append to or delete an existing compose draft.

#### Scenario: Different draft
- **WHEN** the compose box holds other text or an emoji image
- **THEN** the CLI exits 1 with "Not sent" and types and clicks nothing

#### Scenario: Identical leftover draft
- **WHEN** the compose box holds exactly the message text
- **THEN** the CLI sends it once without typing it again

### Requirement: Send control
The CLI SHALL click exactly one Send control identified by its icon, in the
current (`<title>ic-send-filled</title>`) and legacy (`data-icon`) markup.

#### Scenario: Zero or several Send controls
- **WHEN** zero or more than one control matches
- **THEN** the CLI exits 1 with "Not sent", clicks nothing and leaves the draft

### Requirement: Post-send verification
After the click, the CLI SHALL wait up to 10 seconds for one more own message
row containing the sent text than before the click.

#### Scenario: Verified
- **WHEN** the new own row appears
- **THEN** the CLI prints "Sent to <chat>."

#### Scenario: Still a draft
- **WHEN** no new row appears and the compose box still holds text
- **THEN** the CLI exits 1 with "Not sent"; a retry sends the draft once

#### Scenario: Unknown outcome
- **WHEN** no new row appears and the compose box is empty
- **THEN** the CLI exits 1 with "Unverified" and tells the user to check the
  chat before sending again
