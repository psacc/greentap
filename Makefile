SHELL := /bin/bash
PKG_VERSION := $(shell node -p "require('./package.json').version" 2>/dev/null)
LAST_TAG := $(shell git describe --tags --abbrev=0 2>/dev/null)
SKILL := .claude/skills/greentap/SKILL.md

.PHONY: help test pii qa install-hooks release-check tag clean

help:
	@echo "greentap make targets:"
	@echo "  make test           run the unit suite (node:test) — NOT e2e"
	@echo "  make pii            PII scan: tracked files + commit messages since last tag"
	@echo "  make qa             pointer to the agentic QA runbook (docs/QA.md)"
	@echo "  make install-hooks  install the pre-commit PII hook (opt-in, no deps)"
	@echo "  make release-check  clean-tree + version-sync + tests + PII (pre-release gate)"
	@echo "  make tag VERSION=vX.Y.Z   tag main + push (gated; refuses on drift/dirty/dup)"
	@echo ""
	@echo "  package.json version: $(PKG_VERSION)   last tag: $(LAST_TAG)"
	@echo "  E2E is separate + machine-local: GREENTAP_E2E=1 node greentap.js e2e"

test:
	npm test

pii:
	@./scripts/pii-scan.sh --worktree
	@if [ -n "$(LAST_TAG)" ]; then ./scripts/pii-scan.sh --messages "$(LAST_TAG)..HEAD"; \
	else echo "pii-scan: no previous tag; skipped commit-message range scan."; fi

qa:
	@echo "Agentic QA is a runbook, not a script — see docs/QA.md."
	@echo "Run it on the release-prep PR (after 'make test' green) and paste"
	@echo "the one-line verdict (QA: pass | pass with N notes | fail) on the PR."

install-hooks:
	@./scripts/install-hooks.sh

release-check:
	@echo "== release-check (pre-release gate; E2E is separate) =="
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "FAIL: working tree not clean"; git status --short; exit 1; fi
	@echo "ok: clean tree"
	@if grep -qE '^[[:space:]]*version:' "$(SKILL)" 2>/dev/null; then \
		skv=$$(grep -E '^[[:space:]]*version:' "$(SKILL)" | head -1 | sed -E 's/.*version:[[:space:]]*"?([^"#]+)"?.*/\1/' | xargs); \
		if [ "$$skv" != "$(PKG_VERSION)" ]; then \
			echo "FAIL: version drift — package.json=$(PKG_VERSION) SKILL.md=$$skv"; exit 1; fi; \
		echo "ok: version-sync ($(PKG_VERSION), package.json == SKILL.md)"; \
	else \
		echo "ok: version-sync (package.json=$(PKG_VERSION); SKILL.md carries no version field — skipped)"; fi
	@$(MAKE) -s test && echo "ok: tests"
	@$(MAKE) -s pii && echo "ok: PII scan"
	@echo "release-check: PASS"

tag:
	@if [ -z "$(VERSION)" ]; then echo "usage: make tag VERSION=vX.Y.Z"; exit 2; fi
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != "main" ]; then echo "FAIL: not on main (on $$branch)"; exit 1; fi
	@if [ -n "$$(git status --porcelain)" ]; then echo "FAIL: main not clean"; exit 1; fi
	@vnum="$(VERSION)"; vnum="$${vnum#v}"; \
	if [ "$$vnum" != "$(PKG_VERSION)" ]; then \
		echo "FAIL: VERSION=$(VERSION) but package.json=$(PKG_VERSION)"; exit 1; fi
	@if git rev-parse "$(VERSION)" >/dev/null 2>&1; then \
		echo "FAIL: tag $(VERSION) already exists"; exit 1; fi
	@git tag "$(VERSION)" && git push origin "$(VERSION)" && echo "tagged + pushed $(VERSION)"

clean:
	@echo "nothing to clean (no build artifacts; greentap is plain Node ESM)"
