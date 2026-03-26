const copyButton = document.querySelector('[data-copy]');
const copyStatus = document.querySelector('#copy-status');

if (copyButton) {
  copyButton.addEventListener('click', async () => {
    const text = copyButton.getAttribute('data-copy') || '';

    try {
      await navigator.clipboard.writeText(text);
      if (copyStatus) {
        copyStatus.textContent = 'Install command copied to clipboard.';
      }
    } catch {
      if (copyStatus) {
        copyStatus.textContent = 'Copy failed. The install command is visible in the install section.';
      }
    }
  });
}

const revealNodes = document.querySelectorAll('[data-reveal]');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    {
      threshold: 0.12,
    },
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

const snapshotTitle = document.querySelector('#snapshot-title');
const snapshotCopy = document.querySelector('#snapshot-copy');
const heroMetrics = document.querySelector('#hero-metrics');
const reportLink = document.querySelector('#report-link');
const workflowLink = document.querySelector('#workflow-link');
const toolingTitle = document.querySelector('#tooling-title');
const toolingCopy = document.querySelector('#tooling-copy');
const toolingStatus = document.querySelector('#tooling-status');
const matrixVisual = document.querySelector('#matrix-visual');
const scenarioVisual = document.querySelector('#scenario-visual');
const matrixGrid = document.querySelector('#matrix-grid');
const scenarioList = document.querySelector('#scenario-list');
const proofList = document.querySelector('#proof-list');
const repoList = document.querySelector('#repo-list');
const showcaseGrid = document.querySelector('#showcase-grid');
const evidenceTabs = document.querySelector('#evidence-tabs');
const evidenceCaption = document.querySelector('#evidence-caption');
const toolingImage = document.querySelector('#tooling-image');
const toolingVideo = document.querySelector('#tooling-video');
const toolingEmpty = document.querySelector('#tooling-empty');
const toolingChecks = document.querySelector('#tooling-checks');
const toolingSignals = document.querySelector('#tooling-signals');
const toolingCommands = document.querySelector('#tooling-commands');

const scenarioNames = {
  discovery: 'Root Discovery',
  tasks: 'Task Selection',
  modernization: 'Modernization',
  'ui-triage': 'UI Triage',
};

function fallbackSiteData() {
  return {
    headline: {
      pass_rate: 0,
      failed: 0,
      total_cases: 0,
      repos_covered: 0,
      scenarios_covered: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      passed: 0,
    },
    coverage: {
      outputEvalCases: 0,
      triggerQueriesTotal: 0,
      triggerTrainQueries: 0,
      triggerValidationQueries: 0,
    },
    repo_stats: [],
    matrix: {
      repos: [],
      scenarios: [],
      cells: [],
    },
    scenario_stats: [],
    showcase: [],
    tooling: null,
    links: {},
    visuals: {},
  };
}

function statCard(label, value, tone = 'default') {
  const article = document.createElement('article');
  article.className = `metric-card metric-card-${tone}`;

  const labelNode = document.createElement('span');
  labelNode.className = 'metric-label';
  labelNode.textContent = label;

  const valueNode = document.createElement('strong');
  valueNode.className = 'metric-value';
  valueNode.textContent = value;

  article.append(labelNode, valueNode);
  return article;
}

function createEmptyNote(text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-state';
  paragraph.textContent = text;
  return paragraph;
}

function renderMetrics(data) {
  heroMetrics.replaceChildren(
    statCard('Pass rate', `${data.headline.pass_rate}%`, data.headline.failed > 0 ? 'warning' : 'success'),
    statCard('Cases', String(data.headline.total_cases)),
    statCard('Repos', String(data.headline.repos_covered)),
    statCard('Scenarios', String(data.headline.scenarios_covered)),
    statCard('Input tokens', data.headline.total_input_tokens.toLocaleString()),
    statCard('Output tokens', data.headline.total_output_tokens.toLocaleString()),
  );
}

