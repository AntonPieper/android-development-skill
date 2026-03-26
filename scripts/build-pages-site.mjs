import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, '..');
const siteDir = path.join(repoDir, 'site');

const outputDir = process.argv[2];
const runRoot = process.argv[3] || '';
const liveDataUrl = process.argv[4] || '';

if (!outputDir) {
  console.error('Usage: node scripts/build-pages-site.mjs <output-dir> [run-root] [live-data-url]');
  process.exit(1);
}

/* ── Unified pipeline ─────────────────────────────────────── */

function buildSchema() {
  const schema = structuredClone(defaultSchema);
  schema.tagNames = [...(schema.tagNames || []), 'video', 'source', 'figure', 'figcaption'];
  schema.attributes = {
    ...(schema.attributes || {}),
    a: [...(schema.attributes?.a || []), 'target', 'rel'],
    code: [...(schema.attributes?.code || []), ['className', /^language-./]],
    img: [...(schema.attributes?.img || []), 'loading', 'decoding'],
    video: ['aria-label', 'controls', 'loop', 'muted', 'playsinline', 'poster', 'preload', ['className']],
    source: ['src', 'type'],
  };
  return schema;
}

const md = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, buildSchema())
  .use(rehypeStringify);

function rewriteAssetUrls(html, base) {
  return html
    .replaceAll(/(src|href|poster)="\.\/([^"]+)"/g, (_, attr, p) => `${attr}="${base}/${p}"`)
    .replaceAll(/(src|href|poster)="(media\/[^"]+)"/g, (_, attr, p) => `${attr}="${base}/${p}"`)
    .replaceAll(/(src|href|poster)="(raw\/[^"]+)"/g, (_, attr, p) => `${attr}="${base}/${p}"`);
}

async function renderMarkdown(text, base) {
  const html = String(await md.process(text));
  return rewriteAssetUrls(html, base);
}

/* ── Helpers ──────────────────────────────────────────────── */

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
async function readJson(p, fallback = null) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; } }

async function fetchText(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; }
}
async function fetchJson(url) { const t = await fetchText(url); if (!t) return null; try { return JSON.parse(t); } catch { return null; } }
async function fetchBuffer(url) { try { const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; } }

function withBase(base, rel) { return rel ? `${base}/${String(rel).replace(/^\.\//, '')}` : null; }

/* ── Load scenarios from local run root ───────────────────── */

async function loadLocalScenarios(root) {
  const scenarioRoot = path.join(root, 'scenarios');
  if (!root || !(await exists(scenarioRoot))) return [];

  const entries = await fs.readdir(scenarioRoot, { withFileTypes: true });
  const scenarios = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(scenarioRoot, entry.name);
    const outDir = path.join(outputDir, 'reports', 'latest', 'scenarios', entry.name);
    const result = await readJson(path.join(dir, 'result.json'), {});
    const media = await readJson(path.join(dir, 'media', 'index.json'), { images: [], videos: [] });
    const reportMd = await fs.readFile(path.join(dir, 'report.md'), 'utf8').catch(() => '');

    await fs.mkdir(path.dirname(outDir), { recursive: true });
    await fs.cp(dir, outDir, { recursive: true, force: true });

    const base = `./reports/latest/scenarios/${entry.name}`;
    scenarios.push(await buildScenario(entry.name, result, media, reportMd, base));
  }

  return scenarios.sort((a, b) => a.title.localeCompare(b.title));
}

/* ── Load scenarios from published URL ────────────────────── */

