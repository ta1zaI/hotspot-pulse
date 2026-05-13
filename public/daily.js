const els = {
  summary: document.querySelector('#dailySummary'),
  date: document.querySelector('#dailyDate'),
  count: document.querySelector('#dailyCount'),
  manualCount: document.querySelector('#dailyManualCount'),
  topList: document.querySelector('#dailyTopList'),
  categoryList: document.querySelector('#dailyCategoryList')
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadDaily();
  refreshIcons();
});

async function loadDaily() {
  try {
    const response = await fetch('/api/daily');
    if (!response.ok) throw new Error('日报加载失败');
    const daily = await response.json();
    renderDaily(daily);
  } catch (error) {
    els.summary.textContent = error.message;
  }
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
