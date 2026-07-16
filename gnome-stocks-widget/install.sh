#!/bin/bash
# Install GNOME Stocks Widget (Phase 2)
# Installs the desktop entry and API server systemd service.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WIDGET_DIR="$SCRIPT_DIR"
DAEMON_DIR="$SCRIPT_DIR/../stocks-daemon"

echo "═══ GNOME Stocks Widget Installer ═══"

# 1. Install Python dependencies
echo "[1/4] Installing Python dependencies..."
pip3 install --user yfinance flask groq 2>/dev/null || echo "  (packages may already be installed)"

# 2. Install API server systemd service
echo "[2/4] Installing API server systemd service..."
mkdir -p ~/.config/systemd/user
cp "$DAEMON_DIR/gnome-stocks-api.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable gnome-stocks-api.service
systemctl --user restart gnome-stocks-api.service
echo "  ✔ gnome-stocks-api.service enabled & started"

# 3. Install desktop entry
echo "[3/4] Installing desktop entry..."
cp "$WIDGET_DIR/gnome-stocks-widget.desktop" ~/.local/share/applications/ 2>/dev/null || true
echo "  ✔ Desktop entry installed"

# 4. Make widget executable
echo "[4/4] Making widget executable..."
chmod +x "$WIDGET_DIR/widget.py"

echo ""
echo "═══ Installation complete! ═══"
echo "  Launch: python3 $WIDGET_DIR/widget.py"
echo "  Or find 'GNOME Stocks Widget' in your app menu"
echo ""
echo "  API server: http://localhost:5005/api/health"
echo "  To enable autostart, edit ~/.local/share/applications/gnome-stocks-widget.desktop"
echo "  and set X-GNOME-Autostart-enabled=true, then copy to ~/.config/autostart/"
