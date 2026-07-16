# GNOME Stocks Suite

A complete stock monitoring system for GNOME Desktop — featuring a top-bar extension, a desktop widget with interactive charts, and an AI-powered market intelligence engine.

## Components

| Component | Description |
|---|---|
| **stocks-daemon/** | Python polling daemon (Angel One + Finnhub) for the GNOME extension |
| **gnome-stocks@yourname/** | GNOME Shell top-bar extension with autocomplete popup |
| **gnome-stocks-widget/** | GTK3 desktop widget with charts, stats, news & AI chat |

## Quick Start

### 1. Start the API Server (Backend)

```bash
cd stocks-daemon
python3 api_server.py
```

The API server runs on `http://127.0.0.1:5005`. Verify with:

```bash
curl http://127.0.0.1:5005/api/health
```

### 2. Launch the Desktop Widget

```bash
cd gnome-stocks-widget
python3 widget.py
```

### 3. Run Both Together (One-liner)

```bash
cd /home/harshit/Documents/NN/stock-extension-widget && \
  python3 stocks-daemon/api_server.py & \
  sleep 2 && \
  python3 gnome-stocks-widget/widget.py
```

### 4. Install the GNOME Extension

```bash
cd gnome-stocks@yourname
chmod +x install.sh
./install.sh
```

Then restart GNOME Shell (`Alt+F2` → `r` → Enter) and enable "GNOME Stocks" in Extensions.

### 5. Start the Polling Daemon (Extension Backend)

```bash
cd stocks-daemon
python3 daemon.py
```

Or use the systemd service:

```bash
systemctl --user start gnome-stocks-daemon.service
```

## Dependencies

```bash
pip3 install yfinance flask groq requests smartapi-python pyotp
```

## Configuration

Edit `stocks-daemon/config.json`:

- **Angel One:** `client_id`, `password`, `api_key`, `totp_secret`
- **Finnhub:** `finnhub_api_key`
- **Groq (AI):** `groq_api_key`

See `config.json.example` for the full template.

## Keyboard Shortcuts (Widget)

| Key | Action |
|---|---|
| `F5` | Refresh data |
| `F11` | Toggle fullscreen |
| `F12` | Open DevTools |

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Server status |
| `GET /api/search?q=...` | Merged search (Angel One + Yahoo) |
| `GET /api/quote?symbol=...` | Real-time quote |
| `GET /api/profile?symbol=...` | Company profile + stats |
| `GET /api/history?symbol=...&range=1mo` | Chart data (1d–max) |
| `GET /api/news?symbol=...` | Latest news articles |
| `GET /api/llm/explain?term=...&symbol=...&value=...` | AI metric explanation |
| `POST /api/llm/chat` | Conversational AI chatbot |
