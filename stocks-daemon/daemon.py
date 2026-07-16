#!/usr/bin/env python3
"""
gnome-stocks polling daemon.
Fetches stock quotes from Finnhub (global) and Angel One SmartAPI (Indian markets),
writes a unified JSON payload atomically to /dev/shm/gnome-stocks.json.
"""

import json
import os
import re
import sys
import time
import random
import urllib.request
import urllib.error
import signal
from pathlib import Path
from datetime import datetime

CONFIG_DIR = Path.home() / ".config" / "gnome-stocks"
CONFIG_FILE = CONFIG_DIR / "config.json"
OUTPUT_FILE = "/dev/shm/gnome-stocks.json"
OUTPUT_TMP = "/dev/shm/gnome-stocks.json.tmp"

DEFAULT_CONFIG = {
    "symbols": ["AAPL", "NVDA", "RELIANCE-EQ", "NIFTY", "SENSEX"],
    "refresh_interval": 60,
    "finnhub_api_key": "",
    "angelone_api_key": "",
    "angelone_client_id": "",
    "angelone_pin": "",
    "angelone_totp_secret": "",
    "debug": False
}

# ─── Symbol → Angel One mapping ─────────────────────────────────────────────
# Angel One needs exchange, tradingsymbol, and symboltoken.
# Common Indian symbols are mapped here. Users can also use the raw format
# "NSE:SYMBOL-EQ:TOKEN" to specify arbitrary symbols.
ANGELONE_SYMBOL_MAP = {
    # Equities (NSE)
    "RELIANCE-EQ":  {"exchange": "NSE", "tradingsymbol": "RELIANCE-EQ",  "symboltoken": "2885"},
    "TCS-EQ":       {"exchange": "NSE", "tradingsymbol": "TCS-EQ",       "symboltoken": "11536"},
    "INFY-EQ":      {"exchange": "NSE", "tradingsymbol": "INFY-EQ",      "symboltoken": "1594"},
    "HDFCBANK-EQ":  {"exchange": "NSE", "tradingsymbol": "HDFCBANK-EQ",  "symboltoken": "1333"},
    "ICICIBANK-EQ": {"exchange": "NSE", "tradingsymbol": "ICICIBANK-EQ", "symboltoken": "4963"},
    "SBIN-EQ":      {"exchange": "NSE", "tradingsymbol": "SBIN-EQ",      "symboltoken": "3045"},
    "WIPRO-EQ":     {"exchange": "NSE", "tradingsymbol": "WIPRO-EQ",     "symboltoken": "3787"},
    "TATAMOTORS-EQ":{"exchange": "NSE", "tradingsymbol": "TATAMOTORS-EQ","symboltoken": "3456"},
    "TATATECH-EQ":  {"exchange": "NSE", "tradingsymbol": "TATATECH-EQ",  "symboltoken": "20293"},
    "ITC-EQ":       {"exchange": "NSE", "tradingsymbol": "ITC-EQ",       "symboltoken": "1660"},
    "BAJFINANCE-EQ":{"exchange": "NSE", "tradingsymbol": "BAJFINANCE-EQ","symboltoken": "317"},
    "LT-EQ":        {"exchange": "NSE", "tradingsymbol": "LT-EQ",        "symboltoken": "11483"},
    "KOTAKBANK-EQ": {"exchange": "NSE", "tradingsymbol": "KOTAKBANK-EQ", "symboltoken": "1922"},
    "HINDUNILVR-EQ":{"exchange": "NSE", "tradingsymbol": "HINDUNILVR-EQ","symboltoken": "1394"},
    "MARUTI-EQ":    {"exchange": "NSE", "tradingsymbol": "MARUTI-EQ",    "symboltoken": "10999"},
    "SUNPHARMA-EQ": {"exchange": "NSE", "tradingsymbol": "SUNPHARMA-EQ", "symboltoken": "3351"},
    "ADANIENT-EQ":  {"exchange": "NSE", "tradingsymbol": "ADANIENT-EQ",  "symboltoken": "25"},
    # Indices
    "NIFTY":        {"exchange": "NSE", "tradingsymbol": "Nifty 50",     "symboltoken": "99926000"},
    "BANKNIFTY":    {"exchange": "NSE", "tradingsymbol": "Nifty Bank",   "symboltoken": "99926009"},
    "SENSEX":       {"exchange": "BSE", "tradingsymbol": "SENSEX",       "symboltoken": "99919000"},
    # Legacy aliases (from Phase 1a Yahoo-style symbols)
    "RELIANCE.NS":  {"exchange": "NSE", "tradingsymbol": "RELIANCE-EQ",  "symboltoken": "2885"},
    "TCS.NS":       {"exchange": "NSE", "tradingsymbol": "TCS-EQ",       "symboltoken": "11536"},
    "INFY.NS":      {"exchange": "NSE", "tradingsymbol": "INFY-EQ",      "symboltoken": "1594"},
    "^NSEI":        {"exchange": "NSE", "tradingsymbol": "Nifty 50",     "symboltoken": "99926000"},
    "^BSESN":       {"exchange": "BSE", "tradingsymbol": "SENSEX",       "symboltoken": "99919000"},
}

