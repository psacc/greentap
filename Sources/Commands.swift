import ApplicationServices
import Cocoa
import Foundation

struct Commands {
    static func chats(unreadOnly: Bool, asJSON: Bool) throws {
        try AXHelper.ensurePermission()
        let app = try AXHelper.appElement()
        let win = try AXHelper.mainWindow(app)

        guard let chatList = AXHelper.findByDesc(win, "List of chats") else {
            throw AXError.noChatOpen
        }

        let children = AXHelper.getChildren(chatList)
        var entries: [ChatEntry] = []

        for child in children {
            let role = AXHelper.getAttr(child, kAXRoleAttribute as String)
            guard role == "AXButton" || role == "AXStaticText" else { continue }

            let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
            let value = AXHelper.getAttr(child, kAXValueAttribute as String)
            guard !desc.isEmpty, !value.isEmpty else { continue }

            if let entry = Parsers.parseChatEntry(desc: desc, value: value) {
                if unreadOnly && entry.unread == 0 { continue }
                entries.append(entry)
            }
        }

        if asJSON {
            let data = try JSONEncoder.pretty.encode(entries)
            print(String(data: data, encoding: .utf8)!)
        } else {
            for e in entries {
                let unreadTag = e.unread > 0 ? " [\(e.unread)]" : ""
                let mutedTag = e.muted ? " (muted)" : ""
                let mentionTag = e.mentioned ? " @" : ""
                print("\(e.name)\(unreadTag)\(mutedTag)\(mentionTag)")
                if !e.sender.isEmpty {
                    print("  \(e.sender): \(e.lastMessage)  \(e.timestamp)")
                } else {
                    print("  \(e.lastMessage)  \(e.timestamp)")
                }
            }
        }
    }

    static func read(chatName: String?, asJSON: Bool) throws {
        try AXHelper.ensurePermission()
        let app = try AXHelper.appElement()
        let win = try AXHelper.mainWindow(app)

        // If a chat name is provided, open it first
        if let chatName = chatName {
            guard let chatList = AXHelper.findByDesc(win, "List of chats") else {
                throw AXError.noChatOpen
            }
            let children = AXHelper.getChildren(chatList)
            let target = chatName.lowercased()
            var found = false
            for child in children {
                let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
                    .replacingOccurrences(of: "\u{200E}", with: "")
                if desc.lowercased().contains(target) {
                    AXHelper.press(child)
                    found = true
                    Thread.sleep(forTimeInterval: 0.5)
                    break
                }
            }
            if !found { throw AXError.chatNotFound(chatName) }
        }

        // Find the messages group
        guard let msgGroup = AXHelper.findByDesc(win, "Messages in chat") else {
            throw AXError.noChatOpen
        }

        // Extract chat name and members from heading
        let groupDesc = AXHelper.getAttr(msgGroup, kAXDescriptionAttribute as String)
            .replacingOccurrences(of: "\u{200E}", with: "")
            .replacingOccurrences(of: "Messages in chat with ", with: "")

        // Look for the heading with members info
        var members = ""
        if let heading = AXHelper.findByDesc(win, "Members:") {
            members = AXHelper.getAttr(heading, kAXValueAttribute as String)
                .replacingOccurrences(of: "\u{200E}", with: "")
        }

        // Walk message elements
        let children = AXHelper.getChildren(msgGroup)
        var messages: [Message] = []

        for child in children {
            let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
            if desc.isEmpty { continue }

            // Also check nested children (some messages are inside groups)
            if let msg = Parsers.parseMessage(desc: desc) {
                messages.append(msg)
            }
            for nested in AXHelper.getChildren(child) {
                let nestedDesc = AXHelper.getAttr(nested, kAXDescriptionAttribute as String)
                if !nestedDesc.isEmpty, let msg = Parsers.parseMessage(desc: nestedDesc) {
                    messages.append(msg)
                }
            }
        }

        let detail = ChatDetail(name: groupDesc, members: members, messages: messages)

        if asJSON {
            let data = try JSONEncoder.pretty.encode(detail)
            print(String(data: data, encoding: .utf8)!)
        } else {
            print("# \(detail.name)")
            if !detail.members.isEmpty { print("  \(detail.members)") }
            print("")
            for m in detail.messages {
                let fwd = m.forwarded ? " [fwd]" : ""
                let sender = m.sender.isEmpty ? "you" : m.sender
                print("  \(sender): \(m.text)\(fwd)  \(m.timestamp)")
            }
        }
    }

    static func send(chatName: String, message: String) throws {
        try AXHelper.ensurePermission()
        let app = try AXHelper.appElement()
        let win = try AXHelper.mainWindow(app)

        // Find and open the chat
        guard let chatList = AXHelper.findByDesc(win, "List of chats") else {
            throw AXError.noChatOpen
        }
        let children = AXHelper.getChildren(chatList)
        let target = chatName.lowercased()
        var found = false
        for child in children {
            let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
                .replacingOccurrences(of: "\u{200E}", with: "")
            if desc.lowercased().contains(target) {
                AXHelper.press(child)
                found = true
                Thread.sleep(forTimeInterval: 0.5)
                break
            }
        }
        if !found { throw AXError.chatNotFound(chatName) }

        // Find the compose text area and type
        guard let textArea = AXHelper.findByDesc(win, "Compose message") else {
            fputs("ERROR: Can't find compose area\n", stderr)
            exit(1)
        }

        // Set the value
        AXUIElementSetAttributeValue(textArea, kAXValueAttribute as CFString, message as CFTypeRef)

        // Focus it and press Enter
        AXUIElementSetAttributeValue(textArea, kAXFocusedAttribute as CFString, true as CFTypeRef)
        Thread.sleep(forTimeInterval: 0.2)

        // Simulate Enter key
        let src = CGEventSource(stateID: CGEventSourceStateID(rawValue: 1)!) // hidEventState
        let keyDown = CGEvent(keyboardEventSource: src, virtualKey: 0x24, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: src, virtualKey: 0x24, keyDown: false)
        keyDown?.post(tap: CGEventTapLocation.cghidEventTap)
        keyUp?.post(tap: CGEventTapLocation.cghidEventTap)

        print("Sent to \(chatName).")
    }
}

extension JSONEncoder {
    static let pretty: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()
}
