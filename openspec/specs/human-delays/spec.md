# human-delays Specification

## Purpose
TBD - created by archiving change phase2-actions. Update Purpose after archive.
## Requirements
### Requirement: Human-like delays between actions
The CLI SHALL add random delays between browser interactions to reduce automation fingerprint.

#### Scenario: Delay before chat navigation
- **WHEN** the CLI clicks a chat row
- **THEN** a random delay of 200-500ms is applied before the click

#### Scenario: Delay before typing
- **WHEN** the CLI types into a textbox (compose or search)
- **THEN** a random delay of 300-600ms is applied before typing

#### Scenario: Delay after sending
- **WHEN** the CLI clicks the Send button
- **THEN** a random delay of 500-1000ms is applied after the click before verification

