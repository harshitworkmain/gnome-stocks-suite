#!/usr/bin/env python3
"""
gnome-stocks API server (Phase 3).
Flask server exposing yfinance data + Groq LLM for the desktop widget.
Runs on localhost:5005 alongside the existing polling daemon.

Phase 3 additions:
  - Universal Symbol Router (alias normalization)
  - Market Intelligence Engine (Groq LLM: /api/llm/explain, /api/llm/chat)
  - SQLite persistent LLM cache
"""

import json
import os
import re
import sqlite3
import threading
import time
import hashlib
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request

import yfinance as yf

app = Flask(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────

CONFIG_PATH = Path(__file__).parent / "config.json"

def _load_config():
    """Load config.json safely."""
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

_config = _load_config()
GROQ_API_KEY = _config.get("groq_api_key", "")

# ─── In-memory cache with TTL ───────────────────────────────────────────────

_cache = {}
_cache_lock = threading.Lock()

CACHE_TTL = {
    "search": 300,       # 5 min
    "profile": 86400,    # 24 hours — Phase 3 optimization
    "history": 120,      # 2 min
    "news": 300,         # 5 min
}


def _cache_get(namespace, key):
    """Return cached value if present and not expired, else None."""
    with _cache_lock:
        entry = _cache.get(f"{namespace}:{key}")
        if entry and (time.time() - entry["ts"]) < CACHE_TTL.get(namespace, 120):
            return entry["data"]
    return None


def _cache_set(namespace, key, data):
    """Store data in cache with current timestamp."""
    with _cache_lock:
        _cache[f"{namespace}:{key}"] = {"data": data, "ts": time.time()}


# ─── SQLite LLM Cache ───────────────────────────────────────────────────────

LLM_CACHE_DB = Path(__file__).parent / "llm_cache.db"

def _init_llm_cache():
    """Initialize SQLite cache for LLM explain responses."""
    conn = sqlite3.connect(str(LLM_CACHE_DB))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS explain_cache (
            hash TEXT PRIMARY KEY,
            term TEXT,
            symbol TEXT,
            response TEXT,
            created_at REAL
        )
    """)
    conn.commit()
    conn.close()

_init_llm_cache()


def _llm_cache_get(term, symbol, value):
    """Check SQLite for a cached explanation."""
    h = hashlib.md5(f"{term}:{symbol}:{value}".encode()).hexdigest()
    try:
        conn = sqlite3.connect(str(LLM_CACHE_DB))
        row = conn.execute("SELECT response FROM explain_cache WHERE hash = ?", (h,)).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def _llm_cache_set(term, symbol, value, response):
    """Store explanation in SQLite (cached indefinitely)."""
    h = hashlib.md5(f"{term}:{symbol}:{value}".encode()).hexdigest()
    try:
        conn = sqlite3.connect(str(LLM_CACHE_DB))
        conn.execute(
            "INSERT OR REPLACE INTO explain_cache (hash, term, symbol, response, created_at) VALUES (?, ?, ?, ?, ?)",
            (h, term, symbol, response, time.time())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# ─── Phase 3a: Universal Symbol Router ──────────────────────────────────────

# Index alias mapping (Yahoo → Provider-native)
INDEX_ALIASES = {
    "^NSEI": "NIFTY",
    "^BSESN": "SENSEX",
    "^NSEBANK": "BANKNIFTY",
}

# Reverse aliases for display
INDEX_DISPLAY = {v: k for k, v in INDEX_ALIASES.items()}

# Indian exchange suffixes
_INDIAN_SUFFIX_RE = re.compile(r'^(.+)\.(NS|BO)$', re.IGNORECASE)

# Angel One equity suffix
_ANGEL_EQ_RE = re.compile(r'^(.+)-EQ$', re.IGNORECASE)

# Known Indian indices
INDIAN_INDICES = {"NIFTY", "SENSEX", "BANKNIFTY", "NIFTYIT", "NIFTYMIDCAP"}


def normalize_symbol(raw_symbol):
    """
    Normalize a user-entered symbol into the canonical form.
    Returns dict: { normalized, original, provider, asset_type }

    Rules:
      - .NS/.BO suffix → strip and append -EQ  (Angel One equity)
      - ^NSEI/^BSESN   → map to NIFTY/SENSEX   (Angel One index)
      - -EQ suffix      → Angel One equity
      - BINANCE:/OANDA: → Finnhub crypto/forex
      - Default         → yfinance global (works for everything)
    """
    sym = raw_symbol.strip().upper()
    result = {
        "original": raw_symbol,
        "normalized": sym,
        "provider": "yfinance",   # default — yfinance handles all
        "asset_type": "EQUITY",
    }

    # Check index aliases first
    if sym in INDEX_ALIASES:
        result["normalized"] = INDEX_ALIASES[sym]
        result["provider"] = "angelone"
        result["asset_type"] = "INDEX"
        return result

    # Check known Indian indices
    if sym in INDIAN_INDICES:
        result["provider"] = "angelone"
        result["asset_type"] = "INDEX"
        return result

    # .NS / .BO → Indian equity
    m = _INDIAN_SUFFIX_RE.match(sym)
    if m:
        base = m.group(1)
        result["normalized"] = f"{base}-EQ"
        result["provider"] = "angelone"
        result["asset_type"] = "EQUITY"
        return result

    # Already in Angel One -EQ format
    m = _ANGEL_EQ_RE.match(sym)
    if m:
        result["provider"] = "angelone"
        result["asset_type"] = "EQUITY"
        return result

    # Crypto (exchange prefix format)
    if ":" in sym and any(sym.startswith(p) for p in ["BINANCE", "COINBASE", "KRAKEN"]):
        result["provider"] = "finnhub"
        result["asset_type"] = "CRYPTO"
        return result

    # Forex
    if sym.startswith("OANDA:") or sym.endswith("=X"):
        result["provider"] = "finnhub"
        result["asset_type"] = "FOREX"
        return result

    # Yahoo-style crypto (e.g. BTC-USD)
    if re.match(r'^[A-Z]+-USD$', sym):
        result["asset_type"] = "CRYPTO"
        return result

    # Default: yfinance handles US equities, indices, etc.
    return result


def get_yfinance_symbol(normalized_info):
    """
    Convert normalized symbol info back to a yfinance-compatible symbol.
    Angel One -EQ symbols need to be converted to .NS for yfinance.
    """
    sym = normalized_info["normalized"]
    provider = normalized_info["provider"]
    asset_type = normalized_info["asset_type"]

    if provider == "angelone":
        if asset_type == "INDEX":
            # Reverse map: NIFTY → ^NSEI for yfinance
            reverse = {v: k for k, v in INDEX_ALIASES.items()}
            return reverse.get(sym, f"^{sym}")
        elif sym.endswith("-EQ"):
            # Convert -EQ to .NS for yfinance
            base = sym[:-3]
            return f"{base}.NS"

    return sym


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe_get(d, *keys, default=None):
    """Safely traverse nested dicts/objects."""
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, default)
        else:
            return default
    return d


def _format_large_number(n):
    """Format large numbers to human-readable (e.g. 2.45T, 156.3B)."""
    if n is None:
        return "N/A"
    try:
        n = float(n)
    except (ValueError, TypeError):
        return "N/A"
    if abs(n) >= 1e12:
        return f"{n / 1e12:.2f}T"
    if abs(n) >= 1e9:
        return f"{n / 1e9:.2f}B"
    if abs(n) >= 1e6:
        return f"{n / 1e6:.2f}M"
    if abs(n) >= 1e3:
        return f"{n / 1e3:.2f}K"
    return f"{n:.2f}"


# ─── API Endpoints ──────────────────────────────────────────────────────────

@app.route("/api/search")
def api_search():
    """
    Phase 3b: Merged Global Search Aggregator.
    Queries both Yahoo Finance and local Angel One Scrip Master.
    Query params: q (required) — the search term.
    Returns a unified, deduped, ranked list.
    """
    q = request.args.get("q", "").strip()
    if not q or len(q) < 1:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    cached = _cache_get("search", q)
    if cached:
        return jsonify(cached)

    results = []
    seen_symbols = set()

    # ── Source 1: Angel One Scrip Master (local, instant) ──
    try:
        from angelone_indexer import search_local
        angel_results = search_local(q)
        for item in angel_results:
            sym = item.get("symbol", "")
            if sym and sym not in seen_symbols:
                seen_symbols.add(sym)
                results.append({
                    "symbol": sym,
                    "name": item.get("displayName", ""),
                    "exchange": item.get("exchange", "NSE"),
                    "type": item.get("type", "EQUITY"),
                    "exchangeCode": item.get("exchange", "NSE"),
                    "provider": "angelone",
                })
    except Exception as e:
        app.logger.warning(f"Angel One local search failed: {e}")

    # ── Source 2: Yahoo Finance (remote, ~200ms) ──
    try:
        import urllib.request
        import urllib.parse
        url = (
            "https://query2.finance.yahoo.com/v1/finance/search"
            f"?q={urllib.parse.quote(q)}"
            "&quotesCount=12&newsCount=0&listsCount=0"
            "&quotesQueryId=tss_match_phrase_query"
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())

        for item in data.get("quotes", []):
            symbol = item.get("symbol", "")
            if symbol in seen_symbols:
                continue
            seen_symbols.add(symbol)
            norm = normalize_symbol(symbol)
            results.append({
                "symbol": symbol,
                "name": item.get("shortname") or item.get("longname", ""),
                "exchange": item.get("exchDisp", ""),
                "type": item.get("quoteType", ""),
                "exchangeCode": item.get("exchange", ""),
                "provider": norm["provider"],
            })
    except Exception as e:
        app.logger.warning(f"Yahoo search failed: {e}")

    response = {"query": q, "results": results[:15]}
    _cache_set("search", q, response)
    return jsonify(response)


@app.route("/api/profile")
def api_profile():
    """
    Get detailed company/asset profile.
    Query params: symbol (required) — e.g. AAPL, RELIANCE.NS, BTC-USD
    Uses Universal Symbol Router to normalize before querying yfinance.
    """
    raw_symbol = request.args.get("symbol", "").strip()
    if not raw_symbol:
        return jsonify({"error": "Missing query parameter 'symbol'"}), 400

    norm = normalize_symbol(raw_symbol)
    yf_symbol = get_yfinance_symbol(norm)
    cache_key = yf_symbol.upper()

    cached = _cache_get("profile", cache_key)
    if cached:
        return jsonify(cached)

    try:
        ticker = yf.Ticker(yf_symbol)
        info = ticker.info

        if not info or info.get("regularMarketPrice") is None:
            fast = ticker.fast_info
            price = getattr(fast, "last_price", None)
            if price is None:
                return jsonify({"error": f"No data found for symbol: {raw_symbol}"}), 404

        profile = {
            "symbol": raw_symbol.upper(),
            "normalizedSymbol": norm["normalized"],
            "provider": norm["provider"],
            "name": info.get("longName") or info.get("shortName", raw_symbol),
            "description": info.get("longBusinessSummary", ""),
            "sector": info.get("sector", "N/A"),
            "industry": info.get("industry", "N/A"),
            "website": info.get("website", ""),
            "country": info.get("country", ""),
            "city": info.get("city", ""),
            "employees": info.get("fullTimeEmployees"),
            "ceo": "",
            "currency": info.get("currency", "USD"),
            "quoteType": info.get("quoteType", "EQUITY"),
            # Price data
            "price": info.get("regularMarketPrice") or info.get("currentPrice"),
            "previousClose": info.get("regularMarketPreviousClose") or info.get("previousClose"),
            "open": info.get("regularMarketOpen") or info.get("open"),
            "dayHigh": info.get("regularMarketDayHigh") or info.get("dayHigh"),
            "dayLow": info.get("regularMarketDayLow") or info.get("dayLow"),
            "volume": info.get("regularMarketVolume") or info.get("volume"),
            "avgVolume": info.get("averageVolume"),
            # Key stats
            "marketCap": info.get("marketCap"),
            "marketCapFormatted": _format_large_number(info.get("marketCap")),
            "peRatio": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "eps": info.get("trailingEps"),
            "dividendYield": info.get("dividendYield"),
            "beta": info.get("beta"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "fiftyDayAverage": info.get("fiftyDayAverage"),
            "twoHundredDayAverage": info.get("twoHundredDayAverage"),
            # Change
            "change": None,
            "changePercent": None,
        }

        # Calculate change
        price = profile["price"]
        prev = profile["previousClose"]
        if price is not None and prev is not None and prev != 0:
            profile["change"] = round(price - prev, 4)
            profile["changePercent"] = round(((price - prev) / prev) * 100, 4)

        _cache_set("profile", cache_key, profile)
        return jsonify(profile)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/history")
def api_history():
    """
    Get historical price data for charting.
    Uses Universal Symbol Router for normalization.
    """
    raw_symbol = request.args.get("symbol", "").strip()
    rng = request.args.get("range", "1mo").strip().lower()

    if not raw_symbol:
        return jsonify({"error": "Missing query parameter 'symbol'"}), 400

    norm = normalize_symbol(raw_symbol)
    yf_symbol = get_yfinance_symbol(norm)

    range_map = {
        "1d":  {"period": "1d",  "interval": "5m"},
        "5d":  {"period": "5d",  "interval": "15m"},
        "1mo": {"period": "1mo", "interval": "1d"},
        "6mo": {"period": "6mo", "interval": "1d"},
        "ytd": {"period": "ytd", "interval": "1d"},
        "1y":  {"period": "1y",  "interval": "1wk"},
        "5y":  {"period": "5y",  "interval": "1mo"},
        "max": {"period": "max", "interval": "1mo"},
    }

    params = range_map.get(rng, range_map["1mo"])
    cache_key = f"{yf_symbol}_{rng}".upper()

    cached = _cache_get("history", cache_key)
    if cached:
        return jsonify(cached)

    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=params["period"], interval=params["interval"])

        if df.empty:
            return jsonify({"error": f"No history data for {raw_symbol}"}), 404

        data_points = []
        for idx, row in df.iterrows():
            ts = idx
            if hasattr(ts, 'timestamp'):
                unix_ts = int(ts.timestamp())
            else:
                unix_ts = int(time.mktime(ts.timetuple()))

            data_points.append({
                "time": unix_ts,
                "date": str(ts.date()) if hasattr(ts, 'date') else str(ts),
                "open": round(float(row["Open"]), 4) if row["Open"] == row["Open"] else None,
                "high": round(float(row["High"]), 4) if row["High"] == row["High"] else None,
                "low": round(float(row["Low"]), 4) if row["Low"] == row["Low"] else None,
                "close": round(float(row["Close"]), 4) if row["Close"] == row["Close"] else None,
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            })

        response = {
            "symbol": raw_symbol.upper(),
            "range": rng,
            "interval": params["interval"],
            "count": len(data_points),
            "data": data_points,
        }

        _cache_set("history", cache_key, response)
        return jsonify(response)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/news")
def api_news():
    """
    Get news articles related to a symbol.
    Uses Universal Symbol Router for normalization.
    """
    raw_symbol = request.args.get("symbol", "").strip()
    if not raw_symbol:
        return jsonify({"error": "Missing query parameter 'symbol'"}), 400

    norm = normalize_symbol(raw_symbol)
    yf_symbol = get_yfinance_symbol(norm)
    cache_key = yf_symbol.upper()

    cached = _cache_get("news", cache_key)
    if cached:
        return jsonify(cached)

    try:
        ticker = yf.Ticker(yf_symbol)
        raw_news = ticker.news

        articles = []
        for item in (raw_news or [])[:15]:
            content = item.get("content", item)

            article = {
                "title": content.get("title", ""),
                "link": "",
                "publisher": "",
                "publishedAt": content.get("pubDate", "") or content.get("displayTime", ""),
                "thumbnail": "",
                "relatedSymbols": [],
            }

            canon = content.get("canonicalUrl") or content.get("clickThroughUrl")
            if isinstance(canon, dict):
                article["link"] = canon.get("url", "")
            elif isinstance(canon, str):
                article["link"] = canon
            else:
                article["link"] = item.get("link", "")

            provider = content.get("provider")
            if isinstance(provider, dict):
                article["publisher"] = provider.get("displayName", "")
            else:
                article["publisher"] = item.get("publisher", "")

            thumb = content.get("thumbnail")
            if isinstance(thumb, dict):
                resolutions = thumb.get("resolutions", [])
                if resolutions and isinstance(resolutions, list):
                    article["thumbnail"] = resolutions[-1].get("url", "")
            elif isinstance(thumb, str):
                article["thumbnail"] = thumb

            related = item.get("relatedTickers", [])
            if isinstance(related, list):
                article["relatedSymbols"] = related

            articles.append(article)

        response = {"symbol": raw_symbol.upper(), "count": len(articles), "articles": articles}
        _cache_set("news", cache_key, response)
        return jsonify(response)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/quote")
def api_quote():
    """
    Quick live quote for a single symbol.
    Uses Universal Symbol Router for normalization.
    """
    raw_symbol = request.args.get("symbol", "").strip()
    if not raw_symbol:
        return jsonify({"error": "Missing query parameter 'symbol'"}), 400

    norm = normalize_symbol(raw_symbol)
    yf_symbol = get_yfinance_symbol(norm)

    try:
        ticker = yf.Ticker(yf_symbol)
        fast = ticker.fast_info
        price = getattr(fast, "last_price", None)
        prev = getattr(fast, "previous_close", None)

        if price is None:
            return jsonify({"error": f"No quote data for {raw_symbol}"}), 404

        change = round(price - prev, 4) if prev else 0
        change_pct = round(((price - prev) / prev) * 100, 4) if prev and prev != 0 else 0

        return jsonify({
            "symbol": raw_symbol.upper(),
            "normalizedSymbol": norm["normalized"],
            "provider": norm["provider"],
            "price": round(price, 4),
            "previousClose": round(prev, 4) if prev else None,
            "change": change,
            "changePercent": change_pct,
            "currency": getattr(fast, "currency", "USD"),
            "time": datetime.now().strftime("%H:%M:%S"),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Phase 3c: Market Intelligence Engine (Groq LLM) ────────────────────────

EXPLAIN_SYSTEM_PROMPT = """You are an expert financial educator. Explain the provided financial term to a beginner in exactly TWO short sentences. Use the provided stock symbol and current value as a real-world example. Do NOT give financial advice. Keep it strictly educational and objective."""

CHAT_SYSTEM_PROMPT = """You are a helpful educational financial assistant integrated into a desktop stock market widget. You help users understand financial concepts, market terminology, and how to read stock data.

Rules you MUST follow:
1. You MUST NOT provide financial advice, buy/sell recommendations, or price predictions.
2. You only explain financial concepts, historical facts, and what indicators mean.
3. If asked "should I buy/sell?", refuse politely and explain how to evaluate stocks instead.
4. Keep responses concise (3-5 sentences max) and beginner-friendly.
5. Use the provided stock context to make explanations relevant."""


def _call_groq(messages, max_tokens=200):
    """Call the Groq LLM API."""
    if not GROQ_API_KEY:
        return {"error": "Groq API key not configured. Add 'groq_api_key' to config.json."}

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)

        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=messages,
            temperature=0.3,
            max_tokens=max_tokens,
            top_p=0.9,
        )

        return {"response": completion.choices[0].message.content.strip()}

    except Exception as e:
        return {"error": f"LLM API error: {str(e)}"}


@app.route("/api/llm/explain")
def api_llm_explain():
    """
    Explain a financial term in context of a stock.
    Query params:
        term   (required) — e.g. "P/E Ratio", "Market Cap"
        symbol (optional) — e.g. "AAPL"
        value  (optional) — e.g. "31.35"
    Returns a 2-sentence educational explanation.
    Uses SQLite persistent cache for repeated queries.
    """
    term = request.args.get("term", "").strip()
    symbol = request.args.get("symbol", "").strip().upper() or "general"
    value = request.args.get("value", "").strip() or "N/A"

    if not term:
        return jsonify({"error": "Missing query parameter 'term'"}), 400

    # Check SQLite cache first
    cached = _llm_cache_get(term, symbol, value)
    if cached:
        return jsonify({"term": term, "symbol": symbol, "explanation": cached, "cached": True})

    # Build prompt
    user_prompt = f"Term: {term}. Symbol: {symbol}. Value: {value}"

    result = _call_groq([
        {"role": "system", "content": EXPLAIN_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ], max_tokens=120)

    if "error" in result:
        return jsonify(result), 500

    explanation = result["response"]

    # Cache indefinitely
    _llm_cache_set(term, symbol, value, explanation)

    return jsonify({
        "term": term,
        "symbol": symbol,
        "explanation": explanation,
        "cached": False,
    })


@app.route("/api/llm/chat", methods=["POST"])
def api_llm_chat():
    """
    Educational market chatbot.
    POST body (JSON):
        message  (required) — user's question
        context  (optional) — current stock context { symbol, price, peRatio, marketCap, ... }
        history  (optional) — previous messages [{ role, content }, ...]
    Returns AI educational response.
    """
    body = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()

    if not message:
        return jsonify({"error": "Missing 'message' in request body"}), 400

    # Build context-aware system prompt
    context = body.get("context", {})
    system_prompt = CHAT_SYSTEM_PROMPT

    if context:
        context_str = json.dumps(context, indent=2)
        system_prompt += f"\n\nCurrent UI Context (the stock the user is currently viewing):\n{context_str}"

    # Build messages array
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (last 6 messages max to stay within context)
    history = body.get("history", [])
    for msg in history[-6:]:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current message
    messages.append({"role": "user", "content": message})

    result = _call_groq(messages, max_tokens=300)

    if "error" in result:
        return jsonify(result), 500

    return jsonify({
        "response": result["response"],
        "context_used": bool(context),
    })


# ─── Health ──────────────────────────────────────────────────────────────────

@app.route("/api/health")
def api_health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "service": "gnome-stocks-api",
        "version": "3.0",
        "time": datetime.now().isoformat(),
        "cacheSize": len(_cache),
        "groqConfigured": bool(GROQ_API_KEY),
    })


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[gnome-stocks-api] Starting on http://localhost:5005 (Phase 3)", flush=True)
    print(f"[gnome-stocks-api] Groq API: {'configured' if GROQ_API_KEY else 'NOT configured'}", flush=True)
    app.run(host="127.0.0.1", port=5005, debug=False, threaded=True)
