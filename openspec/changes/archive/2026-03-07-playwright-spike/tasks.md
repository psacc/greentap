## 1. Project Setup

- [x] 1.1 Create `package.json` with Playwright dependency (ESM, node:test)
- [x] 1.2 Create `greentap.js` entrypoint with `withBrowser` helper and CLI dispatch
- [x] 1.3 Add `node_modules/` to `.gitignore`
- [x] 1.4 Create `test/fixtures/` and `lib/` directories

## 2. Session Management

- [x] 2.1 Implement `greentap login` — headed browser, wait for user close
- [x] 2.2 Implement `greentap logout` — rmSync browser-data directory

## 3. Aria Snapshot Exploration

- [x] 3.1 Implement `greentap snapshot [full|chats|messages|compose]`
- [x] 3.2 Run `greentap login`, scan QR, establish session
- [x] 3.3 Capture `test/fixtures/main-aria.txt` (full page, no chat open)
- [x] 3.4 Open a chat, capture `test/fixtures/chat-aria.txt` (with messages visible)
- [x] 3.5 Study aria structure — identify chat list, message, and compose patterns

## 4. Chat List Parser

- [x] 4.1 Create `lib/parser.js` with `parseChatList()` based on fixture patterns
- [x] 4.2 Add `printChats()` output formatter
- [x] 4.3 Add `test/parser.test.js` — `parseChatList()` tests against fixtures

## 5. Message Parser

- [x] 5.1 Add `parseMessages()` to `lib/parser.js` based on fixture patterns
- [x] 5.2 Add `printMessages()` output formatter
- [x] 5.3 Add message parsing tests against fixtures

## 6. Verify

- [x] 6.1 Run `npm test` — all tests pass
- [ ] 6.2 Run `/review-code` and `/review-security`
