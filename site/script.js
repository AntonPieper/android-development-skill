const copyStatus = document.querySelector('#copy-status');

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    if (copyStatus) {
      copyStatus.textContent = `${label} copied.`;
    }
  } catch {
    if (copyStatus) {
      copyStatus.textContent = `${label} could not be copied. It is still visible on the page.`;
    }
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-text]');
  if (!button) {
    return;
  }

  const text = button.getAttribute('data-copy-text') || '';
  const label = button.getAttribute('data-copy-label') || 'Text';
  copyText(text, label);
});

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

const heroStatus = document.querySelector('#hero-status');
const heroStageTitle = document.querySelector('#hero-stage-title');
const heroStageCopy = document.querySelector('#hero-stage-copy');
const stageDebugNote = document.querySelector('#stage-debug-note');
const heroVisualImage = document.querySelector('#hero-visual-image');
const heroVisualEmpty = document.querySelector('#hero-visual-empty');
const heroVisualKicker = document.querySelector('#hero-visual-kicker');
const heroMetrics = document.querySelector('#hero-metrics');
const heroBadges = document.querySelector('#hero-badges');
const reportLink = document.querySelector('#report-link');
const workflowLink = document.querySelector('#workflow-link');

const usecaseGrid = document.querySelector('#usecase-grid');
const toolingTitle = document.querySelector('#tooling-title');
const toolingCopy = document.querySelector('#tooling-copy');
const toolingStatus = document.querySelector('#tooling-status');
const proofFacts = document.querySelector('#proof-facts');

const evidenceTabs = document.querySelector('#evidence-tabs');
const evidenceCaption = document.querySelector('#evidence-caption');
const toolingImage = document.querySelector('#tooling-image');
const toolingVideo = document.querySelector('#tooling-video');
const toolingEmpty = document.querySelector('#tooling-empty');
const toolingChecks = document.querySelector('#tooling-checks');
const toolingSignals = document.querySelector('#tooling-signals');
const toolingCommands = document.querySelector('#tooling-commands');

const matrixVisual = document.querySelector('#matrix-visual');
const scenarioVisual = document.querySelector('#scenario-visual');
const repoList = document.querySelector('#repo-list');
const scenarioList = document.querySelector('#scenario-list');
const showcaseGrid = document.querySelector('#showcase-grid');
const starterGrid = document.querySelector('#starter-grid');

const scenarioOrder = ['discovery', 'tasks', 'modernization', 'ui-triage'];
const scenarioNames = {
  discovery: 'Root Discovery',
  tasks: 'Task Selection',
  modernization: 'Modernization',
  'ui-triage': 'UI Triage',
};

const scenarioMeta = {
  discovery: {
    title: 'Stop wandering through the repo.',
    summary: 'Find the real Android root first. Then take the next cheap wrapper-level step.',
    highlights: ['Find gradlew and settings files fast', 'Stay shallow before widening the search', 'Name the next safe command, not ten maybe-commands'],
    starterPrompt: 'Find the smallest Android project root here and tell me the first safe command to inspect it.',
    quote: 'Root first. Everything else gets cheaper after that.',
  },
  tasks: {
    title: 'Pick the next Android command without guessing.',
    summary: 'The skill narrows build, lint, unit test, and connected test commands from the smallest useful files.',
    highlights: ['Prefer wrapper-first commands', 'Avoid broad task dumps when a small read is enough', 'Separate build, test, and device work clearly'],
    starterPrompt: 'Tell me the smallest Gradle commands for build, lint, unit tests, and connected tests in this repo.',
    quote: 'The best next command is specific, small, and reproducible.',
  },
  modernization: {
    title: 'Spot Android upgrade risk before it blows up.',
    summary: 'Look for legacy Gradle, AGP, Kotlin, namespace, JDK, and compileSdk signals before touching code.',
    highlights: ['Read wrapper and top-level Gradle files first', 'Stop after a few concrete legacy signals', 'Name the first safe modernization step'],
    starterPrompt: 'Check whether this Android project needs modernization guidance and name the first safe next step.',
    quote: 'Modernization works better when it starts from evidence, not vibes.',
  },
  'ui-triage': {
    title: 'Look at the screen before the hierarchy dump.',
    summary: 'The skill keeps on-device triage token-light by making screenshots the default and XML optional.',
    highlights: ['Start with a screenshot', 'Use bounded XML only when the screenshot is not enough', 'Keep video and logcat short and focused'],
    starterPrompt: 'Give me the smallest screenshot-first Android UI triage plan for this project.',
    quote: 'Screenshots tell the story. XML is backup, not the opening move.',
  },
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
    scenario_stats: [],
    showcase: [],
    tooling: null,
    links: {},
    visuals: {},
    source: 'fallback',
  };
}

