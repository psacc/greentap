## Context

greentap has two implementations: Swift/AX (legacy, at `Sources/` + `~/bin/greentap`) and Node.js/Playwright (current, at `greentap.js`). The Claude Code greentap skill at `~/.claude/skills/greentap/SKILL.md` still references the Swift binary. Phase 3 completed the Playwright daemon — all commands work via `node greentap.js` with full parity and better performance.

## Goals / Non-Goals

**Goals:**
- Migrate the greentap skill to use `node greentap.js`
- Add CLI-level tests for JSON output contracts and arg parsing
- Remove Swift codebase and binary cleanly
- Update all docs to reflect Node.js-only architecture

**Non-Goals:**
- Change any command behavior or output format
- Add new commands or features
- Modify parser logic or existing parser tests
- Move the skill into the repo (it stays global at `~/.claude/skills/greentap/`)

## Decisions

### 1. Test approach: mock-based CLI tests, not E2E

CLI-level tests will validate JSON output format and argument parsing by either:
- **JSON contract tests**: import `commands.js` functions directly, feed them a mock page that returns fixture aria snapshots, assert the returned objects have correct shape
- **Arg parsing tests**: spawn `node greentap.js` with various args, assert exit codes and stderr for usage errors (no browser needed)

**Why not E2E**: E2E requires a running WhatsApp session — fragile, slow, not suitable for CI. The parser tests already cover snapshot→data. These new tests cover data→JSON and args→command dispatch.

**Alternative considered**: Testing via `child_process.exec` for all tests. Rejected because import-based tests are faster and give better error messages. Subprocess tests only for arg parsing where we need to test the actual CLI entrypoint.

### 2. Skill rewrite, not patch

The skill SKILL.md will be rewritten from scratch rather than patched. The prerequisites, commands, behavior, and guidelines all change. A rewrite is clearer and avoids stale references.

### 3. Swift removal order: skill first, then delete

Update the skill before deleting Swift code. This way, if something is missed in parity, the Swift code is still available for reference. Delete Swift only after skill + tests are confirmed working.

## Risks / Trade-offs

- **One-way door: Swift deletion** → Git history preserves it. Tag the commit before deletion for easy recovery.
- **`~/bin/greentap` binary left behind** → Must be explicitly deleted as a task step. Not tracked by git.
- **Skill not in repo** → Changes to `~/.claude/skills/greentap/SKILL.md` are not version-controlled. Acceptable for a personal tool; the skill content is documented in this change.
