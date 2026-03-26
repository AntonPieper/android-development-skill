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

This scenario was selected after repository exploration because Termux has a visually meaningful drawer-driven session workflow that can be verified with adb input and screenshots.

Task:
1. Find the real Android project root and build a debuggable app if needed.
2. Clear app data, install the app, and launch it.
3. Wait for first-run bootstrap to complete and confirm the terminal session is usable before continuing.
4. Execute this manual visual flow using adb input and bounded hierarchy inspection when needed:
   - open the drawer,
   - long-press the New session control,
   - create a named session with a short stable name,
   - verify the drawer list now shows the new named session and that the selected row state changed.
5. Capture at least three screenshots: first shell ready, create-session dialog, and drawer with the new named session.
6. Capture one short recording that shows the drawer interaction and resulting session list change.
7. Keep hierarchy and logcat capture bounded and only use them to ground brittle interactions; do not rely on terminal transcript text as the main assertion.
8. Do not use broad or destructive actions such as wiping the emulator.
9. After running the media processor, write a markdown report that embeds at least one processed image and one processed video using relative paths under ./media.

Use this exact JSON shape:
{
  "scenarioId": "interaction-termux-create-named-session",
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