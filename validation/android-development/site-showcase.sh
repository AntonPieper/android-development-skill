#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="${SKILL_DIR:-$REPO_DIR/skills/android/android-development}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ROOT="${RUN_ROOT:-${TMPDIR:-/tmp}/android-development-smoke/$TIMESTAMP}"
REPOS_DIR="$RUN_ROOT/repos"
SHOWCASE_DIR="$RUN_ROOT/showcase"
RAW_DIR="$SHOWCASE_DIR/raw"
STATUS_TSV="$SHOWCASE_DIR/status.tsv"
COPILOT_LOG_DIR="$RUN_ROOT/copilot-internal-logs"

MODEL="${MODEL:-gpt-5-mini}"
REASONING_EFFORT="${REASONING_EFFORT:-low}"
STREAM_MODE="${STREAM_MODE:-on}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-240}"
COPILOT_BIN="${COPILOT_BIN:-}"
SKIP_CLONE="${SKIP_CLONE:-0}"

mkdir -p "$REPOS_DIR" "$RAW_DIR" "$COPILOT_LOG_DIR"

if [ -z "$COPILOT_BIN" ]; then
  if command -v copilot >/dev/null 2>&1; then
    COPILOT_BIN="$(command -v copilot)"
  else
    COPILOT_BIN="$HOME/Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot"
  fi
fi

printf 'repo\tscenario\texit_code\traw_file\n' > "$STATUS_TSV"

if [ ! -x "$COPILOT_BIN" ]; then
  printf 'showcase\tbootstrap\t127\tCopilot CLI not found: %s\n' "$COPILOT_BIN" >> "$STATUS_TSV"
  exit 0
fi

clone_repo() {
  local label="$1"
  local url="$2"
  local branch="$3"
  local repo_dir="$REPOS_DIR/$label"

  if [ "$SKIP_CLONE" = "1" ] && [ -d "$repo_dir/.git" ]; then
    return 0
  fi

  if [ -d "$repo_dir/.git" ]; then
    return 0
  fi

  rm -rf "$repo_dir"
  git clone --depth 1 --branch "$branch" "$url" "$repo_dir" >/dev/null 2>&1
}

scenario_prompt() {
  local scenario="$1"
  case "$scenario" in
    discovery)
      cat <<'EOF'
Work read-only.

Use the android-development skill to identify the smallest Android project root and the first wrapper-level commands worth running next.
Return JSON only with this exact shape:
{
  "id": "termux-discovery",
  "scenario": "discovery",
  "repo_label": "termux",
  "repo_url": "https://github.com/termux/termux-app",
  "headline": "short headline",
  "summary": "1-2 sentence summary",
  "highlights": ["3 concise bullets"],
  "commands": ["up to 4 exact shell commands"],
  "quote": "one short sentence that captures the key judgment"
}
Constraints:
- Start with a shallow root search.
- Do not run builds or tests.
- Keep commands concrete and cheap.
EOF
      ;;
    tasks)
      cat <<'EOF'
Work read-only.

Use the android-development skill to name the smallest standard Gradle commands for build, lint, unit tests, and connected tests for this repository.
Return JSON only with this exact shape:
{
  "id": "cleanarchitecture-tasks",
  "scenario": "tasks",
  "repo_label": "cleanarchitecture",
  "repo_url": "https://github.com/android10/Android-CleanArchitecture",
  "headline": "short headline",
  "summary": "1-2 sentence summary",
  "highlights": ["3 concise bullets"],
  "commands": ["up to 4 exact shell commands"],
  "quote": "one short sentence that captures the key judgment"
}
Constraints:
- Inspect only the smallest files needed.
- Do not use broad task listings.
- Keep the commands runnable and specific.
EOF
      ;;
    modernization)
      cat <<'EOF'
Work read-only.

Use the android-development skill to decide whether this repository should trigger modernization guidance.
Return JSON only with this exact shape:
{
  "id": "pockethub-modernization",
  "scenario": "modernization",
  "repo_label": "pockethub",
  "repo_url": "https://github.com/pockethub/PocketHub",
  "headline": "short headline",
  "summary": "1-2 sentence summary",
  "highlights": ["3 concise bullets"],
  "commands": ["up to 4 exact shell commands"],
  "quote": "one short sentence that captures the key judgment"
}
Constraints:
- Base the answer on concrete legacy signals.
- Stop after the first safe next step.
- Do not propose a blind version bump.
EOF
      ;;
    ui-triage)
      cat <<'EOF'
Work read-only.

Use the android-development skill to propose the smallest on-device UI triage plan for this repository.
Return JSON only with this exact shape:
{
  "id": "aegis-ui-triage",
  "scenario": "ui-triage",
  "repo_label": "aegis",
  "repo_url": "https://github.com/beemdevelopment/Aegis",
  "headline": "short headline",
  "summary": "1-2 sentence summary",
  "highlights": ["3 concise bullets"],
  "commands": ["up to 4 exact shell commands"],
  "quote": "one short sentence that captures the key judgment"
}
Constraints:
- Make screenshot-first the default.
- Only mention XML when it is actually justified.
- Keep evidence bounded and reproducible.
EOF
      ;;
    *)
      echo "Unknown scenario: $scenario" >&2
      return 1
      ;;
  esac
}

run_case() {
  local repo_label="$1"
  local repo_url="$2"
  local branch="$3"
  local scenario="$4"
  local repo_dir="$REPOS_DIR/$repo_label"
  local raw_file="$RAW_DIR/${repo_label}__${scenario}.txt"
  local exit_code

  clone_repo "$repo_label" "$repo_url" "$branch"

  if (
    cd "$repo_dir"
    perl -e 'alarm shift @ARGV; exec @ARGV' "$TIMEOUT_SECONDS" \
      "$COPILOT_BIN" \
      --model "$MODEL" \
      --reasoning-effort "$REASONING_EFFORT" \
      --stream "$STREAM_MODE" \
      --no-color \
      --allow-all-tools \
      --allow-all-paths \
      --allow-all-urls \
      --no-ask-user \
      --add-dir "$SKILL_DIR" \
      --add-dir "$repo_dir" \
      --log-dir "$COPILOT_LOG_DIR" \
      -p "Use the android-development skill at $SKILL_DIR. If it is not installed, read $SKILL_DIR/SKILL.md directly and use progressive disclosure across the references directory. Repository root: $repo_dir

$(scenario_prompt "$scenario")" > "$raw_file" 2>&1
  ); then
    exit_code=0
  else
    exit_code=$?
  fi

  printf '%s\t%s\t%s\t%s\n' "$repo_label" "$scenario" "$exit_code" "$raw_file" >> "$STATUS_TSV"
}

run_case termux https://github.com/termux/termux-app.git master discovery
run_case cleanarchitecture https://github.com/android10/Android-CleanArchitecture.git master tasks
run_case pockethub https://github.com/pockethub/PocketHub.git master modernization
run_case aegis https://github.com/beemdevelopment/Aegis.git master ui-triage

cat "$STATUS_TSV"