# Device And Emulator Control

Use this file to discover targets, create or start AVDs, and stop or reset them safely.

## Discover Targets

```bash
adb devices -l
avdmanager list avd
emulator -list-avds
```

If more than one target exists, use `adb -s <serial> ...` for every device command.

## Create An AVD

```bash
avdmanager create avd -n <avd-name> -k "system-images;<api-level>;<variant>;<abi>"
```

Install the matching system image first if creation fails.

## Start An Emulator

Windowed:

```bash
emulator @<avd-name>
```

Headless and more reproducible:

```bash
emulator @<avd-name> -no-window -no-snapshot -no-boot-anim
```

Explicit port when needed:

```bash
emulator @<avd-name> -port 5556
```

Prefer `-port` over `-ports` unless you truly need custom paired ports.

## Boot Readiness

Check that the target is actually usable:

```bash
adb -s <serial> shell getprop sys.boot_completed
adb -s <serial> shell getprop init.svc.bootanim
```

Treat `adb devices -l` showing `device` as necessary but not always sufficient during early boot.

## Stop Or Reset

Graceful stop:

```bash
adb -s <serial> emu kill
```

Destructive reset:

```bash
emulator @<avd-name> -wipe-data
```

Use `-wipe-data` only when the user asks for a reset or when test state is the confirmed problem.

## Useful Emulator Flags

```bash
emulator @<avd-name> -gpu swiftshader_indirect
emulator @<avd-name> -netdelay gsm -netspeed edge
emulator -accel-check
```

Use software GPU modes on CI or headless environments when default graphics are unstable.

## Physical Devices

```bash
adb devices -l
adb -s <serial> shell getprop ro.build.version.release
adb pair <ip>:<pair-port>
adb connect <ip>:<adb-port>
```

For Android 11 and later, prefer wireless pairing over the older `adb tcpip 5555` flow.

## When To Escalate

- Go to `references/on-device-interaction-visual-testing.md` for app launch, taps, screenshots, and bounded logcat.
- Go to `references/troubleshooting.md` if the target is missing or unstable and the next step is unclear.
