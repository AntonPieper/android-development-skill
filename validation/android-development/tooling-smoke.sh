#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ROOT="${RUN_ROOT:-${TMPDIR:-/tmp}/android-development-smoke/$TIMESTAMP}"
TOOLING_DIR="$RUN_ROOT/tooling"
RAW_DIR="$TOOLING_DIR/raw"
PROCESSED_DIR="$TOOLING_DIR/processed"
FIXTURES_DIR="$TOOLING_DIR/fixtures"
FIXTURE_DIR="$FIXTURES_DIR/architecture-samples"
METADATA_ENV="$TOOLING_DIR/metadata.env"
COMMANDS_FILE="$TOOLING_DIR/commands.txt"

FIXTURE_LABEL="${FIXTURE_LABEL:-architecture-samples}"
FIXTURE_REPO_URL="${FIXTURE_REPO_URL:-https://github.com/android/architecture-samples.git}"
FIXTURE_BRANCH="${FIXTURE_BRANCH:-main}"
FIXTURE_REF="${FIXTURE_REF:-ee66e1526b84c026615df032c705842b7d2a521f}"
FIXTURE_MODULE="${FIXTURE_MODULE:-app}"
ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5554}"
RUN_CONNECTED_ANDROID_TESTS="${RUN_CONNECTED_ANDROID_TESTS:-1}"

mkdir -p "$RAW_DIR" "$PROCESSED_DIR" "$FIXTURES_DIR"
: > "$COMMANDS_FILE"

append_command() {
  printf '%s\n' "$1" >> "$COMMANDS_FILE"
}

pick_task() {
  local file="$1"
  shift

  for pattern in "$@"; do
    local match
    match="$(grep -Eo "$pattern" "$file" | sort -u | head -n 1 || true)"
    if [ -n "$match" ]; then
      printf '%s' "$match"
      return 0
    fi
  done

  return 1
}

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required tool not found: $1" >&2
    exit 1
  fi
}

wait_for_boot() {
  adb -s "$ANDROID_SERIAL" wait-for-device

  for _ in $(seq 1 120); do
    local boot_completed
    boot_completed="$(adb -s "$ANDROID_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [ "$boot_completed" = "1" ]; then
      return 0
    fi
    sleep 2
  done

  echo "Emulator did not finish booting in time" >&2
  exit 1
}

clone_fixture() {
  if [ ! -d "$FIXTURE_DIR/.git" ]; then
    append_command "git clone --depth 1 --branch $FIXTURE_BRANCH $FIXTURE_REPO_URL $FIXTURE_DIR"
    git clone --depth 1 --branch "$FIXTURE_BRANCH" "$FIXTURE_REPO_URL" "$FIXTURE_DIR" >/dev/null 2>&1
  fi

  (
    cd "$FIXTURE_DIR"
    append_command "git fetch --depth 1 origin $FIXTURE_REF"
    git fetch --depth 1 origin "$FIXTURE_REF" >/dev/null 2>&1 || true
    append_command "git checkout --detach $FIXTURE_REF"
    git checkout --detach "$FIXTURE_REF" >/dev/null 2>&1
  )
}

require_bin adb
require_bin ffmpeg
clone_fixture
wait_for_boot

PROJECT_ROOT="$FIXTURE_DIR"
ROOT_DISCOVERY_FILE="$RAW_DIR/root-discovery.txt"
TASKS_FILE="$RAW_DIR/app-tasks.txt"
BUILD_LOG="$RAW_DIR/gradle-build.log"
CONNECTED_LOG="$RAW_DIR/gradle-connected.log"
LOGCAT_FILE="$RAW_DIR/logcat.txt"
WINDOW_DUMP_FILE="$RAW_DIR/window_dump.xml"
SCREEN_BEFORE_FILE="$RAW_DIR/screen-before.png"
SCREEN_AFTER_FILE="$RAW_DIR/screen-after.png"
VIDEO_RAW_FILE="$RAW_DIR/device-demo.mp4"
VIDEO_FILE="$PROCESSED_DIR/device-demo.mp4"
VIDEO_POSTER_PNG="$RAW_DIR/video-poster.png"
DISPLAY_SIZE_FILE="$RAW_DIR/display-size.txt"

append_command 'find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)'
(
  cd "$PROJECT_ROOT"
  find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)
) | tee "$ROOT_DISCOVERY_FILE"

append_command "./gradlew :$FIXTURE_MODULE:tasks --all --console=plain"
(
  cd "$PROJECT_ROOT"
  ./gradlew ":$FIXTURE_MODULE:tasks" --all --console=plain
) | tee "$TASKS_FILE"

