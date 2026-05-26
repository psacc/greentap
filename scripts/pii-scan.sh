#!/usr/bin/env bash
#
# pii-scan.sh — backstop PII scanner for the PUBLIC greentap repo.
#
# This is a SAFETY NET, not a replacement for the manual pre-merge grep
# discipline documented in CONTRIBUTING.md ("PII patterns"). It exists
# because the 2026-04-27 leak happened with manual-grep-only defense.
#
# Design constraint (CONTRIBUTING.md:25): this committed script must NOT
# contain any real PII token. It ships only STRUCTURAL patterns (phone
# shapes, /Users/ paths, task-tracker URLs) plus the documented SYNTHETIC
# allowlist. Identity-specific tokens (maintainer name / email / private
# domain) are read at runtime from a GITIGNORED local file, never from a
# tracked file. Resolution order:
#   1. $GREENTAP_PII_TOKENS (path)
#   2. .git/greentap-pii-tokens
#   3. ~/.greentap/pii-tokens
# Each non-blank, non-'#' line is a literal case-insensitive forbidden
# substring. See scripts/greentap-pii-tokens.example for the format.
#
# Modes:
#   --staged              scan staged (index) content        [default]
#   --range <A>..<B>      scan files changed + commit messages in A..B
#   --worktree            scan all tracked files in the working tree
#   --show                print the offending line (default: redacted)
#
# Exit: 0 = clean, 1 = potential PII found, 2 = usage error.

set -uo pipefail

MODE="staged"
RANGE=""
SHOW=0

while [ $# -gt 0 ]; do
  case "$1" in
    --staged)   MODE="staged" ;;
    --worktree) MODE="worktree" ;;
    --range)    MODE="range"; RANGE="${2:-}"; shift ;;
    --range=*)  MODE="range"; RANGE="${1#--range=}" ;;
    --messages) MODE="messages"; RANGE="${2:-}"; shift ;;
    --show)     SHOW=1 ;;
    -h|--help)
      sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "pii-scan: unknown arg '$1'" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)" || { echo "pii-scan: not a git repo" >&2; exit 2; }

# --- Structural patterns (public-safe; no real PII) ----------------------
# Phone: international-looking sequences. Synthetic doc numbers excluded below.
PHONE='\+[0-9][0-9()  .\-]{8,}[0-9]'
# Absolute macOS home paths — none should ever appear in a public repo.
USERPATH='/Users/[A-Za-z0-9._-]+/'
# Task-tracker URLs / issue keys.
TRACKER='(app\.todoist\.com|todoist\.com/(app|showTask|task)|linear\.app/|[a-z0-9-]+\.atlassian\.net|/browse/[A-Z][A-Z0-9]+-[0-9]+)'
# Synthetic phone allowlist — these are NOT violations:
#  - the documented doc numbers (CONTRIBUTING.md): +39 555…, +1 555…, +39 02 0000…
#  - the established fixture convention: an all-zeros tail (>=3 "00" groups),
#    e.g. +33 6 00 00 00 01 — unambiguously a placeholder, never a real number.
SYNTH_PHONE='\+39[ ]?555|\+1[ ]?555|\+39[ ]?02[ ]?0000|\+39[ ]?555[ ]?010|00[ ]?00[ ]?00'

STRUCT="(${PHONE})|(${USERPATH})|(${TRACKER})"

# --- Identity token file (gitignored) ------------------------------------
TOKENS_FILE=""
for cand in "${GREENTAP_PII_TOKENS:-}" ".git/greentap-pii-tokens" "$HOME/.greentap/pii-tokens"; do
  [ -n "$cand" ] && [ -f "$cand" ] && { TOKENS_FILE="$cand"; break; }
done

TOKEN_PAT=""
if [ -n "$TOKENS_FILE" ]; then
  # Build an alternation of escaped literal tokens for grep -iE.
  TOKEN_PAT="$(grep -vE '^\s*(#|$)' "$TOKENS_FILE" \
    | sed -E 's/[][(){}.^$*+?|\\]/\\&/g' \
    | paste -sd'|' -)"
else
  echo "pii-scan: NOTE — no identity token file found; running STRUCTURAL-only." >&2
  echo "pii-scan:        (set \$GREENTAP_PII_TOKENS or create .git/greentap-pii-tokens" >&2
  echo "pii-scan:         from scripts/greentap-pii-tokens.example to enable name/email checks)" >&2
fi

