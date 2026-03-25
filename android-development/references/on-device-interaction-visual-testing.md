# On-Device Interaction And Visual Testing

Use this file for adb-driven app interaction, screenshots, hierarchy dumps, and small evidence bundles.

## Stable Interaction Loop

Prefer a repeatable sequence:

```bash
adb -s <serial> shell am force-stop <package>
adb -s <serial> shell am start -W -n <package>/<activity>
adb -s <serial> shell pidof <package>
adb -s <serial> shell input tap <x> <y>
adb -s <serial> shell input keyevent KEYCODE_BACK
```

Force-stop only when you want a clean launch. Otherwise preserve app state.

## Discover What Is Installed

```bash
adb -s <serial> shell pm list packages
adb -s <serial> shell pm list instrumentation
adb -s <serial> shell pm path <package>
```

## Visual Capture

Use the screenshot as source of truth:

```bash
adb -s <serial> exec-out screencap -p > screen.png
```

Use the hierarchy dump to find controls:

```bash
adb -s <serial> shell uiautomator dump /sdcard/window_dump.xml
adb -s <serial> pull /sdcard/window_dump.xml
adb -s <serial> shell rm /sdcard/window_dump.xml
```

Hierarchy dumps can miss video, camera, games, or other GPU-heavy surfaces.

## Bounded Diagnostics

Capture only recent logs:

```bash
adb -s <serial> logcat -d -v threadtime -t 200
adb -s <serial> logcat -d -v threadtime -t 200 > logcat.txt
```

Clear before a focused repro if needed:

```bash
adb -s <serial> logcat -c
```

Prefer filtered or bounded log pulls over streaming full logcat into the conversation.

When the package is known, prefer `--pid` over broad `grep` filtering.

## Small Evidence Bundle

Default bundle for a UI issue:

1. one screenshot
2. one hierarchy dump
3. one bounded logcat pull
4. exact package, activity, and serial used

Do not attach videos or multiple screenshots unless motion or state transitions matter.

## Default Reduction

Reduce captures before sharing them broadly.

For screenshots, make a 512px-max copy by default:

```bash
sips -Z 512 screen.png --out screen-512.png
```

Do not introduce extra image-processing tools unless the default path is unavailable.

For video, keep it short and reduce both resolution and frame rate by default:

```bash
ffmpeg -y -i demo.mp4 -vf scale=512:512:force_original_aspect_ratio=decrease -r 10 -an -c:v libx264 -preset veryfast -crf 32 demo-512p.mp4
```

Only rerender at a larger target if the reduced capture loses needed detail.

## Optional Video

Only when motion matters:

```bash
adb -s <serial> shell screenrecord --time-limit 15 /sdcard/demo.mp4
adb -s <serial> pull /sdcard/demo.mp4
```

Keep recordings short to avoid token and file bloat.

## Parallel Log Analysis

When multiple relevant concerns exist, collect a few bounded files instead of one huge dump:

```bash
adb -s <serial> logcat -d -v threadtime -t 200 --pid "$(adb -s <serial> shell pidof -s <package>)" > app.log
adb -s <serial> logcat -d -v threadtime -t 200 ActivityTaskManager:V WindowManager:V *:S > window.log
adb -s <serial> logcat -d -v threadtime -t 200 AndroidRuntime:E System.err:W *:S > crash.log
```

Keep each capture short and name it by process or subsystem.