async function loadPublishedScenarios(url) {
  if (!url) return null;
  const published = await fetchJson(url);
  if (!published?.scenarios?.length) {
    return published ? { generatedAt: published.generatedAt || new Date().toISOString(), scenarios: [] } : null;
  }

  const siteRoot = new URL('../', url);
  const scenarios = [];

  for (const s of published.scenarios) {
    const slug = s.slug || s.id;
    if (!slug || !s.reportPath || !s.resultPath) continue;

    const outDir = path.join(outputDir, 'reports', 'latest', 'scenarios', slug);
    await fs.mkdir(path.join(outDir, 'media'), { recursive: true });

    const result = await fetchJson(new URL(s.resultPath, siteRoot));
    const reportMd = await fetchText(new URL(s.reportPath, siteRoot));
    const media = await fetchJson(new URL(`./reports/latest/scenarios/${slug}/media/index.json`, siteRoot)) || s.media || { images: [], videos: [] };
    if (!result || !reportMd) continue;

    await Promise.all([
      fs.writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2) + '\n'),
      fs.writeFile(path.join(outDir, 'report.md'), reportMd),
      fs.writeFile(path.join(outDir, 'media', 'index.json'), JSON.stringify(media, null, 2) + '\n'),
    ]);

    // Download media assets
    const assets = new Set();
    for (const img of media.images || []) { if (img.output) assets.add(`./reports/latest/scenarios/${slug}/${String(img.output).replace(/^\.\//, '')}`); }
    for (const vid of media.videos || []) {
      if (vid.output) assets.add(`./reports/latest/scenarios/${slug}/${String(vid.output).replace(/^\.\//, '')}`);
      if (vid.poster) assets.add(`./reports/latest/scenarios/${slug}/${String(vid.poster).replace(/^\.\//, '')}`);
    }
    await Promise.all([...assets].map(async (a) => {
      const buf = await fetchBuffer(new URL(a, siteRoot));
      if (!buf) return;
      const target = path.join(outputDir, a.replace(/^\.\//, ''));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buf);
    }));

    const base = `./reports/latest/scenarios/${slug}`;
    scenarios.push(await buildScenario(slug, result, media, reportMd, base));
  }

  return { generatedAt: published.generatedAt || new Date().toISOString(), scenarios: scenarios.sort((a, b) => a.title.localeCompare(b.title)) };
}

/* ── Build a single scenario object ───────────────────────── */

async function buildScenario(slug, result, media, reportMd, base) {
  return {
    id: result.scenarioId || slug,
    slug,
    title: result.title || slug,
    status: result.status || 'unknown',
    generatedAt: result.generatedAt || null,
    summary: result.summary || '',
    type: result.type || result.scenarioId || slug,
    repoLabel: result.fixture?.label || 'Android fixture',
    repoUrl: result.fixture?.repoUrl || '',
    keyFindings: Array.isArray(result.keyFindings) ? result.keyFindings : [],
    reportHtml: reportMd ? await renderMarkdown(reportMd, base) : '',
    reportPath: `${base}/report.md`,
    resultPath: `${base}/result.json`,
    media,
    primaryImage: withBase(base, media.images?.[0]?.output),
    primaryVideo: withBase(base, media.videos?.[0]?.output),
    primaryVideoPoster: withBase(base, media.videos?.[0]?.poster),
  };
}

/* ── Summary ──────────────────────────────────────────────── */

function buildSummary(scenarios) {
  return {
    total: scenarios.length,
    passed: scenarios.filter(s => s.status === 'passed').length,
    failed: scenarios.filter(s => s.status === 'failed').length,
    warning: scenarios.filter(s => s.status === 'warning').length,
    fixtures: [...new Set(scenarios.map(s => s.repoLabel))],
    withMedia: scenarios.filter(s => s.media?.images?.length || s.media?.videos?.length).length,
  };
}

/* ── Report index page ────────────────────────────────────── */

