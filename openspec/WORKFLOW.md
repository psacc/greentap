# openspec workflow — greentap

Single-user project, no PRs. Reviews happen locally via Claude sub-agents before merge to main.

## Change lifecycle

```
proposal.md → design.md → tasks.md → implement → review → commit to main → archive
```

### 1. Proposal

Create `openspec/changes/<date>-<slug>/proposal.md`:
- Why, What Changes, Capabilities (new/modified), Impact

### 2. Design

Create `design.md` in the same directory:
- Context, Goals/Non-Goals, Decisions (with rationale + alternatives), Risks

### 3. Tasks

Create `tasks.md` — ordered checklist, grouped by phase.
Mark tasks as they complete: `- [x]`.

### 4. Implement

Work through tasks. Specs for each capability go in `specs/<capability>/spec.md`
using WHEN/THEN scenarios.

### 5. Review

Before committing a completed feature, run both review commands:

```
/review-code
/review-security
```

Both reviewers read the openspec (proposal + design + specs) and the diff.
Fix any blockers. Advisory findings are logged but don't block.

### 6. Archive

Move completed change directory to `openspec/changes/archive/`.

## Review gates

| Reviewer | Focus | Blocks commit? |
|----------|-------|----------------|
| code-reviewer | correctness, structure, test coverage, adherence to specs | Yes (blockers only) |
| security-reviewer | injection, data leaks, credential handling, automation fingerprint | Yes (blockers only) |

Advisory findings from either reviewer are tracked as TODOs, not blockers.
