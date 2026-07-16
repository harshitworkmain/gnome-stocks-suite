# Dual-Module Stocks Suite for GNOME

A stock market tracking suite for Ubuntu 22.04 (GNOME 42), delivered in phases.

## Architecture

```
┌──────────────────────────────────────────────┐
│        Python Polling Daemon                 │
│  Finnhub (global) + Angel One SmartAPI (Ind) │
│  systemd --user service                      │
└─────────────────┬────────────────────────────┘
                  │ atomic write every 60s
                  ▼
       /dev/shm/gnome-stocks.json
         (includes currency field per quote)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   GNOME Shell         GTK3 Desktop
   Extension           Widget (Phase 2)
   (FileMonitor)
```

## Quick Start

### 1. Install Dependencies & Daemon
```bash
sudo apt install python3-pip
pip3 install smartapi-python pyotp logzero websocket-client
cd stocks-daemon
chmod +x install-daemon.sh
./install-daemon.sh
```
Then edit `~/.config/gnome-stocks/config.json` and set your credentials.

### 2. Install the Extension
```bash
cd gnome-stocks@yourname
chmod +x install.sh
./install.sh
```
**X11:** `Alt+F2` → type `r` → Enter.  **Wayland:** Log out / back in.

### 3. Configure Settings
Open Extension Manager → Minimalist Stocks → Settings, or:
```bash
gnome-extensions prefs gnome-stocks@yourname
```

## Configuration

### Daemon Config (`~/.config/gnome-stocks/config.json`):
```json
{
  "symbols": ["AAPL", "NVDA", "RELIANCE-EQ", "NIFTY", "SENSEX"],
  "refresh_interval": 60,
  "finnhub_api_key": "your-key-here",
  "angelone_api_key": "YOUR_SMARTAPI_KEY",
  "angelone_client_id": "YOUR_CLIENT_ID",
  "angelone_pin": "YOUR_4DIGIT_PIN",
  "angelone_totp_secret": "YOUR_TOTP_SECRET",
  "debug": false
}
```

### Extension Settings (via GSettings / prefs.js):
| Setting | Default | Description |
|---|---|---|
| Panel Position | right | left / center / right |
| Max Visible Items | 3 | Tickers shown at once (1–5) |
| Enable Rotation | true | Cycle through extra symbols |
| Rotation Interval | 4s | Seconds between rotation |
| Show Currency | true | Prefix $, ₹, or plain for indices |
| Show % Change | true | Display percentage arrows |
| Show Time | true | Show last update time in popup |
| Compact Mode | false | Smaller font in panel |

### Symbol Formats
| Market | Symbol Examples | Currency |
|---|---|---|
| US | `AAPL`, `NVDA`, `TSLA` (Finnhub) | $ |
| India | `RELIANCE-EQ`, `TCS-EQ` (Angel One) | ₹ |
| Indices | `NIFTY`, `SENSEX` (Angel One) | points |

## Debugging
```bash
# Daemon logs
journalctl --user -u gnome-stocks-daemon -f

# Extension logs
journalctl -f /usr/bin/gnome-shell | grep gnome-stocks
```

## Uninstall
```bash
cd gnome-stocks@yourname && chmod +x uninstall.sh && ./uninstall.sh
systemctl --user stop gnome-stocks-daemon
systemctl --user disable gnome-stocks-daemon
```

## Phases
- **Phase 1a:** Finnhub + Yahoo fallback ✅
- **Phase 1b:** Angel One SmartAPI for real-time Indian data ✅
- **Phase 1c:** Bug fixes, settings system, ticker rotation, UX polish ✅
- **Phase 2:** Desktop widget (GTK3 + WebKit2) — planned
