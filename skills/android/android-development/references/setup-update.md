# Setup And Updates

Use this file on fresh machines, fresh clones, or when the Android toolchain is unclear.

## Discover First

Run the smallest discovery set before installing anything:

```bash
java -version
adb version
adb devices -l
```

If the project root is not clear yet, find it before running the wrapper:

```bash
find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)
```

Treat that as the cheap first pass. If it returns nothing but the repo still looks Android-related, widen the search carefully or inspect likely subdirectories before concluding there is no Android project.

If `./gradlew` exists at the chosen root, prefer it over global `gradle`.

## Required Programs

Required tools:

- JDK
- Android SDK Command-Line Tools
- Android SDK Platform Tools
- Android Emulator and system images if emulator work is needed
- project Gradle wrapper

Use the OS package manager or official Android downloads, then verify with the discovery commands above.

## SDK Layout

The standard command-line tools layout is:

```text
<sdk>/cmdline-tools/latest/bin
<sdk>/platform-tools
<sdk>/emulator
```

Set `ANDROID_SDK_ROOT` to the SDK root and ensure those directories are on `PATH`.

## Install Or Update Packages

List stable packages:

```bash
sdkmanager --list
```

Install only what you need:

```bash
sdkmanager "platform-tools" "emulator"
sdkmanager "platforms;<api-level>" "build-tools;<build-tools-version>"
sdkmanager "system-images;<api-level>;<variant>;<abi>"
```

Accept licenses:

```bash
sdkmanager --licenses
```

Update installed packages:

```bash
sdkmanager --update
```

## Java And Gradle

After you know the project root, check the wrapper runtime:

```bash
./gradlew --version
```

If the project needs a different JDK, switch the shell or Gradle runtime to a compatible JDK before running build tasks.

Only check `adb` or emulator tooling here if the user actually needs device or UI work.

## Tool Discovery Shortcuts

Use these commands for quick facts:

```bash
./gradlew help --task lint
adb --help
emulator -help
sdkmanager --help
```

## When To Escalate

- Go to `references/build-lint-test.md` for build, lint, and test tasks.
- Go to `references/device-emulator-control.md` for AVDs, emulator startup, or target selection.
- Go to `references/modernization.md` if the wrapper, AGP, or repositories are clearly old.
