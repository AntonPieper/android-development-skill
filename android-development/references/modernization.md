# Modernization

Use this file when the project builds poorly because the build system is old, or when you are asked to modernize Android or Gradle infrastructure.

## Default Upgrade Direction

Use current stable upstream releases unless the repo has a clear compatibility reason not to.

Prefer replacing the wrapper and plugin versions with standard upstream releases instead of maintaining bespoke compatibility hacks.

## Detect First

Search for common legacy signals before editing:

- `buildscript {}` plus `apply plugin:`
- `jcenter()`
- `flatDir {}`
- `compile`, `testCompile`, `androidTestCompile`
- support libraries instead of AndroidX
- missing `namespace`
- root `allprojects` or `subprojects` mutation
- `afterEvaluate` and other configuration-time hacks
- `ext` version sprawl instead of a version catalog

Also inspect version-catalog-based repos directly:

- `gradle/libs.versions.toml`
- plugin aliases in `build.gradle(.kts)`
- version catalog references in `settings.gradle(.kts)`

Legacy but still-building patterns matter too. Do not wait for a hard deprecation error before flagging them.

## Preferred Replacements

- Prefer `plugins {}` and `pluginManagement {}` over legacy plugin application.
- Prefer `google()` and `mavenCentral()` over `jcenter()` and `flatDir`.
- Prefer `implementation`, `api`, `compileOnly`, `runtimeOnly`, `testImplementation`, and `androidTestImplementation` over old dependency buckets.
- Prefer AndroidX over support libraries.
- Add `namespace` explicitly to every Android module.
- Prefer centralized repository and plugin management in `settings.gradle(.kts)`.
- Prefer version catalogs instead of scattered `ext` version constants.
- Prefer convention plugins or shared build logic over heavy root `allprojects` mutation.

## Replacement Order

Prefer changing one source of truth at a time:

1. identify where the wrapper version lives
2. identify where plugin versions live
3. identify whether versions come from `libs.versions.toml`, `pluginManagement`, or direct plugin declarations
4. replace those sources of truth, then rerun a small verification pass

Useful reads before editing:

```bash
cat gradle/wrapper/gradle-wrapper.properties
cat gradle/libs.versions.toml
cat settings.gradle.kts
cat build.gradle.kts
./gradlew --version
./gradlew help --task assembleDebug
```

If the repo uses Groovy DSL, substitute `settings.gradle` and `build.gradle`.

## Wrapper Upgrade

Upgrade with the wrapper task instead of hand-editing scripts:

```bash
./gradlew wrapper --gradle-version <target-gradle-version>
./gradlew wrapper --gradle-version <target-gradle-version>
./gradlew --version
```

Running the wrapper task twice refreshes both the properties and the wrapper files.

## Wrapper Safety

When reviewing wrapper updates, verify the wrapper JAR against Gradle-published checksums or wrapper validation tooling.

## AGP And JDK Compatibility

Upgrade AGP together with a compatible Gradle and JDK.

If versions are hidden behind plugin aliases or a version catalog, resolve those first before deciding whether the project is truly current.

If plugin versions come from `libs.versions.toml` or `pluginManagement`, replace them there once instead of editing every module.

If the project is very old, inspect custom build logic before jumping versions. A modern wrapper alone will not fix old AGP internals, root scripts, or deprecated APIs.

## Stop Conditions

Pause and explain the risk before editing when you find:

- custom Gradle plugins or `buildSrc` logic tied to old AGP internals
- heavy `afterEvaluate` logic
- large multi-module builds with root-script mutation everywhere
- support-library to AndroidX migration not yet done

These are still modernizable, but they are not safe to treat as a one-line version bump.
