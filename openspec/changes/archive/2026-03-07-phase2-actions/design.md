## Context

Phase 1 CLI has read-only commands (`chats`, `unread`, `read`). The legacy Swift send worked via AX: set compose textbox value → click Send AXButton → verify compose is empty. Playwright equivalent uses aria roles directly.

## Goals / Non-Goals

**Goals:**
- Send messages reliably via compose textbox + Send button
- Search chats via WhatsApp's search bar
- Add human-like delays to reduce automation detection
- Verify sent messages appear in chat

**Non-Goals:**
- Media/file sending (text only)
- Contact management
- Group creation
- Read receipt suppression

## Read Receipts

Sending a message obviously marks the chat as read. The `search` command navigates within the search panel and does not open chats, so it does not trigger read receipts unless `--open` is used.

## Decisions

### 1. Send flow: fill textbox + click Send button
Playwright `fill()` on the compose textbox (aria name `"Scrivi a X"` or `"Scrivi al gruppo X"`), then click the Send button (aria `button "Invia"`). The Send button only appears after text is entered — wait for it after fill.

Legacy used `AXUIElementSetAttributeValue` which is equivalent. `fill()` is cleaner and doesn't require clipboard.

### 2. Post-send verification via compose box empty check
After clicking Send, wait briefly then check if the compose textbox is empty. If it still has text, the send likely failed. Additionally, take a snapshot and verify the sent message text appears in the last message row. Return success/failure status.

### 3. Search flow: click search textbox → type → parse results
WhatsApp has a search textbox `"Cerca o avvia una nuova chat"`. Click it, type the query via `fill()`, wait for results to appear, then take an aria snapshot to parse results. Press Escape twice to exit search mode.

### 4. Human-like delays
Add a `humanDelay(min, max)` utility that returns a random delay between min and max ms. Use it:
- Before clicking a chat row: 200-500ms
- Before typing in compose: 300-600ms
- After sending: 500-1000ms
- Between search actions: 200-400ms

Keep delays short — this is personal use, not bulk automation. The goal is to avoid machine-gun-speed interactions, not simulate full human behavior.

### 5. Search result parsing
Search results appear in a different panel from the chat list. Need to capture the aria structure via a live snapshot to determine the exact roles/names. The parser may need a new `parseSearchResults()` function or the existing `parseChatList()` may work if the structure is similar.

## Risks / Trade-offs

- **[Send to wrong chat]** → Verify chat name in message panel header after navigation, before sending. Fail if mismatch.
- **[Compose textbox name varies]** → Use regex pattern `/Scrivi a/` to match both 1:1 and group compose boxes.
- **[Search results structure unknown]** → Need a live snapshot to determine. May need to capture a new fixture during e2e testing.
- **[Ban risk from send]** → Low volume personal use. Human-like delays help. Don't send in rapid bursts.
