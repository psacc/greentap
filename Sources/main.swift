import Foundation

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "help"
let flags = Set(args.dropFirst(2))
let asJSON = flags.contains("--json")

func printUsage() {
    let usage = """
    greentap — macOS CLI driver for a green messaging app

    USAGE:
      greentap chats [--json]           List visible chats with last message
      greentap unread [--json]          List chats with unread messages only
      greentap read [CHAT] [--json]     Read messages from current or named chat
      greentap send CHAT MESSAGE        Send a message to a chat
      greentap help                     Show this help

    FLAGS:
      --json    Output as JSON (for machine consumption)

    NOTES:
      Requires Accessibility permission (System Settings > Privacy & Security > Accessibility).
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
        let chatName = args.count > 2 && !args[2].hasPrefix("-") ? args[2] : nil
        try Commands.read(chatName: chatName, asJSON: asJSON)
    case "send":
        guard args.count >= 4 else {
            fputs("Usage: greentap send CHAT MESSAGE\n", stderr)
            exit(1)
        }
        let chatName = args[2]
        let message = args[3...].joined(separator: " ")
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
