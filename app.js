// ─── DATA STORE ───────────────────────────────────────────────
const STORAGE_KEY = 'tradinglab_trades_v2';
const TEMPLATE_KEY = 'tradinglab_template_v1';
const TEMPLATE_DATA_KEY = 'tradinglab_template_data_v1';
const BT_STORAGE_KEY = 'tradinglab_bt_trades_v1';

let trades = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let templateFields = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
// templateData: { [tradeId]: { [fieldLabel]: "respuesta" } }
let templateData = JSON.parse(localStorage.getItem(TEMPLATE_DATA_KEY) || '{}');
let btTrades = JSON.parse(localStorage.getItem(BT_STORAGE_KEY) || '[]');

let editingId = null;
let editingBtId = null;
let openPanelId = null;
let selectedDirection = 'LONG';
let selectedBtDirection = 'LONG';
let selectedStyle = '';
let selectedEmotion = '';
let currentSort = { key: 'date', dir: 'desc' };
let calendarDate = new Date();

function saveTrades() { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }
function saveTemplate() { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templateFields)); }
function saveTemplateData() { localStorage.setItem(TEMPLATE_DATA_KEY, JSON.stringify(templateData)); }
function saveBtTrades() { localStorage.setItem(BT_STORAGE_KEY, JSON.stringify(btTrades)); }

function nextId() { return trades.length === 0 ? 1 : Math.max(...trades.map(t => t.id)) + 1; }
function nextBtId() { return btTrades.length === 0 ? 1 : Math.max(...btTrades.map(t => t.id)) + 1; }

// ─── DATE UTILS ───────────────────────────────────────────────
function formatDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// ─── STATS ────────────────────────────────────────────────────
function computeStats() {
  const closed = trades.filter(t => ['Win','Loss','Break Even'].includes(t.result));
  const wins = trades.filter(t => t.result === 'Win');
  const losses = trades.filter(t => t.result === 'Loss');
  const totalPnl = trades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const withRR = trades.filter(t => t.rr && !isNaN(t.rr));
  const avgRR = withRR.length ? withRR.reduce((s, t) => s + parseFloat(t.rr), 0) / withRR.length : 0;
  const bestTrade = trades.reduce((m, t) => Math.max(m, parseFloat(t.pnl) || 0), 0);

  const stratMap = {};
  trades.forEach(t => {
    if (!t.strategy) return;
    if (!stratMap[t.strategy]) stratMap[t.strategy] = { w: 0, total: 0 };
    stratMap[t.strategy].total++;
    if (t.result === 'Win') stratMap[t.strategy].w++;
  });
  let bestStrategy = '—', bestStratSub = 'sin datos', highestWR = -1;
  Object.entries(stratMap).forEach(([s, v]) => {
    const wr = v.total ? v.w / v.total : 0;
    if (wr > highestWR) { highestWR = wr; bestStrategy = s; bestStratSub = `${Math.round(wr*100)}% win rate`; }
  });

  const dirMap = { LONG: { w: 0, total: 0 }, SHORT: { w: 0, total: 0 } };
  trades.forEach(t => {
    if (!t.direction) return;
    dirMap[t.direction].total++;
    if (t.result === 'Win') dirMap[t.direction].w++;
  });
  const longWR = dirMap.LONG.total ? dirMap.LONG.w / dirMap.LONG.total : 0;
  const shortWR = dirMap.SHORT.total ? dirMap.SHORT.w / dirMap.SHORT.total : 0;
  let bestDir = '—', bestDirSub = 'sin datos';
  if (dirMap.LONG.total || dirMap.SHORT.total) {
    bestDir = longWR >= shortWR ? 'LONG' : 'SHORT';
    bestDirSub = `${Math.round(Math.max(longWR, shortWR) * 100)}% win rate`;
  }

  return { totalPnl, winRate, bestStrategy, bestStratSub, bestDir, bestDirSub, avgRR, bestTrade,
           wins: wins.length, losses: losses.length, closed: closed.length };
}

function renderStats() {
  const s = computeStats();
  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = (s.totalPnl >= 0 ? '+' : '') + s.totalPnl.toFixed(2) + '€';
  pnlEl.className = 'stat-value ' + (s.totalPnl > 0 ? 'positive' : s.totalPnl < 0 ? 'negative' : '');
  document.getElementById('pnlSub').textContent = `${s.closed} trades cerrados`;
  const wrEl = document.getElementById('winRate');
  wrEl.textContent = s.winRate.toFixed(1) + '%';
  wrEl.className = 'stat-value ' + (s.winRate >= 50 ? 'positive' : s.winRate > 0 ? 'negative' : '');
  document.getElementById('winRateSub').textContent = `${s.wins} wins / ${s.losses} losses`;
  document.getElementById('bestStrategy').textContent = s.bestStrategy;
  document.getElementById('bestStrategySub').textContent = s.bestStratSub;
  document.getElementById('bestDirection').textContent = s.bestDir;
  document.getElementById('bestDirectionSub').textContent = s.bestDirSub;
  document.getElementById('avgRR').textContent = s.avgRR.toFixed(2);
  document.getElementById('bestTrade').textContent = '+' + s.bestTrade.toFixed(2) + '€';
}

// ─── BADGES ───────────────────────────────────────────────────
const STRATEGY_COLORS = {
  'Blue A':  { cls: 'badge-blue',   hex: '#5b8af0' },
  'Blue B':  { cls: 'badge-blue',   hex: '#4479e0' },
  'Blue C':  { cls: 'badge-blue',   hex: '#3368d0' },
  'Red':     { cls: 'badge-red',    hex: '#f0436a' },
  'Pink':    { cls: 'badge-pink',   hex: '#f472b6' },
  'White':   { cls: 'badge-gray',   hex: '#c8cce6' },
  'Black':   { cls: 'badge-dark',   hex: '#8b8fa8' },
  'Green':   { cls: 'badge-green',  hex: '#22d364' },
};

// Extra badge classes
const extraBadgeCSS = `
  .badge-pink { background: rgba(244,114,182,0.12); color: #f472b6; border: 1px solid rgba(244,114,182,0.3); }
  .badge-dark { background: rgba(255,255,255,0.04); color: #a8acc8; border: 1px solid rgba(255,255,255,0.1); }
`;
const styleTag = document.createElement('style');
styleTag.textContent = extraBadgeCSS;
document.head.appendChild(styleTag);

function strategyBadge(s) {
  const info = STRATEGY_COLORS[s] || { cls: 'badge-gray', hex: '#8b8fa8' };
  return `<span class="badge ${info.cls}">${s || '—'}</span>`;
}
function styleBadge(s) {
  const map = { Scalping: '⚡', Day: '☀️', Swing: '🌊' };
  if (!s) return '<span class="badge badge-gray">—</span>';
  return `<span class="badge badge-gray">${map[s] || ''} ${s}</span>`;
}
function directionBadge(d) {
  if (!d) return '<span class="badge badge-gray">—</span>';
  return `<span class="badge badge-${d.toLowerCase()}">${d}</span>`;
}
function resultBadge(r) {
  const map = { Win: 'badge-win', Loss: 'badge-loss', 'Break Even': 'badge-be', 'En curso': 'badge-open' };
  return `<span class="badge ${map[r] || 'badge-gray'}">${r || '—'}</span>`;
}
function calcRR(t) {
  const e = parseFloat(t.entry), sl = parseFloat(t.sl), tp = parseFloat(t.tp);
  if (!e || !sl || !tp || isNaN(e) || isNaN(sl) || isNaN(tp)) return null;
  const risk = Math.abs(e - sl), reward = Math.abs(tp - e);
  return risk === 0 ? null : (reward / risk).toFixed(2);
}

