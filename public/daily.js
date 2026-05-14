const els = {
  summary: document.querySelector('#dailySummary'),
  date: document.querySelector('#dailyDate'),
  count: document.querySelector('#dailyCount'),
  manualCount: document.querySelector('#dailyManualCount'),
  historySelect: document.querySelector('#dailyHistorySelect'),
  topList: document.querySelector('#dailyTopList'),
  categoryList: document.querySelector('#dailyCategoryList')
};

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadHistory();
  await loadDaily(selectedDateFromUrl());
  refreshIcons();
});

function bindEvents() {
  els.historySelect.addEventListener('change', () => {
    const date = els.historySelect.value;
    const url = new URL(window.location.href);
    if (date) {
      url.searchParams.set('date', date);
    } else {
      url.searchParams.delete('date');
    }
    window.history.replaceState({}, '', url);
    loadDaily(date);
  });
}

async function loadDaily(date = '') {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const response = await fetch(`/api/daily${query}`);
    if (!response.ok) throw new Error('日报加载失败');
    const daily = await response.json();
    renderDaily(daily);
  } catch (error) {
    els.summary.textContent = error.message;
  }
}

async function loadHistory() {
  try {
    const response = await fetch('/api/daily-history');
    if (!response.ok) throw new Error('历史日报加载失败');
    const history = await response.json();
    renderHistory(history.entries || []);
  } catch {
    renderHistory([]);
  }
}

function renderHistory(entries) {
  const selectedDate = selectedDateFromUrl();
  const options = [
    '<option value="">最新日报</option>',
    ...entries.map((entry) => {
      const label = `${entry.date} · ${entry.itemCount || 0} 条`;
      return `<option value="${escapeHtml(entry.date)}">${escapeHtml(label)}</option>`;
    })
  ];

  els.historySelect.innerHTML = options.join('');
  els.historySelect.value = selectedDate;
}

function renderDaily(daily) {
  els.summary.textContent = daily.summary || '今日日报还没有选择热点。';
  els.date.textContent = daily.date || new Date().toISOString().slice(0, 10);
  els.count.textContent = `${daily.itemCount || 0} 条热点`;
  els.manualCount.textContent = `${daily.manualCount || 0} 条手动添加`;

  const items = daily.items || [];
  if (!items.length) {
    els.topList.innerHTML = '<div class="empty-state">日报还没有内容。管理员保存日报后，这里会自动更新。</div>';
    els.categoryList.innerHTML = '';
    return;
  }

  els.topList.innerHTML = items.slice(0, 8).map(renderDailyItem).join('');
  els.categoryList.innerHTML = (daily.sections || []).map(renderSection).join('');
}

function renderSection(section) {
  return `
    <article class="daily-category">
      <h3>${escapeHtml(section.label)}</h3>
      <div class="daily-list">
        ${(section.items || []).map(renderDailyItem).join('')}
      </div>
    </article>
  `;
}

function renderDailyItem(item) {
  const url = String(item.url || '').trim();
  const title = escapeHtml(item.title);
  const titleHtml = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${title}</a>`
    : `<span>${title}</span>`;
  return `
    <article class="daily-item ${item.image ? '' : 'daily-item-no-image'}">
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" />` : ''}
      <div>
        <div class="trend-meta">
          <span class="pill">${escapeHtml(item.categoryLabel || item.category || '综合热点')}</span>
          <span class="pill">${escapeHtml(item.sourceLabel || '未知来源')}</span>
          ${item.kind === 'manual' ? '<span class="pill">手动添加</span>' : ''}
        </div>
        <h3>
          ${titleHtml}
        </h3>
      </div>
    </article>
  `;
}

function selectedDateFromUrl() {
  const date = new URLSearchParams(window.location.search).get('date') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function refreshIcons() {
  if (!window.lucide) return;
  window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
