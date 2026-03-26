# ─── Android Development Skill — Task Runner ────────────────────────────────
#
# Wraps build, validation, and scenario-run logic so CI workflows stay thin.
# All heavy lifting lives here; the GitHub Actions YAML only sets up the
# environment (Node, Java, Android SDK, emulator) and calls make targets.
#
# Environment variables consumed (all optional with defaults):
#   RUN_ROOT           — root directory for scenario run artifacts
#   MODEL              — Copilot model name
#   REASONING_EFFORT   — Copilot reasoning effort
#   TIMEOUT_SECONDS    — per-scenario timeout
#   INSTALL_SKILL      — 0 to skip installing the skill into each scenario project before running
#   FAIL_ON_SCENARIO_ERROR — 1 to exit non-zero on any scenario failure
#   SKIP_CLONE         — 1 to reuse already-cloned fixture repos
#   COPILOT_BIN        — explicit path to the Copilot CLI binary
# ─────────────────────────────────────────────────────────────────────────────

SHELL := /bin/bash
.DEFAULT_GOAL := help

REPO_DIR   := $(shell cd "$(dir $(lastword $(MAKEFILE_LIST)))" && pwd)
SITE_DIR   := $(REPO_DIR)/site
DIST_DIR   ?= $(REPO_DIR)/dist/site
RUN_ROOT   ?= $(or $(TMPDIR),/tmp)/android-development-scenarios/$(shell date -u +%Y%m%dT%H%M%SZ)

# ─── Help ────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ─── Dependencies ────────────────────────────────────────────────────────────

node_modules: package-lock.json package.json
	npm ci
	@touch $@

.PHONY: deps
deps: node_modules ## Install npm dependencies

# ─── Validate ────────────────────────────────────────────────────────────────

.PHONY: validate
validate: node_modules ## Run all static validations
	./scripts/validate-skills-catalog.sh
	./scripts/validate-validation-assets.sh

.PHONY: lint
lint: ## Lint markdown files
	npx -y markdownlint-cli2 "**/*.md" "#node_modules" "#dist"

.PHONY: syntax-check
syntax-check: ## Syntax-check all scripts
	bash -n scripts/validate-skills-catalog.sh
	bash -n scripts/validate-validation-assets.sh
	bash -n validation/android-development/smoke.sh
	node --check scripts/build-pages-site.mjs
	node --check scripts/process-android-scenario-artifacts.mjs

.PHONY: check
check: validate syntax-check lint ## Run all checks (validate + syntax + lint)

# ─── Site Build ──────────────────────────────────────────────────────────────

.PHONY: build-site
build-site: node_modules ## Build the static Pages site
	node ./scripts/build-pages-site.mjs "$(DIST_DIR)"
	@test -f "$(DIST_DIR)/data/latest.json"
	@test -f "$(DIST_DIR)/reports/latest/index.html"
	@echo "Site built → $(DIST_DIR)"

.PHONY: build-site-with-data
build-site-with-data: node_modules ## Build site with scenario run data
	node ./scripts/build-pages-site.mjs "$(RUN_ROOT)/site-dist" "$(RUN_ROOT)"
	@echo "Site built → $(RUN_ROOT)/site-dist"

.PHONY: build-site-published
build-site-published: node_modules ## Build site pulling from published data URL
	@test -n "$(LIVE_DATA_URL)" || (echo "LIVE_DATA_URL required" && exit 1)
	node ./scripts/build-pages-site.mjs "$(DIST_DIR)" "" "$(LIVE_DATA_URL)"

# ─── Scenario Runs ───────────────────────────────────────────────────────────

.PHONY: scenarios
scenarios: node_modules ## Run all scenario-based Android validations (needs emulator)
	bash ./validation/android-development/smoke.sh

.PHONY: scenarios-and-site
scenarios-and-site: scenarios build-site-with-data ## Run scenarios then build site with results

# ─── CI Composite Targets ────────────────────────────────────────────────────

.PHONY: ci-validate
ci-validate: deps check build-site ## Full CI validation pipeline

.PHONY: ci-smoke
ci-smoke: deps scenarios build-site-with-data ## Full CI smoke pipeline (scenarios + site)
