## 1. Human-like delay utility

- [x] 1.1 Add `humanDelay(min, max)` async function to `greentap.js` that waits a random duration between min and max ms
- [x] 1.2 Add delays to existing chat navigation in `cmdRead` (before click: 200-500ms)

## 2. Send command

- [x] 2.1 Add `cmdSend(chatName, message)` — navigate to chat, verify correct chat opened, type message, click Send
- [x] 2.2 Compose textbox: locate via regex `/Scrivi a/` to match both 1:1 and group patterns
- [x] 2.3 Send button: wait for `button "Invia"` to appear after filling compose, then click
- [x] 2.4 Post-send verification: wait for compose box to be empty (up to 5s), then verify message text in last row
- [x] 2.5 Chat verification: check header button `"<name> clicca qui per info gruppo/contatto"` matches target before typing
- [x] 2.6 Wire `send` command in main switch and update usage text
- [x] 2.7 E2E test: send a test message to "Famiglia Rossi" group and verify ✓

## 3. Search command

- [x] 3.1 Capture search results aria snapshot via e2e test — uses `grid "Risultati della ricerca."` with same structure as chat list
- [x] 3.2 Add `cmdSearch(query, json)` — click search textbox, type query, wait for results, parse, cleanup
- [x] 3.3 Add `parseSearchResults()` to `lib/parser.js` — reuses `parseChatList` by swapping grid name
- [x] 3.4 Wire `search` command in main switch with `--json` flag and update usage text
- [x] 3.5 E2E test: search for "Family" and verify results include the test group ✓
