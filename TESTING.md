# Testing greentap

greentap has three test layers, each closing a different gap:

| Layer | Command | Catches |
|-------|---------|---------|
| **Unit** | `npm test` | parser/logic regressions against recorded fixtures |
| **E2E** | `GREENTAP_E2E=1 node greentap.js e2e` | real round-trip break (send/read/image/link) against the sandbox |
| **Visual QA gate** | agent-governed (this doc) | **semantic** drift — does the extracted JSON faithfully represent what the UI actually shows? |

`npm test` and `e2e` prove the code *runs* and *round-trips*. Neither proves the
JSON is *semantically correct*: a parser can confidently return a clean-looking
message whose `sender` is the wrong person, whose quoted reply was silently
dropped, or whose body absorbed the quoted author's name. Those failures only
surface when you compare the JSON against the pixels. That comparison is the
visual QA gate.

This gate was added after a 2026-06-20 QA run found three sender-attribution
bugs (phone number leaking into `sender`, quote-reply cards not parsed, own
messages mislabeled) that **all unit tests and e2e passed straight through** —
because the fixtures encoded the same wrong assumptions the parser made. Only a
screenshot-vs-JSON comparison caught them.

---

## When to run the visual QA gate

- **Mandatory** on every release-prep, before `git tag` (it is item 8 of the
  CONTRIBUTING.md pre-tag checklist).
- **Strongly recommended** for any PR touching `lib/parser.js` or
  `lib/commands.js` — the fixtures can lie; the pixels can't.
- Optional otherwise.

Pick a **representative chat**: a busy **group** with quote-replies, unsaved
contacts (so phone-number/`~` handling is exercised), emoji, and at least one of
your own messages. A 1:1 chat is not sufficient — most attribution bugs live in
groups.

---

## Data / PII policy (strict — public repo)

The screenshot and the JSON contain **real names, phone numbers, and message
content**. Therefore:

- The screenshot output dir (`qa-visual-out/`, or a `/tmp` scratch dir) is
  **never committed** and never attached to a PR.
- The **QA report contains structural findings only**: counts, field names,
  bug classes, severities, and message **timestamps** as identifiers. Never
  reproduce names, phone numbers, or verbatim message text (a 2–3 word
  paraphrase to identify a message is fine).
- Any new fixture distilled from a finding uses **fake data only** (see
  CONTRIBUTING.md → PII patterns; fake names like Roberto Marini / Elena Conti,
  fake numbers like `+39 555 0100 200`).

---

## Procedure

```bash
# 0. scratch dir (gitignored / /tmp)
mkdir -p /tmp/gtqa

# 1. extract the JSON (this ALSO opens the chat in the daemon's browser)
node greentap.js read "<Representative Group>" --json > /tmp/gtqa/read.json

# 2. screenshot the now-open conversation pane (high-DPI + legibility bands)
node scripts/qa-visual.mjs --out /tmp/gtqa
#    → writes main-2x.png and band-1.png … band-3.png

# 3. hand both to the QA agent (prompt below); it returns the report
```

Then dispatch a subagent with the **comparator prompt** below, pointing it at
`/tmp/gtqa/band-*.png` (+ `main-2x.png`) and `/tmp/gtqa/read.json`. Run it
**unbiased** — do not tell it what you expect to find.

---

## The comparator agent prompt

> You are an independent QA auditor. Judge only from evidence; assume nothing is
> correct or broken. Verify whether a CLI's extracted JSON is a **semantically
> correct** representation of what a WhatsApp chat shows on screen.
>
> Inputs (local, in-session only — they contain private data; in your report do
> NOT reproduce names, phone numbers, or long verbatim text; identify messages
> by `time` + a short paraphrase; write the report only as your returned text,
> never to a file):
> - Screenshots: `<out>/main-2x.png` and bands `<out>/band-1.png …`
> - Extracted JSON: `<out>/read.json` (array of `{kind, sender, text, time,
>   timestamp, quoted_sender, quoted_text, body, links}`)
>
> For each JSON message (match by `time` + content), check:
> 1. **Sender** exactly matches the author shown in the UI. Flag any `sender`
>    carrying extra tokens — a phone number, a `~`/"Forse"/"Maybe" prefix, or
>    the *quoted* person's name — or simply the wrong person. Own messages must
>    be `"You"`, not a localized self-label.
> 2. **Quote cards**: where the UI shows a quote-reply card (nested box with an
>    original author + text), the JSON must capture it in `quoted_sender` /
>    `quoted_text` — not leave them null with the quoted content bled into
>    `text`/`body`.
> 3. **Body fidelity**: `body` matches the actual message (ignoring emoji
>    rendering); flag bleed, truncation, or loss.
> 4. **Completeness**: any message on screen missing from JSON, or vice-versa.
>
> Output: a findings table (`time | issue class | UI vs JSON`), then a list of
> distinct bug classes with affected-message counts and severity. State plainly
> if everything is correct.

---

## Report format + status rubric

Write the agent's findings into a report (kept local — `qa-reports/` is
gitignored, mirroring omnisess). End with one status line:

| Outcome | Status line | Action |
|---------|-------------|--------|
| No semantic defects | `VISUAL-QA: pass` | proceed to tag once human review OK |
| Cosmetic/edge issues only | `VISUAL-QA: pass with N notes` | maintainer decides whether to block |
| Any wrong `sender`, dropped quote, or lost/extra message | `VISUAL-QA: fail — <class>` | **do NOT tag**; fix + re-run |

A `fail` blocks the release. The fix should land as a normal PR **with a
fake-data fixture** that reproduces the defect, so the regression is captured at
the unit layer too — that is how the 2026-06-20 bugs were closed.

---

## Scope notes

- macOS only (the daemon drives system Chrome; `sips` band-slicing is macOS).
- `scripts/qa-visual.mjs` is a dev/QA helper, not part of the shipped CLI — it
  lives in `scripts/` so it carries no e2e obligation and stays reversible.
- Future: promote the comparator into a `/qa-release` skill once the prompt
  stabilizes; add a first-class `greentap screenshot` command if the CDP helper
  proves too fragile.
