# Troubleshooting

Use this file as a symptom router. If a fix needs more than a few commands, switch to the dedicated reference instead of expanding here.

## Missing SDK Or Command-Line Tools

- `sdkmanager` not found
- `avdmanager` not found
- `adb` or `emulator` missing from `PATH`

Next step:

- Open `references/setup-update.md`.

## Wrong Java Or Gradle Runtime

- Gradle fails before configuration starts.
- Java is too old or too new for the project.
- `./gradlew --version` does not match the expected JDK.

Next step:

- Open `references/setup-update.md` first.
- Then rerun `./gradlew --version`.

## Gradle Wrapper Not Executable

- `./gradlew` is not executable.

Next step:

- Try `sh ./gradlew --version` or `sh ./gradlew <task>` first.
- If a file mode change is acceptable, use `chmod +x gradlew` and retry.

## Build, Lint, Or Test Task Unclear

- You do not know which Gradle task to run.
- Lint or tests already exist, but the right wrapper task is unclear.

Next step:

- Open `references/build-lint-test.md`.

## Device Or Emulator Not Ready

- No device appears in `adb devices -l`.
- Emulator is running but not usable yet.
- You need to create, boot, stop, or identify a target device.

Next step:

- Open `references/device-emulator-control.md`.

## Need UI Interaction Or Visual Evidence

- You need taps, key events, screenshots, hierarchy dumps, or bounded logcat.
- You need a small evidence bundle for a UI issue.

Next step:

- Open `references/on-device-interaction-visual-testing.md`.

## Legacy Build Logic

- `jcenter()` or `flatDir`
- `compile` or `testCompile`
- `buildscript {}` plus `apply plugin:` everywhere
- no `namespace`
- support libraries instead of AndroidX
- old wrapper or AGP compatibility failures

Next step:

- Open `references/modernization.md`.