function createEmptyNote(text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-state empty-state-inline';
  paragraph.textContent = text;
  return paragraph;
}

function createMetricCard(label, value, tone = 'default') {
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

function createListRow(className, labelText, valueText) {
  const row = document.createElement('div');
  row.className = className;

  const label = document.createElement('span');
  label.textContent = labelText;

  const value = document.createElement('strong');
  value.textContent = valueText;

  row.append(label, value);
  return row;
}

function createCopyButton(text, label, className = 'button button-ghost is-small') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute('data-copy-text', text);
  button.setAttribute('data-copy-label', label);
  return button;
}

function buildUseCases(data) {
  const showcaseByScenario = new Map(
    (data.showcase || []).map((item) => [item.scenario, item]),
  );

  return scenarioOrder.map((scenario) => {
    const meta = scenarioMeta[scenario];
    const showcase = showcaseByScenario.get(scenario);

    return {
      scenario,
      badge: scenarioNames[scenario] || scenario,
      repoLabel: showcase?.repo_label || 'Smoke scenario',
      repoUrl: showcase?.repo_url || '',
      title: showcase?.headline || meta.title,
      summary: showcase?.summary || meta.summary,
      highlights: Array.isArray(showcase?.highlights) && showcase.highlights.length > 0
        ? showcase.highlights.slice(0, 3)
        : meta.highlights,
      commands: Array.isArray(showcase?.commands) ? showcase.commands.slice(0, 2) : [],
      starterPrompt: showcase?.starter_prompt || meta.starterPrompt,
      quote: showcase?.quote || meta.quote,
    };
  });
}

function pickHeroVisual(data) {
  if (data.tooling?.media?.wide) {
    return {
      src: data.tooling.media.wide,
      label: 'Processed wide WebP from the emulator-backed smoke.',
    };
  }

  if (data.tooling?.media?.videoPoster) {
    return {
      src: data.tooling.media.videoPoster,
      label: 'Poster frame from the latest short Android device clip.',
    };
  }

  if (data.tooling?.media?.primary) {
    return {
      src: data.tooling.media.primary,
      label: 'Processed Android screenshot from the latest tooling smoke.',
    };
  }

  if (data.visuals?.matrix) {
    return {
      src: data.visuals.matrix,
      label: 'Latest prompt smoke matrix generated for the website.',
    };
  }

  return null;
}

function setStageDebugNote(message = '', tone = 'muted') {
  if (!stageDebugNote) {
    return;
  }

  if (!message) {
    stageDebugNote.textContent = '';
    stageDebugNote.className = 'stage-debug-note is-hidden';
    return;
  }

  stageDebugNote.textContent = message;
  stageDebugNote.className = `stage-debug-note stage-debug-note-${tone}`;
}

function getSiteMode(data, runtime = {}) {
  const hasLiveData = data.source !== 'fallback';
  const hasTooling = Boolean(data.tooling);

  if (runtime.fetchError) {
    return {
      mode: 'fetch-error',
      hasLiveData: false,
      hasTooling: false,
    };
  }

  if (!hasLiveData) {
    return {
      mode: 'fallback-build',
      hasLiveData: false,
      hasTooling: false,
    };
  }

  if (hasTooling) {
    return {
      mode: 'live',
      hasLiveData: true,
      hasTooling: true,
    };
  }

  return {
    mode: 'prompt-only',
    hasLiveData: true,
    hasTooling: false,
  };
}

