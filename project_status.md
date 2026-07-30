# Project Status

**Current Phase:** Phase 4 & 4.1 Complete ✅ (Live Cloud Deploy + Interactive API Dashboard)

## Phase 1a: Finnhub + Yahoo Daemon + Extension Refactor ✅
## Phase 1b: Angel One SmartAPI Integration ✅

## Phase 1c: Bug Fixes + Settings + UX ✅
- [x] Daemon: `currency` field (USD/INR/PTS) in every quote
- [x] GSettings: 10 new keys, 3 obsolete removed, schema recompiled
- [x] extension.js: state management, ticker rotation, currency formatting, stale detection
- [x] popup.js: pin toggle (★/☆), hover effects, ERR remove button, currency prefix
- [x] prefs.js: GNOME 42 compatible (Adw.ActionRow + Gtk.SpinButton/Switch)
- [x] stylesheet.css: hover, pin, compact, row borders
- [x] metadata.json: version field added
- [x] install.sh: copies prefs.js, resets dconf
- [x] Live verified: 8 quotes, 0 failures, $, ₹, points all correct

## Phase 2: Desktop Widget System ✅
- [x] API Research & finalized architecture incorporating `yfinance` for global data
- [x] UI/UX Planning (Google Finance aesthetic, Stitch MCP "Market Signal" design system)
- [x] 2a: Backend API Server (`api_server.py` — Flask, yfinance, localhost:5005)
- [x] 2b: Widget Core App (`widget.py` — GTK3 + WebKit2, dark theme, keyboard shortcuts)
- [x] 2c: UI Layout & Search (sidebar, autocomplete, filter pills, market cards)
- [x] 2d: Detail View & Interactive Charts (Lightweight Charts, area series, 8 timeframes, stats grid)
- [x] 2e: News & Polish (Stitch MCP tonal depth, glassmorphism, ghost borders, shimmer loading)

## Phase 3: Next-Gen Features & Architecture ✅

### 3a: Universal Symbol & Alias System ✅
- [x] `normalize_symbol()` / `get_yfinance_symbol()` in `api_server.py`
- [x] `normalize_daemon_symbol()` in `daemon.py` for polling-side normalization
- [x] `.NS`/`.BO` → `-EQ`, `^NSEI` → `NIFTY` alias mapping
- [x] All API endpoints route through Universal Symbol Router
- [x] Live verified: RELIANCE.NS → RELIANCE-EQ (angelone), AAPL → AAPL (yfinance)

### 3b: Dynamic Symbol Discovery (Global Search) ✅
- [x] `angelone_indexer.py` — downloads & indexes 203k instruments (2.6k equities/indices)
- [x] Merged `/api/search` aggregator: Angel One local + Yahoo Finance remote
- [x] Angel One results appear first (instant, local cache), Yahoo results fill remaining
- [x] Deduplication by symbol across providers
- [x] Extension `popup.js` — Soup HTTP autocomplete dropdown with 300ms debounce
- [x] Autocomplete CSS — glassmorphism dropdown, hover effects, provider badges

### 3c: Market Intelligence Engine (Groq LLM) ✅
- [x] Groq LPU API integrated (`llama-3.1-8b-instant`)
- [x] `/api/llm/explain` — 2-sentence explanations with SQLite persistent cache
- [x] `/api/llm/chat` — conversational AI with stock context and conversation history
- [x] Strict educational guardrails (no financial advice)
- [x] Widget UI: Dashed-underline explainable stats + glassmorphism popover
- [x] Widget UI: "Market AI" chat sidebar with typing indicators and gradient bubbles
- [x] Live verified: Groq <200ms, cache returns 0ms

### 3d: Performance & Scalability Optimization ✅
- [x] Bulk quote batching for Angel One (`getMarketData` with individual fallback)
- [x] JavaScript Visibility API — pauses polling when widget minimized
- [x] Auto-refresh every 2 minutes when visible
- [x] Profile cache extended to 24 hours
- [x] `requestAnimationFrame` for chat DOM mutations (smooth animations)
- [x] 300ms debounce on all search inputs (widget + extension)

---

## Phase 4: Cloud Infrastructure & Distribution ✅

### 4a: Backend Containerization & Cloud Deployment ✅
- [x] Dependencies pinned in `requirements.txt` (`flask`, `yfinance`, `groq`, `gunicorn`, `flask-cors`)
- [x] `stocks-daemon/api_server.py` refactored for cloud: env vars (`GROQ_API_KEY`, `PORT`), CORS headers, `0.0.0.0` binding
- [x] Render Blueprint (`render.yaml`) created with `gunicorn` WSGI setup
- [x] Live deployment verified: `https://gnome-stocks-api.onrender.com` (Health check 200 OK, search 200 OK, Groq active)
- [x] Zero cold-start keep-alive workflow (`.github/workflows/keep-alive.yml`) with GitHub Secret `RENDER_API_URL` (pings every 14 min)

### 4b: Namespace & Packaging ✅
- [x] Namespace updated to `gnome-stocks@harshitworkmain`
- [x] `metadata.json` updated with GNOME Shell 42–46 compatibility and GitHub repository URL
- [x] `scripts/make-extension-zip.sh` created for packaging extensions.gnome.org store `.zip`
- [x] Flatpak manifest (`io.github.harshitworkmain.GnomeStocks.yml`) created for Flathub packaging

### 4c: CI/CD & Automated Releases ✅
- [x] Automated release workflow (`.github/workflows/release.yml`) for `v*` tag pushes
- [x] Production Release `v1.0.0` tagged, pushed, and verified live on GitHub Releases
- [x] Release assets generated & attached: `gnome-stocks-extension-v1.0.0.zip` (11.5 KB) and `gnome-stocks-widget-v1.0.0.tar.gz` (27.2 KB)

---

## Phase 4.1: API Root Landing Dashboard (`GET /`) ✅
- [x] `@app.route("/")` added to `api_server.py` with Stitch MCP dark design theme
- [x] Live animated status badge (`Online — v3.0`) and Groq AI connection status
- [x] Interactive global symbol search box (`Try it`) with real-time JSON response viewer
- [x] Interactive endpoint cards for all 7 GET and 1 POST endpoints
- [x] Quick links to GitHub repository and `v1.0.0` release assets
- [x] Deployed and verified live on Render (`https://gnome-stocks-api.onrender.com/` returns 200 OK)
