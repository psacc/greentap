## 1. Browser wait improvements

- [x] 1.1 Extract a `waitForChatList(page)` helper that waits for `grid "Lista delle chat"` with 15s timeout
- [x] 1.2 Replace `waitForTimeout(5000)` in `cmdSnapshot` with `waitForChatList`
- [x] 1.3 Add `waitForMessagePanel(page)` helper that waits for `button "Apri dettagli chat di"` with 10s timeout
- [x] 1.4 Use `waitForMessagePanel` after chat click in snapshot command

## 2. CLI commands — chats and unread

- [x] 2.1 Add `cmdChats(json)` in `greentap.js`: launch browser, wait for chat list, take aria snapshot, parse with `parseChatList`, output with `printChats` or `JSON.stringify`
- [x] 2.2 Add `cmdUnread(json)` in `greentap.js`: same as chats but filter to `unread === true`
- [x] 2.3 Wire `chats` and `unread` commands in the main switch with `--json` flag parsing
- [x] 2.4 Update usage text to include new commands

## 3. CLI command — read

- [x] 3.1 Add `cmdRead(chatName, json)` in `greentap.js`: launch browser, wait for chat list, click chat row, wait for message panel, take aria snapshot, parse with `parseMessages`, output with `printMessages` or `JSON.stringify`
- [x] 3.2 Wire `read` command in the main switch with `--json` flag parsing

## 4. Parser fix — own-message attribution

- [x] 4.1 In `parseMessages`, detect own messages via `msg-dblcheck`/`msg-check` delivery status icons (more reliable than chat partner name inference — works in both 1:1 and group chats)
- [x] 4.2 For message rows with delivery status icons or `Tu:` prefix, set sender to `"Tu"`
- [x] 4.3 Add test fixture with own messages lacking `Tu:` prefix
- [x] 4.4 Add unit tests verifying correct attribution for both prefixed and unprefixed own messages

## 5. Fix scoped snapshot locators

- [x] 5.1 In `cmdSnapshot`, fix the `chats` scope to use `grid` role instead of `list`
- [x] 5.2 In `cmdSnapshot`, fix the `messages` scope locator to target message rows correctly
