const state = {
  snapshot: null,
  daily: null,
  manualLinks: [],
  authenticated: false,
  platformGroup: 'all',
  platform: 'all',
  category: 'all',
  contentType: 'all',
  query: '',
  selectedIds: new Set()
};

const els = {
  clusterList: document.querySelector('#clusterList'),
  sourceList: document.querySelector('#sourceList'),
  platformGroupTabs: document.querySelector('#platformGroupTabs'),
  platformTabs: document.querySelector('#platformTabs'),
  categorySelect: document.querySelector('#categorySelect'),
  contentTypeSelect: document.querySelector('#contentTypeSelect'),
  detailCategorySelect: document.querySelector('#detailCategorySelect'),
  detailContentTypeSelect: document.querySelector('#detailContentTypeSelect'),
  contentGrid: document.querySelector('#contentGrid'),
  searchInput: document.querySelector('#searchInput'),
  refreshButton: document.querySelector('#refreshButton'),
  clusterCount: document.querySelector('#clusterCount'),
  itemCount: document.querySelector('#itemCount'),
  platformCount: document.querySelector('#platformCount'),
  updatedAt: document.querySelector('#updatedAt'),
  sourceMode: document.querySelector('#sourceMode'),
  connectorStatusList: document.querySelector('#connectorStatusList'),
  sourceRefreshButton: document.querySelector('#sourceRefreshButton'),
  sourceRefreshProgress: document.querySelector('#sourceRefreshProgress'),
  sourceRefreshStatus: document.querySelector('#sourceRefreshStatus'),
  adminButton: document.querySelector('#adminButton'),
  dailyAdminPanel: document.querySelector('#dailyAdminPanel'),
  dailyStatus: document.querySelector('#dailyStatus'),
  saveDailyButton: document.querySelector('#saveDailyButton'),
  archiveDailyButton: document.querySelector('#archiveDailyButton'),
  pushTestDailyButton: document.querySelector('#pushTestDailyButton'),
  pushProdDailyButton: document.querySelector('#pushProdDailyButton'),
  clearSelectionButton: document.querySelector('#clearSelectionButton'),
  basketCount: document.querySelector('#basketCount'),
  basketList: document.querySelector('#basketList'),
  manualInput: document.querySelector('#manualInput'),
  manualPlatformSelect: document.querySelector('#manualPlatformSelect'),
  parseManualButton: document.querySelector('#parseManualButton'),
  manualPreview: document.querySelector('#manualPreview'),
  manualList: document.querySelector('#manualList'),
  clearManualButton: document.querySelector('#clearManualButton')
  ,
  adminModal: document.querySelector('#adminModal'),
  adminLoginForm: document.querySelector('#adminLoginForm'),
  adminPasswordInput: document.querySelector('#adminPasswordInput'),
  adminLoginError: document.querySelector('#adminLoginError'),
  adminCancelButton: document.querySelector('#adminCancelButton')
};

let adminLoginResolver = null;
let adminLoginPromise = null;
let refreshPollTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await Promise.all([loadSession(), loadDaily(), loadTrends()]);
  if (state.authenticated) await loadManualLinks();
  refreshIcons();
  window.hpMotion?.pageEnter();
});