# --- State ---
_cache = {}
_failure_count = 0
_running = True
_config_mtime = 0
_angelone_session = None  # SmartConnect object, reused across polls


def log(msg, force=False):
    cfg = _load_config()
    if force or cfg.get("debug", False):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[gnome-stocks {ts}] {msg}", flush=True)


def _load_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                user = json.load(f)
            merged = {**DEFAULT_CONFIG, **user}
            return merged
        except Exception as e:
            log(f"Config read error: {e}", force=True)
    return dict(DEFAULT_CONFIG)


# Indices show points, not currency
_INDEX_SYMBOLS = {"NIFTY", "SENSEX", "BANKNIFTY", "^NSEI", "^BSESN"}

# ─── Phase 3a: Universal Symbol Router (Daemon Side) ────────────────────────
# Index alias mapping (Yahoo → Provider-native)
_INDEX_ALIASES = {
    "^NSEI": "NIFTY",
    "^BSESN": "SENSEX",
    "^NSEBANK": "BANKNIFTY",
}
_INDIAN_SUFFIX_RE = re.compile(r'^(.+)\.(NS|BO)$', re.IGNORECASE)


def normalize_daemon_symbol(raw_sym):
    """
    Phase 3a: Normalize a user-entered symbol into the daemon's canonical form.
    E.g., 'RELIANCE.NS' → 'RELIANCE-EQ', '^NSEI' → 'NIFTY'
    Returns the normalized symbol string.
    """
    sym = raw_sym.strip().upper()

    # Check index aliases
    if sym in _INDEX_ALIASES:
        return _INDEX_ALIASES[sym]

    # .NS/.BO → -EQ suffix (Angel One equity)
    m = _INDIAN_SUFFIX_RE.match(sym)
    if m:
        base = m.group(1)
        return f"{base}-EQ"

    return sym


def _is_angelone_symbol(sym):
    """Returns True if this symbol should be fetched via Angel One."""
    return sym in ANGELONE_SYMBOL_MAP


def _is_finnhub_symbol(sym):
    """Returns True if this symbol should be fetched via Finnhub."""
    return not _is_angelone_symbol(sym)


def _get_currency(symbol, provider):
    """Determine currency for a symbol."""
    if symbol in _INDEX_SYMBOLS:
        return "PTS"
    if provider == "finnhub":
        return "USD"
    return "INR"


# ─── Finnhub ────────────────────────────────────────────────────────────────

def _fetch_finnhub_quote(symbol, api_key):
    url = f"https://finnhub.io/api/v1/quote?symbol={urllib.request.quote(symbol)}&token={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": "gnome-stocks-daemon/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    if data and data.get("c") is not None and data["c"] != 0:
        return {
            "symbol": symbol,
            "price": data["c"],
            "change": data.get("d", 0),
            "changePercent": data.get("dp", 0),
            "high": data.get("h", 0),
            "low": data.get("l", 0),
            "open": data.get("o", 0),
            "prevClose": data.get("pc", 0),
            "time": datetime.now().strftime("%H:%M:%S"),
            "provider": "finnhub",
            "currency": _get_currency(symbol, "finnhub")
        }
    raise ValueError(f"Invalid Finnhub response for {symbol} (price=0 or missing)")


def _fetch_finnhub_batch(symbols, api_key):
    results = []
    for sym in symbols:
        try:
            results.append(_fetch_finnhub_quote(sym, api_key))
        except Exception as e:
            log(f"Finnhub error for {sym}: {e}")
            results.append({"symbol": sym, "error": True, "message": str(e), "provider": "finnhub"})
    return results


# ─── Angel One SmartAPI ─────────────────────────────────────────────────────

def _angelone_login(config):
    """Login to Angel One SmartAPI using credentials from config. Returns SmartConnect object."""
    global _angelone_session
    try:
        from SmartApi import SmartConnect
        import pyotp

        api_key = config.get("angelone_api_key", "")
        client_id = config.get("angelone_client_id", "")
        pin = config.get("angelone_pin", "")
        totp_secret = config.get("angelone_totp_secret", "")

        if not all([api_key, client_id, pin, totp_secret]):
            log("Angel One credentials incomplete, skipping.", force=True)
            return None

        totp = pyotp.TOTP(totp_secret).now()
        obj = SmartConnect(api_key=api_key)
        data = obj.generateSession(client_id, pin, totp)

        if data.get("status"):
            _angelone_session = obj
            log(f"Angel One login OK for {client_id}")
            return obj
        else:
            log(f"Angel One login failed: {data.get('message', 'unknown')}", force=True)
            return None
    except Exception as e:
        log(f"Angel One login error: {e}", force=True)
        return None


