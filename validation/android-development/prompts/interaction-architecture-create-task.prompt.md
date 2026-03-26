Run a manual on-device Android interaction scenario using the android-development skill.

Repository root: $repo_dir
Repository label: $repo_label
Repository URL: $repo_url
Module hint: $module_hint

Required outputs:
- Write JSON to $result_json
- Write Markdown to $report_md
- Save raw screenshots and recordings in $raw_dir
- After capturing media, run: node $media_processor "$scenario_dir"

This scenario was selected after repository exploration because architecture-samples has a deterministic, visually strong first-run todo creation flow.

Task:
1. Find the real Android project root and build a debuggable app if needed.
2. Clear app data to force the empty-state first-run path.
3. Install the app to the running emulator with adb and launch it.
4. Execute this manual visual flow using adb input and bounded hierarchy inspection when needed:
   - verify the empty state on the task list and prefer the visible empty-state screen over transient snackbars as proof,
   - tap the new-task action,
   - enter a short stable title and description, avoiding flaky adb text input patterns where possible,
   - hide the keyboard if it obscures the save action,
   - save the task,
   - verify the app returns to the list and the new task is visible.
5. Capture at least three screenshots: empty state, task entry form, and populated list after save.
6. Capture one short screen recording that shows the interaction path.
7. Keep any UI hierarchy dump or logcat capture bounded and use it only to ground ambiguous taps or assertions.
8. Do not dump unbounded XML or logs into the markdown.
9. After running the media processor, write a markdown report that embeds at least one processed image and one processed video using relative paths under ./media.

Use this exact JSON shape:
{
  "scenarioId": "interaction-architecture-create-task",
  "type": "interaction",
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
    "module": "module name or path",
    "packageName": "android package if discovered"
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
- ## Scenario steps
- ## Captured proof
- ## Commands
- ## Checks
- ## Findings

Embed the processed media with relative links like ./media/example.webp and a HTML <video> block that points at ./media/example.mp4.