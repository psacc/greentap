---
name: "Review: Security"
description: Security review sub-agent. Run before committing a completed feature to check for credential leaks, injection risks, and automation fingerprint.
category: Review
tags: [review, security]
---

Security review for the current change.

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

   Check the diff for:
   - **Credential handling**: No secrets in code, session data only in `~/.greentap/`, no tokens logged
   - **Injection**: No user input passed unsanitized to shell, `eval()`, or `page.evaluate()`
   - **Automation fingerprint**: `--disable-blink-features=AutomationControlled` used, no `navigator.webdriver` leaks
   - **Data exposure**: No message content logged to files, no telemetry, no external calls
   - **Dependencies**: No unnecessary deps, Playwright version pinned

5. **Output**

   ```
   ## Security Review: <change-name>

   ### BLOCKERS (must fix before commit)
   - <issue> or "None"

   ### ADVISORY (suggestions, not blocking)
   - <suggestion> or "None"
   ```

**Guardrails**
- Only flag blockers for real security risks, not theoretical edge cases
- Advisory items are informational — don't block on them
- If no openspec change exists, review the diff standalone
- Do NOT make any code changes — this is review only
