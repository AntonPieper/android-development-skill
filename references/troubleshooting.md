# Troubleshooting

## JAVA_HOME not resolved

Symptoms:

- Could not resolve JAVA_HOME for Java N+

Actions:

1. Run doctor and read Required Java and JAVA_HOME lines.
2. Set ANDROID_JAVA_HOME to a compatible JDK.
3. Re-run build-lint.

## sdkmanager not found

Symptoms:

- sdkmanager not found. Install Android SDK Command-Line Tools first.

Actions:

1. Install Command-Line Tools to `SDK_ROOT/cmdline-tools/latest/bin`.
1. Ensure ANDROID_SDK_ROOT points to the same SDK root.
1. Re-run doctor.

## Emulator console simulation fails

Symptoms:

- Could not read emulator console token
- Connection refused on localhost console port

Actions:

1. Confirm serial is `emulator-PORT`.
1. Verify the emulator is running and booted.
1. Confirm `~/.emulator_console_auth_token` exists.
1. Retry with explicit `--port`.

## No useful hierarchy for rendering surfaces

Symptoms:

- hierarchy.xml exists but does not describe the rendered content

Actions:

1. Use screen.png as source of truth for visual output.
2. Use hierarchy only to find controls and navigation elements.
3. Capture before and after interaction and compare screenshots.
