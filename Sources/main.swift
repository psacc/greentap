import Foundation

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "help"
let positionalArgs = args.dropFirst(2).filter { !$0.hasPrefix("-") }
let flags = Set(args.dropFirst(2).filter { $0.hasPrefix("-") })
let asJSON = flags.contains("--json")

func printUsage() {
    let usage = """
    greentap — macOS CLI driver for a green messaging app

    USAGE:
      greentap chats [--json]           List visible chats with last message
      greentap unread [--json]          List chats with unread messages only
      greentap read [CHAT] [--json]     Read messages from current or named chat
      greentap search QUERY [--json]    Search for chats by name
      greentap send CHAT MESSAGE        Send a message to a chat
      greentap help                     Show this help

    FLAGS:
      --json    Output as JSON (for machine consumption)

    NOTES:
      Requires Accessibility permission (System Settings > Privacy & Security > Accessibility).
      read: tries visible chats first, then falls back to app search.
      Only reads messages visible in the app viewport — does not scroll.
      Send requires the app to be running; it briefly takes focus.
    """
    print(usage)
}

do {
    switch command {
    case "chats":
        try Commands.chats(unreadOnly: false, asJSON: asJSON)
    case "unread":
        try Commands.chats(unreadOnly: true, asJSON: asJSON)
    case "read":
        let chatName = positionalArgs.first
        if let chatName = chatName {
            // Try visible chats first, fall back to search
            do {
                try Commands.read(chatName: chatName, asJSON: asJSON)
            } catch AXError.chatNotFound {
                try Commands.readBySearch(query: chatName, asJSON: asJSON)
            }
        } else {
            try Commands.read(chatName: nil, asJSON: asJSON)
        }
    case "search":
        guard let query = positionalArgs.first else {
            fputs("Usage: greentap search QUERY [--json]\n", stderr)
            exit(1)
        }
        try Commands.search(query: query, andOpen: false, asJSON: asJSON)
    case "send":
        guard positionalArgs.count >= 2 else {
            fputs("Usage: greentap send CHAT MESSAGE\n", stderr)
            exit(1)
        }
        let chatName = positionalArgs[positionalArgs.startIndex]
        let message = positionalArgs.dropFirst().joined(separator: " ")
        try Commands.send(chatName: chatName, message: message)
    case "help", "--help", "-h":
        printUsage()
    default:
        fputs("Unknown command: \(command)\n", stderr)
        printUsage()
        exit(1)
    }
} catch {
    fputs("ERROR: \(error)\n", stderr)
    exit(1)
}
