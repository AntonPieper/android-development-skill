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
    tooling-smoke.sh
scripts/
  process-android-tooling-artifacts.mjs
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

android-development emulator-backed tooling smoke:

```bash
npm ci
./validation/android-development/tooling-smoke.sh
node ./scripts/process-android-tooling-artifacts.mjs "$RUN_ROOT"
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

The scheduled smoke workflow writes a GitHub Actions job summary and uploads a report artifact with Markdown, JSON, HTML, processed screenshots, cropped WebP stills, a short device recording, and the raw Android evidence bundle.

The GitHub Pages workflow publishes the generated static site from `dist/site/`, built by `node ./scripts/build-pages-site.mjs ./dist/site` in GitHub Actions.

For local preview, build the generated bundle first and then serve `dist/site/` over HTTP. Serving raw `site/` will skip the generated `data/latest.json` payload that the page expects.

```bash
npm run build:site
python3 -m http.server 4173 -d ./dist/site
```

The smoke workflow now combines three data lanes for the website: prompt smoke telemetry, a Copilot-driven showcase dataset, and an emulator-backed Android tooling smoke that builds a public sample app, captures screenshots and video, processes those assets, and emits a richer Pages bundle for the site.