function renderHero(data, runtime = {}) {
  const siteMode = getSiteMode(data, runtime);
  const { hasLiveData, hasTooling } = siteMode;

  heroStatus.textContent = hasTooling ? 'live' : hasLiveData ? 'prompt-only' : 'offline';
  heroStatus.classList.toggle('is-live', hasTooling);
  heroStatus.classList.toggle('is-soft', !hasTooling && hasLiveData);

  if (siteMode.mode === 'fetch-error') {
    heroStageTitle.textContent = 'Generated site data could not be loaded.';
    heroStageCopy.textContent = 'The page fell back to starter content because ./data/latest.json was unavailable at runtime.';
    setStageDebugNote(`Preview error: ${runtime.fetchError}. Build the site and serve dist/site when debugging locally.`, 'warning');
  } else if (siteMode.mode === 'fallback-build') {
    heroStageTitle.textContent = 'Fallback build loaded without smoke data.';
    heroStageCopy.textContent = 'This build still shows the core prompts and structure, but live proof and Android media only appear when a smoke-backed run is bundled.';
    setStageDebugNote('This is the expected local output from npm run build:site without a smoke run bundle. Rebuild with generated artifacts to light up live proof.', 'muted');
  } else if (!hasLiveData) {
    heroStageTitle.textContent = 'Waiting for the first proof bundle.';
    heroStageCopy.textContent = 'Publish a smoke-backed run and this page will light up with screenshots, short video, and generated playbook cards.';
    setStageDebugNote();
  } else if (hasTooling) {
    heroStageTitle.textContent = 'Real repo checks. Real device receipts.';
    heroStageCopy.textContent = `${data.headline.repos_covered} public repos checked. ${data.headline.passed}/${data.headline.total_cases} read-only prompt runs passed. Processed screenshots, crops, and short video are bundled for the site.`;
    setStageDebugNote();
  } else {
    heroStageTitle.textContent = `${data.headline.passed}/${data.headline.total_cases} read-only prompt runs passed.`;
    heroStageCopy.textContent = `${data.headline.repos_covered} public repos checked across ${data.headline.scenarios_covered} scenarios. Device evidence appears as soon as the tooling lane publishes.`;
    setStageDebugNote();
  }

  heroMetrics.replaceChildren(
    createMetricCard('Pass rate', `${data.headline.pass_rate}%`, data.headline.failed > 0 ? 'warning' : 'success'),
    createMetricCard('Prompt runs', String(data.headline.total_cases || 0)),
    createMetricCard('Repos', String(data.headline.repos_covered || 0)),
    createMetricCard('Media', hasTooling ? 'live' : 'pending', hasTooling ? 'success' : 'default'),
  );

  heroBadges.replaceChildren();
  const badges = [
    'Token-light Android guidance',
    `${data.headline.repos_covered || 0} public repos in smoke`,
    hasTooling ? 'Screenshots, crops, and video bundled' : 'Device evidence lane ready',
    'Built for agents, not dashboards',
  ];

  for (const badgeText of badges) {
    const badge = document.createElement('span');
    badge.className = 'hero-badge';
    badge.textContent = badgeText;
    heroBadges.append(badge);
  }

  const visual = pickHeroVisual(data);
  if (!visual) {
    heroVisualImage.classList.add('is-hidden');
    heroVisualEmpty.classList.remove('is-hidden');
    heroVisualKicker.textContent = 'No visual proof is published yet.';
    return;
  }

  heroVisualImage.src = visual.src;
  heroVisualImage.classList.remove('is-hidden');
  heroVisualEmpty.classList.add('is-hidden');
  heroVisualKicker.textContent = visual.label;
}

function renderUseCases(data) {
  usecaseGrid.replaceChildren();

  for (const item of buildUseCases(data)) {
    const card = document.createElement('article');
    card.className = 'usecase-card';

    const meta = document.createElement('div');
    meta.className = 'usecase-meta';

    const badge = document.createElement('span');
    badge.className = 'usecase-badge';
    badge.textContent = item.badge;

    const repo = document.createElement('span');
    repo.className = 'usecase-repo';
    repo.textContent = item.repoLabel;

    meta.append(badge, repo);

    const title = document.createElement('h3');
    title.textContent = item.title;

    const summary = document.createElement('p');
    summary.className = 'usecase-summary';
    summary.textContent = item.summary;

    const highlights = document.createElement('ul');
    highlights.className = 'usecase-highlights';
    for (const point of item.highlights) {
      const listItem = document.createElement('li');
      listItem.textContent = point;
      highlights.append(listItem);
    }

    const quote = document.createElement('blockquote');
    quote.className = 'usecase-quote';
    quote.textContent = item.quote;

    const promptWrap = document.createElement('div');
    promptWrap.className = 'prompt-card';

    const promptLabel = document.createElement('span');
    promptLabel.className = 'panel-label';
    promptLabel.textContent = 'Starter prompt';

    const promptText = document.createElement('p');
    promptText.className = 'prompt-text';
    promptText.textContent = item.starterPrompt;

    const actions = document.createElement('div');
    actions.className = 'usecase-actions';
    actions.append(createCopyButton(item.starterPrompt, 'Copy prompt'));

    if (item.repoUrl) {
      const repoLink = document.createElement('a');
      repoLink.className = 'button button-secondary is-small';
      repoLink.href = item.repoUrl;
      repoLink.target = '_blank';
      repoLink.rel = 'noreferrer';
      repoLink.textContent = 'Open example repo';
      actions.append(repoLink);
    }

    promptWrap.append(promptLabel, promptText);

    if (item.commands.length > 0) {
      const commands = document.createElement('pre');
      commands.className = 'usecase-commands';
      commands.textContent = item.commands.join('\n');
      promptWrap.append(commands);
    }

    promptWrap.append(actions);
    card.append(meta, title, summary, highlights, quote, promptWrap);
    usecaseGrid.append(card);
  }
}

function renderProofFacts(data) {
  proofFacts.replaceChildren(
    createMetricCard('Public repos', String(data.headline.repos_covered || 0)),
    createMetricCard('Scenarios', String(data.headline.scenarios_covered || 0)),
    createMetricCard('Eval cases', String(data.coverage.outputEvalCases || 0)),
    createMetricCard('Trigger queries', String(data.coverage.triggerQueriesTotal || 0)),
  );
}

