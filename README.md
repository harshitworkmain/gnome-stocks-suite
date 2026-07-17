# GNOME Stocks Suite

A complete stock monitoring system for GNOME Desktop — featuring a top-bar extension, a desktop widget with interactive charts, and an AI-powered market intelligence engine.

## Components

| Component | Description |
|---|---|
| **stocks-daemon/** | Python Flask API server + polling daemon (Angel One + Finnhub + Groq AI) |
| **gnome-stocks@harshitworkmain/** | GNOME Shell top-bar extension with autocomplete popup |
| **gnome-stocks-widget/** | GTK3 desktop widget with charts, stats, news & AI chat |

## Quick Start (Local)

### 1. Install Dependencies

```bash
pip3 install -r requirements.txt
```

### 2. Configure

```bash
cp stocks-daemon/config.json.example stocks-daemon/config.json
# Edit config.json with your API keys (Groq, Finnhub, Angel One)
```

### 3. Start the API Server

```bash
cd stocks-daemon && python3 api_server.py
```

Verify: `curl http://127.0.0.1:5005/api/health`

### 4. Launch the Desktop Widget

```bash
python3 gnome-stocks-widget/widget.py
```

### 5. Install the GNOME Extension

```bash
cd gnome-stocks@harshitworkmain && chmod +x install.sh && ./install.sh
```

Then restart GNOME Shell (`Alt+F2` → `r` → Enter) and enable "GNOME Stocks" in Extensions.

---

## Cloud Deployment (Render)

The API server can be deployed to [Render](https://render.com) for remote access:

1. **Connect repo** → Link this GitHub repo on Render dashboard
2. **Blueprint deploy** → Render auto-detects `render.yaml` and sets up the service
3. **Set secrets** → Add `GROQ_API_KEY` in the Render environment variables panel
4. **Update clients** → Set your Render URL in the widget/extension config:
   - **Widget:** `localStorage.setItem('apiUrl', 'https://your-app.onrender.com')`
   - **Extension:** Add `"api_url": "https://your-app.onrender.com"` to `~/.config/gnome-stocks/config.json`

### Keep-Alive (No Cold Starts)

A GitHub Actions cron (`.github/workflows/keep-alive.yml`) pings the health endpoint every 14 minutes to prevent Render from sleeping. Add your deployed URL as a GitHub secret named `RENDER_API_URL`.

---

## Distribution

### GNOME Extension Store

```bash
bash scripts/make-extension-zip.sh
# Upload gnome-stocks@harshitworkmain.zip to https://extensions.gnome.org/upload/
```

### Flatpak / Flathub

A Flatpak manifest (`io.github.harshitworkmain.GnomeStocks.yml`) is included for Flathub submission.

### GitHub Releases

Push a version tag to auto-create a release with packaged artifacts:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## Configuration

Edit `stocks-daemon/config.json`:

| Key | Description |
|---|---|
| `groq_api_key` | Groq API key for AI features |
| `finnhub_api_key` | Finnhub key for global market data |
| `angelone_*` | Angel One SmartAPI credentials for Indian markets |
| `api_url` | Remote API URL (default: `http://127.0.0.1:5005`) |

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

## License

MIT
