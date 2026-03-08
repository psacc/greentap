# message-scroll Specification

## Purpose
Scroll-based message collection for reading full chat history beyond the viewport.

## Requirements

### Requirement: Scroll-based message collection
The `scrollAndCollect` function SHALL scroll up through WhatsApp Web's virtual-scrolling message panel, collecting and deduplicating messages from each scroll position until the top of the conversation is reached or safety limits are hit.

#### Scenario: Collect messages across multiple scroll positions
- **WHEN** `scrollAndCollect(page)` is called on a chat with more messages than one viewport
- **THEN** it SHALL return all messages from top to bottom in chronological order
- **THEN** duplicate messages from overlapping scroll windows SHALL be removed

#### Scenario: Short chat fits in one viewport
- **WHEN** `scrollAndCollect(page)` is called on a chat with fewer messages than one viewport
- **THEN** it SHALL return the same messages as a single-snapshot read
- **THEN** top detection SHALL trigger after 3 iterations (expected overhead from stability check — no new messages appear, first message is stable immediately)

### Requirement: Deduplication
Messages SHALL be deduplicated using a composite key of `sender|time|textPrefix` where textPrefix is the first 50 characters of the message text.

#### Scenario: Overlapping messages between scroll positions
- **WHEN** two scroll positions contain the same message (same sender, time, and text prefix)
- **THEN** only one copy SHALL appear in the output

#### Scenario: Different messages with same time
- **WHEN** two different messages have the same timestamp but different text or sender
- **THEN** both messages SHALL appear in the output

### Requirement: Top-of-chat detection
The scroll loop SHALL detect the top of the conversation when the first message in the snapshot is identical for 3 consecutive iterations.

#### Scenario: Reached top of chat
- **WHEN** the first message's dedup key is the same for 3 consecutive scroll iterations
- **THEN** the scroll loop SHALL stop and return all collected messages

#### Scenario: Not yet at top
- **WHEN** the first message changes between iterations
- **THEN** the stability counter SHALL reset and scrolling SHALL continue

### Requirement: Safety limits
The scroll loop SHALL enforce a maximum of 50 iterations and a 30-second overall timeout.

#### Scenario: Max iterations reached
- **WHEN** 50 scroll iterations are completed without reaching the top
- **THEN** the function SHALL return all messages collected so far
- **THEN** a warning SHALL be printed to stderr

#### Scenario: Timeout reached
- **WHEN** 30 seconds elapse without reaching the top
- **THEN** the function SHALL return all messages collected so far
- **THEN** a warning SHALL be printed to stderr

### Requirement: Scrollable container discovery
The scroll mechanism SHALL find the scrollable container by walking up the DOM from `[role="row"]` elements and checking `getComputedStyle(el).overflowY === 'auto'`.

#### Scenario: Container found
- **WHEN** a message panel with `overflowY: auto` exists above `[role="row"]` elements
- **THEN** the function SHALL use that element for `scrollTop` manipulation

#### Scenario: Container not found
- **WHEN** no scrollable container is found
- **THEN** the function SHALL throw an error with message "Could not find scrollable message container"
