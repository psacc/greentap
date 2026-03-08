## MODIFIED Requirements

### Requirement: Search chats
The search command SHALL use structural selectors for the search box and results grid.

#### Scenario: Search box found
- **WHEN** the CLI opens the search bar
- **THEN** it SHALL find the textbox by position (first textbox not inside contentinfo)

#### Scenario: Search results parsed
- **WHEN** search results appear as a new grid after the search action
- **THEN** the parser SHALL identify the results grid by position (second grid) rather than a locale-specific name
