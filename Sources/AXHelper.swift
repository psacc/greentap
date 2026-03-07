import ApplicationServices
import Cocoa

enum AXError: Error, CustomStringConvertible {
    case noPermission
    case appNotRunning
    case noWindow
    case chatNotFound(String)
    case noChatOpen

    var description: String {
        switch self {
        case .noPermission:
            return "Accessibility permission required. Grant it in System Settings > Privacy & Security > Accessibility."
        case .appNotRunning:
            return "Target app is not running."
        case .noWindow:
            return "No app window found."
        case .chatNotFound(let name):
            return "Chat not found: \(name)"
        case .noChatOpen:
            return "No chat is currently open."
        }
    }
}

struct AXHelper {
    static let bundleID = "net.whatsapp.WhatsApp"

    static func ensurePermission() throws {
        let trusted = AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeRetainedValue(): true] as CFDictionary
        )
        if !trusted { throw AXError.noPermission }
    }

    static func appElement() throws -> AXUIElement {
        let apps = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == bundleID }
        guard let app = apps.first else { throw AXError.appNotRunning }
        return AXUIElementCreateApplication(app.processIdentifier)
    }

    static func mainWindow(_ app: AXUIElement) throws -> AXUIElement {
        var ref: CFTypeRef?
        AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &ref)
        guard let windows = ref as? [AXUIElement], let win = windows.first else {
            throw AXError.noWindow
        }
        return win
    }

    static func getAttr(_ el: AXUIElement, _ attr: String) -> String {
        var ref: CFTypeRef?
        AXUIElementCopyAttributeValue(el, attr as CFString, &ref)
        return ref as? String ?? ""
    }

    static func getChildren(_ el: AXUIElement) -> [AXUIElement] {
        var ref: CFTypeRef?
        AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &ref)
        return ref as? [AXUIElement] ?? []
    }

    static func findByDesc(_ root: AXUIElement, _ target: String, maxDepth: Int = 10) -> AXUIElement? {
        findByDesc(root, target, depth: 0, maxDepth: maxDepth)
    }

    private static func findByDesc(_ el: AXUIElement, _ target: String, depth: Int, maxDepth: Int) -> AXUIElement? {
        let desc = getAttr(el, kAXDescriptionAttribute as String)
        if desc.contains(target) { return el }
        if depth >= maxDepth { return nil }
        for child in getChildren(el) {
            if let found = findByDesc(child, target, depth: depth + 1, maxDepth: maxDepth) {
                return found
            }
        }
        return nil
    }

    static func press(_ el: AXUIElement) {
        AXUIElementPerformAction(el, kAXPressAction as CFString)
    }
}
