## Context

greentap Phase 0 shipped a Playwright-based CLI with `login`, `logout`, and `snapshot` commands. The parser layer (`parseChatList`, `parseMessages`) and formatters (`printChats`, `printMessages`) are implemented and tested but not wired to CLI commands. The snapshot command uses a hardcoded 5-second timeout and incorrect aria role locators.

## Goals / Non-Goals

**Goals:**
- Wire existing parsers into user-facing CLI commands (`chats`, `unread`, `read`)
- Support `--json` output for machine consumption (greentap skill, piping)
- Replace fixed timeout with element-based wait
- Fix message attribution for own messages without `Tu:` prefix
- Fix scoped locators to use correct aria roles

**Non-Goals:**
- Send/compose functionality (Phase 2)
- Scroll support for message history (deferred — assess feasibility only)
- Browser daemon / performance optimization (Phase 3)
- Locale detection or multi-locale support

## Decisions

### 1. CLI argument parsing stays manual
No arg-parsing library. The CLI has ~6 commands with simple flags (`--json`). A library adds a dependency for no gain. If Phase 2 needs subcommands with complex options, reconsider then.

### 2. `--json` outputs newline-delimited JSON arrays
`JSON.stringify(result)` to stdout. Human-readable output to stdout by default. Errors always to stderr. This matches hey-cli's pattern and works with `jq`.

### 3. Wait strategy: poll for chat list grid element
Replace `waitForTimeout(5000)` with `page.getByRole('grid', { name: 'Lista delle chat' }).waitFor({ timeout: 15000 })`. This is faster when WA loads quickly and more reliable when it's slow. The 15s timeout is generous — typical load is 2-4s.

### 4. Own-message attribution fix in parser
The `parseMessages` function currently relies on `Tu:` prefix for own messages and `button "Apri dettagli chat di X"` for others. Messages from self that lack `Tu:` get `sender: ""`. Fix: in 1:1 chats, infer the chat partner name from the `button "Apri dettagli chat di X"` element. Any message without that sender prefix is from self → set sender to `"Tu"`. This heuristic works for 1:1 chats (most common use case). Group chats already have sender buttons between message groups.

### 5. Chat navigation for `read` command
Reuse the existing `cmdSnapshot` pattern: find the chat row in the grid by text match, click it, wait for the message panel to load. The message panel is identifiable by `role="application"` containing rows, or by the presence of `button "Apri dettagli chat di"`.

## Read Receipts

Opening a chat in WhatsApp Web marks it as read server-side — there is no way to "peek" without triggering this. The `chats` and `unread` commands are safe (they only parse the sidebar), but `read <chat>` will mark the chat as read. This is accepted behavior and matches normal WhatsApp usage. Disabling "Read receipts" in WhatsApp settings hides blue ticks from senders but does not prevent the unread badge from clearing locally.

## Risks / Trade-offs

- **[Locale brittleness]** → All aria labels are Italian. Accepted for personal use. If locale changes, parser breaks obviously (empty results, not silent corruption).
- **[Chat name collision]** → `filter({ hasText: name })` may match substrings. → Use `.first()` and document exact-match limitation. Acceptable for personal use.
- **[No scroll support yet]** → `read` only shows visible messages (last ~20-30). → Sufficient for "check latest messages" use case. Scroll deferred to later.