// ─── TABLE ────────────────────────────────────────────────────
function getFilteredTrades() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const selStrats = [...document.querySelectorAll('.strat-filter:checked')].map(el => el.value);
  const selStyles = [...document.querySelectorAll('.style-filter:checked')].map(el => el.value);
  const selDirs = [...document.querySelectorAll('.dir-filter:checked')].map(el => el.value);
  const selRes = [...document.querySelectorAll('.result-filter:checked')].map(el => el.value);

  return trades
    .filter(t => {
      if (search && ![(t.asset||''), (t.strategy||''), (t.notes||'')].join(' ').toLowerCase().includes(search)) return false;
      if (selStrats.length && !selStrats.includes(t.strategy)) return false;
      if (selStyles.length && !selStyles.includes(t.style)) return false;
      if (selDirs.length && !selDirs.includes(t.direction)) return false;
      if (selRes.length && !selRes.includes(t.result)) return false;
      return true;
    })
    .sort((a, b) => {
      if (currentSort.key === 'date') {
        const cmp = (b.date||'').localeCompare(a.date||'');
        return currentSort.dir === 'desc' ? cmp : -cmp;
      }
      if (currentSort.key === 'pnl') {
        const cmp = (parseFloat(b.pnl)||0) - (parseFloat(a.pnl)||0);
        return currentSort.dir === 'desc' ? cmp : -cmp;
      }
      return 0;
    });
}