function bindEvents() {
  els.platformGroupTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-platform-group]');
    if (!button) return;
    state.platformGroup = button.dataset.platformGroup;
    state.platform = 'all';
    document.querySelectorAll('.segment').forEach((segment) => {
      segment.classList.toggle('is-active', segment === button);
    });
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.platform === 'all');
    });
    render();
  });

  els.platformTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-platform]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    state.platform = button.dataset.platform;
    if (state.platform !== 'all') {
      state.platformGroup = platformGroupFor(state.platform);
      document.querySelectorAll('.segment').forEach((segment) => {
        segment.classList.toggle('is-active', segment.dataset.platformGroup === state.platformGroup);
      });
    }
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab === button));
    render();
  });

  els.categorySelect.addEventListener('change', (event) => {
    state.category = event.target.value;
    render();
  });

  els.detailCategorySelect.addEventListener('change', (event) => {
    state.category = event.target.value;
    render();
  });

  els.contentTypeSelect.addEventListener('change', (event) => {
    state.contentType = validContentType(event.target.value);
    render();
  });

  els.detailContentTypeSelect.addEventListener('change', (event) => {
    state.contentType = validContentType(event.target.value);
    render();
  });

  els.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.refreshButton.addEventListener('click', async () => {
    await loadTrends({ refresh: true });
  });

  els.sourceRefreshButton?.addEventListener('click', async () => {
    await manualRefreshSources();
  });

  els.adminButton.addEventListener('click', handleAdminButton);
  els.saveDailyButton.addEventListener('click', saveDaily);
  els.archiveDailyButton.addEventListener('click', archiveDaily);
  els.pushTestDailyButton.addEventListener('click', () => pushDaily('test'));
  els.pushProdDailyButton.addEventListener('click', () => pushDaily('prod'));
  els.clearSelectionButton.addEventListener('click', clearSelection);
  els.parseManualButton.addEventListener('click', parseManualLink);
  els.clearManualButton.addEventListener('click', clearManualLinks);
  els.adminLoginForm.addEventListener('submit', submitAdminLogin);
  els.adminCancelButton.addEventListener('click', closeAdminModal);
  els.adminModal.addEventListener('click', (event) => {
    if (event.target === els.adminModal) closeAdminModal();
  });

  els.clusterList.addEventListener('change', async (event) => {
    const input = event.target.closest('input[data-select-id]');
    if (!input) return;
    await handleSelectionChange(input);
  });

  els.manualList.addEventListener('change', async (event) => {
    const input = event.target.closest('input[data-select-id]');
    if (!input) return;
    await handleSelectionChange(input);
  });

  els.manualList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-clear-saved-manual-image]');
    if (!button) return;
    await clearSavedManualImage(button.dataset.clearSavedManualImage);
  });

  els.sourceList.addEventListener('change', async (event) => {
    const input = event.target.closest('input[data-select-id]');
    if (!input) return;
    await handleSelectionChange(input);
  });

  els.basketList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-remove-id]');
    if (!button) return;
    removeSelection(button.dataset.removeId);
  });

  els.manualPreview.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target.closest('form');
    await saveManualLink(Object.fromEntries(new FormData(form).entries()));
  });

  els.manualPreview.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-clear-manual-image]');
    if (!button) return;

    const form = button.closest('form');
    form?.querySelector('input[name="image"]')?.setAttribute('value', '');
    form?.querySelector('.manual-preview-image')?.remove();
    button.remove();
  });
}

async function loadSession() {
  const response = await fetch('/api/admin/session');
  const session = await response.json();
  state.authenticated = Boolean(session.authenticated);
  renderAdminState();
}

async function loadDaily() {
  const response = await fetch('/api/daily');
  state.daily = await response.json();
  state.selectedIds = new Set(state.daily.selectedIds || []);
  renderBasket();
  renderDailyStatus();
}

async function loadManualLinks() {
  const response = await adminFetch('/api/manual-links');
  state.manualLinks = await response.json();
  renderManualLinks();
  renderBasket();
}

async function loadTrends({ refresh = false, wait = false, throwOnError = false } = {}) {
  setLoading(true);
  try {
    const endpoint = refresh ? `/api/refresh${wait ? '?wait=1' : ''}` : '/api/trends';
    const response = await fetch(endpoint, {
      method: refresh ? 'POST' : 'GET'
    });

    if (!response.ok) {
      throw new Error('热点数据加载失败');
    }

    state.snapshot = await response.json();
    renderPlatformTabs();
    hydrateCategories();
    render();
  } catch (error) {
    els.clusterList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (throwOnError) throw error;
  } finally {
    setLoading(false);
  }
}

async function ensureAdmin() {
  if (state.authenticated) return true;
  return openAdminModal();
}

async function handleAdminButton() {
  if (!state.authenticated) {
    await ensureAdmin();
    return;
  }

  const response = await fetch('/api/admin/logout', { method: 'POST' });
  if (!response.ok) {
    alert('退出登录失败');
    return;
  }

  state.authenticated = false;
  state.manualLinks = [];
  state.selectedIds = new Set(state.daily?.selectedIds || []);
  els.manualPreview.innerHTML = '';
  renderAdminState();
  renderBasket();
  syncCheckboxes();
  renderDailyStatus();
}

function openAdminModal() {
  if (adminLoginPromise) return adminLoginPromise;

  els.adminModal.hidden = false;
  els.adminLoginError.textContent = '';
  els.adminPasswordInput.value = '';
  els.adminPasswordInput.focus();
  refreshIcons();

  adminLoginPromise = new Promise((resolve) => {
    adminLoginResolver = resolve;
  });
  return adminLoginPromise;
}

