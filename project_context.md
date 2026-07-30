**Current Phase:** Phase 4 Complete ✅

## Overview
A comprehensive GNOME 42–46 (Ubuntu/Linux) stock market tracking suite consisting of three primary modules:
1. **Top Bar Extension (Phase 1 & 4):** Minimalist panel indicator with real-time updates, rotating ticker, interactive popup with autocomplete search/pin/remove, and full settings UI (`gnome-stocks@harshitworkmain`). Packaged for extensions.gnome.org.
2. **Desktop Widget (Phase 2 & 3):** Sophisticated desktop widget inspired by Google Finance, featuring company profiles, historical interactive charts (Lightweight Charts), global search (stocks, crypto, forex, futures), news feeds, and GNOME AI educational chat. Built with GTK3+WebKit2, powered by the local/cloud Flask API.
3. **Stateless API Backend (Phase 3 & 4):** Centralized Python Flask daemon wrapping `yfinance`, Finnhub, Angel One SmartAPI, and Groq LPU (`llama-3.1-8b-instant`). Deployed live on Render (`https://gnome-stocks-api.onrender.com`) with zero cold-start keep-alive automation.

## Features
- **Global & Indian Market Data:** Finnhub + Yahoo Finance + Angel One SmartAPI (true real-time Nifty, Sensex, NSE/BSE stocks via `ltpData`).
- **Universal Symbol Router:** Aliases `.NS`/`.BO` → `-EQ`, `^NSEI` → `NIFTY`.
- **Dynamic Search Aggregator:** Merges Angel One 200k+ local indexed instruments with Yahoo Finance.
- **GNOME AI Assistant:** Groq LPU LLM proxy for instant metric explanations with SQLite caching & conversational market context.
- **Currency & Formatting:** `$` for USD, `₹` for INR, plain for indices (PTS).
- **Ticker Rotation:** Configurable pinned + rotating symbols with anti-flicker debounce.
- **Settings UI:** `prefs.js` (GTK4 Adw) — panel position, rotation interval, display toggles, compact mode.
- **Cloud & Offline Resilience:** Runs off local app shell (0ms UI cold-start) with automatic fallback between local daemon (`localhost:5005`) and remote Render server.

## Tech Stack
- **Environment**: GNOME 42–46 / Ubuntu & Fedora / Wayland & X11
- **Backend Service**: Python 3 (Flask, Gunicorn), Groq LPU API, `yfinance`, `smartapi-python`, `pyotp`. Deployed on Render Free Tier.
- **Keep-Alive & CI/CD**: GitHub Actions (14-min cron keep-alive, tag-driven release automation).
- **Extension**: GJS (ES5/ES6), `St`, `Clutter`, `Gio.File.monitor_file()`, `Soup 3.0`, `PanelMenu.Button`.
- **Preferences**: GTK4 `Adw.ActionRow` + `Gtk.SpinButton`/`Gtk.Switch`.
- **Desktop Widget**: GTK3 + WebKit2 (`webkit2gtk-4.0`), TradingView Lightweight Charts, Stitch MCP "Market Signal" design system.

## Symbol Routing
| Symbol Format | Provider | Currency | Examples |
|---|---|---|---|
| US tickers | Finnhub / Yahoo | USD ($) | `AAPL`, `NVDA`, `TSLA` |
| Indian equities (`-EQ`) | Angel One | INR (₹) | `RELIANCE-EQ`, `TCS-EQ`, `SBIN-EQ` |
| Indian indices | Angel One | PTS (points) | `NIFTY`, `SENSEX`, `BANKNIFTY` |
| Legacy `.NS` / `^` format | Angel One (aliased) | INR/PTS | `RELIANCE.NS` → `RELIANCE-EQ` |

## Live Deployment & Releases
- **Live Cloud API Endpoint:** `https://gnome-stocks-api.onrender.com`
- **GitHub Release v1.0.0:** [harshitworkmain/gnome-stocks-suite Releases](https://github.com/harshitworkmain/gnome-stocks-suite/releases/tag/v1.0.0)
