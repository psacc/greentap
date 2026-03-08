## 1. Locale Detection Module

- [ ] 1.1 Create `lib/locale.js` — detect day names, relative dates (Ieri/Oggi), and date format from browser's `Intl` APIs via `page.evaluate()`
- [ ] 1.2 Export `detectLocale(page)` returning `{ dayNames, yesterday, today, dateRegex }`
- [ ] 1.3 Unit test locale detection with mocked return values

## 2. Update Commands — Structural Selectors (lib/commands.js)

- [ ] 2.1 Chat list grid: `"Lista delle chat"` → `page.getByRole("grid").first()`
- [ ] 2.2 Search box: `"Cerca o avvia una nuova chat"` → first textbox not in contentinfo
- [ ] 2.3 Compose textbox: `/Scrivi a/` → `page.locator("contentinfo").getByRole("textbox")`
- [ ] 2.4 Send button: `"Invia"` → detect voice→send button swap in contentinfo after typing
- [ ] 2.5 Search results grid: `"Risultati della ricerca."` → second grid / `page.getByRole("grid").nth(1)`
- [ ] 2.6 Chat header verify: `"clicca qui per info"` regex → header button that `includes(chatName)`
- [ ] 2.7 Error detection: `"Si è verificato un errore"` → check if compose textbox still has text after send
- [ ] 2.8 Snapshot command: update `"Lista delle chat"` reference

## 3. Update Client (lib/client.js)

- [ ] 3.1 `ensureChatList`: `"Lista delle chat"` → `page.getByRole("grid").first()`
- [ ] 3.2 Add locale detection to connect flow, return `localeConfig` with page

## 4. Update Parser — Icon-Based + Locale-Agnostic (lib/parser.js)

- [ ] 4.1 Own message detection: replace `Tu:` prefix check with `img "msg-dblcheck"` / `img "msg-check"` in row children
- [ ] 4.2 Set `sender = "You"` for own messages (universal constant)
- [ ] 4.3 Remove `"Letto"` / `"Consegnato"` text matching — rely on icon detection
- [ ] 4.4 Chat list grid: `"Lista delle chat"` → first grid pattern in aria text
- [ ] 4.5 Search results grid: `"Risultati della ricerca."` → dynamic grid name or position-based
- [ ] 4.6 Sender button: `"Apri dettagli chat di"` → configurable prefix from localeConfig or auto-detect
- [ ] 4.7 Message area boundary: `"Dettagli profilo"` → find rows not inside a grid (structural)
- [ ] 4.8 Unread count: `"messaggi? non lett[io]"` → match gridcell with numeric value pattern
- [ ] 4.9 Day names + relative dates: accept localeConfig, build timePattern regex dynamically
- [ ] 4.10 Date format: accept localeConfig.dateRegex for date pattern matching

## 5. Update Tests

- [ ] 5.1 Update `test/parser.test.js` — adjust assertions for icon-based own-message detection and `sender: "You"`
- [ ] 5.2 Add parser tests with minimal English fixture to validate agnostic parsing
- [ ] 5.3 Run `npm test` and fix any remaining failures
- [ ] 5.4 E2E smoke test: `chats`, `unread`, `read`, `search`, `send` on live WhatsApp

## 6. Documentation

- [ ] 6.1 Update CLAUDE.md — note locale-agnostic approach, `sender: "You"` change
- [ ] 6.2 Update `~/.claude/skills/greentap/SKILL.md` — document `sender: "You"` (was `"Tu"`)
- [ ] 6.3 Update ROADMAP.md — mark Phase 6 approach change
- [ ] 6.4 Update canonical openspec specs to reflect structural selectors