function closeAdminModal() {
  els.adminModal.hidden = true;
  if (adminLoginResolver) {
    adminLoginResolver(false);
    adminLoginResolver = null;
    adminLoginPromise = null;
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();
  const password = els.adminPasswordInput.value;
  const submitButton = els.adminLoginForm.querySelector('button[type="submit"]');

  try {
    setButtonBusy(submitButton, true);
    els.adminLoginError.textContent = '';
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '管理员登录失败');
    }

    state.authenticated = true;
    renderAdminState();
    await loadManualLinks();
    els.adminModal.hidden = true;
    if (adminLoginResolver) {
      adminLoginResolver(true);
      adminLoginResolver = null;
      adminLoginPromise = null;
    }
  } catch (error) {
    els.adminLoginError.textContent = error.message;
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function adminFetch(url, options = {}) {
  const ok = await ensureAdmin();
  if (!ok) throw new Error('需要管理员密码');

  const response = await fetch(url, options);
  if (response.status === 401) {
    state.authenticated = false;
    renderAdminState();
    throw new Error('管理员登录已过期，请重新登录');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '操作失败');
  }
  return response;
}

async function parseManualLink() {
  try {
    const input = els.manualInput.value.trim();
    if (!input) {
      alert('请先粘贴链接或分享文案');
      return;
    }
    setButtonBusy(els.parseManualButton, true);
    const response = await adminFetch('/api/manual-links/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, platform: els.manualPlatformSelect.value })
    });
    const parsed = await response.json();
    renderManualPreview(parsed);
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonBusy(els.parseManualButton, false);
  }
}

async function saveManualLink(fields) {
  try {
    const response = await adminFetch('/api/manual-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
    const item = await response.json();
    state.manualLinks = [item, ...state.manualLinks];
    state.selectedIds.add(item.id);
    els.manualInput.value = '';
    els.manualPreview.innerHTML = '';
    renderManualLinks();
    renderBasket();
    renderDailyStatus('手动热点已保存，并已勾选进当前日报。');
  } catch (error) {
    alert(error.message);
  }
}

async function clearManualLinks() {
  if (!window.confirm('确定清空手动热点池吗？已保存的当前日报不会被删除。')) return;
  try {
    await adminFetch('/api/manual-links', { method: 'DELETE' });
    state.manualLinks.forEach((item) => state.selectedIds.delete(item.id));
    state.manualLinks = [];
    renderManualLinks();
    renderBasket();
    renderDailyStatus('手动热点池已清空。');
  } catch (error) {
    alert(error.message);
  }
}

async function manualRefreshSources() {
  setSourceRefreshProgress(0);
  setSourceRefreshStatus('正在尝试拉取数据源...');
  setButtonBusy(els.sourceRefreshButton, true);

  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    if (!response.ok) throw new Error('刷新启动失败');
    await pollRefreshStatus();
    setSourceRefreshStatus(`已完成：${formatTime(new Date().toISOString())}`);
  } catch (error) {
    setSourceRefreshStatus(error.message || '拉取失败，请稍后再试');
  } finally {
    setButtonBusy(els.sourceRefreshButton, false);
  }
}

async function clearSavedManualImage(id) {
  if (!id) return;

  try {
    const response = await adminFetch(`/api/manual-links/${encodeURIComponent(id)}/image`, {
      method: 'DELETE'
    });
    const updated = await response.json();
    state.manualLinks = state.manualLinks.map((item) => (item.id === updated.id ? updated : item));
    renderManualLinks();
    renderBasket();
    renderDailyStatus('这条手动热点的图片已删除；如果已保存到日报，请重新保存日报同步。');
  } catch (error) {
    alert(error.message);
  }
}

async function saveDaily() {
  try {
    setButtonBusy(els.saveDailyButton, true);
    const response = await adminFetch('/api/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIds: selectedItemIds() })
    });
    state.daily = await response.json();
    state.selectedIds = new Set(state.daily.selectedIds || []);
    syncCheckboxes();
    renderBasket();
    renderDailyStatus('当前日报已保存。');
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonBusy(els.saveDailyButton, false);
  }
}

async function archiveDaily() {
  try {
    setButtonBusy(els.archiveDailyButton, true);
    const response = await adminFetch('/api/daily/archive', { method: 'POST' });
    const result = await response.json();
    renderDailyStatus(result.message || '历史日报已保存。');
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonBusy(els.archiveDailyButton, false);
  }
}

