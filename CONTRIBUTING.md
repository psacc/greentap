# Contributing to greentap

## Scope

greentap is a personal CLI. External PRs are welcome for bugs and
small features, but expect slow review and opinionated rejections on
scope.

## Ground rules

- **No PII.** Fixtures and tests must use fake personas
  (e.g. Roberto Marini, Elena Conti, Famiglia Rossi). Never commit
  real names, phone numbers, chat content, or any identifier that
  could be traced to a real person. CI (when added) will grep.
- **Locale-agnostic selectors.** Don't hardcode WhatsApp UI strings.
  See `CLAUDE.md` for the three-tier selector strategy.
- **TDD.** Write the failing test first; make it pass.

## E2E is mandatory — local, not CI

Any PR whose diff touches one or more of the following paths must
pass `GREENTAP_E2E=1 node greentap.js e2e` on the contributor's
machine **before** the PR is merged:

- `lib/commands.js`
- `lib/parser.js`
- `lib/daemon.js`
- `lib/client.js`
- `lib/locale.js`
- any file under `test/fixtures/`

Exempt paths: docs (`README.md`, `CLAUDE.md`, `ROADMAP.md`,
`docs/**`, `CONTRIBUTING.md`), `.claude/**`, `.gitignore`,
`.github/**`, release notes.

### Sandbox setup (one-time)

1. In WhatsApp, create a group named exactly `greentap-sandbox`.
2. Add yourself as the only member.
3. Confirm with `GREENTAP_E2E=1 node greentap.js e2e` — the
   pre-flight stage verifies the group exists.

### Running

```bash
GREENTAP_E2E=1 node greentap.js e2e
```

Exit codes:

- `0` — all stages passed
- `1` — a stage failed
- `2` — sandbox group missing
- `3` — rate-limited (min 60s between runs; override with
  `GREENTAP_E2E_SKIP_RATE_LIMIT=1` for local debugging)

### Multimodal image check

Stage 4 ("image") prints the path of the downloaded image fixture
(after PR #18 lands `fetchImages`). Open that path with any image
viewer, or — if an AI agent is doing the check — Read the path. The
fixture text `GREENTAP-E2E` must be legible. If the image is blank
or the text is unreadable, the pipeline is broken even though the
CLI returned pass.

## Adding a new chat-targeting command

1. Add the command's exported name to `GUARDED_COMMANDS` in
   `lib/e2e-guard.js`.
2. Call `assertE2EAllowed(chatName)` as the first statement of the
   function body.
3. The `test/e2e-guard.test.js` enforcement test will verify the
   new command rejects non-sandbox chats.

## PR checklist

See `.github/pull_request_template.md`.
