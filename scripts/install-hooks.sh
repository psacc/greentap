#!/usr/bin/env bash
#
# install-hooks.sh — install greentap's local git hooks (opt-in, no deps).
#
# Installs a pre-commit hook that runs scripts/pii-scan.sh --staged, so a
# commit carrying potential PII is blocked before it ever lands. This is a
# backstop for the manual discipline in CONTRIBUTING.md, not a replacement.
#
# Idempotent. Run once per clone:  ./scripts/install-hooks.sh
# Bypass a single commit (use sparingly):  git commit --no-verify

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# greentap pre-commit hook (installed by scripts/install-hooks.sh).
# Blocks commits that contain potential PII. Bypass: git commit --no-verify
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
if [ -x "$ROOT/scripts/pii-scan.sh" ]; then
  "$ROOT/scripts/pii-scan.sh" --staged
else
  echo "pre-commit: scripts/pii-scan.sh missing or not executable — skipping PII scan." >&2
fi
HOOK_EOF

chmod +x "$HOOK"
echo "Installed pre-commit hook -> $HOOK"
echo "Tip: create .git/greentap-pii-tokens from scripts/greentap-pii-tokens.example"
echo "     to enable identity-token (name/email) scanning in addition to structural."
