## ADDED Requirements

### Requirement: read requires chat name argument
The `read` command SHALL exit with code 1 and print usage to stderr when called without a chat name.

#### Scenario: read without arguments
- **WHEN** `node greentap.js read` is called without a chat name
- **THEN** process exits with code 1
- **THEN** stderr contains "Usage: greentap read"

### Requirement: send requires chat and message arguments
The `send` command SHALL exit with code 1 and print usage to stderr when called with fewer than 2 arguments.

#### Scenario: send without arguments
- **WHEN** `node greentap.js send` is called without arguments
- **THEN** process exits with code 1
- **THEN** stderr contains "Usage: greentap send"

#### Scenario: send with only chat name
- **WHEN** `node greentap.js send "ChatName"` is called without a message
- **THEN** process exits with code 1
- **THEN** stderr contains "Usage: greentap send"

### Requirement: send joins multiple message arguments
The `send` command SHALL join all arguments after the chat name with spaces.

#### Scenario: send with multi-word message
- **WHEN** `node greentap.js send "Chat" "hello" "world"` is called
- **THEN** the message sent MUST be "hello world"

### Requirement: search requires query argument
The `search` command SHALL exit with code 1 and print usage to stderr when called without a query.

#### Scenario: search without arguments
- **WHEN** `node greentap.js search` is called without a query
- **THEN** process exits with code 1
- **THEN** stderr contains "Usage: greentap search"

### Requirement: unknown command shows usage help
When an unknown command is given, the CLI SHALL print available commands to stdout.

#### Scenario: unknown command
- **WHEN** `node greentap.js foobar` is called
- **THEN** stdout contains "Usage: greentap"
- **THEN** stdout lists available commands
- **THEN** process exits with code 0 (not an error — just help text)