ASSEMBLE_TASK="$(pick_task "$TASKS_FILE" 'assembleMockDebug' 'assembleProdDebug' 'assemble[A-Za-z0-9]+Debug')"
UNIT_TEST_TASK="$(pick_task "$TASKS_FILE" 'testMockDebugUnitTest' 'testProdDebugUnitTest' 'test[A-Za-z0-9]+UnitTest')"
CONNECTED_TASK="$(pick_task "$TASKS_FILE" 'connectedMockDebugAndroidTest' 'connectedProdDebugAndroidTest' 'connected[A-Za-z0-9]+AndroidTest')"

if [ -z "$ASSEMBLE_TASK" ] || [ -z "$UNIT_TEST_TASK" ]; then
  echo "Unable to discover required Gradle tasks" >&2
  exit 1
fi

append_command "./gradlew :$FIXTURE_MODULE:$ASSEMBLE_TASK :$FIXTURE_MODULE:$UNIT_TEST_TASK --console=plain --stacktrace"
(
  cd "$PROJECT_ROOT"
  ./gradlew ":$FIXTURE_MODULE:$ASSEMBLE_TASK" ":$FIXTURE_MODULE:$UNIT_TEST_TASK" --console=plain --stacktrace
) | tee "$BUILD_LOG"

if [ -n "$CONNECTED_TASK" ] && [ "$RUN_CONNECTED_ANDROID_TESTS" = "1" ]; then
  append_command "./gradlew :$FIXTURE_MODULE:$CONNECTED_TASK --console=plain --stacktrace"
  (
    cd "$PROJECT_ROOT"
    ./gradlew ":$FIXTURE_MODULE:$CONNECTED_TASK" --console=plain --stacktrace
  ) | tee "$CONNECTED_LOG"
fi

APK_PATH="$(find "$PROJECT_ROOT/$FIXTURE_MODULE/build/outputs/apk" -type f -name '*debug*.apk' ! -name '*androidTest*.apk' | sort | head -n 1)"

if [ -z "$APK_PATH" ]; then
  echo "Debug APK not found" >&2
  exit 1
fi

AAPT_BIN="$(find "${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}/build-tools" -type f -name aapt 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$AAPT_BIN" ]; then
  echo "aapt not found under Android build-tools" >&2
  exit 1
fi

PACKAGE_NAME="$($AAPT_BIN dump badging "$APK_PATH" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -n 1)"

if [ -z "$PACKAGE_NAME" ]; then
  echo "Unable to determine package name from APK" >&2
  exit 1
fi

append_command "adb -s $ANDROID_SERIAL install -r $APK_PATH"
adb -s "$ANDROID_SERIAL" install -r "$APK_PATH" >/dev/null

append_command "adb -s $ANDROID_SERIAL logcat -c"
adb -s "$ANDROID_SERIAL" logcat -c

append_command "adb -s $ANDROID_SERIAL shell monkey -p $PACKAGE_NAME -c android.intent.category.LAUNCHER 1"
adb -s "$ANDROID_SERIAL" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 4

append_command "adb -s $ANDROID_SERIAL exec-out screencap -p > $SCREEN_BEFORE_FILE"
adb -s "$ANDROID_SERIAL" exec-out screencap -p > "$SCREEN_BEFORE_FILE"

append_command "adb -s $ANDROID_SERIAL shell wm size"
DISPLAY_SIZE="$(adb -s "$ANDROID_SERIAL" shell wm size | tr -d '\r' | sed -n 's/^Physical size: //p' | head -n 1)"
printf '%s\n' "$DISPLAY_SIZE" > "$DISPLAY_SIZE_FILE"

WIDTH="${DISPLAY_SIZE%x*}"
HEIGHT="${DISPLAY_SIZE#*x}"
if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  WIDTH=1080
  HEIGHT=2400
fi

TAP_X=$(( WIDTH * 86 / 100 ))
TAP_Y=$(( HEIGHT * 86 / 100 ))
MID_X=$(( WIDTH / 2 ))
MID_Y=$(( HEIGHT * 30 / 100 ))

append_command "adb -s $ANDROID_SERIAL shell screenrecord --time-limit 10 /sdcard/device-demo.mp4"
adb -s "$ANDROID_SERIAL" shell screenrecord --time-limit 10 /sdcard/device-demo.mp4 >/dev/null 2>&1 &
SCREENRECORD_PID=$!

