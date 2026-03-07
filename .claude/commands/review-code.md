---
name: "Review: Code"
description: Code review sub-agent. Run before committing a completed feature to check correctness, structure, and test coverage.
category: Review
tags: [review, quality]
---

Code review for the current change.

**Steps**

1. **Identify the active openspec change**

   ```bash
   openspec list --json
   ```

   If multiple active changes, ask user which one. If one, use it.

2. **Read the openspec artifacts**

   Read all available artifacts for the change:
   - `openspec/changes/<name>/proposal.md`
   - `openspec/changes/<name>/design.md`
   - `openspec/changes/<name>/specs/` (all spec files)
   - `openspec/changes/<name>/tasks.md`

3. **Read the diff**

   ```bash
   git diff HEAD
   git diff --cached
   ```

   If both are empty, diff against the last commit:
   ```bash
   git diff HEAD~1
   ```

4. **Evaluate**

   Check the diff against the specs:
   - **Correctness**: Does the code match the spec scenarios (WHEN/THEN)?
   - **Structure**: Is pure parsing separated from browser automation?
   - **Test coverage**: Are parser functions tested against fixtures?
   - **Edge cases**: Empty inputs, missing fields, locale variations handled?
   - **Spec adherence**: Any spec requirements missed or diverged from?

5. **Output**

   ```
   ## Code Review: <change-name>

   ### BLOCKERS (must fix before commit)
   - <issue> or "None"

   ### ADVISORY (suggestions, not blocking)
   - <suggestion> or "None"
   ```

**Guardrails**
- Only flag blockers for real correctness or spec violations, not style preferences
- Advisory items are informational — don't block on them
- If no openspec change exists, review the diff standalone
- Do NOT make any code changes — this is review only
