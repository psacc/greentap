## MODIFIED Requirements

### Requirement: Locale detection at runtime
The daemon SHALL detect locale-dependent patterns from the browser's `Intl` APIs at startup rather than hardcoding any language.

#### Scenario: Day names detected
- **WHEN** the daemon starts or a client connects
- **THEN** it SHALL evaluate `Intl.DateTimeFormat` with `navigator.language` to get localized day names

#### Scenario: Relative dates detected
- **WHEN** the daemon starts or a client connects
- **THEN** it SHALL evaluate `Intl.RelativeTimeFormat` to detect "Yesterday" and "Today" equivalents

#### Scenario: Date format detected
- **WHEN** the daemon starts or a client connects
- **THEN** it SHALL evaluate `Intl.DateTimeFormat.formatToParts()` to build a locale-appropriate date regex
