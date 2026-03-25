# android-development

Lightweight Android CLI skill for GitHub Copilot and other
skills-compatible agents.

This package is built around progressive disclosure:

- `SKILL.md` stays small and acts as the router.
- Each reference file handles one topic only.
- There are no custom scripts or helper CLIs.
- Agents are expected to use standard Android and Gradle commands.

## Covers

- environment setup and updates
- nested Android repo discovery
- tool discovery
- build, lint, and tests
- emulator and device lifecycle
- on-device interaction and visual checks
- bounded diagnostics
- legacy build-system modernization

## Layout

- `SKILL.md`: the skill instructions shown to the agent
- `references/`: small topic files loaded only when needed

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

List the skill without installing:

```bash
npx skills add /absolute/path/to/android-development --list
```

## Design Rules

- Keep the root skill short.
- Keep reference files small and topic-specific.
- Prefer standard commands such as `sdkmanager`, `avdmanager`, `emulator`, `adb`, and `./gradlew`.
- Prefer cheap Gradle inspection such as `./gradlew -q projects` and `help --task` before `tasks --all`.
- Do not add custom helper scripts back into the package.
- Put high-churn details in references, not in `SKILL.md`.

## Validation

Skill package smoke test:

```bash
npx skills add /absolute/path/to/android-development --list
```

Local Copilot CLI smoke test:

```bash
copilot --model <raptor-mini-or-gpt-5-mini> -p "Use the android-development skill. Show the smallest standard commands to discover the Android toolchain and project wrapper tasks." --allow-tool='shell' --add-dir /absolute/path/to/android-development
```

Prefer a Raptor mini model if the local CLI exposes it. If not, use GPT-5 mini.
