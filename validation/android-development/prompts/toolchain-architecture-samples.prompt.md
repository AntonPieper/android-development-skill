Run a full Android toolchain validation using the android-development skill.

Repository root: $repo_dir
Repository label: $repo_label
Repository URL: $repo_url
Module hint: $module_hint

Required outputs:
- Write JSON to $result_json
- Write Markdown to $report_md
- If you capture raw screenshots or recordings, store them in $raw_dir
- After capturing any media, run: node $media_processor "$scenario_dir"

Task:
1. Find the real Android project root.
2. Identify the smallest reliable Gradle commands for build, unit tests, and connected tests.
3. Actually run those commands. If no connected test task exists, record a warning and explain what was verified instead.
4. If an emulator is running and the build succeeded, install the app and capture at least one screenshot showing the app launched.
5. Do not edit the repository under test.
6. Summarize what succeeded, what was skipped, and the exact commands that grounded the result.

Write JSON with this exact top-level shape:
{
  "scenarioId": "toolchain-architecture-samples",
  "type": "toolchain",
  "title": "short title",
  "status": "passed|warning|failed",
  "summary": "1-2 sentence summary",
  "generatedAt": "ISO-8601",
  "fixture": {
    "label": "$repo_label",
    "repoUrl": "$repo_url"
  },
  "project": {
    "root": "absolute path",
    "module": "module name or path"
  },
  "commands": [
    {
      "label": "short label",
      "command": "exact command",
      "status": "passed|warning|failed",
      "detail": "short outcome"
    }
  ],
  "checks": [
    {
      "label": "short label",
      "status": "passed|warning|failed",
      "detail": "short evidence"
    }
  ],
  "keyFindings": ["short bullet", "short bullet"]
}

Write Markdown with these sections in order:
- # Title
- ## Summary
- ## Commands
- ## Checks
- ## Findings

Keep both files concise and evidence-based. If media was captured, embed it with relative links under ./media.