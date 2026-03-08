## 1. CLI Tests

- [x] 1.1 Create `test/cli.test.js` with JSON contract tests: import command functions, mock page with fixture aria snapshots, assert output shape for chats, unread, read, search
- [x] 1.2 Add arg parsing tests: spawn `node greentap.js` with missing/invalid args, assert exit codes and stderr for read, send, search, unknown command; include send message joining test
- [x] 1.3 Run `npm test` — all existing + new tests pass

## 2. Skill Migration

- [x] 2.1 Rewrite `~/.claude/skills/greentap/SKILL.md` for Node.js CLI: update prerequisites, commands (`node greentap.js` instead of `greentap`), behavior docs, agent guidelines
- [x] 2.2 Verify skill triggers and description are accurate
- [x] 2.3 Manual smoke test: use skill to run `chats --json`, `unread`, `read`, `search` via Claude Code

## 3. Swift Removal (depends on group 2 — skill must work before deleting source)

- [x] 3.1 Git tag `pre-swift-removal` for recovery reference
- [x] 3.2 Remove `Sources/` directory
- [x] 3.3 Remove `Package.swift`
- [x] 3.4 Remove `~/bin/greentap` binary (manual step — not in repo)

## 4. Docs Update

- [x] 4.1 Update project `CLAUDE.md`: remove Swift/AX references, update architecture to Node.js-only
- [x] 4.2 Run `npm test` — final verification all tests pass
