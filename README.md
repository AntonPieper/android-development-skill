# android-development

Cross-platform Android development skill for GitHub Copilot
and other skills-compatible agents.

It provides a small Python helper for common Android workflows:

- bootstrap Android tooling on fresh clones
- resolve a compatible Java runtime for Gradle
- run build and lint with the Gradle wrapper
- capture screenshots, hierarchy dumps, and bounded logcat
- batch adb UI actions
- start emulators and send emulator console commands

## Layout

- `SKILL.md`: the skill instructions shown to the agent
- `scripts/android_tooling.py`: the helper CLI
- `references/`: short setup and troubleshooting notes

## Install

Global install for GitHub Copilot:

```bash
npx skills add /absolute/path/to/android-development -g -a github-copilot -y
```

Project install for GitHub Copilot:

```bash
cd /path/to/repo
npx skills add /absolute/path/to/android-development -a github-copilot -y
```

## Copilot CLI note

Skills do not declare runtime permissions themselves. Tool and
path approvals are controlled by the agent runtime.

For helper-only, non-interactive `copilot -p` runs, prefer a
project install and narrow Python shell approval instead of
`--allow-all`:

```bash
cd /path/to/repo
npx skills add /absolute/path/to/android-development -a github-copilot -y
copilot -p "Use the android-development skill ..." \
  --allow-tool='shell(python:*)' \
  --allow-tool='shell(python3:*)'
```

On Windows, also allow `py` if needed:

```powershell
copilot -p "Use the android-development skill ..." --allow-tool='shell(py:*)'
```

For global installs, add the installed skills directory if the
runtime restricts path access:

```bash
copilot -p "Use the android-development skill ..." \
  --allow-tool='shell(python:*)' \
  --allow-tool='shell(python3:*)' \
  --add-dir ~/.agents/skills
```

If you want Copilot CLI to run direct repo shell commands
beyond the helper, use a trusted project directory and widen
approvals deliberately, for example `--allow-tool='shell'`.

Without preapproved shell access, non-interactive Copilot CLI
runs can deny helper execution because they cannot pause to ask
for permission.

## Helper usage

```bash
python scripts/android_tooling.py --help
python scripts/android_tooling.py doctor --repo /path/to/android/repo
```

## Development

Validate the helper locally:

```bash
python3 -m py_compile scripts/android_tooling.py
python3 scripts/android_tooling.py --help
```
