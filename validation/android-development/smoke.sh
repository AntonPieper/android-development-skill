#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKILL_DIR="${SKILL_DIR:-$REPO_DIR/skills/android/android-development}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ROOT="${RUN_ROOT:-${TMPDIR:-/tmp}/android-development-smoke/$TIMESTAMP}"
REPOS_DIR="$RUN_ROOT/repos"
LOG_DIR="$RUN_ROOT/logs"
PROMPT_DIR="$RUN_ROOT/prompts"
RESULT_DIR="$RUN_ROOT/results"
COPILOT_LOG_DIR="$RUN_ROOT/copilot-internal-logs"
SUMMARY_TSV="$RUN_ROOT/summary.tsv"
SKILL_LIST_FILE="$RUN_ROOT/skill-package.txt"

MODEL="${MODEL:-gpt-5-mini}"
REASONING_EFFORT="${REASONING_EFFORT:-low}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-420}"
JOBS="${JOBS:-3}"
STREAM_MODE="${STREAM_MODE:-on}"
COPILOT_BIN="${COPILOT_BIN:-}"
REPOS_FILTER="${REPOS:-}"
SCENARIOS_FILTER="${SCENARIOS:-}"
SKIP_CLONE="${SKIP_CLONE:-0}"
INSTALL_SKILL="${INSTALL_SKILL:-0}"

mkdir -p "$REPOS_DIR" "$LOG_DIR" "$PROMPT_DIR" "$RESULT_DIR" "$COPILOT_LOG_DIR"

if [ -z "$COPILOT_BIN" ]; then
  if command -v copilot >/dev/null 2>&1; then
    COPILOT_BIN="$(command -v copilot)"
  else
    COPILOT_BIN="$HOME/Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot"
  fi
fi

if [ ! -x "$COPILOT_BIN" ]; then
  echo "Copilot CLI not found: $COPILOT_BIN" >&2
  exit 1
fi

clone_repo() {
  local label="$1"
  local url="$2"
  local branch="$3"
  local repo_dir="$REPOS_DIR/$label"

  if [ "$SKIP_CLONE" = "1" ] && [ -d "$repo_dir/.git" ]; then
    return 0
  fi

  rm -rf "$repo_dir"
  git clone --depth 1 --branch "$branch" "$url" "$repo_dir" >/dev/null 2>&1
}

repo_selected() {
  local label="$1"
  if [ -z "$REPOS_FILTER" ]; then
    return 0
  fi
  case ",${REPOS_FILTER}," in
    *",$label,"*) return 0 ;;
  esac
  return 1
}

scenario_selected() {
  local label="$1"
  if [ -z "$SCENARIOS_FILTER" ]; then
    return 0
  fi
  case ",${SCENARIOS_FILTER}," in
    *",$label,"*) return 0 ;;
  esac
  return 1
}

scenario_prompt() {
  local scenario="$1"
  case "$scenario" in
    discovery)
      cat <<'EOF'
Work read-only.

Find the smallest Android project root for this repository and the smallest standard wrapper-inspection commands you would run next.
Constraints:
    - Start with `find . -maxdepth 4` for `gradlew` and `settings.gradle*`.
    - If that first pass finds nothing, you may widen the search once or inspect likely Android subdirectories.
    - Read at most 2 repo files and at most 120 lines per file.
    - Do not use broad recursive search beyond that limited fallback.
- Do not run build, lint, or test tasks.
Keep the answer under 12 lines and include the exact project root.
EOF
      ;;
    tasks)
      cat <<'EOF'
Work read-only.

Identify the smallest standard Gradle commands for build, lint, unit tests, and connected tests for this repository.
Constraints:
- Inspect only `settings.gradle*`, the nearest module build file, and at most one targeted wrapper help command.
- Stop after those reads even if the repository has more modules.
- Do not use `tasks --all`, recursive search, or expensive Gradle lifecycle tasks.
- Keep shell output bounded.
Keep the answer under 14 lines.
EOF
      ;;
    modernization)
      cat <<'EOF'
Work read-only.

Decide whether this repository should trigger modernization guidance.
Constraints:
- Inspect only the wrapper properties, the top-level `settings.gradle*`, the top-level build file, and at most one module build file if needed.
- Stop after 4 concrete legacy findings.
- Do not scan source trees or README files unless a Gradle file points you there.
List the concrete legacy signals you found and finish with the first safe next step. Keep the answer under 14 lines.
EOF
      ;;
    ui-triage)
      cat <<'EOF'
Work read-only.

Describe the smallest on-device UI triage plan for this repository that minimizes token use. Make screenshot-first the default, explain when hierarchy XML is actually needed, and state how to avoid dumping full XML or unbounded logcat into context. Keep the answer under 12 lines.
EOF
      ;;
    *)
      echo "Unknown scenario: $scenario" >&2
      return 1
      ;;
  esac
}

extract_metric() {
  local pattern="$1"
  local file="$2"
  sed -n -E "s/$pattern/\\1/p" "$file" | tail -n 1
}

