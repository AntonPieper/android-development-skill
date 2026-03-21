# First-Time Setup

Use this flow on fresh clones and new machines.

## 1. Run doctor

```bash
python /path/to/android-development/scripts/android_tooling.py doctor --repo /path/to/repo
```

If python is not on PATH on Windows, use:

```powershell
py -3 /path/to/android-development/scripts/android_tooling.py doctor --repo C:\path\to\repo
```

## 2. Install SDK packages in one batch

When sdkmanager is available:

```bash
python /path/to/android-development/scripts/android_tooling.py doctor \
  --repo /path/to/repo \
  --install-sdk \
  --with-emulator
```

Optional license acceptance:

```bash
python /path/to/android-development/scripts/android_tooling.py doctor \
  --repo /path/to/repo \
  --install-sdk \
  --with-emulator \
  --accept-licenses
```

If you plan to use emulator console simulation later, start
the emulator once after creating the AVD. That first boot
creates `~/.emulator_console_auth_token`, which the helper
uses for `emu-console`.

## 3. If sdkmanager is missing

Install Android SDK Command-Line Tools under:

- `SDK_ROOT/cmdline-tools/latest/bin`

Official docs:

- <https://developer.android.com/tools/sdkmanager>
- <https://developer.android.com/studio>

After installation, rerun doctor.

## 4. Build and lint

```bash
python /path/to/android-development/scripts/android_tooling.py \
  build-lint --repo /path/to/repo
```

Use generated lint reports as source of truth after each run.
The first Gradle wrapper run on a fresh clone may download the
wrapper distribution before the actual build starts.