function renderProof(data) {
  proofList.replaceChildren(
    statCard('Output eval cases', String(data.coverage.outputEvalCases)),
    statCard('Trigger queries', String(data.coverage.triggerQueriesTotal)),
    statCard('Train split', String(data.coverage.triggerTrainQueries)),
    statCard('Validation split', String(data.coverage.triggerValidationQueries)),
  );
}

function renderRepoStats(data) {
  repoList.replaceChildren();

  if (!Array.isArray(data.repo_stats) || data.repo_stats.length === 0) {
    repoList.append(createEmptyNote('No repository coverage is published yet.'));
    return;
  }

  for (const item of data.repo_stats) {
    const row = document.createElement('div');
    row.className = 'repo-row';

    const label = document.createElement('span');
    label.textContent = item.repo;

    const value = document.createElement('strong');
    value.textContent = `${item.passed}/${item.total} passed`;

    row.append(label, value);
    repoList.append(row);
  }
}

function renderMatrix(data) {
  matrixGrid.replaceChildren();

  const repos = data.matrix.repos || [];
  const scenarios = data.matrix.scenarios || [];

  if (repos.length === 0 || scenarios.length === 0) {
    matrixGrid.append(createEmptyNote('No smoke matrix is published yet.'));
    return;
  }

  for (const repo of repos) {
    const row = document.createElement('div');
    row.className = 'matrix-row';

    const label = document.createElement('div');
    label.className = 'matrix-label';
    label.textContent = repo;
    row.append(label);

    for (const scenario of scenarios) {
      const cellData = data.matrix.cells.find((cell) => cell.repo === repo && cell.scenario === scenario);
      const cell = document.createElement('div');
      cell.className = `matrix-cell matrix-cell-${(cellData?.result || 'missing').toLowerCase()}`;

      const heading = document.createElement('span');
      heading.className = 'matrix-cell-heading';
      heading.textContent = scenarioNames[scenario] || scenario;

      const detail = document.createElement('strong');
      detail.textContent = cellData?.result || 'MISSING';

      const meta = document.createElement('small');
      meta.textContent = cellData?.result === 'FAIL'
        ? (cellData?.exit_code || 'exit 1')
        : (cellData?.session_time || 'ok');

      cell.append(heading, detail, meta);
      row.append(cell);
    }

    matrixGrid.append(row);
  }
}

function renderScenarioStats(data) {
  scenarioList.replaceChildren();

  if (!Array.isArray(data.scenario_stats) || data.scenario_stats.length === 0) {
    scenarioList.append(createEmptyNote('No scenario breakdown is published yet.'));
    return;
  }

  for (const item of data.scenario_stats) {
    const row = document.createElement('div');
    row.className = 'scenario-row';

    const label = document.createElement('span');
    label.className = 'scenario-label';
    label.textContent = scenarioNames[item.scenario] || item.scenario;

    const value = document.createElement('strong');
    value.textContent = `${item.passed}/${item.total} passed`;

    row.append(label, value);
    scenarioList.append(row);
  }
}

function renderShowcase(data) {
  showcaseGrid.replaceChildren();

  if (!Array.isArray(data.showcase) || data.showcase.length === 0) {
    showcaseGrid.append(createEmptyNote('No showcase data is published yet.'));
    return;
  }

  for (const item of data.showcase) {
    const card = document.createElement('article');
    card.className = 'showcase-card';
    card.classList.add('is-visible');

    const meta = document.createElement('div');
    meta.className = 'showcase-meta';

    const badge = document.createElement('span');
    badge.className = 'showcase-badge';
    badge.textContent = scenarioNames[item.scenario] || item.scenario;

    const repo = document.createElement('span');
    repo.className = 'showcase-repo';
    repo.textContent = item.repo_label;

    meta.append(badge, repo);

    const title = document.createElement('h3');
    title.textContent = item.headline;

    const summary = document.createElement('p');
    summary.className = 'showcase-summary';
    summary.textContent = item.summary;

    const highlights = document.createElement('ul');
    highlights.className = 'showcase-highlights';

    for (const point of item.highlights || []) {
      const listItem = document.createElement('li');
      listItem.textContent = point;
      highlights.append(listItem);
    }

    card.append(meta, title, summary, highlights);

    if (Array.isArray(item.commands) && item.commands.length > 0) {
      const commands = document.createElement('pre');
      commands.className = 'showcase-commands';
      commands.textContent = item.commands.join('\n');
      card.append(commands);
    }

    if (item.quote) {
      const quote = document.createElement('blockquote');
      quote.className = 'showcase-quote';
      quote.textContent = item.quote;
      card.append(quote);
    }

    if (item.repo_url) {
      const repoLink = document.createElement('a');
      repoLink.className = 'showcase-link';
      repoLink.href = item.repo_url;
      repoLink.target = '_blank';
      repoLink.rel = 'noreferrer';
      repoLink.textContent = 'Open sample repository';
      card.append(repoLink);
    }

    showcaseGrid.append(card);
  }
}

