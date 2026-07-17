/* ═══════════════════════════════════════════════════════════════════════════
   GNOME Stocks Desktop Widget — Application Logic (Phase 3)
   Connects to local API server at localhost:5005
   Features: Universal Symbol Router, Market AI Chat, Beginner Mode Explanations
   ═══════════════════════════════════════════════════════════════════════════ */

const API = localStorage.getItem('apiUrl') || 'http://127.0.0.1:5005';

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  currentView: 'home',     // 'home' or 'detail'
  currentSymbol: null,
  currentRange: '1mo',
  currentProfile: null,    // Phase 3: cached profile for AI context
  chart: null,
  chartSeries: null,
  searchDebounce: null,
  watchlist: JSON.parse(localStorage.getItem('watchlist') || '["AAPL","NVDA","RELIANCE.NS","TCS.NS","TSLA"]'),
  indices: [
    { symbol: '^GSPC',    name: 'S&P 500' },
    { symbol: '^DJI',     name: 'Dow Jones' },
    { symbol: '^NSEI',    name: 'NIFTY 50' },
    { symbol: '^BSESN',   name: 'SENSEX' },
  ],
  filterType: 'all',
  aiOpen: false,
  aiHistory: [],           // Phase 3: chat conversation history
};

// ─── Dashboard Category Map (Phase 3.5) ────────────────────────────────────
const PILL_CATEGORIES = {
  all:            { cards: [{ symbol: '^NSEI', name: 'NIFTY 50' }, { symbol: '^BSESN', name: 'SENSEX' }, { symbol: '^GSPC', name: 'S&P 500' }, { symbol: '^DJI', name: 'Dow Jones' }], newsSymbol: 'SPY' },
  EQUITY:         { cards: [{ symbol: '^NSEI', name: 'NIFTY 50' }, { symbol: '^BSESN', name: 'SENSEX' }, { symbol: '^GSPC', name: 'S&P 500' }, { symbol: '^DJI', name: 'Dow Jones' }], newsSymbol: 'SPY' },
  CRYPTOCURRENCY: { cards: [{ symbol: 'BTC-USD', name: 'Bitcoin' }, { symbol: 'ETH-USD', name: 'Ethereum' }, { symbol: 'SOL-USD', name: 'Solana' }, { symbol: 'DOGE-USD', name: 'Dogecoin' }], newsSymbol: 'BTC-USD' },
  CURRENCY:       { cards: [{ symbol: 'INR=X', name: 'USD/INR' }, { symbol: 'EUR=X', name: 'EUR/USD' }, { symbol: 'GBP=X', name: 'GBP/USD' }, { symbol: 'JPY=X', name: 'USD/JPY' }], newsSymbol: 'EURUSD=X' },
  FUTURE:         { cards: [{ symbol: 'CL=F', name: 'Crude Oil' }, { symbol: 'GC=F', name: 'Gold' }, { symbol: 'SI=F', name: 'Silver' }, { symbol: 'NG=F', name: 'Natural Gas' }], newsSymbol: 'GC=F' },
  ETF:            { cards: [{ symbol: 'SPY', name: 'S&P 500 ETF' }, { symbol: 'QQQ', name: 'Nasdaq 100 ETF' }, { symbol: 'VTI', name: 'Total Market ETF' }, { symbol: 'ARKK', name: 'ARK Innovation' }], newsSymbol: 'SPY' },
};

