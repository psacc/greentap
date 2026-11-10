# Design

## Decisions
- **Send control (Tier 2, icon).** One XPath predicate matches an icon whose
  SVG `<title>` is `ic-send-filled` or `wds-ic-send-filled`, or an element with
  `data-icon`/`data-testid` `wds-ic-send-filled`. The compose path accepts only
  `<button>` elements in `contentinfo`; the media preview accepts visible
  `role="button"` elements. Alternatives rejected: the accessible name is
  localized; button position breaks when a link-preview close button appears.
- **Destination (Tier 1/2).** When `[data-testid="conversation-info-header-chat-title"]`
  exists in `#main header`, exactly one must exist and its normalized text
  (emoji images replaced by their `alt`) must equal the chat name. Otherwise
  the legacy header-button match applies.
- **Drafts.** Any non-empty compose box (text or emoji image) blocks the send
  unless its text, ignoring whitespace, equals the message and it holds no
  image. An identical draft is sent without typing. A send never deletes a
  draft: it can be the user's own unsent text.
- **Verification.** Count own messages (delivery-receipt icon) whose text
  contains the first line of the message, emoji removed, before the click.
  Poll for up to 10 s for a higher count. On timeout, a non-empty compose box
  means "Not sent"; an empty one means "Unverified", with no retry advice.

## Risks
- A pending message (clock icon) has no receipt yet. A send that stays pending
  for over 10 s reports "Unverified" although it may still go out. The error
  says to check the chat before sending again.
- An emoji-only or image-holding draft cannot be compared and is refused.
