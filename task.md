# Stock Suite — Task Tracker

> **CRITICAL RULE FOR OPUS 4.6:** To save tokens and rate limits, focus ONLY on generating the codebase. NEVER generate unnecessary diagrams in `.md` files, and NEVER output verbose response messages or implementation summary checklists in chat. Be strictly concise.

## Phase 1a: Finnhub + Yahoo Daemon + Extension Refactor ✅
## Phase 1b: Angel One SmartAPI Integration ✅

## Phase 1c: Bug Fixes + Settings + UX ✅

### Bug Fixes
- [x] Currency + units formatting (daemon `currency` field + extension rendering)
- [x] Extension Manager crash (`metadata.json` version + `prefs.js` GNOME 42 compat fix)
- [x] Search bar hint text updated to `Add symbol (e.g. RELIANCE-EQ, AAPL)`
- [x] ERR symbols now have remove button (✕)
- [x] prefs.js fixed: replaced `Adw.SpinRow`/`Adw.SwitchRow` with `Adw.ActionRow` + `Gtk.SpinButton`/`Gtk.Switch` (GNOME 42 libadwaita 1.1 compat)

### Settings System
- [x] Rewrote GSettings schema (10 new keys, 3 obsolete removed)
- [x] Created `prefs.js` (GTK4 `Adw.PreferencesPage` — 2 pages: Panel + Display)
- [x] Wired settings to extension behavior (panel position, rotation, display toggles, compact mode)

### Ticker Rotation
- [x] Centralized `_state` object in extension.js
- [x] Rotation algorithm: pinned vs rotating, configurable interval (2–15s)
- [x] Anti-flicker debounce (`lastPanelText` check)

### UX Polish
- [x] Popup: hover effects, row separators, pin toggle (★/☆), column alignment
- [x] Panel: currency prefix ($, ₹, plain), comma formatting, compact mode
- [x] CSS: hover, pin button (gold ★), compact class, row borders
- [x] Stale data detection (>5 min → ⏳ indicator)

### Verification
- [x] Daemon: 5+ quotes with `currency` field, 0 failures
- [x] Currency: AAPL $248, RELIANCE ₹1384, NIFTY 23002 (plain)
- [x] Rotation: implemented with configurable interval
- [x] ERR symbols deletable
- [x] All `.md` files updated

## Phase 2: Desktop Widget System ✅

### 2a: Backend API Server (`api_server.py`) ✅
- [x] Integrate `yfinance` library
- [x] Spin up local HTTP server (Flask, localhost:5005)
- [x] Implement GET `/api/search?q=...`
- [x] Implement GET `/api/profile?symbol=...`
- [x] Implement GET `/api/history?symbol=...&range=...`
- [x] Implement GET `/api/news?symbol=...`
- [x] Implement GET `/api/quote?symbol=...`
- [x] Implement GET `/api/health`
- [x] In-memory TTL cache (search 5m, profile 1hr, history 2m, news 5m)
- [x] Systemd service (`gnome-stocks-api.service`)

### 2b: Widget Core App ✅
- [x] Initialize GTK3 python app (`gnome-stocks-widget/widget.py`)
- [x] Configure `WebKitWebView` (dark background, JS enabled, DevTools)
- [x] Header bar with refresh + fullscreen buttons
- [x] Keyboard shortcuts (F5 refresh, F11 fullscreen, F12 devtools)
- [x] Desktop entry file + install script

### 2c: UI Layout & Search ✅
- [x] Scaffold HTML/CSS/JS architecture
- [x] Build left navigation/watchlist sidebar
- [x] Build top search bar with pill-shaped input
- [x] Wire autocomplete dropdown to `/api/search`
- [x] Filter pills (All, Stocks, Crypto, Currencies, Futures, ETFs)
- [x] Market index sparkline cards (NIFTY, SENSEX, S&P 500, Dow)
- [x] Market News section with article cards

### 2d: Detail View & Interactive Charts ✅
- [x] Implement Lightweight Charts (TradingView) component
- [x] Build time-frame selector (1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX)
- [x] Wire chart data dynamically from `/api/history`
- [x] Area series with green/red coloring based on trend
- [x] Build "About Company" stats grid from `/api/profile` (12 metrics)
- [x] Company description with show/hide toggle

### 2e: News & Polish (Stitch MCP) ✅
- [x] Build news feed card layout (thumb + title + publisher)
- [x] Implement loading shimmer/skeleton states
- [x] Stitch MCP "Market Signal" design system applied
- [x] Tonal depth surface hierarchy (no hard borders)
- [x] Glassmorphism search dropdown
- [x] Ghost borders on stats grid
- [x] Colored top-highlight bars on market cards
- [x] "Manage Portfolio" gradient button
- [x] Integration tested with daemon API

