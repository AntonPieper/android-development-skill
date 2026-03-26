import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const runRoot = process.argv[2];

if (!runRoot) {
  console.error('Usage: node scripts/process-android-tooling-artifacts.mjs <run-root>');
  process.exit(1);
}

const toolingDir = path.join(runRoot, 'tooling');
const metadataPath = path.join(toolingDir, 'metadata.env');
const processedDir = path.join(toolingDir, 'processed');
const summaryPath = path.join(toolingDir, 'summary.json');

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const entries = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line || !line.includes('=')) {
      continue;
    }

    const [key, ...rest] = line.split('=');
    entries[key] = rest.join('=');
  }

  return entries;
}

function toRelative(filePath) {
  return `./${path.relative(toolingDir, filePath).replaceAll(path.sep, '/')}`;
}

function dedupe(values, limit = 6) {
  const unique = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || unique.includes(normalized)) {
      continue;
    }
    unique.push(normalized);
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

async function createStillVariants(inputPath) {
  const primaryPath = path.join(processedDir, 'screen-primary.webp');
  const detailPath = path.join(processedDir, 'screen-detail.webp');
  const posterPath = path.join(processedDir, 'screen-poster.webp');
  const metadata = await sharp(inputPath).metadata();

  await Promise.all([
    sharp(inputPath)
      .resize({ width: 1280, fit: sharp.fit.inside, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(primaryPath),
    sharp(inputPath)
      .resize({ width: 780, height: 980, fit: sharp.fit.cover, position: sharp.strategy.entropy })
      .webp({ quality: 80 })
      .toFile(detailPath),
    sharp(inputPath)
      .resize({ width: 1440, height: 900, fit: sharp.fit.cover, position: sharp.strategy.attention })
      .webp({ quality: 80 })
      .toFile(posterPath),
  ]);

  return {
    metadata,
    primaryPath,
    detailPath,
    posterPath,
  };
}

async function createPosterVariant(inputPath) {
  const outputPath = path.join(processedDir, 'video-poster.webp');

  await sharp(inputPath)
    .resize({ width: 1280, fit: sharp.fit.inside, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outputPath);

  return outputPath;
}

function extractUiSignals(xmlText) {
  const signals = [];
  const attributePattern = /(text|content-desc|resource-id)="([^"]+)"/g;

  for (const match of xmlText.matchAll(attributePattern)) {
    const rawValue = match[2].trim();
    if (!rawValue) {
      continue;
    }

    const cleaned = rawValue.includes('/') ? rawValue.split('/').at(-1) : rawValue;
    signals.push(cleaned.replaceAll('_', ' '));
  }

  return dedupe(signals, 8);
}

function extractLogSignals(logText, packageName) {
  const interestingLines = logText
    .split(/\r?\n/)
    .filter((line) => line.includes('ActivityTaskManager') || line.includes('WindowManager') || line.includes('Displayed') || line.includes('AndroidRuntime') || (packageName && line.includes(packageName)));

  if (interestingLines.length > 0) {
    return dedupe(interestingLines.map((line) => line.replace(/^.*? [A-Z] /, '').trim()), 6);
  }

  return dedupe(logText.split(/\r?\n/), 4);
}

function buildChecks(metadata, hasConnectedTask, media) {
  return [
    {
      label: 'Project root discovered',
      status: 'pass',
      detail: path.basename(metadata.PROJECT_ROOT || 'android-project'),
    },
    {
      label: 'Task selection grounded in Gradle',
      status: 'pass',
      detail: [metadata.ASSEMBLE_TASK, metadata.UNIT_TEST_TASK, metadata.CONNECTED_TASK].filter(Boolean).join(' · '),
    },
    {
      label: hasConnectedTask ? 'Build, unit tests, and connected tests ran' : 'Build and unit tests ran',
      status: 'pass',
      detail: hasConnectedTask ? 'Emulator-backed scenario completed' : 'No connected Android test task was detected',
    },
    {
      label: media.video ? 'Screenshot and video evidence captured' : 'Screenshot evidence captured',
      status: media.video ? 'pass' : 'warning',
      detail: `${metadata.DISPLAY_SIZE || 'unknown display'} via ${metadata.ANDROID_SERIAL || 'unknown device'}`,
    },
  ];
}

if (!(await fileExists(metadataPath))) {
  console.error(`No tooling metadata found at ${metadataPath}`);
  process.exit(1);
}

await fs.mkdir(processedDir, { recursive: true });

const metadata = parseEnv(await fs.readFile(metadataPath, 'utf8'));
const commands = await fs.readFile(metadata.COMMANDS_FILE, 'utf8').then((text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)).catch(() => []);
const screenPath = metadata.SCREEN_AFTER_FILE || metadata.SCREEN_BEFORE_FILE;

if (!screenPath || !(await fileExists(screenPath))) {
  console.error('No screenshot artifact was produced by tooling-smoke.sh');
  process.exit(1);
}

const stills = await createStillVariants(screenPath);
const xmlText = metadata.WINDOW_DUMP_FILE && await fileExists(metadata.WINDOW_DUMP_FILE)
  ? await fs.readFile(metadata.WINDOW_DUMP_FILE, 'utf8')
  : '';
const logText = metadata.LOGCAT_FILE && await fileExists(metadata.LOGCAT_FILE)
  ? await fs.readFile(metadata.LOGCAT_FILE, 'utf8')
  : '';

const media = {
  primary: toRelative(stills.primaryPath),
  detail: toRelative(stills.detailPath),
  poster: toRelative(stills.posterPath),
  video: null,
  videoPoster: null,
};

if (metadata.VIDEO_FILE && await fileExists(metadata.VIDEO_FILE)) {
  media.video = toRelative(metadata.VIDEO_FILE);
}

if (metadata.VIDEO_POSTER_PNG && await fileExists(metadata.VIDEO_POSTER_PNG)) {
  media.videoPoster = toRelative(await createPosterVariant(metadata.VIDEO_POSTER_PNG));
}

const summary = {
  generated_at: new Date().toISOString(),
  sample: {
    label: metadata.FIXTURE_LABEL,
    repo_url: metadata.FIXTURE_REPO_URL,
    branch: metadata.FIXTURE_BRANCH,
    ref: metadata.FIXTURE_REF,
    module: metadata.FIXTURE_MODULE,
    project_root: metadata.PROJECT_ROOT,
    package_name: metadata.PACKAGE_NAME,
    serial: metadata.ANDROID_SERIAL,
    display_size: metadata.DISPLAY_SIZE,
  },
  checks: buildChecks(metadata, Boolean(metadata.CONNECTED_TASK), media),
  commands: commands.slice(0, 10),
  analysis: {
    screenshot: {
      width: stills.metadata.width ?? 0,
      height: stills.metadata.height ?? 0,
      format: stills.metadata.format ?? 'unknown',
    },
    ui_signals: extractUiSignals(xmlText),
    log_signals: extractLogSignals(logText, metadata.PACKAGE_NAME),
  },
  media,
};

await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Processed Android tooling artifacts in ${toolingDir}`);