function buildReportIndex(payload) {
  const cards = payload.scenarios.map(s => `
    <article class="card">
      <span class="st st-${s.status}">${s.status}</span>
      <span>${s.repoLabel}</span>
      <h2>${s.title}</h2>
      <p>${s.summary}</p>
      <p><a href="./scenarios/${s.slug}/report.md">Markdown</a> · <a href="./scenarios/${s.slug}/result.json">JSON</a></p>
    </article>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scenario Runs</title>
<style>
:root{color-scheme:dark;--bg:#0e0c09;--s:#171411;--t:#ede8df;--m:#928a7e;--b:rgba(237,232,223,.07);--g:#5bb98c;--a:#d4a462;--r:#c75a4a}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--t)}
main{width:min(920px,calc(100% - 2rem));margin:0 auto;padding:3rem 0 4rem}
h1{margin:0 0 .5rem;font-size:clamp(1.8rem,4vw,2.8rem)}p{color:var(--m);line-height:1.6}
.grid{display:grid;gap:1rem;margin-top:1.5rem}
.card{padding:1.2rem;border:1px solid var(--b);border-radius:16px;background:var(--s)}
.st{display:inline-flex;padding:.2rem .5rem;border-radius:999px;font-size:.82rem;font-weight:600;text-transform:capitalize;margin-right:.5rem}
.st-passed{color:var(--g);background:rgba(91,185,140,.1)}.st-warning{color:var(--a);background:rgba(212,164,98,.1)}.st-failed{color:var(--r);background:rgba(199,90,74,.1)}
a{color:var(--t)}
</style>
</head>
<body><main>
<p>android-development</p>
<h1>Scenario Run Index</h1>
<p>${payload.summary.total} runs · ${payload.summary.passed} passed · ${payload.summary.warning} warnings · ${payload.summary.failed} failed</p>
<div class="grid">${cards || '<p>No scenario runs bundled.</p>'}</div>
</main></body></html>`;
}

/* ── Build ────────────────────────────────────────────────── */

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(path.join(outputDir, 'data'), { recursive: true });
await fs.mkdir(path.join(outputDir, 'assets'), { recursive: true });
await fs.mkdir(path.join(outputDir, 'reports', 'latest'), { recursive: true });

// Resolve github-markdown-css path — prefer the combined file
const gmCssDir = path.join(repoDir, 'node_modules', 'github-markdown-css');
const gmCssFile = (await exists(path.join(gmCssDir, 'github-markdown.css')))
  ? path.join(gmCssDir, 'github-markdown.css')
  : path.join(gmCssDir, 'github-markdown-light.css');

const staticCopies = [
  fs.copyFile(path.join(siteDir, 'index.html'), path.join(outputDir, 'index.html')),
  fs.copyFile(path.join(siteDir, 'styles.css'), path.join(outputDir, 'styles.css')),
  fs.copyFile(path.join(siteDir, 'script.js'), path.join(outputDir, 'script.js')),
  fs.copyFile(gmCssFile, path.join(outputDir, 'assets', 'github-markdown.css')),
];

if (await exists(path.join(siteDir, 'favicon.svg'))) {
  staticCopies.push(fs.copyFile(path.join(siteDir, 'favicon.svg'), path.join(outputDir, 'favicon.svg')));
}

await Promise.all(staticCopies);

// Copy skill-package.txt if available
if (runRoot && (await exists(path.join(runRoot, 'skill-package.txt')))) {
  await fs.copyFile(path.join(runRoot, 'skill-package.txt'), path.join(outputDir, 'reports', 'latest', 'skill-package.txt'));
}

// Load scenarios
const localScenarios = await loadLocalScenarios(runRoot);
const published = localScenarios.length === 0 ? await loadPublishedScenarios(liveDataUrl) : null;
const scenarios = localScenarios.length > 0 ? localScenarios : (published?.scenarios || []);

const payload = {
  generatedAt: published?.generatedAt || new Date().toISOString(),
  summary: buildSummary(scenarios),
  scenarios,
};

await Promise.all([
  fs.writeFile(path.join(outputDir, 'data', 'latest.json'), JSON.stringify(payload, null, 2) + '\n'),
  fs.writeFile(path.join(outputDir, 'reports', 'latest', 'index.html'), buildReportIndex(payload)),
]);

console.log(`Built site → ${outputDir} (${scenarios.length} scenarios)`);
