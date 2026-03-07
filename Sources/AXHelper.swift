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

        // Check if the window has content (Catalyst app may need recovery)
        let children = getChildren(win)
        let hasContent = children.contains { child in
            let role = getAttr(child, kAXRoleAttribute as String)
            return role == "AXGroup" || role == "AXWindow"
        }

        if !hasContent {
            // Recover by clicking Window > app name in the menu bar
            recoverWindow(app)
            Thread.sleep(forTimeInterval: 2.0)
            // Re-fetch
            AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &ref)
            if let newWindows = ref as? [AXUIElement], let newWin = newWindows.first {
                return newWin
            }
        }

        return win
    }

    private static func recoverWindow(_ app: AXUIElement) {
        // Activate the app
        let runningApps = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == bundleID }
        runningApps.first?.activate()

        // AXRaise the window
        var ref: CFTypeRef?
        AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &ref)
        if let windows = ref as? [AXUIElement] {
            for w in windows {
                AXUIElementPerformAction(w, kAXRaiseAction as CFString)
            }
        }

        Thread.sleep(forTimeInterval: 0.5)

        // Click Window > WhatsApp in the menu bar
        var menuRef: CFTypeRef?
        AXUIElementCopyAttributeValue(app, kAXMenuBarAttribute as CFString, &menuRef)
        guard menuRef != nil else { return }
        let menuBar = menuRef as! AXUIElement
        for item in getChildren(menuBar) {
            if getAttr(item, kAXTitleAttribute as String) == "Window" {
                AXUIElementPerformAction(item, kAXPressAction as CFString)
                Thread.sleep(forTimeInterval: 0.3)
                for mc in getChildren(item) {
                    for si in getChildren(mc) {
                        if getAttr(si, kAXTitleAttribute as String).contains("WhatsApp") {
                            AXUIElementPerformAction(si, kAXPressAction as CFString)
                            return
                        }
                    }
                }
                break
            }
        }
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

    static func findByDesc(_ root: AXUIElement, _ target: String, role: String? = nil, maxDepth: Int = 10) -> AXUIElement? {
        findByDesc(root, target, role: role, depth: 0, maxDepth: maxDepth)
    }

    private static func findByDesc(_ el: AXUIElement, _ target: String, role: String?, depth: Int, maxDepth: Int) -> AXUIElement? {
        let desc = getAttr(el, kAXDescriptionAttribute as String)
        let elRole = getAttr(el, kAXRoleAttribute as String)
        if desc.contains(target) && (role == nil || elRole == role) { return el }
        if depth >= maxDepth { return nil }
        for child in getChildren(el) {
            if let found = findByDesc(child, target, role: role, depth: depth + 1, maxDepth: maxDepth) {
                return found
            }
        }
        return nil
    }

    static func findFirstByRole(_ root: AXUIElement, role target: String, maxDepth: Int = 10) -> AXUIElement? {
        findFirstByRole(root, role: target, depth: 0, maxDepth: maxDepth)
    }

    private static func findFirstByRole(_ el: AXUIElement, role target: String, depth: Int, maxDepth: Int) -> AXUIElement? {
        let role = getAttr(el, kAXRoleAttribute as String)
        if role == target { return el }
        if depth >= maxDepth { return nil }
        for child in getChildren(el) {
            if let found = findFirstByRole(child, role: target, depth: depth + 1, maxDepth: maxDepth) {
                return found
            }
        }
        return nil
    }

    static func activateApp() {
        let apps = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == bundleID }
        apps.first?.activate()
    }


    static func press(_ el: AXUIElement) {
        AXUIElementPerformAction(el, kAXPressAction as CFString)
    }
}