function renderTable() {
  const filtered = getFilteredTrades();
  const tbody = document.getElementById('tradesBody');
  const empty = document.getElementById('tableEmpty');
  const footer = document.getElementById('tableFooter');

  tbody.innerHTML = '';
  if (filtered.length === 0) { empty.style.display = 'block'; footer.style.display = 'none'; return; }
  empty.style.display = 'none'; footer.style.display = 'block';
  document.getElementById('tableCount').textContent = `${filtered.length} de ${trades.length} trades`;

  filtered.forEach(t => {
    const pnl = parseFloat(t.pnl) || 0;
    const pnlStr = pnl === 0 ? '—' : (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '€';
    const rr = t.rr || calcRR(t) || '—';
    const isActive = openPanelId === t.id;
    const tr = document.createElement('tr');
    tr.dataset.id = t.id;
    if (isActive) tr.classList.add('row-active');
    tr.innerHTML = `
      <td class="td-id">#${t.id}</td>
      <td class="td-asset">${t.asset||'—'}${t.session?`<br><span style="font-size:10px;color:var(--text-muted)">${t.session}</span>`:''}</td>
      <td class="td-date">${formatDate(t.date)}${t.time?`<br><span style="font-size:10px;color:var(--text-muted)">${t.time}</span>`:''}</td>
      <td>${t.strategy ? strategyBadge(t.strategy) : '<span class="badge badge-gray">—</span>'}</td>
      <td>${styleBadge(t.style)}</td>
      <td>${directionBadge(t.direction)}</td>
      <td>${resultBadge(t.result)}</td>
      <td class="td-pnl ${pnl>0?'positive':pnl<0?'negative':''}">${pnlStr}</td>
      <td class="td-rr">${rr!=='—'?`1:${rr}`:'—'}</td>
      <td class="td-actions" onclick="event.stopPropagation()">
        <button class="btn-table-action" onclick="openPanel(${t.id})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver
        </button>
        <button class="btn-table-action" onclick="openEditModal(${t.id})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar
        </button>
        <button class="btn-table-delete" onclick="deleteTrade(${t.id})" title="Eliminar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </td>`;
    tr.addEventListener('click', () => openPanel(t.id));
    tbody.appendChild(tr);
  });
}

// ─── ROW ACTIVE STYLE ─────────────────────────────────────────
const rowStyle = document.createElement('style');
rowStyle.textContent = `.row-active { background: rgba(255,107,53,0.05) !important; outline: 1px solid rgba(255,107,53,0.2); }`;
document.head.appendChild(rowStyle);

// ─── SIDE PANEL ───────────────────────────────────────────────
function openPanel(id) {
  const trade = trades.find(t => t.id === id);
  if (!trade) return;
  openPanelId = id;
  renderTable(); // refresh active row

  // Header
  document.getElementById('panelTitle').textContent = `Trade #${trade.id} — ${trade.asset || ''}`;
  const badges = document.getElementById('panelBadges');
  badges.innerHTML = [
    trade.direction ? directionBadge(trade.direction) : '',
    trade.strategy ? strategyBadge(trade.strategy) : '',
    trade.style ? styleBadge(trade.style) : '',
    trade.result ? resultBadge(trade.result) : ''
  ].join('');

  document.getElementById('panelEditBtn').onclick = () => { openEditModal(id); };

  renderPanelBody(trade);

  // Open panel
  document.getElementById('sidePanel').classList.add('open');
  document.getElementById('mainContent').classList.add('panel-open');
}

function renderPanelBody(trade) {
  const pnl = parseFloat(trade.pnl) || 0;
  const pnlStr = pnl === 0 ? '—' : (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '€';
  const pnlColor = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--text-primary)';
  const rr = trade.rr || calcRR(trade) || '—';
  const tdKey = String(trade.id);
  const tData = templateData[tdKey] || {};

  let html = '';

  // Quick stats
  html += `<div>
    <div class="panel-section-title">Datos del trade</div>
    <div class="panel-stats-grid">
      <div class="panel-stat-item"><div class="panel-stat-label">Fecha</div><div class="panel-stat-value">${formatDate(trade.date)}${trade.time?' '+trade.time:''}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">P&L</div><div class="panel-stat-value" style="color:${pnlColor}">${pnlStr}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">Entrada</div><div class="panel-stat-value">${trade.entry||'—'}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">SL</div><div class="panel-stat-value">${trade.sl||'—'}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">TP</div><div class="panel-stat-value">${trade.tp||'—'}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">R/R</div><div class="panel-stat-value">${rr!=='—'?`1:${rr}`:'—'}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">Tamaño</div><div class="panel-stat-value">${trade.size?trade.size+' lotes':'—'}</div></div>
      <div class="panel-stat-item"><div class="panel-stat-label">Sesión</div><div class="panel-stat-value">${trade.session||'—'}</div></div>
    </div>
  </div>`;

  // Screenshot
  if (trade.image && trade.image.length > 5) {
    html += `<div>
      <div class="panel-section-title">Captura del trade</div>
      <div class="panel-image-wrap"><img src="${trade.image}" alt="Screenshot" onclick="window.open(this.src)" /></div>
    </div>`;
  }

  // Emotion
  if (trade.emotion) {
    html += `<div>
      <div class="panel-section-title">Estado emocional</div>
      <span class="panel-emotion-tag">${trade.emotion}</span>
    </div>`;
  }

  // Notes
  if (trade.notes) {
    html += `<div>
      <div class="panel-section-title">Notas / Análisis</div>
      <div class="panel-notes">${trade.notes}</div>
    </div>`;
  }

  // Template fields
  if (templateFields.length > 0) {
    html += `<div><div class="panel-section-title">Mi plantilla</div>`;
    templateFields.forEach((field, idx) => {
      const val = tData[field] || '';
      html += `<div class="template-field-block" style="margin-bottom:12px;">
        <div class="template-field-label">${field}</div>
        <textarea class="template-field-textarea" data-field="${field}" data-tradeid="${trade.id}" placeholder="Escribe aquí...">${val}</textarea>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="panel-save-btn">
      <button class="btn-primary" id="panelSaveTemplateBtn" style="width:100%;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Guardar respuestas
      </button>
    </div>`;
  } else {
    html += `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">
      <p style="margin-bottom:12px;">No hay campos en tu plantilla aún.</p>
      <button class="btn-template" onclick="openTemplateModal()" style="margin:0 auto;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Editar plantilla
      </button>
    </div>`;
  }

  document.getElementById('panelBody').innerHTML = html;

  // Bind save button
  const saveBtn = document.getElementById('panelSaveTemplateBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => savePanelTemplateData(trade.id));
  }
}

function savePanelTemplateData(tradeId) {
  const key = String(tradeId);
  if (!templateData[key]) templateData[key] = {};
  document.querySelectorAll('.template-field-textarea').forEach(el => {
    templateData[key][el.dataset.field] = el.value;
  });
  saveTemplateData();
  showToast('Respuestas guardadas', 'success');
}

function closePanel() {
  document.getElementById('sidePanel').classList.remove('open');
  document.getElementById('mainContent').classList.remove('panel-open');
  openPanelId = null;
  renderTable();
}

// ─── TEMPLATE MODAL ───────────────────────────────────────────
function openTemplateModal() {
  renderTemplateFields();
  document.getElementById('templateModalOverlay').classList.add('open');
}

function closeTemplateModal() {
  document.getElementById('templateModalOverlay').classList.remove('open');
}

function renderTemplateFields() {
  const list = document.getElementById('templateFieldsList');
  if (templateFields.length === 0) {
    list.innerHTML = `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px 0;">Aún no hay campos. Haz clic en "Agregar campo" para empezar.</p>`;
    return;
  }
  list.innerHTML = templateFields.map((f, i) => `
    <div class="template-field-row" data-index="${i}">
      <span class="drag-handle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
      </span>
      <input type="text" value="${f}" placeholder="Nombre del campo..." data-index="${i}" class="template-field-input" />
      <button class="btn-remove-field" onclick="removeTemplateField(${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function addTemplateField() {
  templateFields.push('');
  renderTemplateFields();
  // focus last input
  setTimeout(() => {
    const inputs = document.querySelectorAll('.template-field-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function removeTemplateField(idx) {
  templateFields.splice(idx, 1);
  renderTemplateFields();
}

function saveTemplateModal() {
  // Collect current input values
  const inputs = document.querySelectorAll('.template-field-input');
  templateFields = [...inputs].map(i => i.value.trim()).filter(v => v.length > 0);
  saveTemplate();
  closeTemplateModal();
  showToast('Plantilla guardada', 'success');
  // Re-render panel if open
  if (openPanelId) {
    const trade = trades.find(t => t.id === openPanelId);
    if (trade) renderPanelBody(trade);
  }
}

// ─── FILTERS ──────────────────────────────────────────────────
function buildStrategyMenu() {
  const menu = document.getElementById('strategyMenu');
  const strategies = [...new Set(trades.map(t => t.strategy).filter(Boolean))];
  menu.innerHTML = '';
  strategies.forEach(s => {
    const label = document.createElement('label');
    label.className = 'dropdown-item';
    label.innerHTML = `<input type="checkbox" value="${s}" class="strat-filter" /> ${s}`;
    menu.appendChild(label);
  });
  document.querySelectorAll('.strat-filter').forEach(el => el.addEventListener('change', applyFilters));
}

function applyFilters() {
  const active = [...document.querySelectorAll('.strat-filter:checked,.dir-filter:checked,.result-filter:checked,.style-filter:checked')];
  document.getElementById('btnClearFilters').style.display = active.length ? 'flex' : 'none';
  document.getElementById('filterStrategyBtn').classList.toggle('active', !!document.querySelectorAll('.strat-filter:checked').length);
  document.getElementById('filterStyleBtn').classList.toggle('active', !!document.querySelectorAll('.style-filter:checked').length);
  document.getElementById('filterDirectionBtn').classList.toggle('active', !!document.querySelectorAll('.dir-filter:checked').length);
  document.getElementById('filterResultBtn').classList.toggle('active', !!document.querySelectorAll('.result-filter:checked').length);
  renderTable();
}

function setupDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.filter-btn');
    const menu = dropdown.querySelector('.dropdown-menu');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown-menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
      menu.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open')));
  document.querySelectorAll('.dir-filter,.result-filter,.style-filter').forEach(el => el.addEventListener('change', applyFilters));
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('btnClearFilters').addEventListener('click', () => {
    document.querySelectorAll('.strat-filter,.dir-filter,.result-filter,.style-filter').forEach(el => el.checked = false);
    document.getElementById('searchInput').value = '';
    applyFilters();
  });
}

function setupSort() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      currentSort = { key, dir: currentSort.key === key && currentSort.dir === 'desc' ? 'asc' : 'desc' };
      document.querySelectorAll('th.sortable').forEach(t => t.classList.remove('asc'));
      if (currentSort.dir === 'asc') th.classList.add('asc');
      renderTable();
    });
  });
}

// ─── MODAL: NUEVO / EDITAR ────────────────────────────────────
function openNewModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Nuevo Trade';
  resetForm();
  document.getElementById('formDate').value = todayISO();
  document.getElementById('modalOverlay').classList.add('open');
}

function openEditModal(id) {
  const trade = trades.find(t => t.id === id);
  if (!trade) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = `Editar Trade #${id}`;
  populateForm(trade);
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function resetForm() {
  ['formAsset','formDate','formTime','formEntry','formSL','formTP','formPnl','formSize','formNotes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['formStrategy','formResult','formSession'].forEach(id => document.getElementById(id).value = '');
  selectedDirection = 'LONG'; selectedStyle = ''; selectedEmotion = '';
  updateDirectionToggle(); updateStyleToggle();
  document.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
  clearImagePreview();
  document.getElementById('rrCalc').style.display = 'none';
}

function populateForm(t) {
  document.getElementById('formAsset').value = t.asset||'';
  document.getElementById('formDate').value = t.date||'';
  document.getElementById('formTime').value = t.time||'';
  document.getElementById('formEntry').value = t.entry||'';
  document.getElementById('formSL').value = t.sl||'';
  document.getElementById('formTP').value = t.tp||'';
  document.getElementById('formPnl').value = t.pnl||'';
  document.getElementById('formSize').value = t.size||'';
  document.getElementById('formNotes').value = t.notes||'';
  document.getElementById('formStrategy').value = t.strategy||'';
  document.getElementById('formResult').value = t.result||'';
  document.getElementById('formSession').value = t.session||'';
  selectedDirection = t.direction||'LONG';
  selectedStyle = t.style||'';
  selectedEmotion = t.emotion||'';
  updateDirectionToggle(); updateStyleToggle();
  document.querySelectorAll('.emotion-btn').forEach(b => b.classList.toggle('active', b.dataset.emotion === t.emotion));
  if (t.image) {
    document.getElementById('imagePreview').src = t.image;
    document.getElementById('imageUploadArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
  } else { clearImagePreview(); }
  updateRRCalc();
}

function updateDirectionToggle() {
  document.getElementById('toggleLong').classList.toggle('active', selectedDirection === 'LONG');
  document.getElementById('toggleShort').classList.toggle('active', selectedDirection === 'SHORT');
}

function updateStyleToggle() {
  document.querySelectorAll('.toggle-btn-3').forEach(b => b.classList.toggle('active', b.dataset.value === selectedStyle));
}

function saveTrade() {
  const asset = document.getElementById('formAsset').value.trim();
  const date = document.getElementById('formDate').value;
  if (!asset) { showToast('El activo es obligatorio', 'error'); return; }
  if (!date) { showToast('La fecha es obligatoria', 'error'); return; }

  const entry = document.getElementById('formEntry').value;
  const sl = document.getElementById('formSL').value;
  const tp = document.getElementById('formTP').value;
  const rr = calcRR({ entry, sl, tp });

  const data = {
    asset, date,
    time: document.getElementById('formTime').value,
    direction: selectedDirection,
    style: selectedStyle,
    strategy: document.getElementById('formStrategy').value,
    result: document.getElementById('formResult').value,
    pnl: document.getElementById('formPnl').value,
    entry, sl, tp,
    size: document.getElementById('formSize').value,
    notes: document.getElementById('formNotes').value,
    session: document.getElementById('formSession').value,
    emotion: selectedEmotion, rr,
    image: document.getElementById('imagePreview').src || ''
  };

  if (editingId) {
    const idx = trades.findIndex(t => t.id === editingId);
    trades[idx] = { ...trades[idx], ...data };
    showToast('Trade actualizado', 'success');
    if (openPanelId === editingId) {
      openPanel(editingId);
    }
  } else {
    data.id = nextId();
    data.createdAt = new Date().toISOString();
    trades.unshift(data);
    showToast('Trade registrado', 'success');
  }

  saveTrades(); buildStrategyMenu(); renderTable(); renderStats();
  renderExtendedStats(); renderCalendar(); renderPlaybook();
  closeModal();
}

function deleteTrade(id) {
  if (!confirm(`¿Eliminar el trade #${id}?`)) return;
  trades = trades.filter(t => t.id !== id);
  if (openPanelId === id) closePanel();
  saveTrades(); buildStrategyMenu(); renderTable(); renderStats();
  renderExtendedStats(); renderCalendar(); renderPlaybook();
  showToast('Trade eliminado', 'info');
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────────
function setupImageUpload() {
  const area = document.getElementById('imageUploadArea');
  const input = document.getElementById('formImage');
  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--accent)'; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  area.addEventListener('drop', e => {
    e.preventDefault(); area.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) loadImage(file);
  });
  input.addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0]); });
  document.getElementById('removeImageBtn').addEventListener('click', clearImagePreview);
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('imagePreview').src = e.target.result;
    document.getElementById('imageUploadArea').style.display = 'none';
    document.getElementById('imagePreviewArea').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  document.getElementById('imagePreview').src = '';
  document.getElementById('imageUploadArea').style.display = 'block';
  document.getElementById('imagePreviewArea').style.display = 'none';
  document.getElementById('formImage').value = '';
}

