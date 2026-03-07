import ApplicationServices
import Foundation

struct Parsers {
    /// Parse a chat list button's description + value into a ChatEntry.
    /// desc example: "Sampigandia, 53 unread messages"
    /// value example: "Message from Perrone Gianmatteo, Ragazzi rendete..., 12:30, Received in Sampigandia, Muted"
    static func parseChatEntry(desc: String, value: String) -> ChatEntry? {
        let cleanDesc = desc.replacingOccurrences(of: "\u{200E}", with: "").trimmingCharacters(in: .whitespaces)
        let cleanValue = value.replacingOccurrences(of: "\u{200E}", with: "").trimmingCharacters(in: .whitespaces)

        // Extract chat name (everything before ", N unread" or the whole desc)
        let name: String
        let unread: Int
        if let range = cleanDesc.range(of: #",\s*\d+ unread"#, options: .regularExpression) {
            name = String(cleanDesc[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
            let unreadStr = cleanDesc[range.lowerBound...]
            let digits = unreadStr.filter { $0.isNumber }
            unread = Int(digits) ?? 0
        } else {
            name = cleanDesc
            unread = 0
        }

        // Parse value: "Message from SENDER, TEXT, TIMESTAMP, Received in ..., Muted"
        var sender = ""
        var lastMessage = ""
        var timestamp = ""
        let muted = cleanValue.contains("Muted")
        let mentioned = cleanValue.contains("Mentioned")

        if cleanValue.hasPrefix("Message from ") {
            let rest = String(cleanValue.dropFirst("Message from ".count))
            // First comma separates sender from message
            let parts = rest.components(separatedBy: ", ")
            if parts.count >= 3 {
                sender = parts[0]
                // Find "Received in" to know where metadata starts
                if let recIdx = parts.firstIndex(where: { $0.hasPrefix("Received in") }) {
                    // timestamp is the part just before "Received in"
                    timestamp = parts[recIdx - 1]
                    lastMessage = parts[1..<(recIdx - 1)].joined(separator: ", ")
                } else {
                    // Fallback: second-to-last is timestamp
                    timestamp = parts[parts.count - 1]
                    lastMessage = parts[1..<(parts.count - 1)].joined(separator: ", ")
                }
            }
        } else if cleanValue.hasPrefix("Photo from ") || cleanValue.hasPrefix("Video from ") || cleanValue.hasPrefix("Voice message from ") {
            let parts = cleanValue.components(separatedBy: ", ")
            if parts.count >= 2 {
                let firstPart = parts[0]
                if let fromRange = firstPart.range(of: " from ") {
                    let mediaType = String(firstPart[..<fromRange.lowerBound])
                    sender = String(firstPart[fromRange.upperBound...])
                    lastMessage = "[\(mediaType)]"
                }
                if let recIdx = parts.firstIndex(where: { $0.hasPrefix("Received in") }) {
                    timestamp = parts[recIdx - 1]
                } else {
                    timestamp = parts[1]
                }
            }
        } else {
            lastMessage = cleanValue
        }

        return ChatEntry(
            name: name,
            unread: unread,
            lastMessage: lastMessage.trimmingCharacters(in: .whitespaces),
            sender: sender.trimmingCharacters(in: .whitespaces),
            timestamp: timestamp.trimmingCharacters(in: .whitespaces),
            muted: muted,
            mentioned: mentioned
        )
    }

    /// Parse a message AXStaticText description into a Message.
    /// Example: "Message from Antonietta Depalma, ciao!, 4Marchat13:38, Received in Famiglia Rossi"
    /// Example: "Forwarded.\nPhoto from Antonietta Depalma, 5Marchat09:19, Received in ..."
    static func parseMessage(desc: String) -> Message? {
        let clean = desc.replacingOccurrences(of: "\u{200E}", with: "").trimmingCharacters(in: .whitespaces)

        // Skip non-message entries
        if clean.contains("Syncing paused") || clean.contains("end-to-end encrypted") { return nil }
        // Skip date headers
        let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Today", "Yesterday"]
        if dayNames.contains(clean) { return nil }

        let forwarded = clean.hasPrefix("Forwarded.")
        let text = forwarded
            ? String(clean.dropFirst("Forwarded.\n".count)).trimmingCharacters(in: .whitespaces)
            : clean

        var sender = ""
        var msgText = ""
        var timestamp = ""

        if text.contains(" from ") {
            let parts = text.components(separatedBy: ", ")
            if parts.count >= 2 {
                let firstPart = parts[0]
                if let fromRange = firstPart.range(of: " from ") {
                    let prefix = String(firstPart[..<fromRange.lowerBound]) // "Message", "Photo", etc.
                    sender = String(firstPart[fromRange.upperBound...])

                    if prefix == "Message" {
                        if let recIdx = parts.firstIndex(where: { $0.hasPrefix("Received in") }) {
                            timestamp = parts[recIdx - 1]
                            msgText = parts[1..<(recIdx - 1)].joined(separator: ", ")
                        } else if parts.count >= 3 {
                            timestamp = parts[parts.count - 1]
                            msgText = parts[1..<(parts.count - 1)].joined(separator: ", ")
                        }
                    } else {
                        // Photo, Video, Voice message, etc.
                        msgText = "[\(prefix)]"
                        if let recIdx = parts.firstIndex(where: { $0.hasPrefix("Received in") }) {
                            timestamp = parts[recIdx - 1]
                        } else {
                            timestamp = parts[1]
                        }
                    }
                }
            }
        } else {
            // System message or own message
            msgText = text
        }

        if msgText.isEmpty && sender.isEmpty { return nil }

        return Message(
            sender: sender.trimmingCharacters(in: .whitespaces),
            text: msgText.trimmingCharacters(in: .whitespaces),
            timestamp: timestamp.trimmingCharacters(in: .whitespaces),
            forwarded: forwarded
        )
    }
}
