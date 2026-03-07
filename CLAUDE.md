# greentap

macOS CLI driver that reads and sends messages from a popular green messaging desktop app
via the macOS Accessibility API. Zero network calls, zero reverse engineering, zero ban risk.

## How it works

- Uses `ApplicationServices` framework to walk the AX UI tree of the desktop app
- Reads chat list entries (AXButton elements inside "List of chats" group)
- Reads messages from the currently visible chat viewport (AXStaticText elements inside "Messages in chat" group)
- Sends by setting the compose text area value and simulating Enter keypress

## Build & install

```
swift build -c release
make install          # copies to ~/bin
```

## Commands

```
greentap chats [--json]         # list visible chats with last message
greentap unread [--json]        # only chats with unread messages
greentap read [CHAT] [--json]   # read messages from current or named chat
greentap send CHAT MESSAGE      # send a message to a chat
```

## Architecture

| File | Purpose |
|------|---------|
| `Sources/main.swift` | CLI argument parsing and dispatch |
| `Sources/AXHelper.swift` | Low-level Accessibility API wrappers |
| `Sources/Models.swift` | Data structs (ChatEntry, Message, ChatDetail) |
| `Sources/Parsers.swift` | Parse AX description/value strings into models |
| `Sources/Commands.swift` | Command implementations (chats, read, send) |

## Constraints

- Only reads messages **visible in the viewport** — no scrolling
- Requires Accessibility permission for the calling process (Terminal/iTerm)
- AX tree structure may change with app updates — parsers may need adjustment
- Send briefly brings the app to focus
- Chat matching is case-insensitive substring match on chat name
