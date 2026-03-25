# ai-skills

Monorepo for installable Copilot skills.

`npx skills add` discovers skills recursively from the repository root by `SKILL.md` plus frontmatter `name`, so skills can live at any depth.

## Install

Install from GitHub by skill name:

```bash
npx skills add AntonPieper/ai-skills --skill android-development
```

List all skills in the repository:

```bash
npx skills add AntonPieper/ai-skills --list
```

Install from a local clone:

```bash
npx skills add "$PWD" --skill android-development -g -a github-copilot -y
```

List from a local clone:

```bash
npx skills add "$PWD" --list
```

## Layout

```text
skills/
  android/
    android-development/
      SKILL.md
      references/
validation/
  android-development/
    smoke.sh
scripts/
  validate-skills-catalog.sh
```

Rules:

- Only files under `skills/.../<skill>/` are installable payload.
- Keep validation, smoke tests, and contributor docs outside `skills/`.
- Group skills by topic or platform, but keep each leaf skill directory named after the skill when practical.

Authoring guidance:

- Write `description` in imperative trigger form: tell the agent when to use the skill, using user intent rather than internal implementation details.
- Keep `SKILL.md` focused on the reusable workflow and move heavier detail to targeted reference files.
- Prefer defaults and small, task-scoped procedures over menus of equal options.
- Keep evals and trigger-query sets under `validation/<skill>/evals/` so they do not ship as installable payload.

## Validation

Catalog validation:

```bash
./scripts/validate-skills-catalog.sh
./scripts/validate-validation-assets.sh
```

android-development smoke matrix:

```bash
./validation/android-development/smoke.sh
```

Useful overrides:

```bash
JOBS=2 TIMEOUT_SECONDS=240 ./validation/android-development/smoke.sh
REPOS=termux,cleanarchitecture SCENARIOS=discovery,modernization ./validation/android-development/smoke.sh
RUN_ROOT="$PWD/tmp/android-smoke" ./validation/android-development/smoke.sh
```

Skill eval assets for `android-development` live in `validation/android-development/evals/`:

- `evals.json` for output-quality eval cases and assertions.
- `trigger-queries.train.json` and `trigger-queries.validation.json` for description-trigger tuning.

The scheduled smoke workflow writes a GitHub Actions job summary and uploads a report artifact with Markdown, JSON, and HTML renderings of the smoke matrix.

The GitHub Pages workflow publishes the static skill site from `site/` using GitHub Actions.

The smoke workflow also acquires a small Copilot-driven showcase dataset and builds a Pages bundle with live smoke metrics, generated visual assets, and curated scenario outputs for the website.