function updateRRCalc() {
  const e = parseFloat(document.getElementById('formEntry').value);
  const sl = parseFloat(document.getElementById('formSL').value);
  const tp = parseFloat(document.getElementById('formTP').value);
  if (isNaN(e)||isNaN(sl)||isNaN(tp)) { document.getElementById('rrCalc').style.display='none'; return; }
  const risk = Math.abs(e-sl), reward = Math.abs(tp-e);
  if (risk===0) return;
  document.getElementById('rrValue').textContent = `1:${(reward/risk).toFixed(2)}`;
  document.getElementById('rrCalc').style.display = 'block';
}

// ─── GREETING ─────────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  document.getElementById('greeting').textContent = h<12?'¡Buenos días, trader!':h<19?'¡Buenas tardes, trader!':'¡Buenas noches, trader!';
  const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const d = new Date();
  document.getElementById('headerDate').textContent = `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── STATS VIEW ───────────────────────────────────────────────
function renderExtendedStats() {
  const container = document.getElementById('extendedMetrics');
  const metrics = [
    { label: 'Total Trades', value: trades.length },
    { label: 'Abiertos', value: trades.filter(t=>t.result==='En curso').length },
    { label: 'Ganados', value: trades.filter(t=>t.result==='Win').length },
    { label: 'Perdidos', value: trades.filter(t=>t.result==='Loss').length },
    { label: 'Break Even', value: trades.filter(t=>t.result==='Break Even').length },
    { label: 'Profit Factor', value: (() => {
      let won = 0, lost = 0;
      trades.forEach(t => {
          const p = parseFloat(t.pnl) || 0;
          if (p > 0) won += p;
          else if (p < 0) lost += Math.abs(p);
      });
      if (lost === 0) return won > 0 ? '∞' : '0.00';
      return (won / lost).toFixed(2);
    })() },
    { label: 'Max Drawdown', value: (() => {
      let eq = 0, maxEq = 0, maxDd = 0;
      const sorted = [...trades].sort((a,b) => (a.date||'').localeCompare(b.date||''));
      sorted.forEach(t => {
          eq += parseFloat(t.pnl) || 0;
          if (eq > maxEq) maxEq = eq;
          const dd = maxEq - eq;
          if (dd > maxDd) maxDd = dd;
      });
      return maxDd > 0 ? '-' + maxDd.toFixed(2) + '€' : '0.00€';
    })() },
    { label: 'Mejor Día', value: (() => {
      const byDay = {};
      trades.forEach(t=>{if(!t.date)return; byDay[t.date]=(byDay[t.date]||0)+(parseFloat(t.pnl)||0);});
      const max = Math.max(...Object.values(byDay), 0);
      return max > 0 ? '+' + max.toFixed(2) + '€' : '—';
    })() },
    { label: 'Peor Día', value: (() => {
      const byDay = {};
      trades.forEach(t=>{if(!t.date)return; byDay[t.date]=(byDay[t.date]||0)+(parseFloat(t.pnl)||0);});
      const min = Math.min(...Object.values(byDay), 0);
      return min < 0 ? min.toFixed(2) + '€' : '—';
    })() },
    { label: 'Racha Victorias', value: (() => {
      let maxW=0, curW=0;
      [...trades].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t => {
          if (t.result==='Win'){ curW++; if(curW>maxW)maxW=curW; }
          else if (t.result==='Loss') curW=0;
      });
      return maxW + (maxW===1?' trade':' trades');
    })() },
    { label: 'Racha Derrotas', value: (() => {
      let maxL=0, curL=0;
      [...trades].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t => {
          if (t.result==='Loss'){ curL++; if(curL>maxL)maxL=curL; }
          else if (t.result==='Win') curL=0;
      });
      return maxL + (maxL===1?' trade':' trades');
    })() }
  ];
  container.innerHTML = metrics.map(m=>`<div class="stat-card"><div class="stat-label">${m.label}</div><div class="stat-value" style="font-size:20px">${m.value}</div></div>`).join('');
  renderCharts();
}

// ─── CHARTS ───────────────────────────────────────────────────
let equityChartInst=null, resultsChartInst=null, strategyChartInst=null;
let drawdownChartInst=null, dayChartInst=null, timeChartInst=null;

function renderCharts() {
  if (!document.getElementById('statsView').classList.contains('active-view')) return;
  const sorted = [...trades].sort((a,b) => (a.date||'').localeCompare(b.date||''));
  
  let eq = 0, maxEq = 0;
  const eqData = [{x:'Inicio', y:0}];
  const ddData = [{x:'Inicio', y:0}];
  
  sorted.forEach(t => {
      eq += parseFloat(t.pnl) || 0;
      if (eq > maxEq) maxEq = eq;
      const dd = eq - maxEq;
      eqData.push({x:`#${t.id}`, y:parseFloat(eq.toFixed(2))});
      ddData.push({x:`#${t.id}`, y:parseFloat(dd.toFixed(2))});
  });

  const wins = trades.filter(t=>t.result==='Win').length;
  const losses = trades.filter(t=>t.result==='Loss').length;
  const be = trades.filter(t=>t.result==='Break Even').length;
  const open = trades.filter(t=>t.result==='En curso').length;

  const stratPnl = {};
  trades.forEach(t => { if(!t.strategy) return; stratPnl[t.strategy]=(stratPnl[t.strategy]||0)+(parseFloat(t.pnl)||0); });

  const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayPnl = { 'Lunes':0, 'Martes':0, 'Miércoles':0, 'Jueves':0, 'Viernes':0 };
  trades.forEach(t => {
      if(!t.date) return;
      const dName = daysMap[new Date(t.date).getDay()];
      if(dayPnl[dName] !== undefined) dayPnl[dName] += parseFloat(t.pnl) || 0;
  });

  const timePnl = {};
  trades.forEach(t => {
      if(!t.time) return;
      const h = parseInt(t.time.split(':')[0]);
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      timePnl[hourStr] = (timePnl[hourStr] || 0) + (parseFloat(t.pnl) || 0);
  });
  const sortedTimes = Object.keys(timePnl).sort((a,b) => parseInt(a) - parseInt(b));

  const defaults = {
    plugins: {
      legend: { labels: { color:'#8b8fa8', font:{family:'Inter',size:12} } },
      tooltip: { backgroundColor:'#1a1c28', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, titleColor:'#f0f2ff', bodyColor:'#8b8fa8' }
    },
    scales: {
      x: { grid: {color:'rgba(255,255,255,0.04)'}, ticks:{color:'#5a5e78', font:{family:'JetBrains Mono',size:11}} },
      y: { grid: {color:'rgba(255,255,255,0.04)'}, ticks:{color:'#5a5e78', font:{family:'JetBrains Mono',size:11}} }
    }
  };

  const draw = () => {
    // Equity
    const eCtx = document.getElementById('equityChart').getContext('2d');
    if(equityChartInst) equityChartInst.destroy();
    const gradE = eCtx.createLinearGradient(0,0,0,200);
    gradE.addColorStop(0,'rgba(34,211,167,0.2)'); gradE.addColorStop(1,'rgba(34,211,167,0)');
    equityChartInst = new Chart(eCtx,{type:'line',data:{labels:eqData.map(d=>d.x),datasets:[{label:'Equity (€)',data:eqData.map(d=>d.y),borderColor:'#22d3a7',backgroundColor:gradE,tension:0.4,fill:true,pointBackgroundColor:'#22d3a7',pointRadius:2,pointHoverRadius:4}]},options:{...defaults,responsive:true,maintainAspectRatio:false}});

    // Drawdown
    const dCtx = document.getElementById('drawdownChart').getContext('2d');
    if(drawdownChartInst) drawdownChartInst.destroy();
    const gradD = dCtx.createLinearGradient(0,0,0,200);
    gradD.addColorStop(0,'rgba(240,67,106,0.2)'); gradD.addColorStop(1,'rgba(240,67,106,0)');
    drawdownChartInst = new Chart(dCtx,{type:'line',data:{labels:ddData.map(d=>d.x),datasets:[{label:'Drawdown (€)',data:ddData.map(d=>d.y),borderColor:'#f0436a',backgroundColor:gradD,tension:0.4,fill:true,pointBackgroundColor:'#f0436a',pointRadius:1,pointHoverRadius:4}]},options:{...defaults,responsive:true,maintainAspectRatio:false}});

    // Results Donut
    const rCtx = document.getElementById('resultsChart').getContext('2d');
    if(resultsChartInst) resultsChartInst.destroy();
    resultsChartInst = new Chart(rCtx,{type:'doughnut',data:{labels:['Win','Loss','Break Even','En curso'],datasets:[{data:[wins,losses,be,open],backgroundColor:['rgba(34,211,167,0.8)','rgba(240,67,106,0.8)','rgba(245,200,66,0.8)','rgba(91,138,240,0.8)'],borderColor:'#13141c',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{...defaults.plugins}}});

    // Strategy Bar
    const sCtx = document.getElementById('strategyChart').getContext('2d');
    if(strategyChartInst) strategyChartInst.destroy();
    const sLabels = Object.keys(stratPnl), sVals = Object.values(stratPnl);
    strategyChartInst = new Chart(sCtx,{type:'bar',data:{labels:sLabels,datasets:[{label:'P&L por Estrategia (€)',data:sVals,backgroundColor:sVals.map(v=>v>=0?'rgba(34,211,167,0.7)':'rgba(240,67,106,0.7)'),borderRadius:4}]},options:{...defaults,responsive:true,maintainAspectRatio:false}});

    // Day Bar
    const dayCtx = document.getElementById('dayChart').getContext('2d');
    if(dayChartInst) dayChartInst.destroy();
    const dLabels = Object.keys(dayPnl), dVals = Object.values(dayPnl);
    dayChartInst = new Chart(dayCtx,{type:'bar',data:{labels:dLabels,datasets:[{label:'P&L Diario (€)',data:dVals,backgroundColor:dVals.map(v=>v>=0?'rgba(91,138,240,0.7)':'rgba(240,67,106,0.7)'),borderRadius:4}]},options:{...defaults,responsive:true,maintainAspectRatio:false}});

    // Time Bar
    const tCtx = document.getElementById('timeChart').getContext('2d');
    if(timeChartInst) timeChartInst.destroy();
    const tVals = sortedTimes.map(h => timePnl[h]);
    timeChartInst = new Chart(tCtx,{type:'bar',data:{labels:sortedTimes,datasets:[{label:'P&L por Hora (€)',data:tVals,backgroundColor:tVals.map(v=>v>=0?'rgba(167,139,250,0.7)':'rgba(240,67,106,0.7)'),borderRadius:4}]},options:{...defaults,responsive:true,maintainAspectRatio:false}});
  };

  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = draw; document.head.appendChild(s);
  } else { draw(); }
}

