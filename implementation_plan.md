# Phase 1b — Angel One SmartAPI Integration

## Goal
Replace Yahoo Finance with Angel One SmartAPI for **true real-time** Indian market data (Nifty, Sensex, NSE/BSE stocks). Yahoo will be fully removed.

## Changes

### [MODIFY] [stocks-daemon/daemon.py](file:///home/harshit/Documents/NN/stock-extension-widget/stocks-daemon/daemon.py)
- Remove all Yahoo Finance code ([_fetch_yahoo_single](file:///home/harshit/Documents/NN/stock-extension-widget/stocks-daemon/daemon.py#113-153), [_fetch_yahoo_batch](file:///home/harshit/Documents/NN/stock-extension-widget/stocks-daemon/daemon.py#155-168), `_url_opener`, cookie jar)
- Add Angel One auth flow: login via `smartapi-python` SDK using API key + client ID + PIN + TOTP
- Auto-generate session token on startup and refresh when expired
- Fetch Indian LTP via Angel One's `ltpData` / `getMarketData` REST endpoint
- Route: `.NS`/`.BO`/`^NSEI`/`^BSESN` → Angel One; everything else → Finnhub

### [MODIFY] `stocks-daemon/config.json`
Add new fields:
```json
{
  "angelone_api_key": "YOUR_SMARTAPI_KEY",
  "angelone_client_id": "YOUR_CLIENT_ID",
  "angelone_pin": "YOUR_4DIGIT_PIN",
  "angelone_totp_secret": "YOUR_TOTP_SECRET"
}
```

### [MODIFY] [stocks-daemon/install-daemon.sh](file:///home/harshit/Documents/NN/stock-extension-widget/stocks-daemon/install-daemon.sh)
- Add `pip install smartapi-python pyotp` to install script

### Dependencies
- `smartapi-python` (official Angel One SDK)
- `pyotp` (TOTP generation for auto-login)

## User Inputs Needed

| Input | Where to get it |
|---|---|
| **SmartAPI Key** | [smartapi.angelone.in](https://smartapi.angelone.in) → My Apps → Create App → copy API Key |
| **Client ID** | Your Angel One login ID (e.g., `S12345678`) |
| **PIN** | Your 4-digit Angel One MPIN |
| **TOTP Secret** | SmartAPI portal → Enable TOTP → scan QR with Google Authenticator → copy the secret string |

## Verification
- Run daemon → check Angel One session login succeeds
- Verify Nifty/Sensex/RELIANCE.NS prices are real-time (not 15-min delayed)
- Confirm Finnhub global symbols still work alongside