// ─── Explainable Terms Map ─────────────────────────────────────────────────
// Maps stat label text to the term name for the LLM
const EXPLAINABLE_TERMS = {
  'Previous Close': 'Previous Close',
  'Open': 'Open Price',
  'Day Range': 'Day Range',
  '52-Week Range': '52-Week Range',
  'Market Cap': 'Market Capitalization',
  'P/E Ratio': 'P/E Ratio',
  'EPS': 'Earnings Per Share',
  'Volume': 'Trading Volume',
  'Avg Volume': 'Average Volume',
  'Beta': 'Beta',
  'Dividend Yield': 'Dividend Yield',
  '50-Day Avg': '50-Day Moving Average',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

async function api(endpoint, options = {}) {
  const res = await fetch(`${API}${endpoint}`, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(price, currency) {
  if (price == null) return '—';
  const formatted = formatNumber(price);
  if (currency === 'INR') return '₹' + formatted;
  if (currency === 'USD') return '$' + formatted;
  return formatted;
}

function formatChange(change, pct) {
  if (change == null || pct == null) return '';
  const sign = change >= 0 ? '+' : '';
  const arrow = change > 0 ? ' ▲' : (change < 0 ? ' ▼' : '');
  return `${sign}${formatNumber(change)} (${sign}${Number(pct).toFixed(2)}%)${arrow}`;
}

function changeClass(val) {
  if (val > 0) return 'positive';
  if (val < 0) return 'negative';
  return 'neutral';
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function saveSetting(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ─── Sidebar: Watchlist ────────────────────────────────────────────────────

async function loadWatchlist() {
  const container = document.getElementById('watchlist');
  container.innerHTML = state.watchlist.map(sym =>
    `<div class="sidebar-item skeleton" data-symbol="${sym}" style="height:44px"></div>`
  ).join('');

  for (const sym of state.watchlist) {
    try {
      const d = await api(`/api/quote?symbol=${encodeURIComponent(sym)}`);
      const el = container.querySelector(`[data-symbol="${sym}"]`);
      if (!el) continue;
      el.classList.remove('skeleton');
      el.innerHTML = `
        <div class="sidebar-item-left">
          <span class="sidebar-item-symbol">${sym}</span>
        </div>
        <div class="sidebar-item-right">
          <span class="sidebar-item-price">${formatPrice(d.price, d.currency)}</span>
          <span class="sidebar-item-change ${changeClass(d.changePercent)}">${d.changePercent != null ? (d.changePercent >= 0 ? '+' : '') + Number(d.changePercent).toFixed(2) + '%' : ''}</span>
          <button class="watchlist-remove-btn" data-remove="${sym}" title="Remove ${sym}">✕</button>
        </div>`;
      el.onclick = (e) => {
        if (e.target.closest('.watchlist-remove-btn')) return;
        navigateToSymbol(sym);
      };
      // Wire remove button
      el.querySelector('.watchlist-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.watchlist = state.watchlist.filter(s => s !== sym);
        saveSetting('watchlist', state.watchlist);
        loadWatchlist();
      });
    } catch (e) {
      const el = container.querySelector(`[data-symbol="${sym}"]`);
      if (el) {
        el.classList.remove('skeleton');
        el.innerHTML = `
          <div class="sidebar-item-left">
            <span class="sidebar-item-symbol">${sym}</span>
          </div>
          <div class="sidebar-item-right">
            <span class="sidebar-item-change negative">ERR</span>
            <button class="watchlist-remove-btn" data-remove="${sym}" title="Remove ${sym}">✕</button>
          </div>`;
        el.onclick = (e) => {
          if (e.target.closest('.watchlist-remove-btn')) return;
          navigateToSymbol(sym);
        };
        el.querySelector('.watchlist-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.watchlist = state.watchlist.filter(s => s !== sym);
          saveSetting('watchlist', state.watchlist);
          loadWatchlist();
        });
      }
    }
  }
}

// ─── Sidebar: Indices ──────────────────────────────────────────────────────

async function loadIndices() {
  const container = document.getElementById('indices-list');
  container.innerHTML = state.indices.map(idx =>
    `<div class="sidebar-item skeleton" data-symbol="${idx.symbol}" style="height:44px"></div>`
  ).join('');

  for (const idx of state.indices) {
    try {
      const d = await api(`/api/quote?symbol=${encodeURIComponent(idx.symbol)}`);
      const el = container.querySelector(`[data-symbol="${idx.symbol}"]`);
      if (!el) continue;
      el.classList.remove('skeleton');
      el.innerHTML = `
        <div class="sidebar-item-left">
          <span class="sidebar-item-symbol">${idx.name}</span>
        </div>
        <div class="sidebar-item-right">
          <span class="sidebar-item-price">${formatNumber(d.price)}</span>
          <span class="sidebar-item-change ${changeClass(d.changePercent)}">${d.changePercent != null ? (d.changePercent >= 0 ? '+' : '') + Number(d.changePercent).toFixed(2) + '%' : ''}</span>
        </div>`;
      el.onclick = () => navigateToSymbol(idx.symbol);
    } catch {
      const el = container.querySelector(`[data-symbol="${idx.symbol}"]`);
      if (el) { el.classList.remove('skeleton'); el.textContent = `${idx.name} — offline`; }
    }
  }
}

// ─── Home View: Market Cards ───────────────────────────────────────────────

async function loadMarketCards(category) {
  const container = document.getElementById('market-cards');
  const cat = category || state.filterType || 'all';
  const cards = (PILL_CATEGORIES[cat] || PILL_CATEGORIES.all).cards;

  container.innerHTML = cards.map(() => `<div class="market-card skeleton skeleton-card"></div>`).join('');

  for (let i = 0; i < cards.length; i++) {
    try {
      const d = await api(`/api/quote?symbol=${encodeURIComponent(cards[i].symbol)}`);
      const cardEl = container.children[i];
      cardEl.classList.remove('skeleton', 'skeleton-card');
      cardEl.classList.add(d.changePercent >= 0 ? 'card-up' : 'card-down');
      cardEl.innerHTML = `
        <div class="market-card-name">${cards[i].name}</div>
        <div class="market-card-price">${formatNumber(d.price)}</div>
        <div class="market-card-change ${changeClass(d.changePercent)}">
          ${d.changePercent != null ? (d.changePercent >= 0 ? '+' : '') + Number(d.changePercent).toFixed(2) + '%' : '—'}
          ${d.change != null ? (d.change >= 0 ? ' ▲' : ' ▼') : ''}
        </div>`;
      cardEl.onclick = () => navigateToSymbol(cards[i].symbol);
    } catch {
      const cardEl = container.children[i];
      cardEl.classList.remove('skeleton', 'skeleton-card');
      cardEl.innerHTML = `
        <div class="market-card-name">${cards[i].name}</div>
        <div class="market-card-price">—</div>
        <div class="market-card-change neutral">Offline</div>`;
    }
  }
}

// ─── Home View: News ───────────────────────────────────────────────────────

async function loadHomeNews(category) {
  const container = document.getElementById('news-list');
  container.innerHTML = Array(4).fill('<div class="skeleton skeleton-card" style="height:86px;margin-bottom:8px"></div>').join('');

  const cat = category || state.filterType || 'all';
  const newsSymbol = (PILL_CATEGORIES[cat] || PILL_CATEGORIES.all).newsSymbol;

  try {
    const d = await api(`/api/news?symbol=${encodeURIComponent(newsSymbol)}`);
    container.innerHTML = '';
    for (const article of d.articles.slice(0, 8)) {
      container.innerHTML += renderNewsCard(article);
    }
  } catch {
    container.innerHTML = '<p style="color:var(--text-disabled)">Unable to load news</p>';
  }
}

function renderNewsCard(article) {
  const thumb = article.thumbnail
    ? `<img class="news-thumb" src="${article.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="news-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--text-disabled);font-size:20px">📰</div>`;

  return `
    <div class="news-card" onclick="window.open('${article.link}', '_blank')">
      ${thumb}
      <div class="news-content">
        <div class="news-title">${article.title}</div>
        <div class="news-meta">${article.publisher}${article.publishedAt ? ' · ' + timeAgo(article.publishedAt) : ''}</div>
      </div>
    </div>`;
}

// ─── Search ────────────────────────────────────────────────────────────────

function setupSearch() {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(state.searchDebounce);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.classList.add('hidden'); return; }

    state.searchDebounce = setTimeout(async () => {
      try {
        const d = await api(`/api/search?q=${encodeURIComponent(q)}`);
        let results = d.results || [];

        // Apply filter
        if (state.filterType !== 'all') {
          results = results.filter(r => r.type === state.filterType);
        }

        if (results.length === 0) {
          dropdown.innerHTML = '<div style="padding:16px;color:var(--text-disabled);text-align:center">No results</div>';
        } else {
          dropdown.innerHTML = results.map(r => `
            <div class="search-result-item" data-symbol="${r.symbol}">
              <div class="search-result-left">
                <span class="search-result-symbol">${r.symbol}</span>
                <span class="search-result-name">${r.name}</span>
              </div>
              <div class="search-result-right">
                <span class="search-result-exchange">${r.exchange}</span>
                <span class="search-result-type">${r.type}</span>
              </div>
            </div>
          `).join('');
        }
        dropdown.classList.remove('hidden');
      } catch {
        dropdown.innerHTML = '<div style="padding:16px;color:var(--color-down)">Search failed</div>';
        dropdown.classList.remove('hidden');
      }
    }, 300);
  });

  // Click search result
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      const sym = item.dataset.symbol;
      input.value = '';
      dropdown.classList.add('hidden');
      navigateToSymbol(sym);
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-bar')) {
      dropdown.classList.add('hidden');
    }
  });

  // Filter pills — wire to dynamically update dashboard (Phase 3.5)
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.filterType = pill.dataset.filter;
      // Reload dashboard cards + news for this category
      loadMarketCards(state.filterType);
      loadHomeNews(state.filterType);
      // Also filter live search if input has text
      if (input.value.trim().length >= 2) {
        input.dispatchEvent(new Event('input'));
      }
    });
  });
}

