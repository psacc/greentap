# greentap

macOS CLI that drives a popular green messaging desktop app via the Accessibility API.

No reverse engineering, no unofficial protocols, no ban risk. Just reads and writes
to the native macOS app's UI tree.

## Install

```sh
git clone git@github.com:psacc/greentap.git
cd greentap
make install   # builds with SwiftPM, copies to ~/bin
```

Requires: macOS 13+, Xcode CLI tools, Accessibility permission for your terminal.

## Usage

```sh
greentap chats              # list visible chats
greentap unread             # only unread chats
greentap read "Family"       # open & read a chat (substring match)
greentap send "Family" "Hi"  # send a message

# JSON output for machine consumption
greentap unread --json
greentap read "Family" --json
```

## How it works

Walks the AX (Accessibility) UI tree of the desktop app via `ApplicationServices` framework.
Chat list entries, message text, sender, timestamps, and unread counts are all exposed
as AX element attributes. Sending works by setting the compose area value and simulating Enter.

## Limitations

- Reads only messages **visible in the viewport** (no scroll)
- AX tree structure may change with app updates
- Send briefly brings the app to foreground
- Chat lookup is case-insensitive substring match

## License

Private. Not affiliated with or endorsed by any messaging platform.
