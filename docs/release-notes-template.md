# Release-notes template

The mandatory structure for every greentap GitHub release body. Copy the block
below, fill it in, delete any section that has no entries. Notes are written by
hand — `--generate-notes` output is a starting point, not the deliverable.

The release notes are the **most public artifact** of this repo. The privacy
style-guide below is not optional. (Forbidden-token detail lives in
`CONTRIBUTING.md` § "PII patterns".)

---

## Privacy + style rules

- **No PII.** No real names, emails, phone numbers, or chat content. If an
  example is unavoidable, use the established fake personas (Roberto Marini,
  Elena Conti, Famiglia Rossi) or placeholders (`<chat>`, `<maintainer>`).
- **No `/Users/<name>/` paths.** Use `~/.greentap/...` or `<home>/...`. Never
  paste an absolute path that contains a username.
- **No real chat names or IDs.** No real group names, contact references, or
  WhatsApp internal IDs.
- **Numbers, not adjectives.** "Read now scrolls to bottom before snapshot,
  capturing the latest N messages" beats "much better message capture". Use
  measured numbers; avoid raw personal data.
- **Action over implementation.** Describe what the user can now do, not the
  internal refactor that enabled it.
- **Known issues belong in the notes**, not only in the tracker. Surfacing them
  up front is part of the contract with users — concealing them costs more trust
  than admitting them.
- **Link work where it helps.** Reference the PR/issue (`#NN`) for non-trivial
  bullets.

---

## Template (copy from here)

```markdown
# vX.Y.Z — <short title>

<One-paragraph headline — the 1–2 things a reader cares about most.>

## Highlights

- Lead bullet: the headline change, in user terms.
- Second-most-important change.

## All changes

- One bullet per user-visible change. Lead with the command/flag/field, then a
  one-line "what it does". Link the PR (#NN).
- (Derive from `git log <prev-tag>..vX.Y.Z --oneline`. Trim trivial/chore
  commits. Group by category if the list is long.)

## Upgrade notes

- Backward-compat statement (default for a minor/patch: "CLI surface and JSON
  output are backward-compatible").
- Anything the user must do manually: re-login (QR scan), new on-disk artifacts
  under `~/.greentap/`, contract changes.
- If git history was rewritten on `main` for PII reasons, say so: consumers with
  an old clone must re-clone or `git fetch && git reset --hard origin/main`.
- If nothing: "None."

## Known limits

- Issues shipping with this release, one bullet each, link the issue (#NN).
- Carry-over warnings from `CONTRIBUTING.md` / `SKILL.md` / `ROADMAP.md` that
  still apply (e.g. low-volume personal use only; aria-snapshot structure may
  change with WhatsApp Web updates).
```
