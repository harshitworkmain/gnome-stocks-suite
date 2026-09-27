# Technical Interview Prep Cheat Sheet: GNOME Stocks Suite
**Target Role:** Software Engineer (Full Stack) — Foodhub (Chennai / UK)  
**Candidate:** Harshit Singh | **Repo:** `stock-extension-widget`

---

## 1. System Overview (30-Second Pitch)

> "GNOME Stocks Suite is a full-stack financial platform aggregating market data across 3 providers (Yahoo Finance, Finnhub, Angel One SmartAPI) into a 9-endpoint REST API, delivering real-time quotes and AI-powered market education across desktop and web interfaces.
> 
> It solves two core problems: **data heterogeneity** (normalizing global/Indian symbol formats into a single JSON schema) and **latency/cost overhead** (a 3-tier caching architecture cutting repeat-request latency from 800ms+ to <1ms while capping LLM token costs). The stack features a Flask/Gunicorn REST backend on Render, a resilient background polling daemon, a vanilla JS SPA with TradingView charts, a guardrailed AI chatbot (Groq/Llama 3.1), and an automated GitHub Actions CI/CD pipeline."

---

## 2. High-Level Design (HLD)

### Architecture Diagram
```
[External APIs] ──► [Background Daemon (daemon.py)] ──► [POSIX RAM Disk (/dev/shm)] ──► [GNOME Shell Ext]
 (Yahoo, Finnhub,     - TOTP Auth & Backoff              - Atomic os.rename()           (Gio.FileMonitor)
  Angel One)          - Bulk Quote Batching
                             │
                             ▼
                    [Flask REST API (api_server.py)] ◄──► [SQLite Cache (llm_cache.db)]
                    - Universal Symbol Router             [Groq LLM Engine (Llama 3.1)]
                    - In-Memory TTL Cache
                             │
                             ▼
                    [Vanilla JS Web SPA / Widget (app.js)]
                    - TradingView Lightweight Charts
                    - Page Visibility Smart Polling
```

### End-to-End Core Data Flows
1. **Real-Time Quote Flow (`GET /api/quote?symbol=RELIANCE.NS`):**
   Client `fetch()` $\rightarrow$ `normalize_symbol()` maps `.NS` to `RELIANCE-EQ` (Provider: `angelone`, Currency: `INR`) $\rightarrow$ Memory TTL Cache Check (Hit: <1ms response) $\rightarrow$ On Miss: SmartAPI call $\rightarrow$ Cache populate $\rightarrow$ HTTP 200 return.
2. **AI Financial Concept Explanation (`GET /api/llm/explain`):**
   User clicks stat label $\rightarrow$ Backend hashes `MD5("P/E Ratio:AAPL:32.4")` $\rightarrow$ SQLite `explain_cache` lookup (Hit: 0ms, \$0 token cost) $\rightarrow$ On Miss: Groq API (`llama-3.1-8b-instant`) with 2-sentence prompt rule $\rightarrow$ Store in SQLite $\rightarrow$ Return response.

### Key Architectural Decisions
- **Flask REST vs. GraphQL:** REST was chosen for deterministic endpoint caching and lightweight client implementation without heavy GraphQL client parsing.
- **`/dev/shm` RAM Disk vs. Sockets for Desktop IPC:** Zero disk I/O latency on Linux; kernel `inotify` (`Gio.FileMonitor`) triggers instant client updates.

---

## 3. Low-Level Design (LLD)

### Database Schema (SQLite `llm_cache.db`)
```sql
CREATE TABLE explain_cache (
    hash TEXT PRIMARY KEY,    -- MD5 digest of (term:symbol:value) -> O(1) B-tree lookup
    term TEXT NOT NULL,       -- e.g., "P/E Ratio"
    symbol TEXT NOT NULL,     -- e.g., "AAPL"
    response TEXT NOT NULL,   -- Sanitized LLM response string
    created_at REAL NOT NULL  -- Timestamp
);
```

### API Surface (All 9 Endpoints in `api_server.py`)
| Method | Path | Purpose | Key Parameters |
|---|---|---|---|
| `GET` | `/` | API Dashboard Landing | None (HTML dashboard) |
| `GET` | `/api/health` | Health & Groq Status | None |
| `GET` | `/api/search` | Instrument Search | `q` (string) |
| `GET` | `/api/quote` | Real-Time Price Quote | `symbol` (string) |
| `GET` | `/api/profile` | 34-Metric Company Profile | `symbol` (string) |
| `GET` | `/api/history` | Chart Data | `symbol`, `range` (`1d`..`max`) |
| `GET` | `/api/news` | Symbol News | `symbol` (string) |
| `GET` | `/api/llm/explain` | AI Concept Explanation | `term`, `symbol`, `value` |
| `POST` | `/api/llm/chat` | Contextual AI Chatbot | Body: `{ message, context, history }` |

