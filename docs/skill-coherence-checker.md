# Skill Coherence Checker

A subagent prompt template that audits `.claude/skills/greentap/SKILL.md` against the actual public surface of the codebase. Run before every release tag, and as part of the PR checklist for any change that adds a new command or new JSON field.

## When to run

- Before tagging a release (`v0.x.0`) — mandatory
- For any PR that adds a new exported command in `lib/commands.js` (the `greentap.js` dispatcher), a new `--flag` to an existing command, or a new field on `read --json` output — recommended
- Manually: `/coherence-check` (alias if the maintainer wires it)

## What it checks

The subagent compares three sources of truth:

1. **`greentap.js`** — the CLI dispatcher's `case "<name>":` blocks define the user-visible command list
2. **`lib/commands.js`** — exported functions define the underlying API; their parameter names define `--flag` names; their return shapes define the JSON output schema
3. **`lib/parser.js`** — `parseMessages` return shape defines per-message JSON fields

Against:

4. **`.claude/skills/greentap/SKILL.md`** — the agent-facing documentation that downstream tooling reads to decide what to call

## Coherence rules

A SKILL.md is coherent when:

- Every `case "<name>"` in `greentap.js` is documented in SKILL.md's `Commands` section, with at minimum a one-line description and the typical `--json` invocation
- Every `--flag` accepted by a command is mentioned in its example or behavior block
- Every field in the message JSON schema (parser output) is in the schema table — including `null`-able fields and their semantics
- New commands flagged with hard-stop semantics (e.g. requires `GREENTAP_E2E=1`) call that out explicitly

## Subagent prompt template

```
You are auditing greentap's SKILL.md for coherence with the codebase.

## Step 1 — Inventory the codebase

Read these files in their entirety:
- `greentap.js` — extract every `case "<name>":` and its dispatched function call
- `lib/commands.js` — extract every `export async function <name>` / `export function <name>` plus their parameter names and JSDoc return shapes
- `lib/parser.js` — find `parseMessages` and identify every distinct field it can emit on a message object (including null-able / additive fields)

Produce three lists:
- COMMANDS = [name, dispatcher_args, exported_fn]
- FLAGS = [(command, flag_name)]
- MESSAGE_FIELDS = [(field, type, semantics_in_one_line)]

## Step 2 — Read SKILL.md

`.claude/skills/greentap/SKILL.md` — extract:
- DOCUMENTED_COMMANDS = the names appearing in the Commands section
- DOCUMENTED_FLAGS = the flags shown in any example or the schema table
- DOCUMENTED_FIELDS = the rows of the "Read output schema" table (or equivalent)

## Step 3 — Diff

- Commands missing from SKILL.md = COMMANDS − DOCUMENTED_COMMANDS
- Commands in SKILL.md that don't exist in code = DOCUMENTED_COMMANDS − COMMANDS
- Flags missing = FLAGS − DOCUMENTED_FLAGS
- Fields missing = MESSAGE_FIELDS − DOCUMENTED_FIELDS
- Fields in SKILL.md that no longer exist = DOCUMENTED_FIELDS − MESSAGE_FIELDS

## Step 4 — Report

Output a JSON-shaped report:

{
  "verdict": "COHERENT" | "GAPS",
  "missing_commands": [...],
  "stale_commands": [...],
  "missing_flags": [...],
  "missing_fields": [...],
  "stale_fields": [...],
  "recommended_diff": "a unified diff against SKILL.md that closes the gaps (or empty if COHERENT)"
}

Do NOT modify any files. Do NOT propose code changes outside SKILL.md. Do not infer features from SKILL.md alone — code is the source of truth.
```

## Integration

- `.github/pull_request_template.md` includes a checkbox referencing this doc
- `CONTRIBUTING.md` § "Adding a new chat-targeting command" cross-references this checker
- Phase 11 (ROADMAP) plans to promote this from a checklist item to a CI step before tagging v0.5.0

## False positives

The diff approach is structural. Acceptable false positives:

- Internal helpers prefixed `_` or starting with lowercase that are not part of the command surface (the CLI dispatcher is the source of truth — only commands listed in `greentap.js` are user-facing)
- Test-only fields (e.g. ones that show up in fixtures but never in real output) — flag as advisory, not gap
- Fields that are intentionally deprecated but still emitted — should be kept in SKILL.md with a "(deprecated)" marker

## Cost

A single subagent invocation, ~3 minutes wall clock, ~10K tokens. Cheap enough to run every release. CI integration would make it free per-PR.
