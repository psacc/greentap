# browser-wait Specification

## Purpose
TBD - created by archiving change phase1-readonly-cli. Update Purpose after archive.
## Requirements
### Requirement: Element-based wait for chat list
The browser automation SHALL wait for the chat list grid element instead of using a fixed timeout when loading WhatsApp Web.

#### Scenario: WhatsApp loads normally
- **WHEN** the browser navigates to WhatsApp Web
- **THEN** the CLI waits for `grid "Lista delle chat"` to appear, with a maximum timeout of 15 seconds

#### Scenario: WhatsApp fails to load
- **WHEN** the chat list grid does not appear within 15 seconds
- **THEN** the CLI exits with an error message on stderr and exit code 1

### Requirement: Element-based wait for message panel
After clicking a chat, the CLI SHALL wait for the message panel to load before taking a snapshot.

#### Scenario: Chat opens successfully
- **WHEN** a chat row is clicked
- **THEN** the CLI waits for `button "Apri dettagli chat di"` to appear in the page, confirming the message panel has loaded

#### Scenario: Chat fails to open
- **WHEN** the message panel does not load within 10 seconds after clicking
- **THEN** the CLI exits with an error message on stderr and exit code 1

