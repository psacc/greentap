---
name: review-docs
description: |
  Three-lens documentation review: dev process, domain accuracy, and markdown quality.
  Use when the user wants to:
  - Review docs for accuracy, structure, and quality
  - Check docs before committing
  - Validate roadmaps, READMEs, specs, or design docs
  Triggers: "review docs", "review this doc", "check this md", "review roadmap",
  "docs review", "review-docs"
---

# review-docs — Three-lens documentation reviewer

Review a markdown file through three specialist lenses using a single subagent.
Return a consolidated report with issues and suggestions.

## Input

The user provides one or more markdown file paths (or you detect them from git status / recent changes).

## How to run

Launch a single `general-purpose` Agent with the prompt below, substituting `FILE_PATH` with the target file(s).

### Agent prompt template

```
You are a documentation reviewer with three lenses. Review the file `FILE_PATH` through each lens and produce a single consolidated report.

## Lens 1: Dev process specialist
- Are tasks actionable and unambiguous?
- Is scope well-defined (not too broad, not too narrow)?
- Any tasks that should be split or merged?
- Are completed items clearly distinguished from upcoming?
- Is the progression realistic? Are dependencies clear?
- Are one-way doors flagged?

## Lens 2: Domain specialist
- Is the content accurate given the current state of the codebase?
- Are there stale references (completed work described as future, wrong paths, outdated decisions)?
- Are risks accurate and complete?
- Are there missing sections or gaps?
- Do prerequisites and blockers make sense?

## Lens 3: Markdown conventions specialist
- Heading hierarchy consistency
- List formatting (indentation, markers)
- Table formatting
- Consistent use of checkboxes, strikethrough, bold
- Any rendering issues (broken links, unescaped characters)
- Mermaid diagram syntax (if present)

## Output format
For each lens, list:
- **Issues** (things that should be fixed) — with specific line references
- **Suggestions** (nice-to-have improvements)

Keep it concise. No fluff. Prioritize issues over suggestions.
```

## After the review

Present the findings to the user, triaged as:
- **Fix now** — stale/wrong info, broken formatting, ambiguous tasks
- **Consider** — suggestions worth discussing
- **Skip** — minor style nits not worth a change

Apply fixes only if the user confirms.
