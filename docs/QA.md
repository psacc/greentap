# QA — Agentic QA Runbook

How greentap uses an LLM subagent for pre-release QA. This is the runbook the
maintainer follows on every release-prep PR. It complements — does not replace
— `npm test` and the live `e2e` harness.

## 1. Purpose + why

`npm test` enforces correctness of pure logic (parser, arg parsing, JSON
contract shape, e2e-guard enforcement) in isolation. `GREENTAP_E2E=1 node
greentap.js e2e` verifies a **single live roundtrip** (text → image → link)
against the sandbox group. Neither verifies **product-level sanity across the
whole command surface**: does every user-facing command exit cleanly on bad
args, emit a helpful (not stack-trace) error, and keep its `--json` shape
stable? Does a refactor silently change an error message or drop a JSON key?

Agentic QA closes that gap. A subagent walks every command with one golden and
one designed-to-fail invocation, scores exit code / JSON shape / error quality,
overlays the git-log risk since the last tag, and reports findings. It is one
more cheap gate.

**Motivating pattern** (borrowed from the omnisess QA runbook): code that
compiles, passes CI, and still produces wrong output — e.g. an error message
that leaks a stack trace, a `--json` invocation that prints human text, or a
flag that's silently parsed into the chat name. Unit tests with mocked pages
do not catch these end-to-end; a subagent invoking the real binary does.

The agent does not replace human review. **FAIL blocks the merge.**

## 2. When it runs

- **Mandatory:** on every release-prep PR, **after `npm test` is green**,
  **before merge**. The prep PR is the gate.
- **Optional:** after a large refactor on `main`, as a smoke check.

This sits alongside the existing pre-tag checklist in `CONTRIBUTING.md`
("Pre-tag checklist"). Agentic QA is the product-sanity layer on top of
`npm test` + live `e2e`. It does NOT replace the mandatory live `e2e` run.

## 3. Data policy (PII constraint)