sleep 2
append_command "adb -s $ANDROID_SERIAL shell input tap $TAP_X $TAP_Y"
adb -s "$ANDROID_SERIAL" shell input tap "$TAP_X" "$TAP_Y"
sleep 2
append_command "adb -s $ANDROID_SERIAL shell input tap $MID_X $MID_Y"
adb -s "$ANDROID_SERIAL" shell input tap "$MID_X" "$MID_Y"
sleep 2
append_command "adb -s $ANDROID_SERIAL shell input keyevent KEYCODE_BACK"
adb -s "$ANDROID_SERIAL" shell input keyevent KEYCODE_BACK

wait "$SCREENRECORD_PID"

append_command "adb -s $ANDROID_SERIAL exec-out screencap -p > $SCREEN_AFTER_FILE"
adb -s "$ANDROID_SERIAL" exec-out screencap -p > "$SCREEN_AFTER_FILE"

append_command "adb -s $ANDROID_SERIAL shell uiautomator dump /sdcard/window_dump.xml"
adb -s "$ANDROID_SERIAL" shell uiautomator dump /sdcard/window_dump.xml >/dev/null
append_command "adb -s $ANDROID_SERIAL pull /sdcard/window_dump.xml $WINDOW_DUMP_FILE"
adb -s "$ANDROID_SERIAL" pull /sdcard/window_dump.xml "$WINDOW_DUMP_FILE" >/dev/null
adb -s "$ANDROID_SERIAL" shell rm /sdcard/window_dump.xml >/dev/null

append_command "adb -s $ANDROID_SERIAL logcat -d -v threadtime -t 200 > $LOGCAT_FILE"
adb -s "$ANDROID_SERIAL" logcat -d -v threadtime -t 200 > "$LOGCAT_FILE"

append_command "adb -s $ANDROID_SERIAL pull /sdcard/device-demo.mp4 $VIDEO_RAW_FILE"
adb -s "$ANDROID_SERIAL" pull /sdcard/device-demo.mp4 "$VIDEO_RAW_FILE" >/dev/null
adb -s "$ANDROID_SERIAL" shell rm /sdcard/device-demo.mp4 >/dev/null

append_command "ffmpeg -y -i $VIDEO_RAW_FILE -vf scale=960:-2:flags=lanczos,fps=12 -an -c:v libx264 -preset veryfast -crf 30 $VIDEO_FILE"
ffmpeg -y -i "$VIDEO_RAW_FILE" -vf "scale=960:-2:flags=lanczos,fps=12" -an -c:v libx264 -preset veryfast -crf 30 "$VIDEO_FILE" >/dev/null 2>&1

append_command "ffmpeg -y -i $VIDEO_FILE -vf thumbnail,scale=960:-2 -frames:v 1 $VIDEO_POSTER_PNG"
ffmpeg -y -i "$VIDEO_FILE" -vf "thumbnail,scale=960:-2" -frames:v 1 "$VIDEO_POSTER_PNG" >/dev/null 2>&1

cat > "$METADATA_ENV" <<EOF
FIXTURE_LABEL=$FIXTURE_LABEL
FIXTURE_REPO_URL=$FIXTURE_REPO_URL
FIXTURE_BRANCH=$FIXTURE_BRANCH
FIXTURE_REF=$FIXTURE_REF
FIXTURE_MODULE=$FIXTURE_MODULE
PROJECT_ROOT=$PROJECT_ROOT
ANDROID_SERIAL=$ANDROID_SERIAL
PACKAGE_NAME=$PACKAGE_NAME
DISPLAY_SIZE=$DISPLAY_SIZE
ASSEMBLE_TASK=$ASSEMBLE_TASK
UNIT_TEST_TASK=$UNIT_TEST_TASK
CONNECTED_TASK=$CONNECTED_TASK
APK_PATH=$APK_PATH
ROOT_DISCOVERY_FILE=$ROOT_DISCOVERY_FILE
TASKS_FILE=$TASKS_FILE
BUILD_LOG=$BUILD_LOG
CONNECTED_LOG=$CONNECTED_LOG
LOGCAT_FILE=$LOGCAT_FILE
WINDOW_DUMP_FILE=$WINDOW_DUMP_FILE
SCREEN_BEFORE_FILE=$SCREEN_BEFORE_FILE
SCREEN_AFTER_FILE=$SCREEN_AFTER_FILE
VIDEO_FILE=$VIDEO_FILE
VIDEO_POSTER_PNG=$VIDEO_POSTER_PNG
COMMANDS_FILE=$COMMANDS_FILE
EOF

printf 'tooling_dir\t%s\n' "$TOOLING_DIR"
printf 'metadata\t%s\n' "$METADATA_ENV"
printf 'package_name\t%s\n' "$PACKAGE_NAME"
printf 'connected_task\t%s\n' "$CONNECTED_TASK"