def _ensure_angelone_session(config):
    """Ensure we have a valid Angel One session, re-login if needed."""
    global _angelone_session
    if _angelone_session is not None:
        # Test if session is still valid by trying a lightweight call
        try:
            _angelone_session.ltpData("NSE", "Nifty 50", "99926000")
            return _angelone_session
        except Exception:
            log("Angel One session expired, re-logging in...", force=True)
            _angelone_session = None

    return _angelone_login(config)


def _fetch_angelone_quote(obj, symbol):
    """Fetch a single quote from Angel One SmartAPI."""
    mapping = ANGELONE_SYMBOL_MAP.get(symbol)
    if not mapping:
        return {"symbol": symbol, "error": True, "message": f"Unknown Angel One symbol: {symbol}", "provider": "angelone"}

    try:
        ltp_data = obj.ltpData(mapping["exchange"], mapping["tradingsymbol"], mapping["symboltoken"])

        if not ltp_data.get("status"):
            raise ValueError(f"API error: {ltp_data.get('message', 'unknown')}")

        d = ltp_data["data"]
        price = d.get("ltp", 0)
        close = d.get("close", 0)
        change = round(price - close, 4) if close else 0
        change_pct = round((change / close) * 100, 4) if close else 0

        return {
            "symbol": symbol,
            "price": price,
            "change": change,
            "changePercent": change_pct,
            "high": d.get("high", 0),
            "low": d.get("low", 0),
            "open": d.get("open", 0),
            "prevClose": close,
            "time": datetime.now().strftime("%H:%M:%S"),
            "provider": "angelone",
            "currency": _get_currency(symbol, "angelone")
        }
    except Exception as e:
        log(f"Angel One fetch error for {symbol}: {e}")
        return {"symbol": symbol, "error": True, "message": str(e), "provider": "angelone"}


def _fetch_angelone_batch(obj, symbols):
    """Phase 3d: Bulk fetch quotes from Angel One using getMarketData."""
    results = []

    # Group symbols by exchange for bulk request
    exchange_groups = {}
    for sym in symbols:
        mapping = ANGELONE_SYMBOL_MAP.get(sym)
        if not mapping:
            results.append({"symbol": sym, "error": True, "message": f"Unknown: {sym}", "provider": "angelone"})
            continue
        exch = mapping["exchange"]
        if exch not in exchange_groups:
            exchange_groups[exch] = []
        exchange_groups[exch].append((sym, mapping))

    # Try bulk API first (getMarketData)
    try:
        for exch, sym_mappings in exchange_groups.items():
            token_list = [{"exchange": exch, "tradingsymbol": m["tradingsymbol"], "symboltoken": m["symboltoken"]}
                          for _, m in sym_mappings]
            bulk_data = obj.getMarketData("LTP", {"exchange": exch, "tradingsymbol": ",".join(m["tradingsymbol"] for _, m in sym_mappings), "symboltoken": ",".join(m["symboltoken"] for _, m in sym_mappings)})

            if bulk_data and bulk_data.get("status"):
                fetched = bulk_data.get("data", {}).get("fetched", [])
                fetched_map = {}
                for item in fetched:
                    fetched_map[item.get("symbolToken") or item.get("symboltoken")] = item

                for sym, mapping in sym_mappings:
                    item = fetched_map.get(mapping["symboltoken"])
                    if item:
                        price = item.get("ltp", 0)
                        close = item.get("close", 0)
                        change = round(price - close, 4) if close else 0
                        change_pct = round((change / close) * 100, 4) if close else 0
                        results.append({
                            "symbol": sym,
                            "price": price,
                            "change": change,
                            "changePercent": change_pct,
                            "high": item.get("high", 0),
                            "low": item.get("low", 0),
                            "open": item.get("open", 0),
                            "prevClose": close,
                            "time": datetime.now().strftime("%H:%M:%S"),
                            "provider": "angelone",
                            "currency": _get_currency(sym, "angelone")
                        })
                    else:
                        # Fallback to individual fetch
                        results.append(_fetch_angelone_quote(obj, sym))
            else:
                raise ValueError("Bulk API returned non-OK status")

        log(f"Bulk fetched {len(results)} Angel One quotes")
        return results

    except Exception as e:
        log(f"Bulk fetch failed ({e}), falling back to individual calls")
        # Fallback: fetch individually
        results = []
        for sym in symbols:
            results.append(_fetch_angelone_quote(obj, sym))
            time.sleep(0.15)
        return results


