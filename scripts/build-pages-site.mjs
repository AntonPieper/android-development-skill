import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoDir = path.resolve(__dirname, '..');
const siteDir = path.join(repoDir, 'site');
const evalsDir = path.join(repoDir, 'validation', 'android-development', 'evals');

const outputDir = process.argv[2];
const runRootArg = process.argv[3] || '';
const liveDataUrl = process.argv[4] || '';

if (!outputDir) {
  console.error('Usage: node scripts/build-pages-site.mjs <output-dir> [run-root] [live-data-url]');
  process.exit(1);
}

const scenarioOrder = ['discovery', 'tasks', 'modernization', 'ui-triage'];
const scenarioNames = {
  discovery: 'Root Discovery',
  tasks: 'Task Selection',
  modernization: 'Modernization',
  'ui-triage': 'UI Triage',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseIntLike(value) {
  const match = String(value ?? '').replaceAll(',', '').match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractFirstJson(text) {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

async function readEvalCounts() {
  const [evalsText, trainText, validationText] = await Promise.all([
    fs.readFile(path.join(evalsDir, 'evals.json'), 'utf8'),
    fs.readFile(path.join(evalsDir, 'trigger-queries.train.json'), 'utf8'),
    fs.readFile(path.join(evalsDir, 'trigger-queries.validation.json'), 'utf8'),
  ]);

  const evals = JSON.parse(evalsText);
  const triggerTrain = JSON.parse(trainText);
  const triggerValidation = JSON.parse(validationText);

  return {
    outputEvalCases: evals.evals.length,
    triggerTrainQueries: triggerTrain.length,
    triggerValidationQueries: triggerValidation.length,
    triggerQueriesTotal: triggerTrain.length + triggerValidation.length,
  };
}

function buildMatrix(rows) {
  const repos = [...new Set(rows.map((row) => row.repo))];
  const scenarios = scenarioOrder.filter((scenario) => rows.some((row) => row.scenario === scenario));
  const cells = repos.flatMap((repo) => scenarios.map((scenario) => {
    const match = rows.find((row) => row.repo === repo && row.scenario === scenario);
    return {
      repo,
      scenario,
      result: match?.result ?? 'MISSING',
      exit_code: match?.exit_code ?? '',
      total_usage: match?.total_usage ?? '',
      session_time: match?.session_time ?? '',
      log_name: match?.log_name ?? '',
    };
  }));

  return { repos, scenarios, cells };
}

function buildMatrixSvg(data) {
  const cellWidth = 122;
  const cellHeight = 72;
  const leftMargin = 170;
  const topMargin = 96;
  const width = leftMargin + (data.matrix.scenarios.length * cellWidth) + 40;
  const height = topMargin + (data.matrix.repos.length * cellHeight) + 36;

  const cellColor = {
    PASS: '#d6f5df',
    FAIL: '#ffd8c2',
    MISSING: '#efe7d8',
  };

  const rowsSvg = data.matrix.repos.map((repo, rowIndex) => {
    const y = topMargin + (rowIndex * cellHeight);
    const label = `<text x="24" y="${y + 42}" font-family="IBM Plex Mono, monospace" font-size="14" fill="#2b241d">${escapeHtml(repo)}</text>`;
    const cells = data.matrix.scenarios.map((scenario, colIndex) => {
      const x = leftMargin + (colIndex * cellWidth);
      const cell = data.matrix.cells.find((item) => item.repo === repo && item.scenario === scenario);
      const result = cell?.result ?? 'MISSING';
      const detail = result === 'FAIL' ? (cell?.exit_code || '1') : (cell?.session_time || 'ok');
      return `
        <g>
          <rect x="${x}" y="${y}" width="110" height="56" rx="18" fill="${cellColor[result]}" stroke="rgba(21,19,17,0.08)" />
          <text x="${x + 18}" y="${y + 24}" font-family="IBM Plex Mono, monospace" font-size="13" fill="#151311">${escapeHtml(result)}</text>
          <text x="${x + 18}" y="${y + 42}" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="rgba(21,19,17,0.68)">${escapeHtml(detail)}</text>
        </g>`;
    }).join('');
    return `${label}${cells}`;
  }).join('');

  const headersSvg = data.matrix.scenarios.map((scenario, index) => {
    const x = leftMargin + (index * cellWidth) + 18;
    return `<text x="${x}" y="54" font-family="IBM Plex Mono, monospace" font-size="13" fill="#2b241d">${escapeHtml(scenarioNames[scenario] || scenario)}</text>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" rx="28" fill="#fffaf4" />
  <text x="24" y="34" font-family="Fraunces, serif" font-size="24" fill="#151311">Latest smoke matrix</text>
  <text x="24" y="58" font-family="IBM Plex Sans, sans-serif" font-size="14" fill="rgba(21,19,17,0.68)">${escapeHtml(`${data.headline.total_cases} cases · ${data.headline.passed} passed · ${data.headline.failed} failed`)}</text>
  ${headersSvg}
  ${rowsSvg}
</svg>`;
}

function buildScenarioBarsSvg(data) {
  const width = 760;
  const height = 280;
  const innerWidth = 420;
  const maxTotal = Math.max(1, ...data.scenario_stats.map((item) => item.total));

  const rowsSvg = data.scenario_stats.map((item, index) => {
    const y = 46 + (index * 54);
    const passWidth = (item.passed / maxTotal) * innerWidth;
    const failWidth = (item.failed / maxTotal) * innerWidth;
    return `
      <g>
        <text x="24" y="${y + 20}" font-family="IBM Plex Mono, monospace" font-size="13" fill="#2b241d">${escapeHtml(scenarioNames[item.scenario] || item.scenario)}</text>
        <rect x="248" y="${y}" width="${innerWidth}" height="24" rx="12" fill="#efe7d8" />
        <rect x="248" y="${y}" width="${passWidth}" height="24" rx="12" fill="#1f7a8c" />
        <rect x="${248 + passWidth}" y="${y}" width="${failWidth}" height="24" rx="12" fill="#ff6b2c" />
        <text x="686" y="${y + 17}" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="rgba(21,19,17,0.72)">${item.passed}/${item.total} passed</text>
      </g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" rx="28" fill="#f6f0e4" />
  <text x="24" y="34" font-family="Fraunces, serif" font-size="24" fill="#151311">Scenario coverage</text>
  <text x="24" y="58" font-family="IBM Plex Sans, sans-serif" font-size="14" fill="rgba(21,19,17,0.68)">Pass or fail counts for each scenario in the latest smoke run.</text>
  ${rowsSvg}
</svg>`;
}

function buildRepoStats(rows) {
  return [...new Set(rows.map((row) => row.repo))].map((repo) => {
    const repoRows = rows.filter((row) => row.repo === repo);
    const passed = repoRows.filter((row) => row.result === 'PASS').length;
    return {
      repo,
      total: repoRows.length,
      passed,
      failed: repoRows.length - passed,
    };
  });
}

function buildScenarioStats(rows) {
  return scenarioOrder
    .filter((scenario) => rows.some((row) => row.scenario === scenario))
    .map((scenario) => {
      const scenarioRows = rows.filter((row) => row.scenario === scenario);
      const passed = scenarioRows.filter((row) => row.result === 'PASS').length;
      return {
        scenario,
        total: scenarioRows.length,
        passed,
        failed: scenarioRows.length - passed,
      };
    });
}

async function loadShowcase(runRoot) {
  const rawDir = path.join(runRoot, 'showcase', 'raw');
  if (!(await fileExists(rawDir))) {
    return [];
  }

  const files = (await fs.readdir(rawDir)).filter((file) => file.endsWith('.txt')).sort();
  const showcase = [];

  for (const file of files) {
    const rawText = await fs.readFile(path.join(rawDir, file), 'utf8');
    const jsonText = extractFirstJson(rawText);
    if (!jsonText) {
      continue;
    }
    try {
      const parsed = JSON.parse(jsonText);
      showcase.push({
        id: parsed.id || file.replace(/\.txt$/, ''),
        scenario: parsed.scenario || 'unknown',
        repo_label: parsed.repo_label || file.split('__')[0],
        repo_url: parsed.repo_url || '',
        headline: parsed.headline || 'Showcase result',
        summary: parsed.summary || '',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 4) : [],
        commands: Array.isArray(parsed.commands) ? parsed.commands.slice(0, 4) : [],
        quote: parsed.quote || '',
      });
    } catch {
      // ignore malformed output and continue with the rest of the showcase set
    }
  }

  return showcase.sort((left, right) => scenarioOrder.indexOf(left.scenario) - scenarioOrder.indexOf(right.scenario));
}

async function buildDataFromRunRoot(runRoot) {
  const summaryJsonPath = path.join(runRoot, 'report', 'summary.json');
  if (!(await fileExists(summaryJsonPath))) {
    return null;
  }

  const summary = JSON.parse(await fs.readFile(summaryJsonPath, 'utf8'));
  const rows = Array.isArray(summary.rows) ? summary.rows : [];
  const showcase = await loadShowcase(runRoot);
  const coverage = summary.evalCounts || await readEvalCounts();
  const repoStats = buildRepoStats(rows);
  const scenarioStats = buildScenarioStats(rows);
  const totalInTokens = rows.reduce((sum, row) => sum + parseIntLike(row.in_tokens), 0);
  const totalOutTokens = rows.reduce((sum, row) => sum + parseIntLike(row.out_tokens), 0);
  const reportPath = path.join(runRoot, 'report', 'index.html');

  return {
    generated_at: new Date().toISOString(),
    source: 'smoke-run',
    workflow_run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
    headline: {
      total_cases: summary.counts?.total ?? rows.length,
      passed: summary.counts?.passed ?? rows.filter((row) => row.result === 'PASS').length,
      failed: summary.counts?.failed ?? rows.filter((row) => row.result === 'FAIL').length,
      repos_covered: repoStats.length,
      scenarios_covered: scenarioStats.length,
      pass_rate: rows.length === 0 ? 0 : Math.round(((summary.counts?.passed ?? rows.filter((row) => row.result === 'PASS').length) / rows.length) * 100),
      total_input_tokens: totalInTokens,
      total_output_tokens: totalOutTokens,
    },
    coverage,
    repo_stats: repoStats,
    scenario_stats: scenarioStats,
    matrix: buildMatrix(rows),
    showcase,
    links: {
      report: (await fileExists(reportPath)) ? './reports/latest/index.html' : null,
      workflow_run: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
    },
  };
}

async function fetchJson(url) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html, text/plain;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function buildFallbackData() {
  const coverage = await readEvalCounts();
  return {
    generated_at: new Date().toISOString(),
    source: 'fallback',
    workflow_run_url: null,
    headline: {
      total_cases: 0,
      passed: 0,
      failed: 0,
      repos_covered: 0,
      scenarios_covered: 4,
      pass_rate: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
    },
    coverage,
    repo_stats: [],
    scenario_stats: scenarioOrder.map((scenario) => ({ scenario, total: 0, passed: 0, failed: 0 })),
    matrix: { repos: [], scenarios: scenarioOrder, cells: [] },
    showcase: [],
    links: {
      report: null,
      workflow_run: null,
    },
  };
}

async function loadSiteData(runRoot, liveUrl) {
  if (runRoot) {
    const fromRunRoot = await buildDataFromRunRoot(runRoot);
    if (fromRunRoot) {
      return { data: fromRunRoot, reportHtml: await fs.readFile(path.join(runRoot, 'report', 'index.html'), 'utf8').catch(() => null) };
    }
  }

  const liveData = await fetchJson(liveUrl);
  if (liveData) {
    const reportUrl = liveUrl ? new URL('../reports/latest/index.html', liveUrl).toString() : '';
    const reportHtml = await fetchText(reportUrl);
    return {
      data: {
        ...liveData,
        source: 'live-cache',
      },
      reportHtml,
    };
  }

  return { data: await buildFallbackData(), reportHtml: null };
}

const { data: siteData, reportHtml } = await loadSiteData(runRootArg, liveDataUrl);

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(siteDir, outputDir, { recursive: true });

const dataDir = path.join(outputDir, 'data');
const generatedDir = path.join(outputDir, 'generated');
const reportOutputDir = path.join(outputDir, 'reports', 'latest');

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(generatedDir, { recursive: true });

siteData.visuals = {
  matrix: './generated/matrix.svg',
  scenario_bars: './generated/scenario-bars.svg',
};

await Promise.all([
  fs.writeFile(path.join(dataDir, 'latest.json'), `${JSON.stringify(siteData, null, 2)}\n`),
  fs.writeFile(path.join(generatedDir, 'matrix.svg'), buildMatrixSvg(siteData)),
  fs.writeFile(path.join(generatedDir, 'scenario-bars.svg'), buildScenarioBarsSvg(siteData)),
]);

if (reportHtml) {
  await fs.mkdir(reportOutputDir, { recursive: true });
  await fs.writeFile(path.join(reportOutputDir, 'index.html'), reportHtml);
}

console.log(`Built Pages site in ${outputDir}`);