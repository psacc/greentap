# search-chats Specification

## Purpose
TBD - created by archiving change phase2-actions. Update Purpose after archive.
## Requirements
### Requirement: Search chats
The CLI SHALL provide a `greentap search <query> [--json]` command that searches WhatsApp chats and displays results.

#### Scenario: Search with results
- **WHEN** user runs `greentap search "Marco"`
- **THEN** stdout displays matching chats in human-readable format

#### Scenario: Search with JSON output
- **WHEN** user runs `greentap search "Marco" --json`
- **THEN** stdout contains a JSON array of matching chat objects

#### Scenario: No results
- **WHEN** user runs `greentap search "xyznonexistent"`
- **THEN** stdout displays "No results found."

#### Scenario: Search cleans up
- **WHEN** search completes (with or without results)
- **THEN** the search bar is cleared (Escape pressed) before the browser closes