# Hits are recorded to a temp file, not a shell var: scan_text runs on the
# right side of a pipe (a subshell), so a var counter would not survive.
HITFILE="$(mktemp)"
trap 'rm -f "$HITFILE"' EXIT

emit() { # file  lineno  rule  line
  printf '.\n' >> "$HITFILE"
  if [ "$SHOW" = "1" ]; then
    printf '  %s:%s [%s] %s\n' "$1" "$2" "$3" "$4" >&2
  else
    printf '  %s:%s [%s] (match redacted — rerun with --show locally to view)\n' "$1" "$2" "$3" >&2
  fi
}

scan_text() { # label  <stdin: text with line numbers "N:content">
  local label="$1" line lineno content
  while IFS= read -r line; do
    lineno="${line%%:*}"
    content="${line#*:}"
    # Structural — but drop synthetic phone matches first.
    if printf '%s' "$content" | grep -qE "$STRUCT"; then
      # If the only structural hit is a synthetic phone, skip it.
      local stripped
      stripped="$(printf '%s' "$content" | grep -oE "$PHONE" | grep -vE "$SYNTH_PHONE" || true)"
      if printf '%s' "$content" | grep -qE "(${USERPATH})|(${TRACKER})" || [ -n "$stripped" ]; then
        emit "$label" "$lineno" "structural" "$content"
      fi
    fi
    # Identity tokens.
    if [ -n "$TOKEN_PAT" ] && printf '%s' "$content" | grep -qiE "$TOKEN_PAT"; then
      emit "$label" "$lineno" "identity-token" "$content"
    fi
  done
}

is_text_blob() { # ref:path  -> 0 if text
  ! git show "$1" 2>/dev/null | grep -qclP '\x00' 2>/dev/null
}

scan_file_at() { # ref(":" for index or "SHA:")  path
  local ref="$1" path="$2" blob="$1$2"
  # Skip binary.
  if git show "$blob" 2>/dev/null | grep -qIl . 2>/dev/null; then :; else return 0; fi
  git show "$blob" 2>/dev/null | grep -nE "$STRUCT" 2>/dev/null | scan_text "$path"
  if [ -n "$TOKEN_PAT" ]; then
    git show "$blob" 2>/dev/null | grep -niE "$TOKEN_PAT" 2>/dev/null | scan_text "$path"
  fi
}

case "$MODE" in
  staged)
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      scan_file_at ":" "$f"
    done < <(git diff --cached --name-only --diff-filter=ACM)
    ;;
  worktree)
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      [ -f "$f" ] || continue
      if grep -qIl . "$f" 2>/dev/null; then
        grep -nE "$STRUCT" "$f" 2>/dev/null | scan_text "$f"
        [ -n "$TOKEN_PAT" ] && grep -niE "$TOKEN_PAT" "$f" 2>/dev/null | scan_text "$f"
      fi
    done < <(git ls-files)
    ;;
  range)
    [ -z "$RANGE" ] && { echo "pii-scan: --range needs A..B" >&2; exit 2; }
    B="${RANGE##*..}"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      scan_file_at "$B:" "$f"
    done < <(git diff --name-only --diff-filter=ACM "$RANGE")
    # Commit messages in range.
    git log "$RANGE" --format='%H%x09%s%x09%b' 2>/dev/null \
      | grep -nE "$STRUCT" | scan_text "commit-message"
    if [ -n "$TOKEN_PAT" ]; then
      git log "$RANGE" --format='%H%x09%s%x09%b' 2>/dev/null \
        | grep -niE "$TOKEN_PAT" | scan_text "commit-message"
    fi
    ;;
  messages)
    [ -z "$RANGE" ] && { echo "pii-scan: --messages needs A..B" >&2; exit 2; }
    git log "$RANGE" --format='%H%x09%s%x09%b' 2>/dev/null \
      | grep -nE "$STRUCT" | scan_text "commit-message"
    if [ -n "$TOKEN_PAT" ]; then
      git log "$RANGE" --format='%H%x09%s%x09%b' 2>/dev/null \
        | grep -niE "$TOKEN_PAT" | scan_text "commit-message"
    fi
    ;;
esac

HITS="$(wc -l < "$HITFILE" | tr -d ' ')"
if [ "${HITS:-0}" -gt 0 ]; then
  echo "pii-scan: FAIL — $HITS potential PII match(es). This is a public repo; remove before committing/pushing." >&2
  echo "pii-scan: structural matches can be false positives (synthetic numbers are allowlisted); review each." >&2
  exit 1
fi
echo "pii-scan: clean (${MODE})."
exit 0