async function pushDaily(target) {
  const button = target === 'test' ? els.pushTestDailyButton : els.pushProdDailyButton;

  try {
    setButtonBusy(button, true);
    const response = await adminFetch('/api/daily/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    const result = await response.json();
    renderDailyStatus(result.message || '飞书日报链接已推送。');
  } catch (error) {
    alert(error.message);
  } finally {
    setButtonBusy(button, false);
  }
}

function toggleSelection(id, checked) {
  if (checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  renderBasket();
  renderDailyStatus();
}

async function handleSelectionChange(input) {
  const ok = await ensureAdmin();
  if (!ok) {
    input.checked = !input.checked;
    return;
  }
  toggleSelection(input.dataset.selectId, input.checked);
}

function removeSelection(id) {
  state.selectedIds.delete(id);
  syncCheckboxes();
  renderBasket();
  renderDailyStatus();
}

function clearSelection() {
  if (!state.selectedIds.size) return;
  state.selectedIds.clear();
  syncCheckboxes();
  renderBasket();
  renderDailyStatus('已清空当前选择。已保存日报和手动热点池不受影响。');
}

function syncCheckboxes() {
  document.querySelectorAll('input[data-select-id]').forEach((input) => {
    input.checked = state.selectedIds.has(input.dataset.selectId);
  });
}

function hydrateCategories() {
  const categories = new Set(
    (state.snapshot?.clusters || [])
      .map((cluster) => cluster.category)
      .filter((category) => category !== 'meme')
  );
  const current = state.category;
  const categoryMeta = new Map((state.snapshot?.categories || []).map((category) => [category.id, category]));
  const sortedCategories = [...categories].sort((a, b) => {
    const orderA = categoryMeta.get(a)?.order ?? 999;
    const orderB = categoryMeta.get(b)?.order ?? 999;
    return orderA - orderB || categoryLabel(a).localeCompare(categoryLabel(b), 'zh-CN');
  });

  els.categorySelect.innerHTML = [
    '<option value="all">全部分类</option>',
    ...sortedCategories.map((category) => `<option value="${escapeHtml(category)}">${categoryLabel(category)}</option>`)
  ].join('');
  els.detailCategorySelect.innerHTML = els.categorySelect.innerHTML;

  els.categorySelect.value = categories.has(current) && current !== 'meme' ? current : 'all';
  state.category = els.categorySelect.value;
  els.detailCategorySelect.value = state.category;
}

function renderPlatformTabs() {
  const connectors = state.snapshot?.connectors || [];
  const typeOrder = [
    'ai-news',
    'gaming-news',
    'gaming-industry',
    'social-trend',
    'community',
    'short-video',
    'video',
    'film-tv',
    'unknown'
  ];
  const typeLabels = {
    'social-trend': '热搜平台',
    community: '社区趋势',
    'short-video': '短视频趋势',
    video: '视频榜单',
    'film-tv': '影视榜单',
    'ai-news': 'AI 动态',
    'gaming-news': '游戏媒体',
    'gaming-industry': '游戏产业',
    unknown: '其他平台'
  };
  const iconMap = {
    weibo: 'flame',
    gamersky: 'gamepad-2',
    threedm: 'joystick',
    yystv: 'newspaper',
    gcores: 'radio',
    gameres: 'briefcase-business',
    nadianshi: 'grape',
    gamelook: 'line-chart',
    aihot: 'bot',
    bilibili_daily: 'play-square',
    bilibili_weekly: 'calendar-days',
    douban_nowplaying: 'ticket',
    douban_movie: 'clapperboard',
    douban_tv: 'tv',
    x: 'hash',
    reddit: 'message-circle',
    tiktok: 'music-2'
  };

  const grouped = new Map();
  connectors.forEach((connector) => {
    const type = connector.type || 'unknown';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(connector);
  });

  const sections = typeOrder
    .filter((type) => grouped.has(type))
    .map((type) => {
      const title = typeLabels[type] || grouped.get(type)[0]?.typeLabel || type;
      const buttons = grouped
        .get(type)
        .map(
          (connector) => `
            <button class="tab" data-platform="${escapeHtml(connector.id)}" type="button">
              <i data-lucide="${iconMap[connector.id] || 'circle'}"></i>
              ${escapeHtml(connector.label)}
            </button>
          `
        )
        .join('');

      return `
        <details class="platform-type-block" open>
          <summary class="platform-type-title">
            <span>${title}</span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="platform-type-items">${buttons}</div>
        </details>
      `;
    })
    .join('');

  els.platformTabs.innerHTML = `
    <button class="tab ${state.platform === 'all' ? 'is-active' : ''}" data-platform="all" type="button">
      <i data-lucide="radar"></i>
      全部平台
    </button>
    ${sections}
  `;
}

function render() {
  if (!state.snapshot) return;

  const clusters = filteredClusters();
  const connectors = state.snapshot.connectors || [];
  const liveCount = connectors.filter((connector) => connector.status === 'live').length;
  const fallbackCount = connectors.filter((connector) => connector.status === 'fallback').length;
  const sampleCount = connectors.filter((connector) => connector.status === 'sample').length;

  els.clusterCount.textContent = state.snapshot.clusters.length;
  els.itemCount.textContent = state.snapshot.items.length;
  els.platformCount.textContent = new Set(state.snapshot.items.map((item) => item.platform)).size;
  els.updatedAt.textContent = formatTime(state.snapshot.generatedAt);
  els.sourceMode.textContent = sourceModeLabel(liveCount, fallbackCount, sampleCount);
  els.connectorStatusList.innerHTML = renderConnectorStatuses(connectors);
  els.contentGrid.classList.toggle('is-overview', state.platform === 'all');
  els.contentGrid.classList.toggle('is-platform-detail', state.platform !== 'all');

  renderClusters(clusters);
  renderSources();
  renderManualLinks();
  renderBasket();
  renderDailyStatus();
  refreshIcons();
  window.hpMotion?.renderUpdate({ platform: state.platform });
}

function filteredClusters() {
  state.contentType = validContentType(state.contentType);
  els.contentTypeSelect.value = state.contentType;
  els.detailContentTypeSelect.value = state.contentType;
  els.categorySelect.value = state.category;
  els.detailCategorySelect.value = state.category;

  return (state.snapshot.clusters || []).filter((cluster) => {
    const platformMatch = state.platform === 'all' || cluster.platforms.includes(state.platform);
    const groupMatch = state.platformGroup === 'all' || (cluster.platformGroups || []).includes(state.platformGroup);
    const contentTypeMatch =
      state.contentType === 'all' || cluster.sources.some((source) => contentTypeFor(source) === state.contentType);
    const categoryMatch = state.category === 'all' || cluster.category === state.category;
    const queryMatch = !state.query || searchableCluster(cluster).includes(state.query);
    return platformMatch && groupMatch && contentTypeMatch && categoryMatch && queryMatch;
  });
}

function validContentType(value) {
  return ['all', 'news', 'social'].includes(value) ? value : 'all';
}

function filteredItems() {
  return (state.snapshot.items || [])
    .filter((item) => {
      const platformMatch = state.platform === 'all' || item.platform === state.platform;
      const groupMatch = state.platformGroup === 'all' || item.platformGroup === state.platformGroup;
      const contentTypeMatch = state.contentType === 'all' || contentTypeFor(item) === state.contentType;
      const categoryMatch = state.category === 'all' || item.category === state.category;
      const queryMatch = !state.query || searchableItem(item).includes(state.query);
      return platformMatch && groupMatch && contentTypeMatch && categoryMatch && queryMatch;
    })
    .sort((a, b) => a.rank - b.rank)
}

function renderClusters(clusters) {
  if (!clusters.length) {
    els.clusterList.innerHTML = '<div class="empty-state">没有匹配的热点</div>';
    return;
  }

  els.clusterList.innerHTML = clusters
    .map((cluster, index) => {
      const platforms = cluster.platforms
        .map((platform) => `<span class="pill ${platform}">${platformLabel(platform)}</span>`)
        .join('');
      const primarySource = cluster.sources.find((source) => source.url) || cluster.sources[0] || {};
      const primaryUrl = primarySource.url || '';
      const checked = state.selectedIds.has(cluster.id) ? 'checked' : '';
      const titleHtml = primaryUrl
        ? `<a class="trend-title-link" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(cluster.canonicalTitle)}</a>`
        : `<span>${escapeHtml(cluster.canonicalTitle)}</span>`;

      return `
        <article class="trend-card">
          <label class="select-check" title="加入当前日报">
            <input type="checkbox" data-select-id="${escapeHtml(cluster.id)}" ${checked} />
            <span></span>
          </label>
          <div class="rank">${index + 1}</div>
          <div>
            <h3 class="trend-title">
              ${titleHtml}
            </h3>
            <div class="trend-meta">
              <span class="pill">${categoryLabel(cluster.category)}</span>
              ${platforms}
            </div>
          </div>
          <div class="score">
            <strong>${cluster.score}</strong>
            <span>热度分</span>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderSources() {
  if (state.platform === 'all') {
    els.sourceList.innerHTML = '<div class="empty-state">选择左侧具体平台后查看平台原榜</div>';
    return;
  }

  const items = filteredItems();
  if (!items.length) {
    els.sourceList.innerHTML = '<div class="empty-state">没有匹配的原榜条目</div>';
    return;
  }

  els.sourceList.innerHTML = items
    .map(
      (item) => `
        <article class="source-item">
          <label class="select-check" title="加入当前日报">
            <input type="checkbox" data-select-id="${escapeHtml(item.id)}" ${state.selectedIds.has(item.id) ? 'checked' : ''} />
            <span></span>
          </label>
          <div class="source-row">
            <div>
              <span class="source-platform">${platformLabel(item.platform)}</span>
              <p class="source-title">
                ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : `<span>${escapeHtml(item.title)}</span>`}
              </p>
              <div class="trend-meta">
                <span class="pill">${categoryLabel(item.category)}</span>
                <span class="pill">${sourceTypeLabel(item.sourceType)}</span>
              </div>
            </div>
            <div class="source-rank">${item.rank}</div>
          </div>
        </article>
      `
    )
    .join('');
}

function renderManualPreview(parsed) {
  els.manualPreview.innerHTML = `
    <form class="manual-preview-card">
      ${parsed.image ? `<div class="manual-preview-image"><img src="${escapeHtml(parsed.image)}" alt="" /><button class="ghost-button" data-clear-manual-image type="button"><i data-lucide="image-off"></i> 不要图片</button></div>` : ''}
      <label>标题<input name="title" value="${escapeHtml(parsed.title)}" required /></label>
      <label>摘要<textarea name="summary" rows="3">${escapeHtml(parsed.summary)}</textarea></label>
      <label>来源<input name="sourceLabel" value="${escapeHtml(parsed.sourceLabel)}" /></label>
      <label>分类
        <select name="category">
          ${categoryOptions(parsed.category)}
        </select>
      </label>
      <input type="hidden" name="url" value="${escapeHtml(parsed.url)}" />
      <input type="hidden" name="image" value="${escapeHtml(parsed.image)}" />
      <p>${escapeHtml(parsed.message || '')}</p>
      <button class="link-button" type="submit">
        <i data-lucide="plus"></i>
        保存到手动热点池
      </button>
    </form>
  `;
  refreshIcons();
}

function renderManualLinks() {
  if (!state.authenticated) {
    els.manualList.innerHTML = '<div class="empty-state">管理员登录后可查看和管理手动热点池</div>';
    return;
  }
  if (!state.manualLinks.length) {
    els.manualList.innerHTML = '<div class="empty-state">还没有手动添加热点</div>';
    return;
  }

  els.manualList.innerHTML = state.manualLinks
    .map((item) => {
      const checked = state.selectedIds.has(item.id) ? 'checked' : '';
      return `
        <article class="manual-item ${item.image ? '' : 'manual-item-no-image'}">
          <label class="select-check" title="加入当前日报">
            <input type="checkbox" data-select-id="${escapeHtml(item.id)}" ${checked} />
            <span></span>
          </label>
          ${item.image ? `<div class="manual-item-image"><img src="${escapeHtml(item.image)}" alt="" /><button class="ghost-button" data-clear-saved-manual-image="${escapeHtml(item.id)}" type="button"><i data-lucide="image-off"></i> 删除图片</button></div>` : ''}
          <div>
            <h4>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : `<span>${escapeHtml(item.title)}</span>`}</h4>
            <p>${escapeHtml(item.summary || '暂无摘要')}</p>
            <div class="trend-meta">
              <span class="pill">${escapeHtml(item.sourceLabel || '手动添加')}</span>
              <span class="pill">${categoryLabel(item.category)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderBasket() {
  if (!els.basketList || !els.basketCount) return;

  const items = selectedItems();
  els.basketCount.textContent = `${items.length} 条`;

  if (!items.length) {
    els.basketList.innerHTML = '<div class="empty-state">还没有选择热点。勾选热榜或手动热点后会出现在这里。</div>';
    return;
  }

  els.basketList.innerHTML = items
    .map(
      (item) => `
        <article class="basket-item">
          <div>
            <h4>${escapeHtml(item.title)}</h4>
            <div class="trend-meta">
              <span class="pill">${escapeHtml(item.sourceLabel)}</span>
              <span class="pill">${categoryLabel(item.category)}</span>
              ${item.kind === 'manual' ? '<span class="pill">手动添加</span>' : ''}
            </div>
          </div>
          <button class="icon-button basket-remove" data-remove-id="${escapeHtml(item.id)}" type="button" aria-label="移出日报篮子">
            <i data-lucide="x"></i>
          </button>
        </article>
      `
    )
    .join('');
  refreshIcons();
}

function selectedItems() {
  const clusters = new Map((state.snapshot?.clusters || []).map((cluster) => [cluster.id, cluster]));
  const sources = new Map((state.snapshot?.items || []).map((item) => [item.id, item]));
  const manuals = new Map(state.manualLinks.map((item) => [item.id, item]));

  return [...state.selectedIds]
    .map((id) => {
      const cluster = clusters.get(id);
      if (cluster) return basketCluster(cluster);

      const manual = manuals.get(id);
      if (manual) return basketManual(manual);

      const source = sources.get(id);
      if (source) return basketSource(source);

      const saved = (state.daily?.items || []).find((item) => item.id === id);
      if (saved) {
        return {
          id: saved.id,
          title: saved.title,
          category: saved.category,
          sourceLabel: saved.sourceLabel || '已保存日报',
          kind: saved.kind || 'saved'
        };
      }

      return null;
    })
    .filter(Boolean);
}

function selectedItemIds() {
  return selectedItems().map((item) => item.id);
}

function basketCluster(cluster) {
  return {
    id: cluster.id,
    title: cluster.canonicalTitle,
    category: cluster.category || 'general',
    sourceLabel: (cluster.platforms || []).map(platformLabel).join(' / ') || '热点聚合',
    kind: 'cluster'
  };
}

function basketManual(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category || 'general',
    sourceLabel: item.sourceLabel || '手动添加',
    kind: 'manual'
  };
}

function basketSource(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category || 'general',
    sourceLabel: platformLabel(item.platform),
    kind: 'source'
  };
}

function renderAdminState() {
  els.adminButton.innerHTML = state.authenticated
    ? '<i data-lucide="log-out"></i> 退出登录'
    : '<i data-lucide="lock"></i> 管理员登录';
  els.adminButton.classList.toggle('is-authed', state.authenticated);
  els.dailyAdminPanel.hidden = !state.authenticated;
  document.body.classList.toggle('is-admin', state.authenticated);
  refreshIcons();
}

function renderDailyStatus(message = '') {
  const selectedCount = selectedItemIds().length;
  const savedCount = state.daily?.itemCount || 0;
  if (message) {
    els.dailyStatus.textContent = message;
    return;
  }
  if (!selectedCount) {
    els.dailyStatus.textContent = `还没有选择热点；当前已保存日报 ${savedCount} 条。`;
    return;
  }
  els.dailyStatus.textContent = `日报篮子里有 ${selectedCount} 条热点；保存后日报页才会更新。当前已保存 ${savedCount} 条。`;
}

function renderConnectorStatuses(connectors) {
  if (!connectors.length) return '';

  return connectors
    .map(
      (connector) => `
        <div class="connector-status">
          <b>${escapeHtml(connector.groupLabel || '')} / ${escapeHtml(connector.label)} / ${connectorStatusLabel(connector.status)}</b>
          <small>${escapeHtml(connector.message || connector.sourceType || '')}</small>
        </div>
      `
    )
    .join('');
}

function setLoading(isLoading) {
  els.refreshButton.classList.toggle('is-loading', isLoading);
  els.refreshButton.disabled = isLoading;
  if (els.sourceRefreshButton) {
    els.sourceRefreshButton.disabled = isLoading;
    els.sourceRefreshButton.classList.toggle('is-loading', isLoading);
  }
  window.hpMotion?.setLoading(isLoading);
}

function setSourceRefreshStatus(message) {
  if (!els.sourceRefreshStatus) return;
  els.sourceRefreshStatus.textContent = message || '';
}

function setSourceRefreshProgress(percent) {
  if (!els.sourceRefreshProgress) return;
  const value = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const bar = els.sourceRefreshProgress.querySelector('span');
  if (bar) bar.style.width = `${value}%`;
  els.sourceRefreshProgress.setAttribute('aria-valuenow', String(value));
}

async function pollRefreshStatus() {
  if (refreshPollTimer) {
    clearTimeout(refreshPollTimer);
    refreshPollTimer = null;
  }

  while (true) {
    const response = await fetch('/api/refresh-status');
    if (!response.ok) throw new Error('刷新进度读取失败');

    const status = await response.json();
    const percent = status.total ? (status.completed / status.total) * 100 : 8;
    setSourceRefreshProgress(percent);

    if (status.phase === 'completed') {
      setSourceRefreshProgress(100);
      setSourceRefreshStatus(`已完成：${formatTime(status.completedAt || new Date().toISOString())}`);
      await loadTrends();
      return;
    }

    if (status.phase === 'error') {
      throw new Error(status.error || '刷新失败');
    }

    const label = status.current ? `，正在处理：${status.current}` : '';
    setSourceRefreshStatus(`刷新中 ${status.completed || 0}/${status.total || '?'}${label}`);
    await delay(1200);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setButtonBusy(button, isBusy) {
  if (!button) return;
  button.disabled = isBusy;
  button.classList.toggle('is-loading', isBusy);
}

function refreshIcons() {
  if (!window.lucide) return;
  document.querySelectorAll('svg[data-lucide]').forEach((icon) => {
    const parent = icon.parentElement;
    const name = icon.getAttribute('data-lucide');
    if (!parent || !name) return;
    const placeholder = document.createElement('i');
    placeholder.setAttribute('data-lucide', name);
    parent.replaceChild(placeholder, icon);
  });
  window.lucide.createIcons();
}

function searchableCluster(cluster) {
  return [
    cluster.canonicalTitle,
    cluster.category,
    categoryLabel(cluster.category),
    cluster.platforms.join(' '),
    (cluster.platformGroups || []).join(' '),
    ...cluster.sources.map((source) => source.title)
  ]
    .join(' ')
    .toLowerCase();
}

function searchableItem(item) {
  return [
    item.title,
    item.category,
    categoryLabel(item.category),
    item.platform,
    item.platformLabel,
    item.platformGroup,
    item.platformGroupLabel,
    item.tags?.join(' ')
  ]
    .join(' ')
    .toLowerCase();
}

function platformLabel(platform) {
  const connector = (state.snapshot?.connectors || []).find((item) => item.id === platform);
  if (connector?.label) return connector.label;

  return (
    {
      weibo: '微博',
      gamersky: '游民星空',
      threedm: '3DM游戏网',
      yystv: '游研社',
      gcores: '机核网',
      gameres: 'GameRes',
      nadianshi: '游戏葡萄',
      gamelook: 'GameLook',
      aihot: 'AI HOT',
      bilibili_daily: 'B站日榜',
      bilibili_weekly: 'B站周榜',
      douban_nowplaying: '豆瓣热映',
      douban_movie: '豆瓣电影',
      douban_tv: '豆瓣剧集',
      x: 'X',
      reddit: 'Reddit',
      tiktok: 'TikTok',
      manual: '手动添加'
    }[platform] || platform
  );
}

function platformGroupFor(platform) {
  const connector = (state.snapshot?.connectors || []).find((item) => item.id === platform);
  return connector?.group || 'all';
}

function contentTypeFor(item) {
  const type = (state.snapshot?.connectors || []).find((connector) => connector.id === item.platform)?.type;
  if (type === 'video' || type === 'short-video' || type === 'film-tv') return 'video';
  if (type === 'ai-news') return 'news';
  if (type === 'gaming-news' || type === 'gaming-industry') return 'news';
  if (type === 'social-trend' || type === 'community') return 'social';
  return 'news';
}

function categoryLabel(category) {
  return (
    {
      auto: '汽车出行',
      business: '财经商业',
      education: '教育考试',
      entertainment: '影视娱乐',
      food: '餐饮美食',
      finance: '财经商业',
      gaming: '游戏电竞',
      meme: '时下热梗',
      general: '综合热点',
      health: '健康医疗',
      lifestyle: '生活消费',
      politics: '政务国际',
      science: '科学探索',
      society: '社会民生',
      sports: '体育赛事',
      tech: '科技数码',
      travel: '旅行文旅',
      world: '政务国际'
    }[category] || category || '综合热点'
  );
}

function categoryOptions(current) {
  const categories = [
    'general',
    'tech',
    'business',
    'entertainment',
    'gaming',
    'meme',
    'society',
    'sports',
    'education',
    'health',
    'travel',
    'lifestyle',
    'politics'
  ];
  return categories
    .map((category) => {
      const selected = category === current ? 'selected' : '';
      return `<option value="${category}" ${selected}>${categoryLabel(category)}</option>`;
    })
    .join('');
}

function sourceTypeLabel(sourceType) {
  return (
    {
      api: '真实 API',
      'public-page': '公开页',
      'public-api': '公开 API',
      'public-proxy': '公开代理',
      rss: 'RSS',
      'custom-json': '自定义源',
      sample: '示例',
      'sample-fallback': '回退示例',
      'manual-link': '手动添加'
    }[sourceType] || sourceType || '未知源'
  );
}

function connectorStatusLabel(status) {
  return (
    {
      live: '真实源',
      fallback: '访问受限 / 回退',
      sample: '待配置',
      error: '源不可用'
    }[status] || status
  );
}

function sourceModeLabel(liveCount, fallbackCount, sampleCount) {
  const parts = [];
  if (liveCount) parts.push(`${liveCount} 个真实源`);
  if (fallbackCount) parts.push(`${fallbackCount} 个访问受限`);
  if (sampleCount) parts.push(`${sampleCount} 个待配置`);
  return parts.length ? parts.join(' / ') : '示例数据';
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
