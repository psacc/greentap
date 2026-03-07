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
        var win = try AXHelper.mainWindow(app)

        // If a chat name is provided, open it first
        if let chatName = chatName {
            // Dismiss any stuck overlays (e.g. archived chat panels)
            AXHelper.activateApp()
            Thread.sleep(forTimeInterval: 0.2)
            try dismissOverlays()
            Thread.sleep(forTimeInterval: 0.3)
            win = try AXHelper.mainWindow(app)

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

    /// Activate search, paste query, return (searchResults, window) for callers to use.
    private static func activateSearch(query: String) throws -> (results: AXUIElement?, win: AXUIElement) {
        let app = try AXHelper.appElement()
        let win = try AXHelper.mainWindow(app)

        AXHelper.activateApp()
        Thread.sleep(forTimeInterval: 0.3)

        // Press the Search AXButton (not the AXStaticText label)
        guard let searchBtn = AXHelper.findByDesc(win, "Search", role: "AXButton") else {
            throw AXError.noChatOpen
        }
        AXHelper.press(searchBtn)
        Thread.sleep(forTimeInterval: 0.3)

        // Clear existing search text (Cmd+A) then paste query via clipboard
        let pb = NSPasteboard.general
        let savedContents = pb.string(forType: .string)
        selectAllCmd()
        Thread.sleep(forTimeInterval: 0.1)
        pb.clearContents()
        pb.setString(query, forType: .string)
        pasteCmd()
        Thread.sleep(forTimeInterval: 1.2)

        // Re-fetch window state after search
        let freshWin = try AXHelper.mainWindow(app)

        // Restore clipboard
        pb.clearContents()
        if let saved = savedContents { pb.setString(saved, forType: .string) }

        let results = AXHelper.findByDesc(freshWin, "Search results")
        return (results, freshWin)
    }

    /// Search for a chat using the app's search bar.
    static func search(query: String, andOpen: Bool, asJSON: Bool) throws {
        try AXHelper.ensurePermission()
        let (resultsGroup, _) = try activateSearch(query: query)

        guard let resultsGroup = resultsGroup else {
            clearSearch()
            fputs("No search results for: \(query)\n", stderr)
            exit(1)
        }

        let children = AXHelper.getChildren(resultsGroup)
        var entries: [ChatEntry] = []

        // Search results contain AXButton elements with chat info
        for child in children {
            let role = AXHelper.getAttr(child, kAXRoleAttribute as String)
            guard role == "AXButton" else { continue }
            let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
            let value = AXHelper.getAttr(child, kAXValueAttribute as String)
            guard !desc.isEmpty else { continue }
            if let entry = Parsers.parseChatEntry(desc: desc, value: value) {
                entries.append(entry)
            }
        }

        if andOpen {
            // Open the first AXButton result
            for child in children {
                let role = AXHelper.getAttr(child, kAXRoleAttribute as String)
                if role == "AXButton" {
                    AXHelper.press(child)
                    Thread.sleep(forTimeInterval: 0.5)
                    break
                }
            }
            clearSearch()
        } else {
            if asJSON {
                let data = try JSONEncoder.pretty.encode(entries)
                print(String(data: data, encoding: .utf8)!)
            } else {
                for e in entries {
                    let unreadTag = e.unread > 0 ? " [\(e.unread)]" : ""
                    print("\(e.name)\(unreadTag)")
                    if !e.sender.isEmpty {
                        print("  \(e.sender): \(e.lastMessage)  \(e.timestamp)")
                    } else if !e.lastMessage.isEmpty {
                        print("  \(e.lastMessage)  \(e.timestamp)")
                    }
                }
            }
            clearSearch()
        }
    }

    private static func pasteCmd() {
        let src = CGEventSource(stateID: CGEventSourceStateID(rawValue: 1)!)
        let vDown = CGEvent(keyboardEventSource: src, virtualKey: 0x09, keyDown: true)
        vDown?.flags = .maskCommand
        let vUp = CGEvent(keyboardEventSource: src, virtualKey: 0x09, keyDown: false)
        vUp?.flags = .maskCommand
        vDown?.post(tap: CGEventTapLocation.cghidEventTap)
        vUp?.post(tap: CGEventTapLocation.cghidEventTap)
    }

    private static func selectAllCmd() {
        let src = CGEventSource(stateID: CGEventSourceStateID(rawValue: 1)!)
        let aDown = CGEvent(keyboardEventSource: src, virtualKey: 0x00, keyDown: true)
        aDown?.flags = .maskCommand
        let aUp = CGEvent(keyboardEventSource: src, virtualKey: 0x00, keyDown: false)
        aUp?.flags = .maskCommand
        aDown?.post(tap: CGEventTapLocation.cghidEventTap)
        aUp?.post(tap: CGEventTapLocation.cghidEventTap)
    }


    private static func pressEscape() {
        let src = CGEventSource(stateID: CGEventSourceStateID(rawValue: 1)!)
        let keyDown = CGEvent(keyboardEventSource: src, virtualKey: 0x35, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: src, virtualKey: 0x35, keyDown: false)
        keyDown?.post(tap: CGEventTapLocation.cghidEventTap)
        keyUp?.post(tap: CGEventTapLocation.cghidEventTap)
    }

    private static func clearSearch() {
        // Press Escape twice (once to clear search text, once to exit search mode)
        for _ in 0..<2 {
            pressEscape()
            Thread.sleep(forTimeInterval: 0.2)
        }
    }

    private static func dismissOverlays() throws {
        // Only press Escape if an archived/overlay chat is open that doesn't match the chat list.
        // Check if "Messages in chat" exists but the chat isn't in the visible list (= overlay).
        let app = try AXHelper.appElement()
        let win = try AXHelper.mainWindow(app)
        if let msgGroup = AXHelper.findByDesc(win, "Messages in chat") {
            let chatName = AXHelper.getAttr(msgGroup, kAXDescriptionAttribute as String)
                .replacingOccurrences(of: "\u{200E}", with: "")
                .replacingOccurrences(of: "Messages in chat with ", with: "")
            // Check if this chat is in the visible list
            if let chatList = AXHelper.findByDesc(win, "List of chats") {
                let inList = AXHelper.getChildren(chatList).contains { child in
                    AXHelper.getAttr(child, kAXDescriptionAttribute as String)
                        .replacingOccurrences(of: "\u{200E}", with: "")
                        .contains(chatName)
                }
                if !inList {
                    // This is an overlay (archived chat) — dismiss it
                    pressEscape()
                    Thread.sleep(forTimeInterval: 0.3)
                }
            }
        }
    }

    /// Open a chat by searching for it (works for chats not in viewport), then read messages.
    static func readBySearch(query: String, asJSON: Bool) throws {
        try AXHelper.ensurePermission()
        let (resultsGroup, _) = try activateSearch(query: query)

        guard let resultsGroup = resultsGroup else {
            clearSearch()
            throw AXError.chatNotFound(query)
        }

        // Open the first AXButton result
        let children = AXHelper.getChildren(resultsGroup)
        var opened = false
        for child in children {
            let role = AXHelper.getAttr(child, kAXRoleAttribute as String)
            if role == "AXButton" {
                AXHelper.press(child)
                opened = true
                break
            }
        }
        if !opened {
            clearSearch()
            throw AXError.chatNotFound(query)
        }

        Thread.sleep(forTimeInterval: 0.5)
        clearSearch()
        Thread.sleep(forTimeInterval: 0.5)

        try read(chatName: nil, asJSON: asJSON)
    }

    /// Check if the currently open chat matches the target name.
    private static func currentChatMatches(_ win: AXUIElement, _ target: String) -> Bool {
        guard let msgGroup = AXHelper.findByDesc(win, "Messages in chat") else { return false }
        let heading = AXHelper.getAttr(msgGroup, kAXDescriptionAttribute as String)
            .replacingOccurrences(of: "\u{200E}", with: "")
            .lowercased()
        return heading.contains(target.lowercased())
    }

    /// Open a chat by name — tries visible list first, falls back to search.
    private static func openChat(_ chatName: String) throws -> AXUIElement {
        try AXHelper.ensurePermission()
        let app = try AXHelper.appElement()

        // Dismiss overlays first
        AXHelper.activateApp()
        Thread.sleep(forTimeInterval: 0.2)
        try dismissOverlays()
        Thread.sleep(forTimeInterval: 0.3)

        var win = try AXHelper.mainWindow(app)

        // If the target chat is already open, skip navigation
        if currentChatMatches(win, chatName) {
            return win
        }

        // Try visible chat list
        if let chatList = AXHelper.findByDesc(win, "List of chats") {
            let target = chatName.lowercased()
            for child in AXHelper.getChildren(chatList) {
                let desc = AXHelper.getAttr(child, kAXDescriptionAttribute as String)
                    .replacingOccurrences(of: "\u{200E}", with: "")
                if desc.lowercased().contains(target) {
                    AXHelper.press(child)
                    Thread.sleep(forTimeInterval: 0.5)
                    win = try AXHelper.mainWindow(app)
                    // Verify the correct chat opened
                    if currentChatMatches(win, chatName) {
                        return win
                    }
                    // Press didn't work (already selected as AXStaticText) — fall through to search
                    break
                }
            }
        }

        // Fall back to search
        let (resultsGroup, _) = try activateSearch(query: chatName)
        guard let resultsGroup = resultsGroup else {
            clearSearch()
            throw AXError.chatNotFound(chatName)
        }

        var opened = false
        for child in AXHelper.getChildren(resultsGroup) {
            if AXHelper.getAttr(child, kAXRoleAttribute as String) == "AXButton" {
                AXHelper.press(child)
                opened = true
                break
            }
        }
        if !opened {
            clearSearch()
            throw AXError.chatNotFound(chatName)
        }

        Thread.sleep(forTimeInterval: 0.5)
        clearSearch()
        Thread.sleep(forTimeInterval: 0.5)

        win = try AXHelper.mainWindow(app)

        // Final verification
        if !currentChatMatches(win, chatName) {
            throw AXError.chatNotFound(chatName)
        }

        return win
    }

    static func send(chatName: String, message: String) throws {
        let win = try openChat(chatName)

        // Find the compose text area
        guard let textArea = AXHelper.findByDesc(win, "Compose message") else {
            fputs("ERROR: Can't find compose area\n", stderr)
            exit(1)
        }

        // Clear any existing text, then set the message via AX
        AXUIElementSetAttributeValue(textArea, kAXValueAttribute as CFString, "" as CFTypeRef)
        Thread.sleep(forTimeInterval: 0.1)
        AXUIElementSetAttributeValue(textArea, kAXValueAttribute as CFString, message as CFTypeRef)
        Thread.sleep(forTimeInterval: 0.3)

        // Find and press the Send button
        let freshWin = try AXHelper.mainWindow(try AXHelper.appElement())
        guard let sendBtn = AXHelper.findByDesc(freshWin, "Send", role: "AXButton") else {
            fputs("ERROR: Can't find Send button\n", stderr)
            exit(1)
        }
        AXHelper.press(sendBtn)
        Thread.sleep(forTimeInterval: 0.5)

        // Verify compose is empty
        let afterValue = AXHelper.getAttr(textArea, kAXValueAttribute as String)
        if !afterValue.isEmpty && afterValue != "\n" {
            fputs("WARNING: Message may not have been sent. Compose still contains: \(afterValue)\n", stderr)
        } else {
            print("Sent to \(chatName).")
        }
    }

}

extension JSONEncoder {
    static let pretty: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()
}
