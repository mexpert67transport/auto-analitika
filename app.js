// ============================================================
// APP.JS — Логика приложения АвтоАналитика
// ============================================================

// ---- STATE ----
let state = {
  invoices: [],
  activeFilters: { compType: 'all' },
  charts: {}
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  setupNavigation();
  setupUpload();
  setupForm();
  setupSearch();
  setupCompFilter();
  renderAll();
});

function loadFromStorage() {
  const saved = localStorage.getItem('autoanalytica_invoices');
  const base = (typeof INVOICES_DATA !== 'undefined') ? INVOICES_DATA : [];
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Merge: base invoices + any new ones not in base
      const baseIds = new Set(base.map(i => i.id));
      const extra = parsed.filter(i => !baseIds.has(i.id));
      state.invoices = [...base, ...extra];
    } catch { state.invoices = base; }
  } else {
    state.invoices = base;
  }
}

function saveToStorage() {
  const base = (typeof INVOICES_DATA !== 'undefined') ? INVOICES_DATA : [];
  const baseIds = new Set(base.map(i => i.id));
  const extra = state.invoices.filter(i => !baseIds.has(i.id));
  localStorage.setItem('autoanalytica_invoices', JSON.stringify([...base, ...extra]));
}

// ---- NAVIGATION ----
let currentPage = 'dashboard';
const pageTitles = {
  dashboard: 'Дашборд',
  invoices: 'Счета на ремонт',
  comparison: 'Сравнение с рыночными ценами',
  parts: 'Справочник запчастей',
  works: 'Справочник работ',
  duplicates: 'Задвоение работ',
  upload: 'Загрузить счёт'
};

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  renderPage(page);
  document.getElementById('sidebar').classList.remove('open');
}

function renderPage(page) {
  if (page === 'dashboard') renderDashboard();
  if (page === 'invoices') renderInvoicesTable();
  if (page === 'comparison') renderComparisonTable();
  if (page === 'parts') renderPartsTable();
  if (page === 'works') renderWorksTable();
  if (page === 'duplicates') renderDuplicates();
}

function renderAll() {
  updateBadges();
  renderDashboard();
}

// ---- BADGES ----
function updateBadges() {
  const n = state.invoices.length;
  document.getElementById('invoiceBadge').textContent = n;
  document.getElementById('totalInvoicesStat').textContent = n;
  const dups = findDuplicates();
  const dupCount = dups.reduce((a, d) => a + d.items.length, 0);
  document.getElementById('dupBadge').textContent = dupCount;
  const overpayPct = calcOverallOverpay();
  document.getElementById('totalOverpaysStat').textContent = overpayPct > 0 ? `+${overpayPct.toFixed(0)}%` : '—';
  if (overpayPct > 0) document.getElementById('totalOverpaysStat').classList.add('danger');
}



// ---- DASHBOARD ----
function renderDashboard() {
  const total = state.invoices.reduce((s, i) => s + i.totalAmount, 0);
  document.getElementById('statTotalSum').textContent = fmtMoney(total);

  const overpay = calcOverallOverpay();
  const overpayEl = document.getElementById('statOverpay');
  if (overpay > 0) {
    overpayEl.textContent = `+${overpay.toFixed(1)}%`;
    overpayEl.closest('.stat-card').classList.add('warning');
  } else {
    overpayEl.textContent = 'Норма';
  }

  const dups = findDuplicates();
  const dupCount = dups.reduce((a, d) => a + d.items.length, 0);
  document.getElementById('statDuplicates').textContent = dupCount > 0 ? `${dupCount} шт` : '0';

  const vehicles = new Set(state.invoices.map(i => i.vehicle).filter(Boolean));
  document.getElementById('statVehicles').textContent = vehicles.size;

  renderServiceChart();
  renderTimelineChart();
  renderTopParts();
  renderRecentInvoices();
}

function calcOverallOverpay() {
  let totalCharged = 0, totalMarket = 0;
  state.invoices.forEach(inv => {
    inv.parts.forEach(p => {
      const market = findMarketPrice(p.name);
      if (market && p.price > 0) {
        totalCharged += p.sum;
        totalMarket += market * p.qty;
      }
    });
  });
  if (totalMarket === 0) return 0;
  return ((totalCharged - totalMarket) / totalMarket) * 100;
}

function findMarketPrice(name) {
  const n = name.toLowerCase();
  for (const [key, val] of Object.entries(MARKET_PRICES)) {
    if (n.includes(key.toLowerCase().substring(0, 12))) return val.price;
  }
  return null;
}

function renderServiceChart() {
  const ctx = document.getElementById('chartServices');
  if (!ctx) return;
  if (state.charts.services) state.charts.services.destroy();

  const byService = {};
  state.invoices.forEach(inv => {
    byService[inv.service] = (byService[inv.service] || 0) + inv.totalAmount;
  });

  const colors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  state.charts.services = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(byService),
      datasets: [{
        data: Object.values(byService),
        backgroundColor: colors.slice(0, Object.keys(byService).length),
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter' }, padding: 16 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtMoney(ctx.raw)}` } }
      }
    }
  });
}

function renderTimelineChart() {
  const ctx = document.getElementById('chartTimeline');
  if (!ctx) return;
  if (state.charts.timeline) state.charts.timeline.destroy();

  const sorted = [...state.invoices].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(i => fmtDate(i.date));
  const data = sorted.map(i => i.totalAmount);

  state.charts.timeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Сумма счёта',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${fmtMoney(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#64748b', callback: v => fmtMoneyShort(v) },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

function renderTopParts() {
  const partsMap = {};
  state.invoices.forEach(inv => {
    inv.parts.forEach(p => {
      if (!partsMap[p.name]) partsMap[p.name] = { name: p.name, total: 0 };
      partsMap[p.name].total += p.sum;
    });
  });
  const top = Object.values(partsMap).sort((a, b) => b.total - a.total).slice(0, 6);
  const el = document.getElementById('topPartsList');
  el.innerHTML = top.map((p, i) => `
    <div class="top-item">
      <div class="top-item-rank">${i + 1}</div>
      <div class="top-item-name">${p.name}<small>Суммарно: ${fmtMoney(p.total)}</small></div>
      <div class="top-item-value">${fmtMoney(p.total)}</div>
    </div>
  `).join('');
}