## Phase 3: Next-Gen Features & Architecture ✅

### 3a: Universal Symbol & Alias System ✅
- [x] Define global normalization schema in `api_server.py` (`normalize_symbol`, `get_yfinance_symbol`)
- [x] Add `normalize_daemon_symbol` in `daemon.py` for polling-side normalization
- [x] Implement alias stripping/mapping (`.NS` → `-EQ`, `^NSEI` → `NIFTY`)
- [x] Route requests correctly based on normalized type

### 3b: Dynamic Symbol Discovery (Global Search) ✅
- [x] Merged search aggregator: Angel One Scrip Master + Yahoo Finance in `/api/search`
- [x] Angel One Scrip Master local indexing (`angelone_indexer.py` — 203k instruments, 2.6k indexed equities/indices)
- [x] Create merged, deduped, ranked search algorithm across providers
- [x] Standardize search output schema (`/api/search`) with `provider` field
- [x] Extension `popup.js` autocomplete dropdown consuming `/api/search` (Soup HTTP, 300ms debounce)
- [x] Autocomplete CSS (glassmorphism dropdown, hover, provider badges)

### 3c: Market Intelligence Engine (LLM APIs) ✅
- [x] Groq LPU API integrated (`llama-3.1-8b-instant`)
- [x] `/api/llm/explain` endpoint with SQLite persistent cache
- [x] `/api/llm/chat` endpoint with conversation history + context injection
- [x] Strict educational guardrails (no financial advice)
- [x] Widget UI: Dashed-underline stats + glassmorphism explain popover
- [x] Widget UI: "Market AI" chat sidebar with typing indicators

### 3d: Performance & Scalability Optimization ✅
- [x] Bulk quote batching for Angel One (`getMarketData` with fallback)
- [x] Visibility API throttling (pauses polling when widget minimized)
- [x] 24H caching for static profile data
- [x] `requestAnimationFrame` for chat messages and typing indicators
- **Throttled Background Activity:** The GTK3 WebKit2 widget will pause active data polling via the JavaScript `Visibility API` when the window is minimized or covered by other windows. LLM Chat rendering will use `requestAnimationFrame` to ensure smooth sliding transitions without layout thrashing.

---

## Phase 3.5: Final Polish & UI Fixes

### Branding & UI Refinements
- [ ] Rename "Market AI" to "GNOME AI" and remove 🤖 icon
- [ ] Remove "Manage Portfolio" button
- [ ] Wire dashboard filter pills to dynamically update Home Market Cards and News (Crypto, Forex, Futures)

### Watchlist UX
- [ ] Replace Widget `prompt()` watchlist addition with Autocomplete search + Detail view Star (★) button
- [ ] Fix Extension `popup.js` invisible autocomplete dropdown (`visible = true` bug)
- [ ] Add `✕` delete button to watchlist sidebar items

### News Links
- [ ] Make home dashboard news cards clickable (`target="_blank"`)
- [ ] Make stock-specific news cards clickable (`target="_blank"`)
- [ ] Make "View All" market news link open external browser

---

## Phase 4: Cloud Infrastructure & MCP Integration

To transition GNOME Stocks from a local tool to a universally available extension with cloud-synced accounts, Phase 4 will strategically utilize the following Model Context Protocol (MCP) servers:

### 6.1 Selected MCP Stack
1. **Cloud Run MCP (Deployment):** Migrate the `api_server.py` Flask daemon from `localhost` to a Serverless Google Cloud Run container. This removes the requirement for users to run a Python background process.
2. **Supabase MCP (Storage & Sync):** Replace the local `config.json` with a cloud Postgres schema for user accounts. Watchlists and panel settings will sync seamlessly across multiple GNOME machines.
3. **Sequential Thinking MCP (Logic & System Design):** A completely free, built-in tool that provides structured reasoning capabilities. We will use this to break down complex, multi-step asynchronous logic (like preventing race conditions between the GNOME UI and the polling daemon).
4. **SonarQube & GitHub MCPs (CI/CD):** Enforce strict code quality on the GJS extension to pass GNOME Extension Store validation, and manage GitHub releases. 

### 6.2 Architectural Migration Steps
* **Step 1:** Containerize `api_server.py` and deploy via Cloud Run. Update Extension and Widget to point to the new remote URL.
* **Step 2:** Integrate Supabase REST capabilities to store the `watchlist` and `settings` objects.
* **Step 3:** Setup SonarQube workflows to prep the codebase for the GNOME Extensions platform.
