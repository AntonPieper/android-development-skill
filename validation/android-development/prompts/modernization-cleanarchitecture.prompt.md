Run a modernization triage and build scenario using the android-development skill.

Repository root: $repo_dir
Repository label: $repo_label
Repository URL: $repo_url
Module hint: $module_hint

Required outputs:
- Write JSON to $result_json
- Write Markdown to $report_md
- Save raw screenshots in $raw_dir if an emulator is available
- After capturing media, run: node $media_processor "$scenario_dir"

Task:
1. Find the real Android project root.
2. Run ./gradlew --version to ground the wrapper and JDK environment.
3. Inspect only the Gradle and Android build files you need to identify the most concrete modernization signals.
4. Attempt ./gradlew assembleDebug (or the closest available debug build task). Record whether it succeeds or fails and use the output to ground your triage.
5. If an emulator is running and the build succeeds, install the app and capture at least one screenshot showing the app launched.
6. Do not edit files and do not recommend blind version bumps.
7. Identify the first safe modernization step based on what you observed.

Use this exact JSON shape:
{
  "scenarioId": "modernization-cleanarchitecture",
  "type": "modernization",
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
- ## Signals
- ## Commands
- ## Findings
- ## First safe next step

If media was captured, embed it with relative links under ./media.