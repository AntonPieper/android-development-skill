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

This scenario was selected after repository exploration because Aegis has a deterministic first-run secure setup flow that produces strong visual state changes without camera or import dependencies.

Task:
1. Find the real Android project root and build a debuggable app if needed. Prefer a debug build because release screen-security behavior can block screenshots and recordings.
2. Clear app data, install the app, and launch it.
3. Execute this manual visual flow using adb input and bounded hierarchy inspection when needed:
   - progress through the intro screens,
   - explicitly choose password-based setup even if it appears preselected,
   - enter a stable test password and confirmation,
   - allow for the setup-complete transition to take a moment after password submission,
   - complete setup,
   - verify the app reaches the empty vault screen.
4. Capture at least three screenshots: intro/setup start, password entry, and empty vault after completion.
5. Capture one short recording that shows the end-to-end setup transition.
6. Keep hierarchy and logcat capture bounded and only use them to ground ambiguous taps or text fields.
7. Do not rely on camera, file picker, or external import flows.
8. After running the media processor, write a markdown report that embeds at least one processed image and one processed video using relative paths under ./media.

Use this exact JSON shape:
{
  "scenarioId": "interaction-aegis-first-run",
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