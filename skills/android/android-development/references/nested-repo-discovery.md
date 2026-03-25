# Nested Android Repo Discovery

Use this file when the repository contains multiple Android project roots.

## Goal

Find the smallest Android project root that actually owns the task.

Prefer the nearest directory that contains both:

- `gradlew`
- `settings.gradle` or `settings.gradle.kts`

## Cheap Discovery Order

Start with file inspection before Gradle commands:

```bash
find . -maxdepth 4 \( -name gradlew -o -name settings.gradle -o -name settings.gradle.kts \)
cat settings.gradle.kts
cat app/build.gradle.kts
./gradlew -q projects
./gradlew help --task assembleDebug
```

Treat the `maxdepth 4` search as the cheap first pass. If it finds nothing, inspect likely Android subdirectories or widen the search once before declaring that the repository has no Android project.

If the sample uses Groovy DSL, substitute `build.gradle` and `settings.gradle`.

## Typical Patterns

- Sample catalog repo: each sample has its own wrapper and settings file.
- Monorepo: one root wrapper drives many included modules.
- Legacy repo: wrapper may live above the Android app directory.

Do not assume the outer repo root is the build root.

## When To Stop Going Broader

If you already found:

- the project root
- included modules
- the app module path
- the task you need

stop. Do not jump to `tasks --all` unless targeted help is still unclear.

## Common Outputs To Report

When acting in a nested repo, always report:

- the exact project root used
- the module path used
- the wrapper command run from that root
- the artifact path or test task selected

## Cost Warning

Even wrapper inspection can download Gradle on a fresh clone. Prefer file reads first.