function renderRepoStats(data) {
  repoList.replaceChildren();

  if (!Array.isArray(data.repo_stats) || data.repo_stats.length === 0) {
    repoList.append(createEmptyNote('No repository coverage is published yet.'));
    return;
  }

  for (const item of data.repo_stats) {
    repoList.append(createListRow('repo-row', item.repo, `${item.passed}/${item.total} passed`));
  }
}

function renderScenarioStats(data) {
  scenarioList.replaceChildren();

  if (!Array.isArray(data.scenario_stats) || data.scenario_stats.length === 0) {
    scenarioList.append(createEmptyNote('No scenario breakdown is published yet.'));
    return;
  }

  for (const item of data.scenario_stats) {
    scenarioList.append(createListRow('scenario-row', scenarioNames[item.scenario] || item.scenario, `${item.passed}/${item.total} passed`));
  }
}

function renderStarterPrompts(data) {
  starterGrid.replaceChildren();

  for (const item of buildUseCases(data)) {
    const card = document.createElement('article');
    card.className = 'starter-card';

    const badge = document.createElement('span');
    badge.className = 'starter-badge';
    badge.textContent = item.badge;

    const title = document.createElement('h3');
    title.textContent = item.title;

    const prompt = document.createElement('p');
    prompt.className = 'starter-text';
    prompt.textContent = item.starterPrompt;

    const action = createCopyButton(item.starterPrompt, 'Copy prompt');

    card.append(badge, title, prompt, action);
    starterGrid.append(card);
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

    if (item.starter_prompt) {
      const prompt = document.createElement('div');
      prompt.className = 'showcase-prompt';

      const promptLabel = document.createElement('span');
      promptLabel.className = 'panel-label';
      promptLabel.textContent = 'Try asking';

      const promptText = document.createElement('p');
      promptText.className = 'showcase-prompt-text';
      promptText.textContent = item.starter_prompt;

      prompt.append(promptLabel, promptText, createCopyButton(item.starter_prompt, 'Copy prompt'));
      card.append(prompt);
    }

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
    toolingCopy.textContent = 'When the tooling lane publishes, this section shows processed screenshots, short video, and bounded signals from a real emulator run.';
    toolingStatus.textContent = 'offline';
    toolingStatus.classList.remove('is-live');
    toolingStatus.classList.remove('is-soft');
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
  toolingCopy.textContent = `${packageName} at ${displaySize} from ${refLabel}. This is where the site turns raw Android evidence into lightweight WebP stills and short video.`;
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

  if (tooling.media?.wide) {
    views.push({
      label: 'Wide still',
      type: 'image',
      src: tooling.media.wide,
      caption: 'Wide WebP crop generated for landing-page hero layouts and lighter visual bundles.',
    });
  }

  if (tooling.media?.primary) {
    views.push({
      label: 'Primary still',
      type: 'image',
      src: tooling.media.primary,
      caption: 'Processed still from the emulator-backed tooling smoke.',
    });
  }

  if (tooling.media?.story) {
    views.push({
      label: 'Story crop',
      type: 'image',
      src: tooling.media.story,
      caption: 'Vertical crop generated for smaller story cards and prompt-grounding layouts.',
    });
  }

  if (tooling.media?.detail) {
    views.push({
      label: 'Detail crop',
      type: 'image',
      src: tooling.media.detail,
      caption: 'A tighter crop generated for compact UI cards.',
    });
  }

  if (tooling.media?.video) {
    views.push({
      label: 'Device clip',
      type: 'video',
      src: tooling.media.video,
      poster: tooling.media.videoPoster || tooling.media.poster || tooling.media.primary || '',
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

function renderPage(data, runtime = {}) {
  renderHero(data, runtime);
  renderUseCases(data);
  renderProofFacts(data);
  renderTooling(data);
  renderRepoStats(data);
  renderScenarioStats(data);
  renderShowcase(data);
  renderStarterPrompts(data);
  applyLinks(data);

  if (data.visuals?.matrix) {
    matrixVisual.src = data.visuals.matrix;
  }

  if (data.visuals?.scenario_bars) {
    scenarioVisual.src = data.visuals.scenario_bars;
  }
}

async function hydrate() {
  try {
    const response = await fetch('./data/latest.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`latest.json not available (${response.status})`);
    }

    const data = await response.json();
    renderPage(data);
  } catch (error) {
    console.error('Failed to hydrate site data.', error);
    renderPage(fallbackSiteData(), {
      fetchError: error instanceof Error ? error.message : 'Unknown hydration error',
    });
  }
}

hydrate();