function setEvidenceState(view) {
  if (view.type === 'video') {
    toolingImage.classList.add('is-hidden');
    toolingVideo.classList.remove('is-hidden');
    toolingVideo.src = view.src;
    toolingVideo.poster = view.poster || '';
    toolingEmpty.classList.add('is-hidden');
    return;
  }

  toolingVideo.pause();
  toolingVideo.removeAttribute('src');
  toolingVideo.load();
  toolingVideo.classList.add('is-hidden');
  toolingImage.classList.remove('is-hidden');
  toolingImage.src = view.src;
  toolingImage.alt = view.label;
  toolingEmpty.classList.add('is-hidden');
}

function renderEvidenceTabs(views) {
  evidenceTabs.replaceChildren();

  if (views.length === 0) {
    toolingImage.classList.add('is-hidden');
    toolingVideo.classList.add('is-hidden');
    toolingEmpty.classList.remove('is-hidden');
    return;
  }

  views.forEach((view, index) => {
    const button = document.createElement('button');
    button.className = `evidence-tab${index === 0 ? ' is-active' : ''}`;
    button.type = 'button';
    button.textContent = view.label;
    button.addEventListener('click', () => {
      evidenceTabs.querySelectorAll('.evidence-tab').forEach((tab) => tab.classList.remove('is-active'));
      button.classList.add('is-active');
      evidenceCaption.textContent = view.caption;
      setEvidenceState(view);
    });
    evidenceTabs.append(button);
  });

  evidenceCaption.textContent = views[0].caption;
  setEvidenceState(views[0]);
}