function renderRecentInvoices() {
  const recent = [...state.invoices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const el = document.getElementById('recentInvoicesList');
  el.innerHTML = recent.map(inv => `
    <div class="recent-invoice" onclick="showInvoice('${inv.id}')">
      <div class="ri-icon">📄</div>
      <div class="ri-info">
        <div class="ri-num">№ ${inv.number}</div>
        <div class="ri-meta">${fmtDate(inv.date)} · ${inv.service} · ${inv.vehicle}</div>
      </div>
      <div class="ri-sum">${fmtMoney(inv.totalAmount)}</div>
    </div>
  `).join('');
}

// ---- INVOICES TABLE ----
function renderInvoicesTable() {
  const search = (document.getElementById('invoiceSearch')?.value || '').toLowerCase();
  const svcFilter = document.getElementById('invoiceServiceFilter')?.value || '';
  const vehFilter = document.getElementById('invoiceVehicleFilter')?.value || '';

  // Fill filter dropdowns
  fillDropdown('invoiceServiceFilter', [...new Set(state.invoices.map(i => i.service))]);
  fillDropdown('invoiceVehicleFilter', [...new Set(state.invoices.map(i => i.vehicle))]);

  let filtered = state.invoices.filter(inv => {
    const text = `${inv.number} ${inv.service} ${inv.vehicle} ${inv.vehicleModel} ${fmtDate(inv.date)}`.toLowerCase();
    return (!search || text.includes(search))
      && (!svcFilter || inv.service === svcFilter)
      && (!vehFilter || inv.vehicle === vehFilter);
  });

  const tbody = document.getElementById('invoicesBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Счета не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(inv => {
    const partsSum = inv.parts.reduce((s, p) => s + p.sum, 0);
    const worksSum = inv.works.reduce((s, w) => s + w.sum, 0);
    const overpay = calcInvoiceOverpay(inv);
    const isNew = inv.source === 'pdf';
    const overpayHtml = overpay > 5
      ? `<span class="badge badge-danger">+${overpay.toFixed(0)}%</span>`
      : overpay < -5
        ? `<span class="badge badge-success">${overpay.toFixed(0)}%</span>`
        : `<span class="badge badge-neutral">≈ рынок</span>`;
    return `
      <tr class="${isNew ? 'row-new' : ''}">
        <td><strong>${inv.number}</strong>${isNew ? ' <span class="badge badge-new">✨ NEW</span>' : ''}</td>
        <td>${fmtDate(inv.date)}</td>
        <td>${inv.service}</td>
        <td>${inv.vehicle || '—'}<br><small style="color:var(--text-muted)">${inv.vehicleModel || ''}</small></td>
        <td>${fmtMoney(partsSum)}</td>
        <td>${fmtMoney(worksSum)}</td>
        <td><strong>${fmtMoney(inv.totalAmount)}</strong></td>
        <td>${overpayHtml}</td>
        <td>
          <button class="btn-icon" onclick="showInvoice('${inv.id}')" title="Подробнее">👁</button>
          <button class="btn-icon" onclick="deleteInvoice('${inv.id}')" title="Удалить" style="color:var(--danger)">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

function calcInvoiceOverpay(inv) {
  let charged = 0, market = 0;
  inv.parts.forEach(p => {
    const mp = findMarketPrice(p.name);
    if (mp) { charged += p.sum; market += mp * p.qty; }
  });
  if (market === 0) return 0;
  return ((charged - market) / market) * 100;
}

function fillDropdown(id, options) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    sel.appendChild(opt);
  });
  sel.value = cur;
}

// ---- COMPARISON TABLE ----
function renderComparisonTable() {
  const filter = state.activeFilters.compType;
  const rows = [];

  state.invoices.forEach(inv => {
    // Parts rows
    if (filter === 'all' || filter === 'parts' || filter === 'overpay') {
      inv.parts.forEach(p => {
        if (p.sum === 0) return;
        const marketPrice = findMarketPriceForPart(p);
        const diff = marketPrice ? ((p.price - marketPrice) / marketPrice * 100) : null;
        if (filter === 'overpay' && (diff === null || diff <= 20)) return;
        rows.push({ type: 'parts', inv, item: p, marketPrice, diff });
      });
    }
    // Works rows
    if (filter === 'all' || filter === 'works' || filter === 'overpay') {
      inv.works.forEach(w => {
        const norm = findNormHours(w.name);
        const normDiff = norm ? ((w.normHours - norm.norm) / norm.norm * 100) : null;
        if (filter === 'overpay' && (normDiff === null || normDiff <= 20)) return;
        rows.push({ type: 'works', inv, item: w, normHours: norm, normDiff });
      });
    }
  });

  const tbody = document.getElementById('comparisonBody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">Нет данных</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    if (r.type === 'parts') {
      const p = r.item;
      const diffHtml = r.diff !== null
        ? `<span class="${r.diff > 20 ? 'diff-positive' : r.diff < -5 ? 'diff-negative' : 'diff-neutral'}">${r.diff > 0 ? '+' : ''}${r.diff.toFixed(0)}%</span>`
        : '<span class="diff-neutral">—</span>';
      const badge = r.diff !== null
        ? (r.diff > 30 ? `<span class="badge badge-danger">Дорого</span>`
          : r.diff > 10 ? `<span class="badge badge-warning">Выше рынка</span>`
          : r.diff < -5 ? `<span class="badge badge-success">Ниже рынка</span>`
          : `<span class="badge badge-neutral">Норма</span>`)
        : `<span class="badge badge-neutral">Нет данных</span>`;
      return `<tr>
        <td><span class="badge badge-info">🔧 Запчасть</span></td>
        <td style="max-width:220px;word-break:break-word;font-size:12px">${p.name}</td>
        <td><code style="font-size:11px;color:var(--text-muted)">${p.article}</code></td>
        <td style="font-size:12px">${r.inv.service}</td>
        <td>${p.qty} ${p.unit}</td>
        <td><strong>${fmtMoney(p.price)}</strong></td>
        <td>${r.marketPrice ? fmtMoney(r.marketPrice) : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>'}</td>
        <td>${diffHtml}</td>
        <td><span class="badge badge-neutral" style="font-size:10px">Н/Д</span></td>
        <td>${badge}</td>
      </tr>`;
    } else {
      const w = r.item;
      const normInfo = r.normHours;
      const normExceeded = r.normDiff !== null && r.normDiff > 30;
      const normHtml = normInfo
        ? `<span class="${normExceeded ? 'norm-exceeded' : 'norm-ok'}">${w.normHours.toFixed(2)} н/ч</span>`
        : `${w.normHours.toFixed(2)} н/ч`;
      const normMarket = normInfo ? `${normInfo.norm.toFixed(2)} н/ч` : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>';
      const badge = normExceeded
        ? `<span class="badge badge-danger">Выше нормы</span>`
        : normInfo
          ? `<span class="badge badge-success">В норме</span>`
          : `<span class="badge badge-neutral">Нет норматива</span>`;
      return `<tr>
        <td><span class="badge badge-neutral">⚙️ Работа</span></td>
        <td style="max-width:220px;word-break:break-word;font-size:12px">${w.name}</td>
        <td><span class="badge badge-neutral" style="font-size:10px">Н/Д</span></td>
        <td style="font-size:12px">${r.inv.service}</td>
        <td><span class="badge badge-neutral" style="font-size:10px">Н/Д</span></td>
        <td><strong>${fmtMoney(w.sum)}</strong></td>
        <td>${fmtMoney(r.inv.laborRate)} /н-ч</td>
        <td><span class="badge badge-neutral" style="font-size:10px">Н/Д</span></td>
        <td>${normHtml} / ${normMarket}</td>
        <td>${badge}</td>
      </tr>`;
    }
  }).join('');
}

function findMarketPriceForPart(p) {
  // Нормализация артикула (замена русских букв на английские)
  const normArt = (art) => {
     if (!art) return '';
     const cyrillicToLatin = {'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X','У':'Y'};
     return art.toString().toUpperCase().replace(/[АВЕКМНОРСТХУ]/g, m => cyrillicToLatin[m]);
  };

  // 1. Поиск по точному артикулу (с защитой от кириллицы)
  if (p.article && p.article !== '-') {
    const pArt = normArt(p.article);
    for (const [key, val] of Object.entries(MARKET_PRICES)) {
      if (val.article && normArt(val.article) === pArt) return val.price;
    }
  }

  const n = p.name.toLowerCase();
  let bestMatchPrice = null;
  let maxMatches = 1;

  // 2. Поиск по тексту
  for (const [key, val] of Object.entries(MARKET_PRICES)) {
    // Если в справочнике жестко задан артикул, не пытаемся искать по названию (раз артикул не совпал выше)
    if (val.article) continue;

    const kWords = key.toLowerCase().split(' ').filter(w => w.length > 2);
    if (!kWords.length) continue;

    // Обязательно должно совпадать главное существительное (первое слово)
    const firstWord = kWords[0];
    if (!n.includes(firstWord)) continue;

    const matches = kWords.filter(w => n.includes(w));
    
    // Требуем совпадения хотя бы 60% ключевых слов из названия в справочнике,
    // чтобы "РМК суппорта" не привязывалось к "РМК суппорта Wabco PAN19/22 полный"
    if (matches.length >= Math.ceil(kWords.length * 0.6) && matches.length > maxMatches) {
      maxMatches = matches.length;
      bestMatchPrice = val.price;
    }
  }
  return bestMatchPrice;
}

function findNormHours(workName) {
  const n = workName.toLowerCase();
  let bestMatch = null;
  let maxMatches = 1;

  for (const [key, val] of Object.entries(NORM_HOURS)) {
    const kWords = key.toLowerCase().split(' ').filter(w => w.length > 2);
    if (!kWords.length) continue;

    const matches = kWords.filter(w => n.includes(w));
    if (matches.length > maxMatches) {
      maxMatches = matches.length;
      bestMatch = val;
    }
  }
  return bestMatch;
}

// ---- PARTS TABLE ----
function renderPartsTable() {
  const search = (document.getElementById('partsSearch')?.value || '').toLowerCase();
  const partsMap = {};

  state.invoices.forEach(inv => {
    inv.parts.forEach(p => {
      const key = `${p.article}|${p.name}`;
      if (!partsMap[key]) {
        partsMap[key] = {
          article: p.article,
          name: p.name,
          brand: p.brand,
          purchases: [],
          prices: [],
          totalQty: 0,
          totalSum: 0,
          isNew: false
        };
      }
      if (inv.source === 'pdf') partsMap[key].isNew = true;
      partsMap[key].purchases.push({ date: inv.date, price: p.price, service: inv.service });
      if (p.price > 0) partsMap[key].prices.push(p.price);
      partsMap[key].totalQty += p.qty;
      partsMap[key].totalSum += p.sum;
    });
  });

  let parts = Object.values(partsMap).filter(p => {
    const text = `${p.article} ${p.name} ${p.brand}`.toLowerCase();
    return !search || text.includes(search);
  }).sort((a, b) => b.totalSum - a.totalSum);

  const tbody = document.getElementById('partsBody');
  if (!parts.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Нет данных</td></tr>`;
    return;
  }

  tbody.innerHTML = parts.map(p => {
    const minPrice = p.prices.length ? Math.min(...p.prices) : 0;
    const maxPrice = p.prices.length ? Math.max(...p.prices) : 0;
    const marketPrice = findMarketPriceForPart(p);
    const avgPrice = p.prices.length ? p.prices.reduce((a, b) => a + b, 0) / p.prices.length : 0;
    const diff = marketPrice && avgPrice > 0 ? ((avgPrice - marketPrice) / marketPrice * 100) : null;
    const diffHtml = diff !== null
      ? `<span class="${diff > 20 ? 'diff-positive' : diff < -5 ? 'diff-negative' : 'diff-neutral'}">${diff > 0 ? '+' : ''}${diff.toFixed(0)}%</span>`
      : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>';
    return `<tr class="${p.isNew ? 'row-new' : ''}">
      <td>${p.isNew ? '<span class="badge badge-new" style="margin-right:5px;display:inline-block">NEW</span>' : ''}<code style="font-size:11px">${p.article}</code></td>
      <td style="font-size:12px;max-width:200px">${p.name}</td>
      <td style="color:var(--text-muted);font-size:12px">${p.brand}</td>
      <td>${p.purchases.length}</td>
      <td>${p.prices.length > 1 ? fmtMoney(minPrice) : fmtMoney(minPrice)}</td>
      <td>${p.prices.length > 1 ? fmtMoney(maxPrice) : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>'}</td>
      <td>${marketPrice ? fmtMoney(marketPrice) : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>'}</td>
      <td>${diffHtml}</td>
    </tr>`;
  }).join('');
}

// ---- WORKS TABLE ----
function renderWorksTable() {
  const search = (document.getElementById('worksSearch')?.value || '').toLowerCase();
  const worksMap = {};

  state.invoices.forEach(inv => {
    inv.works.forEach(w => {
      const key = w.name;
      if (!worksMap[key]) {
        worksMap[key] = { name: w.name, services: new Set(), count: 0, prices: [], normHours: [], totalSum: 0, rates: [], isNew: false };
      }
      if (inv.source === 'pdf') worksMap[key].isNew = true;
      worksMap[key].services.add(inv.service);
      worksMap[key].count++;
      worksMap[key].prices.push(w.sum);
      worksMap[key].normHours.push(w.normHours);
      worksMap[key].rates.push(w.rate || 0);
      worksMap[key].totalSum += w.sum;
    });
  });

  let works = Object.values(worksMap).filter(w => !search || w.name.toLowerCase().includes(search))
    .sort((a, b) => b.totalSum - a.totalSum);

  const tbody = document.getElementById('worksBody');
  if (!works.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Нет данных</td></tr>`;
    return;
  }

  tbody.innerHTML = works.map(w => {
    const norm = findNormHours(w.name);
    const avgNorm = w.normHours.length ? w.normHours.reduce((a, b) => a + b, 0) / w.normHours.length : 0;
    const maxPrice = w.prices.length ? Math.max(...w.prices) : 0;
    const minPrice = w.prices.length ? Math.min(...w.prices.filter(p => p > 0)) : 0;
    const priceRange = w.prices.length > 1 && minPrice !== maxPrice ? `${fmtMoney(minPrice)} — ${fmtMoney(maxPrice)}` : fmtMoney(minPrice || maxPrice);
    const normExceeded = norm && avgNorm > norm.norm * 1.3;
    const normHtml = norm
      ? `<span class="${normExceeded ? 'norm-exceeded' : 'norm-ok'}">${avgNorm.toFixed(2)}</span>`
      : avgNorm > 0 ? avgNorm.toFixed(2) : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>';
    const dupBadge = w.count > 1 && [...w.services].length === 1
      ? `<br/><span class="badge badge-warning" style="margin-top:4px">Повтор</span>`
      : '';
      
    const validRates = w.rates.filter(r => r > 0);
    const minRate = validRates.length ? Math.min(...validRates) : 0;
    const maxRate = validRates.length ? Math.max(...validRates) : 0;
    const rateStr = minRate > 0 ? (minRate === maxRate ? fmtMoney(minRate) : `${fmtMoney(minRate)} — ${fmtMoney(maxRate)}`) : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>';

    return `<tr class="${w.isNew ? 'row-new' : ''}">
      <td style="font-size:12px;max-width:240px">${w.isNew ? '<span class="badge badge-new" style="margin-right:5px;display:inline-block">NEW</span>' : ''}${w.name}</td>
      <td style="font-size:11px">${[...w.services].join(', ')}</td>
      <td>${w.count}${dupBadge}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${priceRange}</td>
      <td>${normHtml} н/ч</td>
      <td>${norm ? `<span class="${normExceeded ? 'norm-exceeded' : 'norm-ok'}">${norm.norm} н/ч</span>` : '<span class="badge badge-neutral" style="font-size:10px">Н/Д</span>'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${rateStr}</td>
      <td><strong>${fmtMoney(w.totalSum)}</strong></td>
    </tr>`;
  }).join('');
}

// ---- DUPLICATES ----
function findDuplicates() {
  const dups = [];

  // 1. Дубликаты запчастей в одном счёте (одинаковый артикул)
  state.invoices.forEach(inv => {
    const artCount = {};
    inv.parts.forEach(p => {
      if (!p.article || p.article === '-' || p.article === '000004979') return;
      if (!artCount[p.article]) artCount[p.article] = [];
      artCount[p.article].push(p);
    });
    Object.entries(artCount).forEach(([art, parts]) => {
      if (parts.length > 1) {
        dups.push({
          invoiceId: inv.id,
          invoiceNum: inv.number,
          type: 'part',
          description: `Дублирующийся артикул ${art} в счёте`,
          items: parts.map(p => `${p.name} × ${p.qty} = ${fmtMoney(p.sum)}`),
          totalExtra: parts.slice(1).reduce((s, p) => s + p.sum, 0)
        });
      }
    });

    // 2. Дубликаты работ в одном счёте
    const workCount = {};
    inv.works.forEach(w => {
      if (!workCount[w.name]) workCount[w.name] = [];
      workCount[w.name].push(w);
    });
    Object.entries(workCount).forEach(([name, works]) => {
      if (works.length > 1) {
        dups.push({
          invoiceId: inv.id,
          invoiceNum: inv.number,
          type: 'work',
          description: `Дублирующаяся работа в счёте`,
          items: works.map(w => `"${w.name}" ${w.normHours} н/ч = ${fmtMoney(w.sum)}`),
          totalExtra: works.slice(1).reduce((s, w) => s + w.sum, 0)
        });
      }
    });
  });

  // 3. Явно помеченные задвоения
  state.invoices.forEach(inv => {
    inv.parts.filter(p => p.isDuplicate).forEach(p => {
      dups.push({
        invoiceId: inv.id,
        invoiceNum: inv.number,
        type: 'marked',
        description: `Подозрение на задвоение: одинаковая запчасть выставлена дважды`,
        items: [`Артикул: ${p.article}`, `"${p.name}" = ${fmtMoney(p.sum)}`],
        totalExtra: p.sum
      });
    });
  });

  return dups;
}

function renderDuplicates() {
  const dups = findDuplicates();
  const el = document.getElementById('duplicatesContent');

  if (!dups.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <h3>Задвоений не обнаружено</h3>
        <p>Все позиции в счетах уникальны</p>
      </div>`;
    return;
  }

  const totalExtra = dups.reduce((s, d) => s + (d.totalExtra || 0), 0);
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;border-color:rgba(239,68,68,0.3)">
      <div class="card-body" style="display:flex;gap:24px;align-items:center">
        <div style="font-size:36px">⚠️</div>
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--danger)">Обнаружено ${dups.length} задвоений</div>
          <div style="color:var(--text-muted);font-size:14px">Возможная переплата: <strong style="color:var(--danger)">${fmtMoney(totalExtra)}</strong></div>
        </div>
      </div>
    </div>
    ${dups.map(d => `
      <div class="dup-card">
        <div class="dup-card-header">
          <span style="font-size:20px">${d.type === 'work' ? '⚙️' : '🔧'}</span>
          <div>
            <h4>${d.description}</h4>
            <div style="font-size:12px;color:var(--text-muted)">Счёт № ${d.invoiceNum} · Потенциальная переплата: <strong>${d.totalExtra ? fmtMoney(d.totalExtra) : '?'}</strong></div>
          </div>
        </div>
        <div class="dup-items">
          ${d.items.map(i => `<div class="dup-item">${i}</div>`).join('')}
        </div>
      </div>
    `).join('')}`;
}

// ---- INVOICE MODAL ----
function showInvoice(id) {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const partsSum = inv.parts.reduce((s, p) => s + p.sum, 0);
  const worksSum = inv.works.reduce((s, w) => s + w.sum, 0);
  const overpay = calcInvoiceOverpay(inv);

  document.getElementById('modalTitle').innerHTML = `Счёт № ${inv.number} от ${fmtDate(inv.date)} 
    <button class="btn-primary" style="padding: 4px 10px; font-size: 12px; margin-left: 15px; vertical-align: middle; background: var(--success); border-color: var(--success);" onclick="downloadInvoicePDF('${inv.id}')">📥 Скачать PDF</button>
    <button class="btn-secondary" style="padding: 4px 10px; font-size: 12px; margin-left: 8px; vertical-align: middle; border: 1px solid var(--border);" onclick="editInvoice('${inv.id}')">✏️ Редактировать</button>`;
  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="stat-card" style="padding:14px"><div class="stat-icon" style="font-size:20px">🏢</div><div class="stat-info"><div class="stat-value" style="font-size:15px">${inv.service}</div><div class="stat-label">Сервис</div></div></div>
      <div class="stat-card" style="padding:14px"><div class="stat-icon" style="font-size:20px">🚛</div><div class="stat-info"><div class="stat-value" style="font-size:15px">${inv.vehicle}</div><div class="stat-label">${inv.vehicleModel || 'Автомобиль'}</div></div></div>
      <div class="stat-card" style="padding:14px"><div class="stat-icon" style="font-size:20px">💰</div><div class="stat-info"><div class="stat-value" style="font-size:15px">${fmtMoney(inv.totalAmount)}</div><div class="stat-label">Итого</div></div></div>
      <div class="stat-card ${overpay > 10 ? 'warning' : 'success'}" style="padding:14px"><div class="stat-icon" style="font-size:20px">${overpay > 10 ? '📈' : '✅'}</div><div class="stat-info"><div class="stat-value" style="font-size:15px">${overpay > 0 ? '+' : ''}${overpay.toFixed(0)}%</div><div class="stat-label">К рынку</div></div></div>
    </div>

    <h4 style="margin-bottom:10px;color:var(--text-secondary)">🔧 ЗАПЧАСТИ (${inv.parts.length} позиций, итого ${fmtMoney(partsSum)})</h4>
    <table class="data-table" style="margin-bottom:20px">
      <thead><tr><th>Артикул</th><th>Наименование</th><th>Бренд</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th>Рын. цена</th><th>Разница</th></tr></thead>
      <tbody>
        ${inv.parts.map(p => {
          const mp = findMarketPriceForPart(p);
          const diff = mp ? ((p.price - mp) / mp * 100) : null;
          const cls = diff !== null ? (diff > 20 ? 'diff-positive' : diff < -5 ? 'diff-negative' : '') : '';
          return `<tr ${p.isDuplicate ? 'style="background:rgba(239,68,68,0.08)"' : ''}>
            <td><code style="font-size:11px">${p.article}</code>${p.isDuplicate ? ' <span class="badge badge-danger">Дубль!</span>' : ''}</td>
            <td style="font-size:12px">${p.name}</td>
            <td style="font-size:11px;color:var(--text-muted)">${p.brand}</td>
            <td>${p.qty} ${p.unit}</td>
            <td>${fmtMoney(p.price)}</td>
            <td><strong>${fmtMoney(p.sum)}</strong></td>
            <td>${mp ? fmtMoney(mp) : '—'}</td>
            <td class="${cls}">${diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(0) + '%' : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <h4 style="margin-bottom:10px;color:var(--text-secondary)">⚙️ РАБОТЫ (${inv.works.length} позиций, итого ${fmtMoney(worksSum)})</h4>
    <table class="data-table">
      <thead><tr><th>Наименование работы</th><th>Норм-ч (факт)</th><th>Норм-ч (норм.)</th><th>Ставка</th><th>Сумма</th><th>Статус</th></tr></thead>
      <tbody>
        ${inv.works.map(w => {
          const norm = findNormHours(w.name);
          const exceeded = norm && w.normHours > norm.norm * 1.3;
          return `<tr>
            <td style="font-size:12px">${w.name}</td>
            <td class="${exceeded ? 'norm-exceeded' : 'norm-ok'}">${w.normHours.toFixed(2)} н/ч</td>
            <td class="norm-info">${norm ? norm.norm + ' н/ч' : '—'}</td>
            <td style="font-size:12px">${w.rate > 0 ? fmtMoney(w.rate) + '/н-ч' : 'Бесплатно'}</td>
            <td><strong>${fmtMoney(w.sum)}</strong></td>
            <td>${exceeded ? '<span class="badge badge-danger">↑ Выше нормы</span>' : norm ? '<span class="badge badge-success">✓ Норма</span>' : '<span class="badge badge-neutral">—</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  document.getElementById('invoiceModal').classList.add('open');
}

function closeModal() {
  document.getElementById('invoiceModal').classList.remove('open');
}

function editInvoice(id) {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  
  document.getElementById('modalTitle').textContent = `Редактирование счёта № ${inv.number}`;
  document.getElementById('modalBody').innerHTML = `
    <div style="background: var(--surface-light); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display:grid; grid-template-columns: 1fr; gap:16px; max-width:400px;">
        <div>
          <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-muted)">Номер счёта</label>
          <input type="text" id="editInvNumber" class="form-input" value="${inv.number}">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-muted)">Название автосервиса</label>
          <input type="text" id="editService" class="form-input" value="${inv.service}">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-muted)">Гос. номер автомобиля</label>
          <input type="text" id="editVehicle" class="form-input" value="${inv.vehicle || ''}" placeholder="Например: А123ВГ67">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-size:13px;color:var(--text-muted)">Модель автомобиля (или тип)</label>
          <input type="text" id="editVehicleModel" class="form-input" value="${inv.vehicleModel || ''}" placeholder="Например: Foton Auman">
        </div>
        <div style="margin-top:10px; display:flex; gap:10px;">
          <button class="btn-primary" onclick="saveInvoiceEdits('${inv.id}')">💾 Сохранить</button>
          <button class="btn-secondary" onclick="showInvoice('${inv.id}')">Отмена</button>
        </div>
      </div>
    </div>
  `;
}

function saveInvoiceEdits(id) {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  
  inv.number = document.getElementById('editInvNumber').value.trim() || inv.number;
  inv.service = document.getElementById('editService').value.trim() || inv.service;
  inv.vehicle = document.getElementById('editVehicle').value.trim();
  inv.vehicleModel = document.getElementById('editVehicleModel').value.trim();
  
  saveToStorage();
  renderAll(); // Обновляет все дашборды, бейджи и таблицы
  showInvoice(id); // Возвращаемся к просмотру счёта
}

function downloadInvoicePDF(id) {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const partsSum = inv.parts.reduce((s, p) => s + p.sum, 0);
  const worksSum = inv.works.reduce((s, w) => s + w.sum, 0);
  const overpay = calcInvoiceOverpay(inv);

  // Generate clean, printable HTML report
  const html = `
    <div style="font-family: 'Inter', sans-serif; color: #111; padding: 20px; background: #fff;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; page-break-inside: avoid;">
        <h1 style="margin: 0; font-size: 24px; color: #1e3a8a;">АвтоАналитика: Отчёт по счёту № ${inv.number}</h1>
        <p style="margin: 5px 0 0; color: #4b5563;">Дата счёта: ${fmtDate(inv.date)}</p>
      </div>
      
      <div style="display: flex; gap: 20px; margin-bottom: 30px; page-break-inside: avoid;">
        <div style="flex: 1; background: #f3f4f6; padding: 15px; border-radius: 8px;">
          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px;">Сервис</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${inv.service}</p>
        </div>
        <div style="flex: 1; background: #f3f4f6; padding: 15px; border-radius: 8px;">
          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px;">Автомобиль</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${inv.vehicle} (${inv.vehicleModel || '—'})</p>
        </div>
        <div style="flex: 1; background: #f3f4f6; padding: 15px; border-radius: 8px;">
          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px;">Сумма счёта</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${fmtMoney(inv.totalAmount)}</p>
        </div>
        <div style="flex: 1; background: ${overpay > 10 ? '#fee2e2' : '#dcfce7'}; padding: 15px; border-radius: 8px;">
          <p style="margin: 0 0 5px; color: #6b7280; font-size: 12px;">Переплата к рынку</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px; color: ${overpay > 10 ? '#b91c1c' : '#15803d'};">${overpay > 0 ? '+' : ''}${overpay.toFixed(0)}%</p>
        </div>
      </div>

      <div style="page-break-inside: auto;">
        <h3 style="color: #1e3a8a; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; page-break-after: avoid;">Запчасти (${inv.parts.length} шт., на сумму ${fmtMoney(partsSum)})</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; page-break-inside: auto;">
          <thead>
            <tr style="background: #f9fafb; text-align: left; page-break-inside: avoid;">
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Артикул</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Наименование</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Кол-во</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Цена</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Сумма</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Рын. цена</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Переплата</th>
            </tr>
          </thead>
          <tbody>
            ${inv.parts.map(p => {
              const mp = findMarketPriceForPart(p);
              const diff = mp ? ((p.price - mp) / mp * 100) : null;
              const diffColor = diff !== null && diff > 20 ? '#ef4444' : diff !== null && diff < -5 ? '#22c55e' : '#6b7280';
              return `
              <tr style="page-break-inside: avoid;">
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${p.article}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${p.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${p.qty} ${p.unit}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fmtMoney(p.price)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${fmtMoney(p.sum)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${mp ? fmtMoney(mp) : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: ${diffColor}; font-weight: bold;">${diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(0) + '%' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div style="page-break-inside: auto;">
        <h3 style="color: #1e3a8a; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; page-break-after: avoid;">Работы (${inv.works.length} шт., на сумму ${fmtMoney(worksSum)})</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto;">
          <thead>
            <tr style="background: #f9fafb; text-align: left; page-break-inside: avoid;">
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Наименование работы</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Норм-ч (факт)</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Норм-ч (рынок)</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Ставка</th>
              <th style="padding: 8px; border-bottom: 2px solid #e5e7eb;">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${inv.works.map(w => {
              const norm = findNormHours(w.name);
              const exceeded = norm && w.normHours > norm.norm * 1.3;
              return `
              <tr style="page-break-inside: avoid;">
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${w.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: ${exceeded ? '#ef4444' : '#22c55e'}; font-weight: bold;">${w.normHours.toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${norm ? norm.norm : '—'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${w.rate > 0 ? fmtMoney(w.rate) + '/н-ч' : 'Бесплатно'}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${fmtMoney(w.sum)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 40px; text-align: center; color: #9ca3af; font-size: 10px; page-break-inside: avoid;">
        Сгенерировано системой «АвтоАналитика»
      </div>
    </div>
  `;

  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     `Аналитика_счет_${inv.number}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, scrollY: 0, windowY: 0 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['css', 'legacy'] }
  };

  html2pdf().set(opt).from(html).save();
}

document.getElementById('invoiceModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ---- UPLOAD / PDF ----
function setupUpload() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('pdfFileInput');

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') handlePDF(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handlePDF(fileInput.files[0]);
  });
}

async function handlePDF(file) {
  const status = document.getElementById('pdfStatus');
  const preview = document.getElementById('pdfPreview');
  status.className = 'pdf-status loading';
  status.textContent = `⏳ Читаю файл: ${file.name}...`;
  preview.style.display = 'none';

  try {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // ============================================================
    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: группируем элементы по Y-координате
    // чтобы реконструировать настоящие строки из PDF
    // ============================================================
    let allItems = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Y в PDF идёт снизу вверх, переводим в координаты сверху вниз
      content.items.forEach(item => {
        const x = Math.round(item.transform[4]);
        const y = Math.round(viewport.height - item.transform[5]);
        allItems.push({ str: item.str.trim(), x, y, page: pageNum });
      });
    }

    // Группируем по Y (с допуском 4px = одна строка)
    const lineMap = {};
    allItems.forEach(item => {
      if (!item.str) return;
      const bucket = Math.round(item.y / 4) * 4;
      if (!lineMap[bucket]) lineMap[bucket] = [];
      lineMap[bucket].push(item);
    });

    // Сортируем строки сверху вниз, внутри — слева направо
    const linesWithY = Object.keys(lineMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(y => ({
        y: y,
        text: lineMap[y].sort((a, b) => a.x - b.x).map(i => i.str).join(' ').trim()
      }));

    const reconstructedLines = linesWithY.map(l => l.text);
    const structuredText = reconstructedLines.join('\n');
    const flatText = allItems.map(i => i.str).join(' ');

    preview.style.display = 'block';
    preview.textContent = reconstructedLines.slice(0, 30).join('\n') + '\n...';

    const parsed = parsePDFInvoice(flatText, structuredText, file.name, linesWithY);
    if (parsed) {
      // Удаляем дубликат если был ранее добавлен пустым
      state.invoices = state.invoices.filter(i => !(i.number === parsed.number && i.date === parsed.date));
      state.invoices.push(parsed);
      saveToStorage();
      updateBadges();

      const partsCount = parsed.parts.length;
      const worksCount = parsed.works.length;
      status.className = 'pdf-status success';
      status.innerHTML = `
        ✅ <strong>Счёт № ${parsed.number} сохранён!</strong><br>
        📦 Запчастей: ${partsCount} | ⚙️ Работ: ${worksCount} | 💰 Итого: <strong>${fmtMoney(parsed.totalAmount)}</strong>
      `;
      // Автоматически открываем модальное окно со счетом
      showInvoice(parsed.id);
    } else {
      status.className = 'pdf-status error';
      status.innerHTML = `⚠️ Не удалось распознать номер счёта.<br>Заполните форму вручную.
        <small style="color:var(--text-muted)"><br>Поддерживаются форматы: КомТранс Трейд, ТРАК СЕРВИС, ТЕХМСК-СЕРВИС</small>`;
    }
  } catch (e) {
    status.className = 'pdf-status error';
    status.textContent = `❌ Ошибка чтения PDF: ${e.message}`;
    console.error(e);
  }
}

// ===== УМНЫЙ ПАРСЕР PDF =====
// text = flatText (для поиска шапки), items = structuredText (строки с позициями)
function parsePDFInvoice(flatText, structuredText, filename, linesWithY) {
  const text = flatText;
  // --- 1. Определяем номер счёта ---
  const numPatterns = [
    /Счет(?:а)?\s+(?:на\s+оплату\s+)?№\s*([\w\d-]{2,20})\s+от/i,
    /Счет[ёе]\s+(?:на\s+оплату\s+)?№\s*([\w\d-]{2,20})\s+от/i,
    /№\s*([A-ZА-ЯЁ0-9-]{3,20})\s+от/i,
    /Счет(?: на оплату)?\s*№?\s*([A-Za-zА-Яа-я0-9-]{2,20})\s+от/i,
    /Счет\s*(\d{2,})\s+от/i
  ];
  let invoiceNumber = '';
  for (const pat of numPatterns) {
    const m = text.match(pat);
    if (m) { invoiceNumber = m[1].replace(/^000+/, ''); break; }
  }
  if (!invoiceNumber) {
    const m = text.match(/(\d{2,})\s+от\s+\d/); if (m) invoiceNumber = m[1];
  }
  if (!invoiceNumber) {
    const m = text.substring(0, 500).match(/№\s*([\w\d-]+)/);
    if (m) invoiceNumber = m[1];
  }
  if (!invoiceNumber) return null;

  // --- 2. Дата ---
  const monthMap = { 'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12,'янв':1,'фев':2,'мар':3,'апр':4,'май':5,'июн':6,'июл':7,'авг':8,'сен':9,'окт':10,'ноя':11,'дек':12 };
  let invoiceDate = '';
  const dateRu = text.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+г/i);
  const dateDot = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateRu) {
    const mon = monthMap[dateRu[2].toLowerCase()];
    if (mon) invoiceDate = `${dateRu[3]}-${String(mon).padStart(2,'0')}-${dateRu[1].padStart(2,'0')}`;
  } else if (dateDot) {
    invoiceDate = `${dateDot[3]}-${dateDot[2]}-${dateDot[1]}`;
  } else {
    invoiceDate = new Date().toISOString().split('T')[0];
  }

  // --- 3. Итоговая сумма ---
  let totalAmount = 0;
  const totalPatterns = [
    /Всего(?:\s+наименований[^,]*,)?\s+на\s+сумму\s+([\d\s]+[,.]\d{2})/i,
    /Всего\s+к\s+оплате[^\d]*([\d\s]+[,.]\d{2})/i
  ];
  for (const pat of totalPatterns) {
    const m = text.match(pat);
    if (m) { totalAmount = parseRuNum(m[1]); if (totalAmount > 100) break; }
  }

  // Если предыдущие строгие паттерны не сработали, ищем строчку "Итого" и берем ПОСЛЕДНЮЮ сумму в ней
  if (totalAmount === 0 || totalAmount < 100) {
     const itogoLine = text.match(/(?:Итого|Всего|Сумма)[^\n\r]+/i);
     if (itogoLine) {
         const monies = [...itogoLine[0].matchAll(/([\d\s]{3,}[,.]\d{2})/g)];
         if (monies.length > 0) {
             totalAmount = parseRuNum(monies[monies.length - 1][1]);
         }
     }
  }

  // --- 3. Определяем сервис ---
  let service = 'Неизвестный сервис';
  if (text.includes('ТРАНСХОЛОД') || text.toLowerCase().includes('трансхолод')) service = 'ТрансХолод';
  else if (text.includes('КомТранс') || text.includes('КомТранс Трейд') || text.includes('ЗНКТ')) service = 'КомТранс Трейд';
  else if (text.includes('ТРАК СЕРВИС') || text.includes('ТРАК') && text.includes('СЕРВИС')) service = 'ТРАК СЕРВИС';
  else if (text.includes('ТЕХМСК') || text.includes('ТЕХМСК-СЕРВИС')) service = 'ТЕХМСК-СЕРВИС';
  else {
    // Извлечь название из Поставщик, Продавец, Исполнитель, либо просто ООО / ИП
    const svcM = text.match(/(?:Поставщик|Исполнитель|Продавец|Организация|Получатель|Подрядчик):\s*(?:ООО|ИП)?\s*["«]?([^"»,\n]{3,50})["»]?/i) ||
                 text.match(/(ООО\s*["«][^"»\n]{3,50}["»])/i) ||
                 text.match(/(ООО\s+[А-ЯЁA-Z][а-яёa-zА-ЯЁA-Z0-9-]{2,30})/i) ||
                 text.match(/(ИП\s+[А-ЯЁ][а-яё]+(?:[\s.]+[А-ЯЁ][а-яё]*){1,2})/);
    if (svcM) {
      let s = (svcM[1] || svcM[0]).replace(/ИНН.*/i, '').replace(/КПП.*/i, '').replace(/р\/с.*/i, '').trim();
      service = s.length > 3 ? s : service;
    }
  }

  // --- 5. Автомобиль и прицеп (из строки Заказ-наряд) ---
  let vehicle = '', vehicleModel = '';

  // Приоритет: строка "Заказ-наряд № ... (МОДЕЛЬ НОМЕР VIN)"
  const naryadM = text.match(/[Зз]аказ[-.\s]*наряд[^(\n]{0,60}\(([^)]{3,100})\)/);
  if (naryadM) {
    const info = naryadM[1].trim();
    // Гос. номер: буква+3цифры+2буквы+2-3цифры
    const regM = info.match(/([А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3})/);
    if (regM) vehicle = regM[1];
    // Модель: всё до гос. номера
    vehicleModel = info.replace(/[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3}.*/, '').replace(/[A-Z0-9]{17}/, '').trim().substring(0, 60);
    if (!vehicleModel && info.length > 2) vehicleModel = info.replace(regM?.[0] || '', '').trim().substring(0, 60);
  }

  // Запасной вариант: ищем гос. номер в тексте
  if (!vehicle) {
    const vinM = text.match(/([А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3})/);
    if (vinM) vehicle = vinM[1];
  }

  // Запасной вариант: модель по ключевым словам
  if (!vehicleModel) {
    const modelPatterns = [
      /FOTON\s+AUMAN[\s\w]*/i,
      /КамАЗ[\s\d]*/i,
      /ТОНАР[\s\d]*/i,
      /МАЗ[\s\d]*/i,
      /VOLVO\s+[A-Z]+[\s\d]*/i,
      /SCANIA\s+[A-Z]+[\s\d]*/i,
      /DAF\s+[A-Z]+[\s\d]*/i,
    ];
    for (const pat of modelPatterns) {
      const m = text.match(pat);
      if (m) { vehicleModel = m[0].trim().substring(0, 60); break; }
    }
  }

  // --- 6. Ставка нормо-часа ---
  let laborRate = 3000;
  const rateM = text.match(/([23]\s*[0-9]{3})[,.]00\s*(?:руб|₽|н\/ч)/i) ||
                text.match(/ставк[аи]\s*([\d\s]+[,.]\d{2})/i);
  if (rateM) { const r = parseRuNum(rateM[1]); if (r >= 1500 && r <= 10000) laborRate = r; }
  if (service === 'КомТранс Трейд') {
    laborRate = text.includes('2 802') || text.includes('2802') ? 2802.50 : 2950;
  } else if (service === 'ТРАК СЕРВИС') {
    laborRate = 3200;
  } else if (service === 'ТЕХМСК-СЕРВИС') {
    laborRate = text.includes('2 550') ? 2550 : 2440;
  }

  // --- 7. Парсим позиции ---
  const parts = [];
  const works = [];
  parseLineItems(linesWithY || structuredText, parts, works, laborRate);

  // --- 8. Санитарный фильтр: убираем позиции с суммой > итога счёта ---
  const maxSum = totalAmount > 0 ? totalAmount * 1.1 : 5000000;
  const filteredParts = parts.filter(p => p.sum > 0 && p.sum <= maxSum);
  const filteredWorks = works.filter(w => w.sum > 0 && w.sum <= maxSum);

  return {
    id: `PDF-${invoiceNumber}-${Date.now()}`,
    number: invoiceNumber,
    date: invoiceDate,
    service,
    vehicle,
    vehicleModel: vehicleModel.replace(/\s+/g, ' ').trim(),
    laborRate,
    totalAmount,
    source: 'pdf',
    parts: filteredParts,
    works: filteredWorks
  };
}

function parseLineItems(inputData, parts, works, laborRate) {
  const SKIP = /^(Итого|Всего|НДС|В\s+т\.ч|Скидка|Руководитель|Бухгалтер|ИНН|КПП|БИК|Сч\.|Банк|Договор|Покупатель|Поставщик|Получатель|Внимание|Оплата|Уведомление|\d{9,}|Образец|Прихода|обязательно|самовывозом|Товар\s+отпускается|Принят|Вид ремонта|Диспетчер|Мастер|Срок исполнения|W\)\s*№\s*Товар|№\s*Товар|Код\s*Артикул|Всего\s*Артикул|Товар\s*Кол-во)/i;

  let validLines = [];
  if (typeof inputData === 'string') {
     validLines = inputData.split(/\n/).map((l, i) => ({ y: i * 10, text: l.trim() }));
  } else {
     validLines = inputData;
  }
  
  validLines = validLines.filter(l => l.text.length > 0 && !(l.text.length < 5 && !/^\d{1,3}$/.test(l.text)) && l.text.length <= 350);

  let previousLineBuf = '';
  let lastPushedItem = null;
  let lastPushedY = null;

  for (let i = 0; i < validLines.length; i++) {
    const lineObj = validLines[i];
    const line = lineObj.text;

    if (SKIP.test(line)) {
        if (/№\s*Товар/i.test(line) || /Код\s*Артикул/i.test(line)) {
             previousLineBuf = ''; 
        }
        continue;
    }

    // Ищем артикул в начале
    const artM = line.match(/(?:^|[^А-ЯЁA-Z0-9_])([А-ЯA-Z]{0,2}\d{5,}[\w-]*)(?![А-ЯЁA-Z0-9_])/i) ||
                 line.match(/(?:^|[^A-Z0-9_])([A-Z]{2,}[\d-]{3,}[\w-]*)(?![A-Z0-9_])/i);
    const article = artM ? artM[1] : '-';

    // Ищем все денежные суммы в конце строки (Цена, Скидка, Сумма, НДС)
    let tempLine = line;
    const endMonies = [];
    while (true) {
      const m = tempLine.match(/(?:\s|^)(\d+(?:\s\d{3})*[,.]\d{2})\s*$/);
      if (m) {
        endMonies.unshift({ str: m[0], val: parseRuNum(m[1]) });
        tempLine = tempLine.substring(0, tempLine.length - m[0].length);
      } else {
        break;
      }
    }

    let isMatchedBlock = false;
    let qty = 1;
    let unit = 'шт';
    let sum = 0;
    let price = 0;
    let name = line;
    let hasExplicitPartUnit = false;

    if (endMonies.length > 0) {
      const vals = endMonies.map(x => x.val);
      const last = vals[vals.length - 1];
      let sumIndex = vals.length - 1;
      
      if (vals.length >= 2) {
        const prev = vals[vals.length - 2];
        const ratio = last / prev;
        if (ratio > 0.15 && ratio < 0.22) {
          sumIndex = vals.length - 2;
        }
      }
      
      sum = vals[sumIndex];
      price = sum;
      
      const unitM = tempLine.match(/(\d+(?:[,.]\d+)?)\s*(шт|л|кг|к-т|мл|комплект|компл|н\/ч|ч)(?:\s|$)/i);
      if (unitM) {
        qty = parseRuNum(unitM[1]);
        unit = unitM[2].toLowerCase();
        if (unit !== 'н/ч' && unit !== 'ч') hasExplicitPartUnit = true;
        tempLine = tempLine.substring(0, unitM.index).trim();
        isMatchedBlock = true;
      } else {
        const numsMatches = [...tempLine.matchAll(/(?:\s|^)(\d+(?:\s\d{3})*(?:[,.]\d{1,4})?)(?=\s|$)/g)];
        if (numsMatches.length > 0) {
           let foundQty = 1;
           let qtyFound = false;
           let lastQtyIndex = -1;
           let multipliedCount = 0;
           let expectedEnd = tempLine.length;
           
           for (let j = numsMatches.length - 1; j >= 0; j--) {
              const match = numsMatches[j];
              const textBetween = tempLine.substring(match.index + match[0].length, expectedEnd);
              if (/[a-zA-Zа-яА-ЯЁё]/.test(textBetween)) break; 
              
              const val = parseRuNum(match[1]);
              
              if (val > 0 && Math.abs(val - laborRate) < 1) {
                 lastQtyIndex = match.index;
                 expectedEnd = match.index;
                 continue; 
              }
              if (val > 0 && val < 1000) {
                 foundQty *= val;
                 qtyFound = true;
                 lastQtyIndex = match.index;
                 expectedEnd = match.index;
                 multipliedCount++;
                 if (multipliedCount >= 2) break;
              } else {
                 break; 
              }
           }
           if (qtyFound) {
              qty = foundQty;
              tempLine = tempLine.substring(0, lastQtyIndex).trim();
              isMatchedBlock = true;
           }
        }
      }

      if (isMatchedBlock) {
        name = tempLine.replace(/(?:\s|^)[\d\s,.-]+$/, '').trim();
        price = qty > 0 ? sum / qty : sum;
      }
    }

    if (!isMatchedBlock) {
      const sumM = line.match(/(?:\s|^)(\d+(?:\s\d{3})*[,.]\d{2})\s*$/);
      sum = sumM ? parseRuNum(sumM[1]) : 0;
      price = sum;
      name = line.replace(/(?:\s|^)(\d+(?:\s\d{3})*[,.]\d{2})\s*$/, '').trim();
      const nhM = line.match(/(\d+[,.]\d+)\s*(?:н\/ч|ч(?![а-яёa-z]))/i);
      const unitM = line.match(/(\d+(?:[,.]\d+)?)\s*(шт|л|кг|к-т|мл|комплект|компл)(?:\s|$)/i);
      if (nhM) {
        qty = parseRuNum(nhM[1]);
        unit = 'н/ч';
        price = qty > 0 ? sum / qty : sum;
        name = name.replace(nhM[0], '').trim();
      } else if (unitM) {
        qty = parseRuNum(unitM[1]);
        unit = unitM[2].toLowerCase();
        hasExplicitPartUnit = true;
        price = qty > 0 ? sum / qty : sum;
        name = name.replace(unitM[0], '').trim();
      }
    }

    if (sum === 0) {
        let nextPriceY = null;
        for (let j = i + 1; j < validLines.length; j++) {
            if (/(?:\s|^)\d+(?:\s\d{3})*[,.]\d{2}\s*$/.test(validLines[j].text)) {
                nextPriceY = validLines[j].y;
                break;
            }
        }
        
        const distToLast = lastPushedY !== null ? Math.abs(lineObj.y - lastPushedY) : Infinity;
        const distToNext = nextPriceY !== null ? Math.abs(lineObj.y - nextPriceY) : Infinity;

        if (distToLast < distToNext) {
            lastPushedItem.name += ' ' + line;
        } else {
            previousLineBuf = previousLineBuf ? previousLineBuf + ' ' + line : line;
        }
        continue;
    }

    if (previousLineBuf) {
        name = previousLineBuf + (name ? ' ' + name : '');
        previousLineBuf = '';
    }

    // Удаляем артикулы из названия
    name = name
      .replace(/[А-ЯA-Z]{2}\d{6,}\s*/g, '')
      .replace(/\d{6,}\s+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Удаляем номер позиции из начала названия, если он там есть
    name = name.replace(/^\d{1,2}\s+/, '').trim();
    // И удаляем номер позиции из конца, если он приклеился туда из-за сбитых координат PDF
    name = name.replace(/\s+\d{1,2}$/, '').trim();

    if (name.length < 4 || /^[\d\s,.-]+$/.test(name) || /^\d{10,}$/.test(name.replace(/\s/g,''))) {
        continue;
    }

    // Эвристика определения типа (Работа или Запчасть)
    let isWork = false;
    
    if (unit === 'н/ч' || unit === 'ч') {
      isWork = true;
    } else if (hasExplicitPartUnit) {
      isWork = false;
    } else if (qty % 1 !== 0) {
      isWork = true; // Дробное количество без единиц измерения - это точно нормо-часы
    } else {
      isWork = /(замена|ремонт|с\/у|диагностика|снятие|установка|проверка|осмотр|то\s|регулировка|обслуживание|очистка|мойка|промывка|стоянка|работы|слив\/залив|долив|смазка|шприцевание|поиск|устранение|неисправност|сварка|шиномонтаж|балансировка|схождение|развал)/i.test(name);
      const isPart = /(насос|фильтр|колодк|диск|датчик|болт|гайк|ремень|ролик|подшипник|масло|суппорт|рычаг|амортизатор|прокладк|сальник|ламп|свеч|шкив|кольцо|реле|втулк|патрубок|шланг|ремкомплект|рмк|радиатор|генератор|стартер|клапан|трос|стекло|зеркало|дворник|щетк|антифриз|жидкость)/i.test(name);
      
      // Расходные материалы обычно считаются запчастями
      if (/расходные\s+материалы/i.test(name)) {
         isWork = false;
      } else if (isWork && isPart) {
         isWork = true; // Приоритет работе (например "Замена фильтра")
      }
    }

    if (isWork) {
      let finalRate = price;
      if (qty > 0 && laborRate > 0) {
          const expectedSum = qty * laborRate;
          if (expectedSum >= sum && expectedSum < sum * 1.5) {
              finalRate = laborRate;
          }
      }
      works.push({ name: name.substring(0, 120), normHours: qty, rate: finalRate, sum });
      lastPushedItem = works[works.length - 1];
    } else {
      parts.push({ article, name: name.substring(0, 120), brand: '-', qty, unit: unit === 'н/ч' ? 'шт' : unit, price, sum });
      lastPushedItem = parts[parts.length - 1];
    }
    lastPushedY = lineObj.y;
  }
}

function parseRuNum(str) {
  if (!str) return 0;
  return parseFloat(str.toString().replace(/\s/g, '').replace(',', '.')) || 0;
}

// ---- MANUAL FORM ----
function setupForm() {
  const form = document.getElementById('manualInvoiceForm');
  form.addEventListener('submit', e => {
    e.preventDefault();
    saveManualInvoice();
  });
  updateFormTotal();

  // Populate datalists with existing values
  refreshDataLists();
}

function refreshDataLists() {
  const services = [...new Set(state.invoices.map(i => i.service).filter(Boolean))];
  const vehicles = [...new Set(state.invoices.map(i => i.vehicle).filter(Boolean))];
  const sl = document.getElementById('servicesList');
  const vl = document.getElementById('vehiclesList');
  if (sl) { sl.innerHTML = ''; services.forEach(s => { const o = document.createElement('option'); o.value = s; sl.appendChild(o); }); }
  if (vl) { vl.innerHTML = ''; vehicles.forEach(v => { const o = document.createElement('option'); o.value = v; vl.appendChild(o); }); }
}

let partRows = 0, workRows = 0;

function addPartRow() {
  partRows++;
  const container = document.getElementById('partsContainer');
  const row = document.createElement('div');
  row.className = 'part-row';
  row.id = `part-${partRows}`;
  row.innerHTML = `
    <input type="text" placeholder="Артикул" name="part_art_${partRows}">
    <input type="text" placeholder="Наименование" name="part_name_${partRows}" required>
    <input type="number" placeholder="Кол-во" name="part_qty_${partRows}" min="0.001" step="any" value="1" oninput="updateFormTotal()">
    <input type="number" placeholder="Цена, ₽" name="part_price_${partRows}" min="0" step="0.01" oninput="updateFormTotal()">
    <button type="button" class="btn-icon" onclick="document.getElementById('part-${partRows}').remove();updateFormTotal()" title="Удалить">✕</button>`;
  container.appendChild(row);
}

function addWorkRow() {
  workRows++;
  const container = document.getElementById('worksContainer');
  const row = document.createElement('div');
  row.className = 'work-row';
  row.id = `work-${workRows}`;
  row.innerHTML = `
    <input type="text" placeholder="Наименование работы" name="work_name_${workRows}" required>
    <input type="number" placeholder="н/ч" name="work_norm_${workRows}" min="0" step="0.01" value="1">
    <input type="number" placeholder="Сумма, ₽" name="work_price_${workRows}" min="0" step="0.01" oninput="updateFormTotal()">
    <button type="button" class="btn-icon" onclick="document.getElementById('work-${workRows}').remove();updateFormTotal()" title="Удалить">✕</button>`;
  container.appendChild(row);
}

function updateFormTotal() {
  const form = document.getElementById('manualInvoiceForm');
  let total = 0;
  form.querySelectorAll('[name^="part_price_"], [name^="work_price_"]').forEach(inp => {
    const v = parseFloat(inp.value);
    const qtyInp = inp.name.replace('price', 'qty');
    const qty = parseFloat(form.querySelector(`[name="${qtyInp}"]`)?.value || 1);
    if (!isNaN(v)) total += inp.name.startsWith('part') ? v * qty : v;
  });
  document.getElementById('formTotal').textContent = fmtMoney(total);
}

function saveManualInvoice() {
  const form = document.getElementById('manualInvoiceForm');
  const id = `MAN-${Date.now()}`;
  const inv = {
    id,
    number: document.getElementById('invNumber').value,
    date: document.getElementById('invDate').value,
    service: document.getElementById('invService').value,
    vehicle: document.getElementById('invVehicle').value,
    vehicleModel: document.getElementById('invModel').value,
    laborRate: 3000,
    totalAmount: 0,
    parts: [],
    works: []
  };

  // Collect parts
  for (let i = 1; i <= partRows; i++) {
    const name = form.querySelector(`[name="part_name_${i}"]`)?.value;
    if (!name) continue;
    const art = form.querySelector(`[name="part_art_${i}"]`)?.value || '-';
    const qty = parseFloat(form.querySelector(`[name="part_qty_${i}"]`)?.value || 1);
    const price = parseFloat(form.querySelector(`[name="part_price_${i}"]`)?.value || 0);
    inv.parts.push({ article: art, name, brand: '-', qty, unit: 'шт', price, sum: qty * price });
    inv.totalAmount += qty * price;
  }

  // Collect works
  for (let i = 1; i <= workRows; i++) {
    const name = form.querySelector(`[name="work_name_${i}"]`)?.value;
    if (!name) continue;
    const norm = parseFloat(form.querySelector(`[name="work_norm_${i}"]`)?.value || 1);
    const price = parseFloat(form.querySelector(`[name="work_price_${i}"]`)?.value || 0);
    inv.works.push({ name, normHours: norm, rate: 0, sum: price });
    inv.totalAmount += price;
  }

  state.invoices.push(inv);
  saveToStorage();
  updateBadges();

  // Success feedback
  form.reset();
  document.getElementById('partsContainer').querySelectorAll('.part-row').forEach(r => r.remove());
  document.getElementById('worksContainer').querySelectorAll('.work-row').forEach(r => r.remove());
  document.getElementById('formTotal').textContent = '0 ₽';
  partRows = 0; workRows = 0;

  const status = document.createElement('div');
  status.className = 'pdf-status success';
  status.textContent = `Успех: Счёт № ${inv.number} сохранен! Итого: ${fmtMoney(inv.totalAmount)}`;
  form.parentNode.insertBefore(status, form);
  setTimeout(() => status.remove(), 5000);
  
  // Автоматически открываем отдельную вкладку (модальное окно) со счетом
  showInvoice(inv.id);
  navigateTo('invoices');
}

function deleteInvoice(id) {
  if (!confirm('Удалить этот счёт из истории?')) return;
  state.invoices = state.invoices.filter(i => i.id !== id);
  saveToStorage();
  updateBadges();
  renderInvoicesTable();
}

// ---- SEARCH / FILTERS ----
function setupSearch() {
  document.getElementById('invoiceSearch')?.addEventListener('input', renderInvoicesTable);
  document.getElementById('invoiceServiceFilter')?.addEventListener('change', renderInvoicesTable);
  document.getElementById('invoiceVehicleFilter')?.addEventListener('change', renderInvoicesTable);
  document.getElementById('partsSearch')?.addEventListener('input', renderPartsTable);
  document.getElementById('worksSearch')?.addEventListener('input', renderWorksTable);
}

function setupCompFilter() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeFilters.compType = tab.dataset.filter;
      renderComparisonTable();
    });
  });
}

// ---- UTILS ----
function fmtMoney(n) {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtMoneyShort(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'М';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'К';
  return n.toFixed(0);
}

function fmtDate(d) {
  if (!d) return '—';
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}