// ─── CALENDAR ─────────────────────────────────────────────────
function renderCalendar() {
  const grid=document.getElementById('calendarGrid');
  const label=document.getElementById('calMonthLabel');
  const y=calendarDate.getFullYear(), m=calendarDate.getMonth();
  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  label.textContent=`${months[m]} ${y}`;
  const days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const firstDay=new Date(y,m,1).getDay();
  const offset=(firstDay+6)%7;
  const daysInMonth=new Date(y,m+1,0).getDate();
  const dayMap={};
  trades.forEach(t=>{
    if(!t.date)return;
    const d=new Date(t.date);
    if(d.getFullYear()===y&&d.getMonth()===m){
      const k=d.getDate();
      if(!dayMap[k])dayMap[k]={pnl:0,count:0};
      dayMap[k].pnl+=parseFloat(t.pnl)||0; dayMap[k].count++;
    }
  });
  const today=new Date();
  grid.innerHTML='';
  days.forEach(d=>{const el=document.createElement('div');el.className='cal-day-header';el.textContent=d;grid.appendChild(el);});
  for(let i=0;i<offset;i++){const el=document.createElement('div');el.className='cal-day empty';grid.appendChild(el);}
  for(let d=1;d<=daysInMonth;d++){
    const el=document.createElement('div');
    const data=dayMap[d];
    const isToday=d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
    let cls='cal-day'+(isToday?' today':'')+(data?(' has-trades'+(data.pnl>0?' positive':data.pnl<0?' negative':'')):'');
    el.className=cls;
    el.innerHTML=`<div class="cal-day-num">${d}</div>`;
    if(data){const sign=data.pnl>=0?'+':'';el.innerHTML+=`<div class="cal-day-pnl ${data.pnl>=0?'pos':'neg'}">${sign}${data.pnl.toFixed(2)}€</div><div class="cal-day-count">${data.count} trade${data.count>1?'s':''}</div>`;}
    grid.appendChild(el);
  }
}

// ─── PLAYBOOK ─────────────────────────────────────────────────
function renderPlaybook() {
  const container=document.getElementById('playbookContainer');
  const strategies=[...new Set(trades.map(t=>t.strategy).filter(Boolean))];
  if(!strategies.length){container.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-muted)"><p>Agrega trades con estrategias para ver tu playbook aquí</p></div>`;return;}
  container.innerHTML=strategies.map(s=>{
    const st=trades.filter(t=>t.strategy===s);
    const wins=st.filter(t=>t.result==='Win').length;
    const losses=st.filter(t=>t.result==='Loss').length;
    const total=st.filter(t=>['Win','Loss','Break Even'].includes(t.result)).length;
    const wr=total?Math.round((wins/total)*100):0;
    const pnl=st.reduce((sum,t)=>sum+(parseFloat(t.pnl)||0),0);
    const info=STRATEGY_COLORS[s]||{hex:'#8b8fa8'};
    return `<div class="playbook-card">
      <div class="playbook-strategy-name" style="color:${info.hex}"><span style="width:10px;height:10px;border-radius:50%;background:${info.hex};display:inline-block;"></span>${s}</div>
      <div class="playbook-stats">
        <div class="playbook-stat"><div class="playbook-stat-val" style="color:${wr>=50?'var(--green)':'var(--red)'}">${wr}%</div><div class="playbook-stat-label">Win Rate</div></div>
        <div class="playbook-stat"><div class="playbook-stat-val">${st.length}</div><div class="playbook-stat-label">Trades</div></div>
        <div class="playbook-stat"><div class="playbook-stat-val" style="color:${pnl>=0?'var(--green)':'var(--red)'}">${pnl>=0?'+':''}${pnl.toFixed(0)}€</div><div class="playbook-stat-label">P&L</div></div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);">
        <span style="color:var(--green)">${wins}W</span> · <span style="color:var(--red)">${losses}L</span> · ${total-wins-losses} BE
      </div>
    </div>`;
  }).join('');
}

// ─── BACKTESTING ──────────────────────────────────────────────
let currentBtStrategy = null;

function renderBtStrategies() {
  const menu = document.getElementById('btStrategyMenu');
  const strategies = ['Blue A', 'Blue B', 'Blue C', 'Red', 'Pink', 'White', 'Black', 'Green'];
  menu.innerHTML = strategies.map(s => {
      return `<label class="dropdown-item" onclick="selectBtStrategy('${s}')" style="cursor:pointer; display:block; padding:8px 12px; transition:all 0.2s;">
        ${s}
      </label>`;
  }).join('');
}

function selectBtStrategy(strategy) {
  currentBtStrategy = strategy;
  document.getElementById('filterBtStrategyBtn').innerHTML = strategy + ' <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><polyline points="6 9 12 15 18 9"/></svg>';
  document.getElementById('btStrategyMenu').classList.remove('open');
  renderBtTable();
}

const BT_BLUE_FIELDS = [
  { id: 'bt_nivel', label: 'Nivel diario', type: 'select', options: ['Soporte', 'Resistencia', 'Si', 'No'] },
  { id: 'bt_estructura', label: 'Cambio de estructura', type: 'select', options: ['Si', 'No'] },
  { id: 'bt_fibo', label: 'Pullback Fibo', type: 'select', options: ['0.38', '0.5', '0.61'] },
  { id: 'bt_entrada', label: 'Entrada', type: 'select', options: ['Diagonal', 'EMA 5m', 'EMA 2m'] }
];

