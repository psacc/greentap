## MODIFIED Requirements

### Requirement: Parse chat entries from aria snapshot
The parser SHALL use locale-agnostic structural selectors to extract chat entries.

#### Scenario: Chat list grid found
- **WHEN** the aria snapshot contains a grid element
- **THEN** the parser SHALL use the first grid (by position) rather than matching a locale-specific name

#### Scenario: Unread count extraction
- **WHEN** a chat row contains a gridcell with a numeric value
- **THEN** the parser SHALL extract the number from the gridcell value attribute, not from locale-specific text

#### Scenario: Time patterns use auto-detected locale
- **WHEN** a chat's time field contains a day name or relative date
- **THEN** the parser SHALL match against runtime-detected day names and relative dates from `Intl` APIs