// ─── Navigation ────────────────────────────────────────────────────────────

async function navigateToSymbol(symbol) {
  state.currentView = 'detail';
  state.currentSymbol = symbol;
  state.currentRange = '1mo';

  document.getElementById('home-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');

  document.getElementById('content-area').scrollTop = 0;

  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.symbol === symbol);
  });

  await loadDetailView(symbol);

  // Phase 3.5: Update star button state
  updateWatchlistStar(symbol);
}

function navigateHome() {
  state.currentView = 'home';
  state.currentSymbol = null;
  state.currentProfile = null;

  document.getElementById('detail-view').classList.add('hidden');
  document.getElementById('home-view').classList.remove('hidden');

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
}

// ─── Detail View ───────────────────────────────────────────────────────────

async function loadDetailView(symbol) {
  document.getElementById('chart').innerHTML = '<div class="skeleton" style="height:100%;border-radius:8px"></div>';
  document.getElementById('stats-grid').innerHTML = Array(8).fill('<div class="stat-item skeleton" style="height:40px"></div>').join('');
  document.getElementById('about-text').textContent = 'Loading…';
  document.getElementById('detail-news-list').innerHTML = Array(3).fill('<div class="skeleton skeleton-card" style="height:86px;margin-bottom:8px"></div>').join('');

  // Load profile
  try {
    const p = await api(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
    state.currentProfile = p;  // Phase 3: cache for AI context

    document.getElementById('detail-name').textContent = p.name || symbol;
    document.getElementById('detail-symbol').textContent = p.symbol || symbol;
    document.getElementById('detail-exchange').textContent = p.sector || '';
    document.getElementById('detail-price').textContent = formatPrice(p.price, p.currency);
    const changeEl = document.getElementById('detail-change');
    changeEl.textContent = formatChange(p.change, p.changePercent);
    changeEl.className = 'detail-change ' + changeClass(p.changePercent);

    // Phase 3.5: Update star button state
    updateWatchlistStar(symbol);

    // Stats grid with EXPLAINABLE labels (Phase 3: Beginner Mode)
    const stats = [
      ['Previous Close', formatPrice(p.previousClose, p.currency)],
      ['Open', formatPrice(p.open, p.currency)],
      ['Day Range', `${formatPrice(p.dayLow, p.currency)} – ${formatPrice(p.dayHigh, p.currency)}`],
      ['52-Week Range', `${formatPrice(p.fiftyTwoWeekLow, p.currency)} – ${formatPrice(p.fiftyTwoWeekHigh, p.currency)}`],
      ['Market Cap', p.marketCapFormatted || 'N/A'],
      ['P/E Ratio', p.peRatio != null ? Number(p.peRatio).toFixed(2) : 'N/A'],
      ['EPS', p.eps != null ? formatPrice(p.eps, p.currency) : 'N/A'],
      ['Volume', p.volume != null ? Number(p.volume).toLocaleString() : 'N/A'],
      ['Avg Volume', p.avgVolume != null ? Number(p.avgVolume).toLocaleString() : 'N/A'],
      ['Beta', p.beta != null ? Number(p.beta).toFixed(3) : 'N/A'],
      ['Dividend Yield', p.dividendYield != null ? (Number(p.dividendYield) * 100).toFixed(2) + '%' : 'N/A'],
      ['50-Day Avg', formatPrice(p.fiftyDayAverage, p.currency)],
    ];

    document.getElementById('stats-grid').innerHTML = stats.map(([label, val]) => {
      const isExplainable = EXPLAINABLE_TERMS[label];
      const explainableClass = isExplainable ? 'explainable' : '';
      const dataAttrs = isExplainable
        ? `data-term="${label}" data-value="${val}"`
        : '';
      return `<div class="stat-item"><span class="stat-label ${explainableClass}" ${dataAttrs}>${label}</span><span class="stat-value">${val}</span></div>`;
    }).join('');

    // About
    const aboutText = document.getElementById('about-text');
    const aboutToggle = document.getElementById('about-toggle');
    if (p.description) {
      aboutText.textContent = p.description;
      aboutText.classList.remove('expanded');
      aboutToggle.classList.remove('hidden');
      aboutToggle.textContent = 'Show more';
      aboutToggle.onclick = () => {
        aboutText.classList.toggle('expanded');
        aboutToggle.textContent = aboutText.classList.contains('expanded') ? 'Show less' : 'Show more';
      };
    } else {
      aboutText.textContent = 'No company information available.';
      aboutToggle.classList.add('hidden');
    }
  } catch (e) {
    document.getElementById('detail-name').textContent = symbol;
    document.getElementById('detail-price').textContent = '—';
    document.getElementById('detail-change').textContent = 'Data unavailable';
    document.getElementById('detail-change').className = 'detail-change neutral';
  }

  await loadChart(symbol, state.currentRange);
  loadDetailNews(symbol);
}

// ─── Chart (Lightweight Charts) ────────────────────────────────────────────

async function loadChart(symbol, range) {
  const container = document.getElementById('chart');
  container.innerHTML = '';

  if (state.chart) {
    state.chart.remove();
    state.chart = null;
    state.chartSeries = null;
  }

  try {
    const d = await api(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`);

    if (!d.data || d.data.length === 0) {
      container.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-disabled)">No chart data available</div>';
      return;
    }

    const firstClose = d.data[0].close;
    const lastClose = d.data[d.data.length - 1].close;
    const isPositive = lastClose >= firstClose;

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 350,
      layout: {
        background: { type: 'solid', color: '#1e2022' },
        textColor: '#9AA0A6',
        fontSize: 12,
        fontFamily: "'Inter', sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(66, 71, 80, 0.25)' },
        horzLines: { color: 'rgba(66, 71, 80, 0.25)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: 'rgba(138, 180, 248, 0.25)', labelBackgroundColor: '#292a2d' },
        horzLine: { color: 'rgba(138, 180, 248, 0.25)', labelBackgroundColor: '#292a2d' },
      },
      timeScale: {
        borderColor: 'rgba(66, 71, 80, 0.4)',
        timeVisible: range === '1d' || range === '5d',
      },
      rightPriceScale: {
        borderColor: 'rgba(66, 71, 80, 0.4)',
      },
      handleScroll: true,
      handleScale: true,
    });

    state.chart = chart;

    const lineColor = isPositive ? '#8ed7a1' : '#ffbfb8';
    const topColor = isPositive ? 'rgba(142, 215, 161, 0.25)' : 'rgba(255, 191, 184, 0.25)';
    const bottomColor = isPositive ? 'rgba(142, 215, 161, 0.01)' : 'rgba(255, 191, 184, 0.01)';

    const series = chart.addAreaSeries({
      lineColor: lineColor,
      topColor: topColor,
      bottomColor: bottomColor,
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: lineColor,
      lastValueVisible: true,
    });

    const chartData = d.data
      .filter(p => p.close != null)
      .map(p => ({ time: p.time, value: p.close }));

    series.setData(chartData);
    state.chartSeries = series;

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

  } catch (e) {
    container.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--color-down)">Failed to load chart: ${e.message}</div>`;
  }
}

// ─── Detail News ───────────────────────────────────────────────────────────

async function loadDetailNews(symbol) {
  const container = document.getElementById('detail-news-list');
  try {
    const d = await api(`/api/news?symbol=${encodeURIComponent(symbol)}`);
    container.innerHTML = '';
    if (d.articles.length === 0) {
      container.innerHTML = '<p style="color:var(--text-disabled)">No news available</p>';
      return;
    }
    for (const article of d.articles.slice(0, 6)) {
      container.innerHTML += renderNewsCard(article);
    }
  } catch {
    container.innerHTML = '<p style="color:var(--text-disabled)">Unable to load news</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3c: Market Intelligence Engine
// ═══════════════════════════════════════════════════════════════════════════

// ─── Explain Popover (Beginner Mode) ───────────────────────────────────────

function setupExplainPopover() {
  const popover = document.getElementById('explain-popover');

  // Event delegation on stats grid
  document.addEventListener('click', async (e) => {
    const label = e.target.closest('.stat-label.explainable');

    if (label) {
      const term = label.dataset.term;
      const value = label.dataset.value;
      const symbol = state.currentSymbol || 'general';

      // Position popover above the label
      const rect = label.getBoundingClientRect();
      popover.style.left = `${rect.left}px`;
      popover.style.top = `${rect.top - 10}px`;
      popover.style.transform = 'translateY(-100%)';

      // Show with loading
      document.getElementById('explain-term').textContent = term;
      document.getElementById('explain-text').textContent = 'Thinking…';
      popover.classList.remove('hidden');

      try {
        const d = await api(`/api/llm/explain?term=${encodeURIComponent(term)}&symbol=${encodeURIComponent(symbol)}&value=${encodeURIComponent(value)}`);
        document.getElementById('explain-text').textContent = d.explanation;
      } catch (err) {
        document.getElementById('explain-text').textContent = 'Unable to load explanation. Please try again.';
      }
    } else if (!e.target.closest('.explain-popover')) {
      // Close popover on outside click
      popover.classList.add('hidden');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      popover.classList.add('hidden');
    }
  });
}

// ─── AI Chat Panel ─────────────────────────────────────────────────────────

function setupAIChat() {
  const panel = document.getElementById('ai-panel');
  const openBtn = document.getElementById('market-ai-btn');
  const closeBtn = document.getElementById('ai-close-btn');
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send-btn');
  const messagesContainer = document.getElementById('ai-messages');

  // Toggle panel
  openBtn.addEventListener('click', () => {
    state.aiOpen = true;
    panel.classList.remove('hidden');
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    state.aiOpen = false;
    panel.classList.add('hidden');
  });

  // Send message
  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;

    // Add user message to UI
    appendChatMessage('user', msg);
    input.value = '';

    // Store in history
    state.aiHistory.push({ role: 'user', content: msg });

    // Show typing indicator
    const typingEl = appendTypingIndicator();

    try {
      // Build context from current profile
      const context = state.currentProfile ? {
        symbol: state.currentProfile.symbol,
        name: state.currentProfile.name,
        price: state.currentProfile.price,
        change: state.currentProfile.change,
        changePercent: state.currentProfile.changePercent,
        peRatio: state.currentProfile.peRatio,
        marketCap: state.currentProfile.marketCapFormatted,
        beta: state.currentProfile.beta,
        sector: state.currentProfile.sector,
      } : {};

      const response = await api('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: context,
          history: state.aiHistory.slice(-6),
        }),
      });

      // Remove typing indicator
      typingEl.remove();

      // Add AI response
      appendChatMessage('assistant', response.response);
      state.aiHistory.push({ role: 'assistant', content: response.response });

    } catch (err) {
      typingEl.remove();
      appendChatMessage('assistant', '⚠ Sorry, I couldn\'t connect to the AI service. Please check that the API server is running.');
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function appendChatMessage(role, content) {
  const messagesContainer = document.getElementById('ai-messages');
  const msgEl = document.createElement('div');
  msgEl.className = `ai-msg ai-msg-${role}`;
  msgEl.innerHTML = `<div class="ai-msg-content">${escapeHtml(content)}</div>`;
  requestAnimationFrame(() => {
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
  return msgEl;
}

function appendTypingIndicator() {
  const messagesContainer = document.getElementById('ai-messages');
  const typingEl = document.createElement('div');
  typingEl.className = 'ai-msg ai-msg-assistant';
  typingEl.innerHTML = `
    <div class="ai-typing">
      <div class="ai-typing-dot"></div>
      <div class="ai-typing-dot"></div>
      <div class="ai-typing-dot"></div>
    </div>`;
  requestAnimationFrame(() => {
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
  return typingEl;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Visibility API (Phase 3d: Throttle when hidden) ───────────────────────

let refreshInterval = null;

function setupVisibilityThrottle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Pause polling
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    } else {
      // Resume if on home view
      if (state.currentView === 'home') {
        startHomeRefresh();
      }
    }
  });
}

function startHomeRefresh() {
  // Refresh home data every 2 minutes when visible
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (state.currentView === 'home' && !document.hidden) {
      loadMarketCards();
      loadWatchlist();
      loadIndices();
    }
  }, 120000);
}

// ─── Event Listeners ───────────────────────────────────────────────────────

function setupEventListeners() {
  // Back button
  document.getElementById('back-btn').addEventListener('click', navigateHome);

  // Timeframe buttons
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentRange = btn.dataset.range;
      if (state.currentSymbol) {
        loadChart(state.currentSymbol, state.currentRange);
      }
    });
  });

  // Add watchlist button — Phase 3.5: focus search bar instead of prompt()
  document.getElementById('add-watchlist-btn').addEventListener('click', () => {
    const input = document.getElementById('search-input');
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Phase 3.5: Star toggle button in detail view
  document.getElementById('watchlist-star-btn').addEventListener('click', () => {
    const sym = state.currentSymbol;
    if (!sym) return;
    if (state.watchlist.includes(sym)) {
      state.watchlist = state.watchlist.filter(s => s !== sym);
    } else {
      state.watchlist.push(sym);
    }
    saveSetting('watchlist', state.watchlist);
    updateWatchlistStar(sym);
    loadWatchlist();
  });
}

// Phase 3.5: Update star button to reflect watchlist state
function updateWatchlistStar(symbol) {
  const btn = document.getElementById('watchlist-star-btn');
  if (!btn) return;
  const inWatchlist = state.watchlist.includes(symbol);
  btn.textContent = inWatchlist ? '★' : '☆';
  btn.title = inWatchlist ? 'Remove from watchlist' : 'Add to watchlist';
  btn.classList.toggle('starred', inWatchlist);
}

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  setupEventListeners();
  setupExplainPopover();    // Phase 3: Beginner Mode
  setupAIChat();            // Phase 3: Market AI Chat
  setupVisibilityThrottle(); // Phase 3d: Performance

  // Load sidebar data
  loadWatchlist();
  loadIndices();

  // Load home view
  loadMarketCards();
  loadHomeNews();

  // Start background refresh
  startHomeRefresh();
});