function getDynamicBtFields(strategy) {
  if (!strategy) return [];
  if (strategy.startsWith('Blue')) return BT_BLUE_FIELDS;
  return []; // you can configure other strategies here later
}

function renderBtTable() {
  const tbody = document.getElementById('btTradesBody');
  const empty = document.getElementById('btTableEmpty');
  const thead = document.getElementById('btTradesHead');
  
  if (!currentBtStrategy) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'Selecciona una estrategia para ver las columnas o crea un nuevo trade.';
    return;
  }
  
  const dynFields = getDynamicBtFields(currentBtStrategy);
  let dynHeaders = dynFields.map(f => `<th style="text-transform:uppercase; font-size:10px; color:var(--text-muted); padding:14px; text-align:left; font-weight:600;">${f.label}</th>`).join('');

  thead.innerHTML = `<tr>
    <th class="th-id" style="width:50px;">#ID</th>
    <th class="th-asset" style="width:100px;">Activo</th>
    <th class="th-date" style="width:120px;">Fecha BT</th>
    <th class="th-direction" style="width:70px;">Dir.</th>
    <th class="th-result" style="width:100px;">Resultado</th>
    <th class="th-pnl" style="width:70px;">R/R</th>
    ${dynHeaders}
    <th class="th-actions" style="width:80px;">Acciones</th>
  </tr>`;

  // Quick Entry Row HTML
  let quickDynInputs = dynFields.map(f => {
    let opts = '<option value="">-</option>' + f.options.map(o => `<option value="${o}">${o}</option>`).join('');
    return `<td><select id="quick_${f.id}" class="form-input form-select" style="padding:4px 8px; font-size:12px; height:32px; min-width:80px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);">${opts}</select></td>`;
  }).join('');

  let quickRow = `<tr style="background: rgba(34, 211, 167, 0.05); border-bottom: 2px solid rgba(34, 211, 167, 0.2);">
    <td><span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-secondary);">Nuevo</span></td>
    <td><input type="text" id="quick_asset" class="form-input" placeholder="Activo" style="padding:4px 8px; font-size:12px; height:32px; width:70px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);"></td>
    <td><input type="date" id="quick_date" class="form-input" value="${todayISO()}" style="padding:4px 8px; font-size:12px; height:32px; width:110px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);"></td>
    <td><select id="quick_dir" class="form-input form-select" style="padding:4px 8px; font-size:12px; height:32px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);"><option value="LONG">L</option><option value="SHORT">S</option></select></td>
    <td><select id="quick_res" class="form-input form-select" style="padding:4px 8px; font-size:12px; height:32px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);"><option value="Win">Win</option><option value="Loss">Loss</option><option value="Break Even">BE</option></select></td>
    <td><input type="number" id="quick_rr" class="form-input" placeholder="2.0" step="0.1" style="padding:4px 8px; font-size:12px; height:32px; width:50px; background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.1);"></td>
    ${quickDynInputs}
    <td class="td-actions">
      <button class="btn-primary" onclick="saveQuickBtTrade()" style="padding:4px 10px; height:30px; font-size:12px; width:100%;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Agregar
      </button>
    </td>
  </tr>`;

  const filtered = btTrades.filter(t => t.strategy === currentBtStrategy).sort((a,b) => b.id - a.id);
  empty.style.display = 'none';

  let rowsHtml = filtered.map(t => {
    let dynCells = dynFields.map(f => `<td style="padding:14px; color:var(--text-secondary); font-size:13px;">${t[f.id] || '—'}</td>`).join('');
    return `<tr>
      <td class="td-id">#${t.id}</td>
      <td class="td-asset">${t.asset||'—'}<br><span style="font-size:10px; color:var(--accent);">STR: ${t.strategy}</span></td>
      <td class="td-date">${formatDate(t.date)}</td>
      <td style="font-size:12px; font-weight:600; color:${t.direction==='LONG'?'var(--green)':'var(--red)'}">${t.direction==='LONG'?'L':'S'}</td>
      <td><span class="badge ${t.result === 'Win' ? 'badge-win' : t.result === 'Loss' ? 'badge-loss' : t.result === 'Break Even' ? 'badge-be' : 'badge-strategy' }">${t.result || '—'}</span></td>
      <td class="td-rr">${t.rr ? `1:${t.rr}` : '—'}</td>
      ${dynCells}
      <td class="td-actions">
        <button class="btn-table-delete" onclick="deleteBtTrade(${t.id})" title="Eliminar" style="background: rgba(240,67,106,0.1); color: var(--red); width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');

  tbody.innerHTML = quickRow + rowsHtml;
}

function saveQuickBtTrade() {
  if (!currentBtStrategy) return;
  const dynFields = getDynamicBtFields(currentBtStrategy);
  const asset = document.getElementById('quick_asset').value.trim();
  if (!asset) { showToast('El activo es obligatorio para Backtesting', 'error'); return; }

  const data = {
    strategy: currentBtStrategy,
    asset: asset,
    date: document.getElementById('quick_date').value,
    direction: document.getElementById('quick_dir').value,
    result: document.getElementById('quick_res').value,
    rr: document.getElementById('quick_rr').value
  };

  dynFields.forEach(f => {
    const el = document.getElementById(`quick_${f.id}`);
    if (el) data[f.id] = el.value;
  });

  data.id = nextBtId();
  btTrades.push(data);
  saveBtTrades();
  showToast('Setup registrado rápido', 'success');
  renderBtTable();
  
  // Refocus asset input
  setTimeout(() => {
    const assetEl = document.getElementById('quick_asset');
    if (assetEl) assetEl.focus();
  }, 50);
}

document.addEventListener('keydown', e => {
  if(e.key === 'Enter' && e.target && e.target.id && e.target.id.startsWith('quick_')) {
    saveQuickBtTrade();
  }
});

function updateBtDirectionToggle() {
  document.getElementById('btToggleLong').classList.toggle('active', selectedBtDirection === 'LONG');
  document.getElementById('btToggleShort').classList.toggle('active', selectedBtDirection === 'SHORT');
}

function openBtModal(id = null) {
  if (!currentBtStrategy) {
    showToast('Selecciona primero una estrategia en la barra superior', 'info');
    return;
  }
  editingBtId = id;
  const overlay = document.getElementById('btModalOverlay');
  const dContainer = document.getElementById('btDynamicFields');
  const dynFields = getDynamicBtFields(currentBtStrategy);

  // Generate dynamic inputs
  if (dynFields.length > 0) {
    dContainer.style.display = 'grid';
    dContainer.innerHTML = `<div style="grid-column: 1 / -1; margin-bottom:10px; font-weight:600; color:var(--text-secondary); font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Campos Específicos (${currentBtStrategy})</div>` + 
      dynFields.map(f => {
        let optionsHtml = '<option value="">Seleccionar...</option>' + f.options.map(o => `<option value="${o}">${o}</option>`).join('');
        return `<div class="form-group"><label class="form-label">${f.label}</label><select id="${f.id}" class="form-input form-select bt-dynamic-input">${optionsHtml}</select></div>`;
      }).join('');
  } else {
    dContainer.style.display = 'none';
    dContainer.innerHTML = '';
  }

  if (id) {
    document.getElementById('btModalTitle').textContent = `Editar Setup BT #${id} - ${currentBtStrategy}`;
    const t = btTrades.find(x => x.id === id);
    if(t) {
      document.getElementById('btFormAsset').value = t.asset || '';
      document.getElementById('btFormDate').value = t.date || '';
      document.getElementById('btFormResult').value = t.result || '';
      document.getElementById('btFormRR').value = t.rr || '';
      selectedBtDirection = t.direction || 'LONG';
      // Fill dynamic fields
      dynFields.forEach(f => {
         const el = document.getElementById(f.id);
         if(el && t[f.id]) el.value = t[f.id];
      });
    }
  } else {
    document.getElementById('btModalTitle').textContent = `Nuevo Setup - ${currentBtStrategy}`;
    document.getElementById('btFormAsset').value = '';
    document.getElementById('btFormDate').value = todayISO();
    document.getElementById('btFormResult').value = '';
    document.getElementById('btFormRR').value = '';
    selectedBtDirection = 'LONG';
  }
  
  updateBtDirectionToggle();
  overlay.classList.add('open');
}