append_summary() {
  local repo_label="$1"
  local scenario="$2"
  local exit_code="$3"
  local log_file="$4"
  local total_usage api_time session_time model_line in_tokens out_tokens cached_tokens premium_requests

  total_usage="$(extract_metric '^Total usage est:[[:space:]]+(.+)$' "$log_file")"
  api_time="$(extract_metric '^API time spent:[[:space:]]+(.+)$' "$log_file")"
  session_time="$(extract_metric '^Total session time:[[:space:]]+(.+)$' "$log_file")"
  model_line="$(awk '/^Breakdown by AI model:/{getline; sub(/^[[:space:]]+/, "", $0); print; exit}' "$log_file")"

  in_tokens=""
  out_tokens=""
  cached_tokens=""
  premium_requests=""

  if [ -n "$model_line" ]; then
    in_tokens="$(printf '%s\n' "$model_line" | sed -E 's/^[^[:space:]]+[[:space:]]+([^[:space:]]+)[[:space:]]+in,.*/\1/')"
    out_tokens="$(printf '%s\n' "$model_line" | sed -E 's/.*,[[:space:]]+([^[:space:]]+)[[:space:]]+out,.*/\1/')"
    cached_tokens="$(printf '%s\n' "$model_line" | sed -E 's/.*,[[:space:]]+([^[:space:]]+)[[:space:]]+cached.*/\1/')"
    premium_requests="$(printf '%s\n' "$model_line" | sed -E 's/.*\((Est\.[^)]+)\).*/\1/')"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$repo_label" \
    "$scenario" \
    "$exit_code" \
    "$total_usage" \
    "$api_time" \
    "$session_time" \
    "$in_tokens" \
    "$out_tokens" \
    "$cached_tokens" \
    "$premium_requests" \
    "$log_file" >> "$SUMMARY_TSV"
}

run_case() {
  local repo_label="$1"
  local scenario="$2"
  local repo_dir="$REPOS_DIR/$repo_label"
  local prompt_file="$PROMPT_DIR/${repo_label}__${scenario}.txt"
  local log_file="$LOG_DIR/${repo_label}__${scenario}.log"
  local status_file="$RESULT_DIR/${repo_label}__${scenario}.status"
  local exit_code

  {
    printf 'Use the android-development skill at %s. If the skill is not installed, read %s directly and use progressive disclosure across the references directory.\n\n' "$SKILL_DIR" "$SKILL_DIR/SKILL.md"
    printf 'Repository root: %s\n\n' "$repo_dir"
    scenario_prompt "$scenario"
  } > "$prompt_file"

  printf 'Starting %s/%s\n' "$repo_label" "$scenario"
  printf 'Log file: %s\n' "$log_file"

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
      -p "$(cat "$prompt_file")" > "$log_file" 2>&1
  ); then
    exit_code=0
  else
    exit_code=$?
  fi

  printf '%s\n' "$exit_code" > "$status_file"
  append_summary "$repo_label" "$scenario" "$exit_code" "$log_file"
}

wait_for_slot() {
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$JOBS" ]; do
    sleep 1
  done
}

printf 'run_root\t%s\n' "$RUN_ROOT"
printf 'summary\t%s\n' "$SUMMARY_TSV"
printf 'skill_package\t%s\n' "$SKILL_LIST_FILE"

printf 'repo\tscenario\texit_code\ttotal_usage\tapi_time\tsession_time\tin_tokens\tout_tokens\tcached_tokens\tpremium_requests\tlog_file\n' > "$SUMMARY_TSV"

if command -v npx >/dev/null 2>&1; then
  npx -y skills add "$SKILL_DIR" --list > "$SKILL_LIST_FILE" 2>&1 || true
  if [ "$INSTALL_SKILL" = "1" ]; then
    npx -y skills add "$SKILL_DIR" -g -a github-copilot -y >/dev/null 2>&1
  fi
else
  printf 'npx not available; skipped skills package validation\n' > "$SKILL_LIST_FILE"
fi

clone_repo termux https://github.com/termux/termux-app.git master
clone_repo aegis https://github.com/beemdevelopment/Aegis.git master
clone_repo cleanarchitecture https://github.com/android10/Android-CleanArchitecture.git master
clone_repo pockethub https://github.com/pockethub/PocketHub.git master

repos=(termux aegis cleanarchitecture pockethub)
scenarios=(discovery tasks modernization ui-triage)

pids=()

for repo_label in "${repos[@]}"; do
  repo_selected "$repo_label" || continue
  for scenario in "${scenarios[@]}"; do
    scenario_selected "$scenario" || continue
    wait_for_slot
    run_case "$repo_label" "$scenario" &
    pids+=("$!")
  done
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

printf '\nSummary:\n'
if command -v column >/dev/null 2>&1; then
  column -t -s $'\t' "$SUMMARY_TSV"
else
  cat "$SUMMARY_TSV"
fi