**greentap reads real WhatsApp data during the LIVE checks** (`chats`,
`unread`, `search`, `read`, `whoami` all surface real contacts, group names,
message text, and the maintainer's own phone number). The repo is **public**.

**Hard constraint on the agent's report content — never write PII into the
report:**

| Allowed | Forbidden |
|---|---|
| Exit codes (`0`, `1`, `2`, `3`) | Message text / chat content (verbatim or paraphrased) |
| Counts (e.g. "chats returned N rows", "read returned M messages") | Real chat or group names — use `<chat-1>`, `<group-A>` |
| Wallclock times | Real contact / sender names — use the fake personas only |
| Structural shape ("keys: name, time, unread, lastMessage") | Phone numbers (incl. the account's own number from `whoami`) |
| Boolean assertions ("`--json` parses as valid JSON: yes") | Absolute paths past the **basename** (`<imageId>.png` ✅, `/Users/<name>/.greentap/...` ❌) |
| Error class / first line of stderr **if structural** | Any verbatim output excerpt longer than one line |
| Fake personas: Roberto Marini, Elena Conti, Famiglia Rossi | Link preview hrefs pointing at real domains the user visits |

If a check needs a chat name as input, use the **sandbox group**
(`greentap-sandbox`) or a fake-persona placeholder — never a real chat.

The OFFLINE matrix (§4) is PII-free by construction: it never connects to a
live session, so no real data can enter the report. Prefer offline checks; the
LIVE section (§5) is the only place real data is touched, and there the
e2e harness already emits structural-only JSON.

## 4. OFFLINE matrix (no live WhatsApp)

For each command: one **golden** invocation and one **designed-to-fail**
invocation that run **without** a live session. Assert four things per row:

1. **Exit code** matches the expectation.
2. **`--json` shape** — when the command supports `--json`, the golden path
   prints a single line of valid JSON with the documented keys (verify the
   keys, never the values).
3. **Helpful error on bad args** — the failure path prints a `Usage:` line (or
   a clear one-line message) to **stderr**, not stdout.
4. **No stack-trace leak** — stderr on the failure path must NOT contain a
   Node stack trace (`at Object.<anonymous>`, `at file://`, `node:internal`).
   The top-level catch in `greentap.js` formats as `greentap error: <msg>` —
   anything raw is a finding.

### How to run the offline checks safely

Most commands that target a chat will try to `connect()` to the daemon and open
a live session — which would touch real data and is **not** offline. Keep those
in the LIVE section. The offline matrix targets exactly the paths that fail
(or print help) **before** any browser work:

- **Arg-parsing failures** (missing required arg) — `greentap.js` prints
  `Usage:` and `process.exit(1)` in the `switch` **before** calling
  `withDaemon`. These are pure and offline-safe.
- **Help / unknown command** — the `default` branch prints the usage block to
  stdout with exit `0`. Offline-safe.
- **`status`** — calls `daemonStatus()` only (reads a lockfile); no browser.
  Offline-safe whether or not a daemon is running.
- **`e2e` guard** — `greentap.js e2e` **without** `GREENTAP_E2E=1` prints
  `e2e requires GREENTAP_E2E=1` to stderr and exits `1` before any browser
  work. Offline-safe.
- **`daemon` (bare)** — `greentap daemon` with no subcommand prints
  `Usage: greentap daemon stop` (stdout, exit `0`). Offline-safe.

For the **JSON-shape golden** of read-type commands (`chats`, `unread`,
`read`, `search`, `whoami`, `poll-results`), do NOT spin up a live session in
the offline phase. Instead assert the shape from the **unit test contract**
(`test/cli.test.js` "JSON contract" describes) which exercises
`parseChatList` / `parseMessages` / `parseSearchResults` / `whoami` against
fixtures and asserts `JSON.stringify` round-trips. Treat "the JSON-contract
tests in `npm test` are green" as the offline JSON-shape assertion, and route
the live-data shape confirmation to §5.

| Command | Golden (offline) | Designed-to-fail (offline) | Asserts | Live? |
|---|---|---|---|---|
| `chats` | JSON shape via `npm test` "JSON contract: chats" | — | keys: `name,time,unread,lastMessage` round-trip as JSON | live golden → §5 |
| `unread` | JSON shape via `npm test` "JSON contract: unread" | — | same keys, `unread:true` subset | live golden → §5 |
| `read` | JSON shape via `npm test` "JSON contract: read" | `greentap read` (no chat) → stderr `Usage: greentap read …`, exit `1` | message keys round-trip; usage on missing arg; no stack trace | live golden → §5 |
| `search` | JSON shape via `npm test` "JSON contract: search" | `greentap search` (no query) → stderr `Usage: greentap search …`, exit `1` | result keys; usage on empty query | live golden → §5 |
| `poll-results` | shape via parser unit tests | `greentap poll-results` (no chat) → stderr `Usage: greentap poll-results …`, exit `1` | usage on missing arg; no stack trace | live golden → §5 |
| `fetch-images` | n/a offline (needs live blobs) | `greentap fetch-images` (no chat) → stderr `Usage: greentap fetch-images …`, exit `1` | usage on missing arg; no stack trace | live golden → §5 (image stage) |
| `send` | n/a offline (mutating) | `greentap send <chat>` (no message) → stderr `Usage: greentap send …`, exit `1`; `greentap send` (no args) → same | usage on <2 args; no stack trace | live golden → §5 (text stage) |
| `whoami` | shape `{name,phone}` via `npm test` whoami contract | — | `JSON.stringify` → `{name,phone}` (both nullable) | live golden → §5 |
| `status` | `greentap status` → stdout `Daemon running…` or `No daemon running.`, exit `0` | — | clean exit; no browser; no PII | offline ✅ |
| `snapshot` | n/a offline (needs live DOM) | (no offline failure path — defaults to `full` scope) | — | live → §5 (or skip; diagnostic only) |
| `e2e` | n/a (live by definition) | `greentap e2e` **without** `GREENTAP_E2E=1` → stderr `e2e requires GREENTAP_E2E=1`, exit `1` | guard fires before browser; clean message | live golden → §5 |
| `daemon` | `greentap daemon stop` → stdout `Daemon stopping…` or `No daemon running.`, exit `0` | `greentap daemon` (bare) → stdout `Usage: greentap daemon stop`, exit `0` | clean exit; no browser | offline ✅ |
| `login` | n/a — launches a headed browser for QR scan; cannot assert headless | — | document as manual-only | manual (not automated) |
| `logout` | n/a — destructive (clears `~/.greentap/browser-data`); never run in QA | — | document as destructive; do NOT invoke | never |
| (help) | `greentap badcmd` or `greentap --help`-style → stdout usage block, exit `0` | — | usage printed; clean exit | offline ✅ |

Notes:

- **`logout` is destructive** (wipes the session). The QA agent MUST NOT run
  it. Listed for completeness only.
- **`login` opens a headed browser** and blocks on a window-close event. Not
  automatable headless — manual smoke only.
- For commands marked "live golden → §5", the offline phase only runs the
  **failure path** + relies on `npm test` for JSON-shape; the **golden live
  data** confirmation is the `e2e` harness in §5.

## 5. LIVE checks

**Do not reinvent the roundtrip.** Defer to the existing harness:

```bash
GREENTAP_E2E=1 node greentap.js e2e
```

It runs ordered stages against the `greentap-sandbox` group; first failure
aborts. Output is structural JSON only (counts, paths, booleans — no message
content). Exit codes: `0` pass · `1` stage failed · `2` sandbox missing ·
`3` rate-limited (60s min between runs; override
`GREENTAP_E2E_SKIP_RATE_LIMIT=1` for local debugging only).

A `0` exit code is **necessary but not sufficient** — the feature's stage must
have actually **run and passed** (not skipped). Read the stdout stage list.

| Stage | Covers (exercised commands) | Known risk it guards |
|---|---|---|
| `preflight` | `navigateToChat` cold-state (grid-or-search, R5 fast-path) | "Chat not found" when a chat is already open (grid picks the message-panel grid); sandbox-group reachability |
| `text` | `send` + `read` roundtrip | multi-line `Shift+Enter` send; `sender: "You"` own-message detection; read-returns-`[]` retry path; scroll-to-bottom materialization (Ponte 1-5-26 bug) |
| `image` | `fetchImages` (attach correct photo input, not sticker) + blob extraction | wrong file-input targeted (sticker vs photo); revoked blob URLs; `--limit`/`slice(-N)` ordering |
| `link` | `read` with `withLinks` + `collectRowLinks` + `mergeLinksIntoMessages` | URL-only message alignment by timestamp; greedy-monotone link merge |

### Multimodal image-legibility check (mandatory when the image stage runs)

After the `image` stage passes it emits `imagePath` and a `multimodalCheck`
hint. The QA agent MUST `Read()` that path and confirm the text
**`GREENTAP-E2E`** is legible in the pixels. A CLI `pass` with a blank or
unreadable image means the pipeline is broken — record it as a **FAIL**.

When reporting the multimodal result, follow §3: report only the basename
(`<imageId>.png`) and the boolean ("GREENTAP-E2E legible: yes"), never the full
path.

### Live JSON-shape golden

Optionally, against the **sandbox only** (E2E guard restricts every
chat-targeting command to `greentap-sandbox`), confirm the live `--json`
shapes:

```bash
GREENTAP_E2E=1 node greentap.js read greentap-sandbox --json
GREENTAP_E2E=1 node greentap.js chats --json   # guard filters to sandbox row
```

Report only the **key set** and **row count**, never the values.

## 6. Risk overlay — what changed since the last tag

Compute the delta and exercise each change:

```bash
last_tag=$(git tag --sort=-v:refname | head -1)
git log "$last_tag"..HEAD --oneline
git diff --stat "$last_tag"..HEAD
```

| Commit type | Action |
|---|---|
| `feat:` | Identify the command/area; add one **deeper** offline exercise (more flags, `--index`, `--scroll`, `--limit`, `--json` combos). If it touches a live path, ensure the matching `e2e` stage runs. |
| `fix:` | **Re-run the bug scenario** from the commit/PR body and confirm the fix is live (the bug no longer reproduces). |
| `refactor:` | Re-run the touched command's regression suite (its unit tests) + the matching `e2e` stage if it touches a guarded path. |

### Path-touched → re-exercise map

| Path in diff | Re-exercise |
|---|---|
| `lib/parser.js` | `npm test` parser suite **and** live `e2e` text+link stages (read shape depends on parser) |
| `lib/commands.js` | the affected command's offline failure path + the matching `e2e` stage (`send`→text, `fetchImages`→image, `read`→text/link, `navigateToChat`→preflight) |
| `lib/client.js` / `lib/daemon.js` | `status` offline + daemon lifecycle; a full `e2e` run (preflight must actually connect, not just lockfile-check) |
| `lib/locale.js` | live `e2e` (locale detection runs against the live chat list) + parser suite |
| `lib/e2e.js` / `lib/e2e-guard.js` | `npm test` e2e-guard enforcement suite + a full `e2e` run |
| `greentap.js` | the offline arg-parsing matrix in §4 (every `Usage:` and exit code) |
| `test/fixtures/**` | `npm test` (fixtures are the parser's golden inputs) + the stage that consumes the fixture |

Per `CONTRIBUTING.md`, any PR touching `lib/**` or `test/fixtures/**` MUST have
already passed live `e2e` with the feature's stage active. The risk overlay
re-confirms this at release-prep time across the cumulative `main` state.

## 7. Performance budgets

Measure wallclock per command (`/usr/bin/time -p`, or `time` in the shell).

| Threshold | Outcome |
|---|---|
| `< 5 s` | PASS — silent |
| `5 s ≤ t < 30 s` | PASS-WITH-NOTES — flag in report |
| `t ≥ 30 s` | FAIL — likely hung |

**Daemon cold-start caveat.** greentap is daemon-backed: the first command
after the daemon idle-shuts-down (15-min idle timeout) pays the Chrome
cold-start cost — empirically **15-30 s**. That first call can legitimately
land in PASS-WITH-NOTES or near the FAIL line without indicating a regression.

**Warm the daemon before timing** so budgets measure steady-state, not
cold-start:

```bash
node greentap.js status        # cheap; does NOT start the daemon
GREENTAP_E2E=1 node greentap.js e2e   # warms the daemon (preflight connects)
# now time the commands you care about
```

If you measure a command that triggered the cold start, note it explicitly
("first call after idle — cold start ~Ns") rather than recording a FAIL.

## 8. PII allow/forbid table (report content)

Repeated here as the agent's quick reference — see §3 for the rationale.

| Allowed in the report | Forbidden in the report |
|---|---|
| Exit codes | Message text / chat content |
| Counts (rows, messages, images) | Real chat / group names |
| Wallclock times | Real contact / sender names |
| Structural shape (key lists) | Phone numbers (incl. the account's own) |
| Boolean assertions | Absolute paths past the basename |
| First line of stderr **if structural** | Any verbatim excerpt > one line |
| Fake personas (Roberto Marini, Elena Conti, Famiglia Rossi) | Real link-preview hrefs |

When in doubt, redact to a placeholder (`<chat-1>`, `<group-A>`,
`<imageId>.png`).

## 9. Agent prompt template

Copy-paste this into a Claude Code session when spawning the QA subagent.
Fill `{{VERSION}}`, `{{PR}}`, `{{LAST_TAG}}`.

```text
You are the greentap release QA agent. Walk every user-facing command and
produce a structured QA report for release {{VERSION}}, prep PR #{{PR}}.
Last release tag: {{LAST_TAG}}.

## Setup (once)
1. cd to the repo root.
2. Confirm npm test is green:  npm test
3. Confirm the version:  node -p "require('./package.json').version"  (== {{VERSION}})
4. Compute the change delta:
     git log {{LAST_TAG}}..HEAD --oneline
     git diff --stat {{LAST_TAG}}..HEAD

## OFFLINE matrix (docs/QA.md §4) — run these; they need NO live session
- For each row's designed-to-fail invocation, capture: exit code, whether
  stderr has a `Usage:`/clear message, and that stderr has NO Node stack trace.
  Examples:
    node greentap.js read                     # expect exit 1, "Usage: greentap read"
    node greentap.js send <chat>              # expect exit 1, "Usage: greentap send"
    node greentap.js search                   # expect exit 1, "Usage: greentap search"
    node greentap.js poll-results             # expect exit 1, "Usage: greentap poll-results"
    node greentap.js fetch-images             # expect exit 1, "Usage: greentap fetch-images"
    node greentap.js e2e                      # expect exit 1, "e2e requires GREENTAP_E2E=1"
    node greentap.js daemon                   # expect exit 0, "Usage: greentap daemon stop"
    node greentap.js status                   # expect exit 0, clean
    node greentap.js badcmd                   # expect exit 0, usage block
- For JSON-shape goldens of read-type commands, rely on the npm test
  "JSON contract" describes (do NOT open a live session in this phase).
- NEVER run `node greentap.js logout` (destructive) or `login` (headed/manual).

## LIVE checks (docs/QA.md §5) — defer to the harness, do NOT reinvent
    GREENTAP_E2E=1 node greentap.js e2e
- Confirm exit 0 AND that the stage(s) touching this release's changes actually
  RAN (read the stdout stage list — not skipped/preflight-only).
- When the image stage runs: Read() the emitted imagePath and confirm the text
  "GREENTAP-E2E" is legible. Report only the basename + a boolean.

## Risk overlay (docs/QA.md §6)
- For each feat/fix/refactor since {{LAST_TAG}}, add the exercise the table
  prescribes; map path-touched -> stage/command and re-run it.

## Performance (docs/QA.md §7)
- Warm the daemon first (run e2e once), THEN time commands. Cold start (15-30s
  after idle) is a NOTE, not a FAIL.

## Data policy (docs/QA.md §3 + §8) — CRITICAL
Your report MUST NOT contain: message text, real chat/group names, real
contact/sender names, phone numbers (incl. the account's own), absolute paths
past the basename, or any verbatim output excerpt longer than one line.
You MAY include: exit codes, counts, wallclock, structural key lists, boolean
assertions, and the first structural line of stderr. Redact to placeholders
(<chat-1>, <group-A>, <imageId>.png). Use only the fake personas
(Roberto Marini, Elena Conti, Famiglia Rossi) if a name is needed.

## Output
- Write the full report to:  qa-reports/{{VERSION}}.md  (format in §10).
- Emit (do NOT post) a single verdict line at the very end of your response,
  on its own line, exactly one of:
     QA: pass
     QA: pass with N notes
     QA: fail — <one-clause summary>
- Do NOT call `gh`. Return the report path + the verdict line. The MAINTAINER
  posts it to the PR.

Return to the maintainer:
1. Path to the local report.
2. The one-line verdict.
3. Nothing else.
```

## 10. Output

The agent writes the full report to:

```
qa-reports/<version>.md
```

> **Gitignore flag (action for the maintainer):** `qa-reports/` should be
> **gitignored** — reports describe runs against real WhatsApp data and the
> repo is public. As of this writing `.gitignore` does NOT contain a
> `qa-reports/` entry. **Add `qa-reports/` to `.gitignore` before the first
> report is generated.** (This runbook does not edit `.gitignore` itself.)

### Report format (`qa-reports/<version>.md`)

```markdown
# QA Report — vX.Y.Z (prep PR #NN)

_Generated: <UTC timestamp>_
_Last release: <last tag>_
_Host: darwin_

## Outcome: <PASS | PASS-WITH-NOTES | FAIL>

<one-paragraph summary — PII-free>

## Offline matrix
| Command | Invocation | Exit | Stack-trace-free | Outcome | Observation |
|---|---|---|---|---|---|
| read (fail path) | `read` (no chat) | 1 | yes | PASS | stderr first line: `Usage: greentap read …` |
| ... | | | | | |

## Live (e2e)
| Stage | Ran | Exit | Outcome | Observation |
|---|---|---|---|---|
| preflight | yes | — | PASS | sandbox reachable |
| text | yes | — | PASS | marker round-tripped, sender=You |
| image | yes | — | PASS | GREENTAP-E2E legible: yes (<imageId>.png) |
| link | yes | — | PASS | marker href matched |

## Risk overlay (since <last tag>)
`<commit subject>` (feat/fix/refactor) — exercise: `<command/stage>` — outcome — <observation>

## Performance notes
<empty if all < 5s after warm-up; flag cold starts explicitly>

## Skipped
- `login` — manual only (headed browser)
- `logout` — destructive, never run
```

### Verdict + posting boundary

The agent emits **one** verdict line as text; the **maintainer** posts it to
the PR. The agent never calls `gh`.

| Outcome | Verdict line | Action |
|---|---|---|
| **PASS** | `QA: pass` | Merge once human review is also OK + merge protocol satisfied. |
| **PASS-WITH-NOTES** | `QA: pass with N notes` | Read the notes; decide block-or-land. Document the call in the prep PR body if shipping anyway. |
| **FAIL** | `QA: fail — <one-clause summary>` | **Blocks merge.** Fix, re-run QA, re-status. |

`QA: fail` blocks the merge. No exceptions. The full report stays local at
`qa-reports/<version>.md`; only the one-line verdict goes on the PR.

This agent-emits / maintainer-posts split is a deliberate autonomy boundary
(consistent with the iron-clad merge protocol in `CLAUDE.md` and
`CONTRIBUTING.md`). The QA verdict informs the merge decision; it never makes
it.