function closeBtModal() {
  document.getElementById('btModalOverlay').classList.remove('open');
  editingBtId = null;
}

function saveBtTrade() {
  const asset = document.getElementById('btFormAsset').value.trim();
  const date = document.getElementById('btFormDate').value;
  if (!asset) { showToast('El activo es obligatorio', 'error'); return; }
  
  const data = {
    strategy: currentBtStrategy,
    asset, date, 
    direction: selectedBtDirection,
    result: document.getElementById('btFormResult').value,
    rr: document.getElementById('btFormRR').value
  };

  // Collect dynamic fields
  getDynamicBtFields(currentBtStrategy).forEach(f => {
     const el = document.getElementById(f.id);
     if(el) data[f.id] = el.value;
  });

  if (editingBtId) {
    const idx = btTrades.findIndex(t => t.id === editingBtId);
    btTrades[idx] = { ...btTrades[idx], ...data };
    showToast('Setup actualizado', 'success');
  } else {
    data.id = nextBtId();
    btTrades.push(data);
    showToast('Setup registrado', 'success');
  }

  saveBtTrades(); 
  renderBtTable();
  closeBtModal();
}

function deleteBtTrade(id) {
  if (!confirm(`¿Eliminar este registro de backtesting (#${id})?`)) return;
  btTrades = btTrades.filter(t => t.id !== id);
  saveBtTrades();
  closeBtPanel();
  renderBtTable();
  showToast('Setup eliminado', 'info');
}

// ─── BT SIDE PANEL ────────────────────────────────────────────
let openBtPanelId = null;

function openBtPanel(id) {
  const t = btTrades.find(x => x.id === id);
  if (!t) return;
  openBtPanelId = id;
  renderBtTable(); // refresh active highlight

  document.getElementById('btPanelTitle').textContent = `Setup BT #${t.id} — ${t.asset || ''}`;
  const badges = document.getElementById('btPanelBadges');
  const dirColor = t.direction === 'LONG' ? 'var(--green)' : 'var(--red)';
  badges.innerHTML = `<span class="badge badge-strategy" style="background:rgba(91,138,240,0.12); color:#5b8af0;">${t.strategy}</span>
    <span class="badge" style="background:rgba(0,0,0,0.2); color:${dirColor}; border:1px solid ${dirColor}20;">${t.direction||'—'}</span>
    <span class="badge ${t.result==='Win'?'badge-win':t.result==='Loss'?'badge-loss':'badge-be'}">${t.result||'—'}</span>`;

  document.getElementById('btPanelEditBtn').onclick = () => { closeBtPanel(); openBtModal(id); };
  document.getElementById('btPanelDeleteBtn').onclick = () => deleteBtTrade(id);

  renderBtPanelBody(t);

  document.getElementById('btSidePanel').classList.add('open');
  document.getElementById('mainContent').classList.add('panel-open');
  document.getElementById('btPanelOverlay').classList.add('open');
}

function renderBtPanelBody(t) {
  const dynFields = getDynamicBtFields(t.strategy);
  let dynRows = dynFields.map(f =>
    `<div class="panel-stat-item"><div class="panel-stat-label">${f.label}</div><div class="panel-stat-value">${t[f.id] || '—'}</div></div>`
  ).join('');

  let html = `
    <div>
      <div class="panel-section-title">Datos del setup</div>
      <div class="panel-stats-grid">
        <div class="panel-stat-item"><div class="panel-stat-label">Activo</div><div class="panel-stat-value">${t.asset||'—'}</div></div>
        <div class="panel-stat-item"><div class="panel-stat-label">Fecha BT</div><div class="panel-stat-value">${formatDate(t.date)}</div></div>
        <div class="panel-stat-item"><div class="panel-stat-label">Dirección</div><div class="panel-stat-value" style="color:${t.direction==='LONG'?'var(--green)':'var(--red)'}">${t.direction||'—'}</div></div>
        <div class="panel-stat-item"><div class="panel-stat-label">Resultado</div><div class="panel-stat-value">${t.result||'—'}</div></div>
        <div class="panel-stat-item"><div class="panel-stat-label">R/R</div><div class="panel-stat-value">${t.rr?`1:${t.rr}`:'—'}</div></div>
        ${dynRows}
      </div>
    </div>`;

  // Screenshot / image
  if (t.image && t.image.length > 5) {
    html += `<div>
      <div class="panel-section-title">Captura del setup</div>
      <div class="panel-image-wrap"><img src="${t.image}" alt="Screenshot" onclick="window.open(this.src)" style="cursor:zoom-in;" /></div>
      <button onclick="removeBtImage(${t.id})" style="margin-top:8px; background:rgba(240,67,106,0.1); color:var(--red); border:none; border-radius:6px; padding:6px 12px; font-size:12px; cursor:pointer; width:100%;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Eliminar imagen
      </button>
    </div>`;
  } else {
    html += `<div>
      <div class="panel-section-title">Imagen del setup</div>
      <div id="btImageUploadArea" style="border:2px dashed var(--border); border-radius:10px; padding:20px; text-align:center; cursor:pointer; color:var(--text-muted); font-size:13px; transition:border-color 0.2s;" onclick="document.getElementById('btImageInput').click()">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <p style="margin:0;">Click para subir imagen</p>
        <input type="file" id="btImageInput" accept="image/*" style="display:none;" onchange="loadBtImage(${t.id}, this)">
      </div>
    </div>`;
  }

  // Notes
  html += `<div>
    <div class="panel-section-title">Notas / Análisis</div>
    <textarea id="btPanelNotes" class="template-field-textarea" placeholder="Escribe aquí tu análisis, observaciones, lecciones aprendidas..." style="min-height:120px; width:100%; resize:vertical;">${t.notes || ''}</textarea>
    <div class="panel-save-btn" style="margin-top:10px;">
      <button class="btn-primary" onclick="saveBtPanelNotes(${t.id})" style="width:100%;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Guardar notas
      </button>
    </div>
  </div>`;

  document.getElementById('btPanelBody').innerHTML = html;

  // Setup drag-and-drop on image area
  const area = document.getElementById('btImageUploadArea');
  if (area) {
    area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--accent)'; });
    area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
    area.addEventListener('drop', e => {
      e.preventDefault(); area.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) loadBtImageFile(t.id, file);
    });
  }
}

function closeBtPanel() {
  document.getElementById('btSidePanel').classList.remove('open');
  document.getElementById('mainContent').classList.remove('panel-open');
  document.getElementById('btPanelOverlay').classList.remove('open');
  openBtPanelId = null;
  renderBtTable();
}

function saveBtPanelNotes(id) {
  const idx = btTrades.findIndex(t => t.id === id);
  if (idx === -1) return;
  const notes = document.getElementById('btPanelNotes').value;
  btTrades[idx].notes = notes;
  saveBtTrades();
  showToast('Notas guardadas', 'success');
}

function loadBtImage(id, input) {
  const file = input.files[0];
  if (file) loadBtImageFile(id, file);
}

function loadBtImageFile(id, file) {
  const reader = new FileReader();
  reader.onload = e => {
    const idx = btTrades.findIndex(t => t.id === id);
    if (idx === -1) return;
    btTrades[idx].image = e.target.result;
    saveBtTrades();
    showToast('Imagen guardada', 'success');
    const t = btTrades[idx];
    renderBtPanelBody(t);
  };
  reader.readAsDataURL(file);
}

function removeBtImage(id) {
  const idx = btTrades.findIndex(t => t.id === id);
  if (idx === -1) return;
  btTrades[idx].image = '';
  saveBtTrades();
  renderBtPanelBody(btTrades[idx]);
  showToast('Imagen eliminada', 'info');
}

// ─── NAVIGATION ───────────────────────────────────────────────
function setupNav() {
  const navMap={
    'nav-journal':'journalView','nav-stats':'statsView',
    'nav-calendar':'calendarView','nav-playbook':'playbookView',
    'nav-backtesting':'backtestingView'
  };
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',e=>{
      e.preventDefault();
      const id=item.id;
      if(!navMap[id])return;
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
      document.getElementById(navMap[id]).classList.add('active-view');
      if(id==='nav-stats') renderExtendedStats();
      if(id==='nav-calendar') renderCalendar();
      if(id==='nav-playbook') renderPlaybook();
      if(id==='nav-backtesting') renderBtStrategies();
    });
  });
}

