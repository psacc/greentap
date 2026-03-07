import Foundation

struct ChatEntry: Encodable {
    let name: String
    let unread: Int
    let lastMessage: String
    let sender: String
    let timestamp: String
    let muted: Bool
    let mentioned: Bool
}

struct Message: Encodable {
    let sender: String
    let text: String
    let timestamp: String
    let forwarded: Bool
}

struct ChatDetail: Encodable {
    let name: String
    let members: String
    let messages: [Message]
}