# ─── Core polling logic ─────────────────────────────────────────────────────

def _get_backoff(base_interval, failure_count):
    if failure_count == 0:
        return base_interval
    wait = base_interval * (2 ** (failure_count - 1))
    jitter = wait * 0.1 * random.random()
    return min(int(wait + jitter), 300)


def _config_changed():
    """Check if config.json was modified since last read."""
    global _config_mtime
    try:
        mtime = os.path.getmtime(CONFIG_FILE)
        if mtime != _config_mtime:
            _config_mtime = mtime
            return True
    except OSError:
        pass
    return False


def poll_once(config):
    global _cache, _failure_count

    raw_symbols = config.get("symbols", [])
    api_key = config.get("finnhub_api_key", "")
    if not raw_symbols:
        log("No symbols configured.", force=True)
        return

    # Phase 3a: Normalize all symbols through Universal Symbol Router
    symbols = [normalize_daemon_symbol(s) for s in raw_symbols]
    # Deduplicate while preserving order
    seen = set()
    unique_symbols = []
    for s in symbols:
        if s not in seen:
            seen.add(s)
            unique_symbols.append(s)
    symbols = unique_symbols

    # Route symbols: known Indian → Angel One, everything else → Finnhub
    angelone_syms = [s for s in symbols if _is_angelone_symbol(s)]
    finnhub_syms = [s for s in symbols if _is_finnhub_symbol(s)]

    all_results = []
    had_error = False

    # Fetch global via Finnhub
    if finnhub_syms:
        if not api_key:
            log("No Finnhub API key, skipping global symbols.", force=True)
            for s in finnhub_syms:
                all_results.append({"symbol": s, "error": True, "message": "No API key"})
            had_error = True
        else:
            try:
                all_results.extend(_fetch_finnhub_batch(finnhub_syms, api_key))
            except Exception as e:
                log(f"Finnhub batch error: {e}", force=True)
                for s in finnhub_syms:
                    cached = _cache.get(s)
                    all_results.append(cached if cached else {"symbol": s, "error": True, "message": str(e)})
                had_error = True

    # Fetch Indian via Angel One SmartAPI
    if angelone_syms:
        obj = _ensure_angelone_session(config)
        if obj:
            try:
                all_results.extend(_fetch_angelone_batch(obj, angelone_syms))
            except Exception as e:
                log(f"Angel One batch error: {e}", force=True)
                for s in angelone_syms:
                    cached = _cache.get(s)
                    all_results.append(cached if cached else {"symbol": s, "error": True, "message": str(e)})
                had_error = True
        else:
            log("Angel One not available, marking Indian symbols as errors.", force=True)
            for s in angelone_syms:
                cached = _cache.get(s)
                all_results.append(cached if cached else {"symbol": s, "error": True, "message": "Angel One login failed"})
            had_error = True

    if had_error:
        _failure_count += 1
    else:
        _failure_count = 0

    # Update cache
    for r in all_results:
        if not r.get("error"):
            _cache[r["symbol"]] = r

    # Write atomically
    payload = {
        "timestamp": datetime.now().isoformat(),
        "failure_count": _failure_count,
        "quotes": all_results
    }
    try:
        with open(OUTPUT_TMP, "w") as f:
            json.dump(payload, f)
        os.rename(OUTPUT_TMP, OUTPUT_FILE)
        log(f"Wrote {len(all_results)} quotes to {OUTPUT_FILE}")
    except Exception as e:
        log(f"File write error: {e}", force=True)


def main():
    global _running, _config_mtime

    def handle_signal(signum, frame):
        global _running
        log("Received signal, shutting down...", force=True)
        _running = False

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Ensure config dir exists
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        with open(CONFIG_FILE, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        log(f"Created default config at {CONFIG_FILE}", force=True)

    # Record initial mtime
    try:
        _config_mtime = os.path.getmtime(CONFIG_FILE)
    except OSError:
        pass

    log("Daemon starting...", force=True)

    while _running:
        config = _load_config()
        poll_once(config)

        interval = max(config.get("refresh_interval", 60), 30)
        wait = _get_backoff(interval, _failure_count)
        log(f"Next poll in {wait}s (failures={_failure_count})")

        # Sleep in 2s chunks, checking for config changes every tick.
        # If config changes (user added/removed symbol), immediately re-poll.
        for _ in range(0, wait, 2):
            if not _running:
                break
            time.sleep(2)
            if _config_changed():
                log("Config changed, re-polling immediately...", force=True)
                break

    log("Daemon stopped.", force=True)
    if os.path.exists(OUTPUT_TMP):
        os.unlink(OUTPUT_TMP)


if __name__ == "__main__":
    main()
