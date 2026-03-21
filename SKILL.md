---
name: android-development
description: Cross-platform Android workflow for fresh clones,
  Gradle build and lint, emulator control, adb UI interaction,
  screenshots, and bounded diagnostics.
---

# Android Development

## Use It When

- The repo is a fresh clone or the Android toolchain is unclear.
- You need a repeatable build/lint loop without guessing `JAVA_HOME` or Gradle tasks.
- You need one-shot adb/emulator actions and small capture bundles.

## Entry Point

The authoritative, low-token way to discover commands and
flags is the helper's built-in help:

```bash
python /path/to/android-development/scripts/android_tooling.py --help
```

Then start with:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  doctor --repo /path/to/repo
```

On Windows prefer `py -3` if `python` is unavailable.
The helper uses only the Python standard library.
`--repo` works before or after the subcommand.

References:

- `references/setup-first-time.md`
- `references/troubleshooting.md`

## Core Flow

1. Bootstrap with `doctor`.

Use it first on new machines, fresh clones, and fresh agent sessions.
Treat its output as authoritative for Java, SDK, Gradle wrapper,
default tasks, modules, launchers, devices, and AVDs.

If `doctor` reports a tool as missing, fix that first instead
of manually inspecting project files.

If `sdkmanager` is available, install the standard packages in one batch:

```bash
python /path/to/android-development/scripts/android_tooling.py doctor \
  --repo /path/to/repo \
  --install-sdk \
  --with-emulator
```

1. Build and lint with `build-lint`.

Run builds through the helper so Java resolution and output
handling stay consistent:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  build-lint --repo /path/to/repo
```

Defaults: wrapper build, resolved `JAVA_HOME`, concise console
output, detected app module, and printed report paths. Add
`--stream` only when full Gradle output matters.

1. Capture only what you need.

Capture evidence with one command:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  capture --serial <serial>
```

Keep captures small unless you need more context:

```bash
# visual-only: screenshot only
python /path/to/android-development/scripts/android_tooling.py capture \
  --serial <serial> \
  --skip-hierarchy \
  --skip-dumpsys \
  --skip-logcat

# compact diagnostics
python /path/to/android-development/scripts/android_tooling.py capture \
  --serial <serial> \
  --logcat-lines 200
```

1. Batch UI actions with `ui-sequence`.

Prefer one batched command over many individual adb calls when
approvals are involved:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  ui-sequence --serial <serial> -- \
  force-stop <package> \
  logcat-clear \
  start <package>/<launcher-activity> \
  sleep 1 \
  tap-id <package>:id/menu_btn \
  tap-text "Load sample" \
  sleep 1 \
  capture
```

Prefer `tap-id`, `tap-text`, or `tap-desc` over raw
coordinates when the hierarchy exposes a stable target.

1. Control the emulator through the helper.

Start an existing AVD:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  start-emulator \
  --repo /path/to/repo \
  --avd <name> \
  --port 5556 \
  --no-window \
  --no-snapshot \
  --wait-boot
```

Use the built-in console client instead of a separate telnet binary:

```bash
python /path/to/android-development/scripts/android_tooling.py \
  emu-console \
  --serial emulator-5556 \
  --power-capacity 15 \
  --power-status discharging \
  --geo 13.4050 52.5200 \
  --acceleration 0 9.81 0
```

## Working Rules

- Prefer one Python helper invocation over ad hoc shell command sequences.
- Prefer helper defaults and small captures first, then expand only when needed.
- Prefer wrapper builds over globally installed Gradle.
- Prefer lint reports over console summaries when Android
  annotations, API levels, or resource types matter.
- Prefer screenshot plus hierarchy plus bounded logcat
  together when UI behavior is unclear.

## Visual Debugging

Use the hierarchy for structure and the screenshot for truth.
Rendering, video, and camera surfaces often carry little or
no useful XML.
