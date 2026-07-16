**Current Phase:** Phase 2 Complete ✅

## Overview
A comprehensive GNOME 42 (Ubuntu 22.04) stock market tracking suite consisting of two modules, delivered in phases:
1. **Top Bar Extension (Phase 1 — Complete):** Minimalist panel indicator with real-time updates, rotating ticker, interactive popup with search/pin/remove, and full settings UI.
2. **Desktop Widget (Phase 2 — Complete):** Sophisticated desktop widget inspired by Google Finance, featuring company profiles, historical interactive charts (Lightweight Charts), global search (stocks, crypto, forex, futures), and news feeds. Built with GTK3+WebKit2, powered by a local Flask API wrapping `yfinance`. Design system: Stitch MCP "Market Signal" (tonal depth, glassmorphism, editorial typography).

## Features
- **Global Data:** Finnhub (real-time US stocks, 60 req/min free tier).
- **Indian Data:** Angel One SmartAPI (true real-time Nifty, Sensex, NSE/BSE stocks via `ltpData`).
- **Currency Formatting:** `$` for USD, `₹` for INR, plain for indices (PTS). Daemon emits `currency` field per quote.
- **Ticker Rotation:** Configurable pinned + rotating symbols with anti-flicker debounce.
- **Settings UI:** `prefs.js` (GTK4 Adw) — panel position, rotation interval, display toggles, compact mode.
- **Symbol Management:** Search bar to add, ✕ to remove (works on ERR symbols too), ★/☆ to pin.
- **Synchronized State:** Python daemon → `/dev/shm/gnome-stocks.json` → `GLib.FileMonitor`.

## Tech Stack
- **Environment**: GNOME 42.9 / Ubuntu 22.04 / Wayland & X11
- **Daemon**: Python 3 (`systemd --user`), polls Finnhub + Angel One SmartAPI.
- **Python Libraries**: `smartapi-python`, `pyotp`, `logzero`, `websocket-client`.
- **Extension**: GJS (ES5), `St`, `Clutter`, `Gio.File.monitor_file()`, `PanelMenu.Button`.
- **Preferences**: GTK4 `Adw.ActionRow` + `Gtk.SpinButton`/`Gtk.Switch` (libadwaita 1.1 compat).
- **Desktop Widget (Phase 2)**: GTK3 + WebKit2 (`webkit2gtk-4.0`).

## Symbol Routing
| Symbol Format | Provider | Currency | Examples |
|---|---|---|---|
| US tickers | Finnhub | USD ($) | `AAPL`, `NVDA`, `TSLA` |
| Indian equities (`-EQ`) | Angel One | INR (₹) | `RELIANCE-EQ`, `TCS-EQ`, `SBIN-EQ` |
| Indian indices | Angel One | PTS (points) | `NIFTY`, `SENSEX`, `BANKNIFTY` |
| Legacy `.NS` / `^` format | Angel One (aliased) | INR/PTS | `RELIANCE.NS` → `RELIANCE-EQ` |