// ─── EXPORT ───────────────────────────────────────────────────
function exportTrades() {
  const headers=['ID','Activo','Fecha','Hora','Dirección','Estilo','Estrategia','Resultado','Entrada','SL','TP','R/R','P&L','Tamaño','Sesión','Emociones','Notas'];
  const rows=trades.map(t=>[t.id,t.asset,t.date,t.time,t.direction,t.style,t.strategy,t.result,t.entry,t.sl,t.tp,t.rr,t.pnl,t.size,t.session,t.emotion,(t.notes||'').replace(/\n/g,' ')]);
  const csv=[headers,...rows].map(r=>r.map(v=>`"${v||''}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`tradinglab_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast('Datos exportados como CSV','success');
}

// ─── TOAST ────────────────────────────────────────────────────
function showToast(msg,type='info'){
  const icons={success:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3a7" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,error:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f0436a" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,info:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5b8af0" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`};
  const toast=document.createElement('div');
  toast.className=`toast ${type}`;
  toast.innerHTML=`${icons[type]||''}<span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(()=>toast.remove(),3000);
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  setGreeting(); setupNav(); setupDropdowns(); setupSort(); setupImageUpload();
  buildStrategyMenu(); renderTable(); renderStats();

  // New trade
  document.getElementById('btnNewTrade').addEventListener('click',openNewModal);
  document.getElementById('modalClose').addEventListener('click',closeModal);
  document.getElementById('modalCancel').addEventListener('click',closeModal);
  document.getElementById('modalSave').addEventListener('click',saveTrade);
  document.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});

  // Direction toggle
  document.getElementById('toggleLong').addEventListener('click',()=>{selectedDirection='LONG';updateDirectionToggle();});
  document.getElementById('toggleShort').addEventListener('click',()=>{selectedDirection='SHORT';updateDirectionToggle();});

  // Style toggle
  document.querySelectorAll('.toggle-btn-3').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectedStyle = selectedStyle === btn.dataset.value ? '' : btn.dataset.value;
      updateStyleToggle();
    });
  });

  // Emotion buttons
  document.querySelectorAll('.emotion-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectedEmotion=btn.dataset.emotion;
      document.querySelectorAll('.emotion-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // RR live calc
  ['formEntry','formSL','formTP'].forEach(id=>document.getElementById(id).addEventListener('input',updateRRCalc));

  // Export
  document.getElementById('btnExport').addEventListener('click',exportTrades);

  // Calendar nav
  document.getElementById('calPrev').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar();});
  document.getElementById('calNext').addEventListener('click',()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar();});

  // Side panel close
  document.getElementById('panelClose').addEventListener('click',closePanel);
  document.getElementById('panelOverlay').addEventListener('click',closePanel);


  document.getElementById('btnNewBtTrade').addEventListener('click', () => openBtModal(null));
  document.getElementById('btModalClose').addEventListener('click', closeBtModal);
  document.getElementById('btModalCancel').addEventListener('click', closeBtModal);
  document.getElementById('btModalSave').addEventListener('click', saveBtTrade);
  document.getElementById('btModalOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBtModal();});
  
  document.getElementById('btToggleLong').addEventListener('click',()=>{selectedBtDirection='LONG';updateBtDirectionToggle();});
  document.getElementById('btToggleShort').addEventListener('click',()=>{selectedBtDirection='SHORT';updateBtDirectionToggle();});

  // BT Panel
  document.getElementById('btPanelClose').addEventListener('click', closeBtPanel);
  document.getElementById('btPanelOverlay').addEventListener('click', closeBtPanel);

  // Template modal
  document.getElementById('btnEditTemplate').addEventListener('click',openTemplateModal);
  document.getElementById('templateModalClose').addEventListener('click',closeTemplateModal);
  document.getElementById('templateModalCancel').addEventListener('click',closeTemplateModal);
  document.getElementById('templateModalSave').addEventListener('click',saveTemplateModal);
  document.getElementById('btnAddField').addEventListener('click',addTemplateField);
  document.getElementById('templateModalOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeTemplateModal();});

  // ESC key
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeModal();closeTemplateModal();closePanel();closeBtModal();}
  });

  // Generar 50 trades de prueba si hay menos
  if(trades.length < 50){
    const assets = ['EURUSD', 'GBPUSD', 'BTCUSDT', 'XAUUSD', 'NQ1!', 'US30', 'ETHUSDT', 'AUDUSD'];
    const strategies = ['Blue A', 'Blue B', 'Blue C', 'Red', 'Pink', 'White', 'Black', 'Green'];
    const styles = ['Scalping', 'Day', 'Swing'];
    const sessions = ['Tokio', 'Londres', 'Nueva York', 'Overlap LDN/NY'];
    const emotions = ['😌 Tranquilo', '😤 Ansioso', '😰 Con miedo', '🤩 Eufórico', '😡 Frustrado', '🧠 Enfocado'];
    
    trades = [];
    let currentDate = new Date();
    currentDate.setMonth(currentDate.getMonth() - 2); // Empezar hace 2 meses
    
    for(let i=1; i<=50; i++) {
        const isWin = Math.random() > 0.45; // ~55% win rate
        const isBE = !isWin && Math.random() > 0.8;
        const result = isWin ? 'Win' : (isBE ? 'Break Even' : 'Loss');
        const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
        const pnl = isWin ? (Math.random() * 300 + 50) : (isBE ? 0 : (Math.random() * -150 - 50));
        const rr = (Math.random() * 2 + 1).toFixed(2);
        
        // Sumar entre 0 y 1.5 días para avanzar en el tiempo
        currentDate = new Date(currentDate.getTime() + Math.random() * 1000 * 60 * 60 * 24 * 1.5);
        if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
           currentDate = new Date(currentDate.getTime() + 1000 * 60 * 60 * 24 * 2); // saltar finde
        }
        
        trades.push({
            id: i,
            asset: assets[Math.floor(Math.random()*assets.length)],
            date: currentDate.toISOString().split('T')[0],
            time: currentDate.toISOString().split('T')[1].substring(0,5),
            direction: direction,
            style: styles[Math.floor(Math.random()*styles.length)],
            strategy: strategies[Math.floor(Math.random()*strategies.length)],
            result: result,
            pnl: pnl.toFixed(2),
            entry: (1000 + Math.random()*100).toFixed(5),
            sl: (1000 + Math.random()*100).toFixed(5),
            tp: (1000 + Math.random()*100).toFixed(5),
            size: (Math.random()*2 + 0.1).toFixed(2),
            session: sessions[Math.floor(Math.random()*sessions.length)],
            emotion: emotions[Math.floor(Math.random()*emotions.length)],
            notes: 'Trade generado automáticamente para análisis de la plataforma. ' + (isWin ? 'Buen setup validado.' : 'Entrada con dudad, faltó confirmación.'),
            rr: rr,
            createdAt: currentDate.toISOString()
        });
    }

    trades.reverse(); // Para que el ID 50 (el más nuevo) quede primero en el array
    
    // Plantilla Demo
    templateFields = ['¿Cómo me sentí antes del trade?', '¿Seguí el plan de trading?', 'Lección aprendida hoy'];
    localStorage.removeItem(TEMPLATE_DATA_KEY);
    templateData = {};
    saveTrades(); saveTemplate(); saveTemplateData();
    buildStrategyMenu(); renderTable(); renderStats(); 
    if (document.getElementById('statsView').classList.contains('active-view')) renderExtendedStats();
    if (document.getElementById('calendarView').classList.contains('active-view')) renderCalendar();
    if (document.getElementById('playbookView').classList.contains('active-view')) renderPlaybook();
  }

  // Generate demo BT trade if empty
  if(btTrades.length === 0) {
    btTrades = [
      { id:1, strategy:'Blue A', asset:'NQ1!', date:'2025-02-01', direction:'LONG', result:'Win', rr:'2.5', bt_nivel:'Soporte', bt_estructura:'Si', bt_fibo:'0.61', bt_entrada:'EMA 5m' }
    ];
    saveBtTrades();
  }
});
