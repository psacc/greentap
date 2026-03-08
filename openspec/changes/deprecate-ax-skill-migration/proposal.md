## Why

The Swift/AX implementation is deprecated since Phase 3. The Node.js/Playwright CLI has full feature parity and superior performance (~531ms vs 3-5s). The Claude Code greentap skill still points to `~/bin/greentap` (Swift binary) — it needs to be migrated to `node greentap.js`. The Swift codebase and binary should be removed to avoid confusion.

## What Changes

- Update Claude Code greentap skill (`~/.claude/skills/greentap/SKILL.md`) to use `node greentap.js` commands
- Update skill prerequisites (no more Accessibility permissions, needs Node.js + Playwright)
- Update skill behavior docs (daemon-backed, no focus stealing, no clipboard use)
- Add CLI-level tests for `--json` output format and argument parsing edge cases
- **BREAKING**: Remove Swift codebase (`Sources/`, `Package.swift`)
- **BREAKING**: Remove `~/bin/greentap` binary
- Update project CLAUDE.md to remove Swift/AX references

## Capabilities

### New Capabilities
- `cli-json-contract`: Tests that validate `--json` output format (valid JSON, correct fields) for chats, unread, read, search commands
- `cli-arg-parsing`: Tests for argument parsing edge cases (send message joining, missing args, usage errors)

### Modified Capabilities
_None — no spec-level behavior changes. Commands, parsing, and output formats remain the same._

## Impact

- `~/.claude/skills/greentap/SKILL.md` — rewritten for Node.js CLI
- `CLAUDE.md` — remove Swift/AX references, update architecture section
- `Sources/` — deleted (git history preserves it)
- `Package.swift` — deleted
- `~/bin/greentap` — deleted
- `test/cli.test.js` — new test file for CLI-level tests