### Core Algorithms
- **`normalize_symbol()` Routing:** Regex pattern matching maps `.NS`/`.BO` $\rightarrow$ `-EQ` (Angel One), `^NSEI` $\rightarrow$ `NIFTY`, `BINANCE:` $\rightarrow$ Crypto (Finnhub), `OANDA:` $\rightarrow$ Forex.
- **Daemon Backoff:** `_get_backoff()` doubles interval (`base * 2^(n-1)`) + 10% random jitter, capped at 300s max to prevent rate-limit thundering herds.

---

## 4. Resume Metrics Cheat Sheet

| Resume Metric | Source File & Location | Defense & Technical Justification |
|---|---|---|
| **9 REST Endpoints** | [api_server.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/api_server.py#L271) | 9 distinct `@app.route` handlers separating quotes, profiles, history, search, AI, and health. |
| **3 Data Providers** | [api_server.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/api_server.py#L26) & [daemon.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/daemon.py#L8) | `yfinance` (Global equities), Finnhub API (Crypto/Forex), Angel One SmartAPI (Indian markets). |
| **8 Symbol Formats** | [api_server.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/api_server.py#L127) | `.NS`, `.BO`, `-EQ`, `^NSEI`-style, `BINANCE:`, `OANDA:`, `-USD`, and raw tickers normalized seamlessly. |
| **3-Tier Caching** | [api_server.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/api_server.py#L52) & [angelone_indexer.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/angelone_indexer.py#L9) | Tier 1: In-memory dict with TTLs; Tier 2: Persistent SQLite MD5 table; Tier 3: `/dev/shm` RAM disk file. |
| **800ms+ to <1ms Latency** | Benchmark: I/O vs. Memory | Outbound HTTP network calls take 600ms–1200ms; in-memory dict cache hit resolves in <0.1ms. |
| **832-line Vanilla JS SPA** | [app.js](file:///home/harshit/Documents/projects-all/stock-extension-widget/gnome-stocks-widget/web/app.js) | Framework-free single page app managing state, TradingView charts, AI chat, and Visibility API polling. |
| **8 Chart Time Ranges** | [app.js](file:///home/harshit/Documents/projects-all/stock-extension-widget/gnome-stocks-widget/web/app.js#L773) | `1d`, `5d`, `1mo`, `6mo`, `ytd`, `1y`, `5y`, `max` mapped to TradingView resolutions. |
| **14-min Keep-Alive Cron** | [.github/workflows/keep-alive.yml](file:///home/harshit/Documents/projects-all/stock-extension-widget/.github/workflows/keep-alive.yml#L6) | GitHub Actions cron (`*/14 * * * *`) pinging `/api/health` to eliminate 50s Render free-tier cold starts. |
| **25 Pre-Mapped Symbols** | [daemon.py](file:///home/harshit/Documents/projects-all/stock-extension-widget/stocks-daemon/daemon.py#L40) | 17 NSE stocks + 3 indices + 5 legacy aliases pre-indexed for zero-latency bulk token API requests. |

---

## 5. Key Trade-offs

1. **In-Memory TTL + SQLite vs. Redis:** Local memory yields sub-millisecond access with zero infrastructure cost on single-node deployments; Redis would be required for multi-node horizontal scaling.
2. **`/dev/shm` RAM Disk IPC vs. WebSockets:** Zero overhead POSIX shared memory for desktop clients on Linux; sacrificed cross-machine network IPC.
3. **Vanilla JS vs. React/Next.js:** Eliminated 500KB+ framework parse overhead inside embedded WebKit2GTK desktop webviews; sacrificed declarative JSX component abstractions.
4. **Dynamic Context Injection vs. Vector RAG for AI:** Appended exact UI stock JSON into system prompt for instant 0ms retrieval; sacrificed multi-document semantic search.

---

## 6. Real Engineering Problems Solved

### Problem 1: Torn File Reads on Shared Memory IPC
- **Issue:** GNOME Extension read `/dev/shm/gnome-stocks.json` while Python daemon was writing it, throwing `JSONDecodeError`.
- **Solution:** Implemented atomic POSIX writes in `daemon.py` (lines 436–448): write to `.tmp` file first, then `os.rename(OUTPUT_TMP, OUTPUT_FILE)`. Kernel VFS atomic rename guarantees readers see only complete JSON.

### Problem 2: Render Cloud Cold-Start Latency
- **Issue:** Render free tier spins down idle instances after 15 mins, causing 50s delays on fresh requests.
- **Solution:** Created automated GitHub Actions workflow (`keep-alive.yml`) pinging `/api/health` every 14 minutes (`*/14 * * * *`), keeping Gunicorn workers warm 24/7.

---

## 7. Foodhub Stack Mapping

| Foodhub Stack | My Codebase Equivalent | Interview Talking Point |
|---|---|---|
| **REST APIs** | 9 Flask REST endpoints | Direct match. Clean URL structure, HTTP verbs, JSON request/response validation. |
| **Node.js / Express** | Python / Flask + Gunicorn | Express routes and middleware map 1:1 to Flask route functions and decorators. |
| **SQL & NoSQL** | SQLite relational schema + JSON storage | Relational SQL schema design, B-tree primary key indexing, denormalization trade-offs. |
| **React / React Native** | Vanilla JS SPA (`app.js`) | Demonstrates core JS mastery (async/await, event loop, state management) underlying React. |
| **CI/CD & Cloud** | Render PaaS + GitHub Actions | Automated build/test pipelines and Infrastructure-as-Code deployment (`render.yaml`). |

---

## 8. High-Yield Interview Q&As

### Q1: "How does your API normalize symbols across 3 data sources?"
> "Via `normalize_symbol()` in `api_server.py`. It uses regex pattern matching to parse symbols like `RELIANCE.NS`, strip the suffix, map it to `RELIANCE-EQ` for Angel One SmartAPI, set currency to `INR`, and return a standardized JSON payload so client code remains 100% provider-agnostic."

### Q2: "How do you enforce LLM guardrails against giving financial advice?"
> "In `api_server.py`, `CHAT_SYSTEM_PROMPT` enforces 5 strict rules: mandatory refusal of buy/sell questions, no price predictions, and limiting explanations to beginner-friendly concepts in 3–5 sentences. For metric terms (`/api/llm/explain`), responses are strictly capped at 2 educational sentences."

---

## 9. Production & Scale Roadmap

1. **DB & Cache:** Replace SQLite and `/dev/shm` with managed PostgreSQL (user data) and Redis (distributed caching & pub/sub).
2. **Auth & Rate Limiting:** Add JWT header validation and IP-level rate limiting (`Flask-Limiter`) on LLM endpoints.
3. **Real-time Streaming:** Upgrade interval polling to WebSockets or SSE for real-time price tick streaming.

---

## 10. Probing Follow-Up Chains (Drill-Down Practice)

### Chain 1: Multi-Tier Caching & Race Conditions
- **Q1 (Surface):** *What happens when two requests hit `/api/quote?symbol=AAPL` at the same time?*  
  **A1:** `api_server.py` acquires a `threading.Lock`. The first request checks the `_cache` dict. On a hit, it releases the lock and returns JSON in <1ms.
- **Q2 (Deeper):** *What if the cache key has expired for both requests simultaneously?*  
  **A2:** Both threads experience a cache miss and issue concurrent outbound HTTP requests to `yfinance`. The last writer updates `_cache`.
- **Q3 (Production Edge):** *How do you prevent this thundering herd problem in production?*  
  **A3:** Implement Mutex Locking per Key (Singleflight pattern) so secondary threads wait on the first thread's fetch result rather than duplicating external API calls.

### Chain 2: Resilient Polling & Session Auth
- **Q1 (Surface):** *How does the background daemon handle broker API failures?*  
  **A1:** In `daemon.py`, `_get_backoff()` implements exponential backoff (`base * 2^(n-1)`) with 10% random jitter, capped at 300 seconds.
- **Q2 (Deeper):** *Why add random jitter to exponential backoff?*  
  **A2:** Jitter desynchronizes retry attempts across multiple instances, preventing synchronized retry waves that re-trigger API rate limits.
- **Q3 (Deeper Still):** *What if the broker 2FA session expires during daemon execution?*  
  **A3:** `_ensure_angelone_session()` validates session liveness via a lightweight `ltpData()` test call. If unauthorized, it auto-regenerates a TOTP token via `pyotp` and re-authenticates seamlessly.