function renderTooling(data) {
  const tooling = data.tooling;

  toolingChecks.replaceChildren();
  toolingSignals.replaceChildren();

  if (!tooling) {
    toolingTitle.textContent = 'Waiting for device evidence.';
    toolingCopy.textContent = 'When the emulator-backed smoke publishes a bundle, the site will surface screenshots, video, XML signals, and exact collection commands here.';
    toolingStatus.textContent = 'offline';
    toolingStatus.classList.remove('is-live');
    toolingChecks.append(createEmptyNote('No tooling checks are published yet.'));
    toolingSignals.append(createEmptyNote('No UI or log signals are published yet.'));
    toolingCommands.textContent = 'No tooling commands published yet.';
    renderEvidenceTabs([]);
    return;
  }

  const sampleLabel = tooling.sample?.label || 'android-sample';
  const sampleSerial = tooling.sample?.serial || 'emulator';
  const packageName = tooling.sample?.package_name || 'package unavailable';
  const displaySize = tooling.sample?.display_size || 'unknown display';
  const refLabel = tooling.sample?.ref ? tooling.sample.ref.slice(0, 7) : 'current';

  toolingTitle.textContent = `${sampleLabel} on ${sampleSerial}`;
  toolingCopy.textContent = `${packageName} at ${displaySize} from ${refLabel}.`;
  toolingStatus.textContent = 'live';
  toolingStatus.classList.add('is-live');

  for (const item of tooling.checks || []) {
    const check = document.createElement('div');
    check.className = `check-item${item.status === 'warning' ? ' is-warning' : ''}`;

    const status = document.createElement('span');
    status.className = 'check-status';
    status.textContent = item.status;

    const label = document.createElement('strong');
    label.textContent = item.label;

    const detail = document.createElement('span');
    detail.textContent = item.detail;

    check.append(status, label, detail);
    toolingChecks.append(check);
  }

  const signals = [
    ...(tooling.analysis?.ui_signals || []).map((value) => ({ title: 'UI', value })),
    ...(tooling.analysis?.log_signals || []).map((value) => ({ title: 'Logcat', value })),
  ];

  if (signals.length === 0) {
    toolingSignals.append(createEmptyNote('No UI or log signals are published yet.'));
  } else {
    for (const signal of signals.slice(0, 8)) {
      const item = document.createElement('div');
      item.className = 'signal-item';

      const title = document.createElement('span');
      title.className = 'panel-label';
      title.textContent = signal.title;

      const value = document.createElement('strong');
      value.textContent = signal.value;

      item.append(title, value);
      toolingSignals.append(item);
    }
  }

  toolingCommands.textContent = Array.isArray(tooling.commands) && tooling.commands.length > 0
    ? tooling.commands.join('\n')
    : 'No tooling commands published yet.';

  const views = [];

  if (tooling.media?.primary) {
    views.push({
      label: 'Primary still',
      type: 'image',
      src: tooling.media.primary,
      caption: 'Processed still from the emulator-backed tooling smoke.',
    });
  }

  if (tooling.media?.detail) {
    views.push({
      label: 'Detail crop',
      type: 'image',
      src: tooling.media.detail,
      caption: 'A tighter crop generated for smaller evidence cards and generative layouts.',
    });
  }

  if (tooling.media?.video) {
    views.push({
      label: 'Device clip',
      type: 'video',
      src: tooling.media.video,
      poster: tooling.media.videoPoster || tooling.media.poster || '',
      caption: 'Short emulator capture showing the app launch and on-device interaction path.',
    });
  }

  renderEvidenceTabs(views);
}

function applyLinks(data) {
  reportLink.classList.add('is-hidden');
  workflowLink.classList.add('is-hidden');

  if (data.links?.report) {
    reportLink.href = data.links.report;
    reportLink.classList.remove('is-hidden');
  }

  if (data.links?.workflow_run) {
    workflowLink.href = data.links.workflow_run;
    workflowLink.classList.remove('is-hidden');
  }
}

async function hydrate() {
  try {
    const response = await fetch('./data/latest.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('latest.json not available');
    }

    const data = await response.json();
    snapshotTitle.textContent = data.source === 'fallback'
      ? 'Waiting for the first published run.'
      : `${data.headline.passed}/${data.headline.total_cases} prompt cases passed`;

    snapshotCopy.textContent = data.source === 'fallback'
      ? 'The site is live, but no smoke-backed bundle has been published into Pages yet.'
      : `${data.headline.repos_covered} repositories across ${data.headline.scenarios_covered} prompt scenarios, plus a device-backed Android tooling lane when available.`;

    renderMetrics(data);
    renderProof(data);
    renderRepoStats(data);
    renderMatrix(data);
    renderScenarioStats(data);
    renderShowcase(data);
    renderTooling(data);
    applyLinks(data);

    if (data.visuals?.matrix) {
      matrixVisual.src = data.visuals.matrix;
    }

    if (data.visuals?.scenario_bars) {
      scenarioVisual.src = data.visuals.scenario_bars;
    }
  } catch {
    const data = fallbackSiteData();
    snapshotTitle.textContent = 'Smoke data is unavailable.';
    snapshotCopy.textContent = 'The site loaded, but the latest Pages data bundle could not be fetched.';
    renderMetrics(data);
    renderProof(data);
    renderRepoStats(data);
    renderMatrix(data);
    renderScenarioStats(data);
    renderShowcase(data);
    renderTooling(data);
    applyLinks(data);
  }
}

hydrate();
