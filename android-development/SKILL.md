---
name: android-development
description: Lightweight Android CLI workflow for setup, build, testing, device control, visual checks, and modernization.
---

# Android Development

## Use It When

- The repo is a fresh clone or the Android toolchain is unclear.
- You need a standard Android CLI workflow without custom scripts.
- You need a small, repeatable path for build, test, device work, or modernization.

## Default Flow

1. Discover installed tools.

   ```bash
   java -version
   adb version
   adb devices -l
   ```

2. Find the Android project root.

   ```bash
   find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)
   ```

3. Run the smallest task that answers the question.

   - Build, lint, and unit test:

     ```bash
     ./gradlew assembleDebug
     ./gradlew lint
     ./gradlew test
     ```

   - Run connected-device or emulator tests:

     ```bash
     ./gradlew connectedAndroidTest
     adb -s <serial> shell am instrument -w <test-package>/<runner>
     ```

   - Capture UI evidence:

     ```bash
     adb -s <serial> exec-out screencap -p > screen.png
     adb -s <serial> shell uiautomator dump /sdcard/window_dump.xml
     adb -s <serial> logcat -d -v threadtime -t 200
     ```

4. If the build logic looks old, switch to modernization guidance.

## Working Rules

- Prefer standard upstream commands over custom wrappers.
- Prefer `./gradlew` over global `gradle`.
- In multi-sample or monorepo layouts, first find the nearest Android project root with `gradlew` plus `settings.gradle(.kts)`.
- Prefer explicit device targeting with `adb -s <serial>`.
- Prefer `./gradlew help --task <task>` over `tasks --all` when one task name is already known.
- Prefer one screenshot, one hierarchy dump, and bounded log output.
- Prefer report files over long console output when lint or tests already generate them.
- Prefer stable, idempotent device flows: force-stop, start, verify, then capture.
- Prefer one finite test or capture sequence, not shell loops.
- Avoid destructive emulator actions such as `-wipe-data` unless the user asks for them.

## Progressive Disclosure

Open only the next reference you need:

- `references/setup-update.md` for environment setup, required tools, package installation, and updates.
- `references/nested-repo-discovery.md` for sample catalogs, monorepos, nested wrappers, and choosing the right Android project root.
- `references/build-lint-test.md` for wrapper tasks, lint, unit tests, instrumentation tests, and report locations.
- `references/device-emulator-control.md` for device discovery, AVD creation, emulator lifecycle, and boot readiness.
- `references/on-device-interaction-visual-testing.md` for adb interaction, screenshots, hierarchy dumps, bounded log capture, and token-efficient evidence.
- `references/modernization.md` for legacy Gradle or Android build logic, wrapper or AGP replacement, and best-practice upgrades.
- `references/troubleshooting.md` for a short symptom router.

## Modernization Trigger

Switch to `references/modernization.md` when you see any of these:

- very old Gradle wrapper or AGP
- `jcenter()` or `flatDir`
- `compile` or `testCompile`
- missing `namespace`
- support libraries instead of AndroidX
- heavy root `allprojects` or `subprojects` build logic

## Visual Testing Rules

- Treat the screenshot as the source of truth for rendered UI.
- Treat the hierarchy dump as the source of truth for view structure and control discovery.
- Downsize screenshots to a max dimension of 512px by default.
- Use short video only when motion matters, and reduce it before sharing.
- Never dump unbounded logcat or large image sets into the conversation by default.
