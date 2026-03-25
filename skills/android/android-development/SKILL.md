---
name: android-development
description: Use this skill when the user needs a standard Android CLI workflow to find the right Android project root, choose the smallest build, lint, or test command, work with a device or emulator, triage UI issues from screenshots, or modernize legacy Gradle or Android build logic.
---

# Android Development

Keep context small. Read only the next file, command output, screenshot, or XML slice you need. If Android or Gradle behavior is unclear, check current upstream documentation before changing files.

## Use It When

- The repo is a fresh clone and the Android project root is unclear.
- You need the smallest standard Android CLI path for build, lint, test, device, emulator, or UI-triage work.
- You need to inspect or modernize legacy Gradle, AGP, Kotlin, or Android build logic without jumping straight to broad scans.

## Pick The Entry Path

1. For build, lint, test, or modernization work, start by finding the Android project root.

   ```bash
   find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)
   ```

2. Treat that command as the cheap first pass, not a hard limit. If it finds nothing and the repo still looks Android-related, widen the search carefully or inspect likely subdirectories before concluding there is no Android project.

3. For device, emulator, or on-device UI work, discover the target device only when that work is actually needed.

   ```bash
   adb version
   adb devices -l
   ```

4. Open only the next reference you need, then run the smallest task that answers the question.

## Working Rules

- Prefer standard upstream commands over custom wrappers.
- Prefer `./gradlew` over global `gradle`.
- In multi-sample or monorepo layouts, first find the nearest Android project root with `gradlew` plus `settings.gradle(.kts)`.
- Prefer explicit device targeting with `adb -s <serial>`.
- Prefer file reads and `./gradlew help --task <task>` over broad Gradle inspection.
- Prefer screenshot-first UI inspection. Reduce screenshots to a max dimension of 512px by default.
- Keep hierarchy dumps on disk, search them first, then read only matching slices.
- Prefer bounded logs and generated reports over long console output.
- Prefer stable, idempotent device flows: force-stop, start, verify, then capture.
- Prefer one finite test or capture sequence, not shell loops.
- Avoid destructive emulator actions such as `-wipe-data` unless the user asks for them.
- When modernizing, resolve the source of truth for Gradle, AGP, Kotlin, and JDK versions before proposing changes.

## Gotchas

- Cheap root discovery is a first pass. Do not conclude there is no Android project just because `find . -maxdepth 4` returned nothing.
- Modernization is not just a wrapper bump. Gradle, AGP, Kotlin, JDK, and often compileSdk constraints have to stay compatible.
- Do not front-load adb or emulator discovery for build-only tasks.
- Do not open full hierarchy dumps or unbounded logcat unless the screenshot-first path failed.

## Progressive Disclosure

Open only the next reference you need:

- `references/setup-update.md` for environment setup, required tools, package installation, and updates.
- `references/nested-repo-discovery.md` for sample catalogs, monorepos, nested wrappers, and choosing the right Android project root.
- `references/build-lint-test.md` for wrapper tasks, lint, unit tests, instrumentation tests, and report locations.
- `references/device-emulator-control.md` for device discovery, AVD creation, emulator lifecycle, and boot readiness.
- `references/on-device-interaction-visual-testing.md` for adb interaction, screenshot-first UI triage, hierarchy dumps, and bounded logs.
- `references/modernization.md` for legacy Gradle or Android build logic, wrapper or AGP replacement, and best-practice upgrades.
- `references/troubleshooting.md` for a short symptom router.

## Modernization Trigger

Switch to `references/modernization.md` when you see any of these:

- very old Gradle wrapper or AGP
- Kotlin plugin versions pinned far behind the rest of the build
- `jcenter()` or `flatDir`
- `compile` or `testCompile`
- missing `namespace`
- support libraries instead of AndroidX
- heavy root `allprojects` or `subprojects` build logic
