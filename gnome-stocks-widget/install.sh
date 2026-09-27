#!/bin/bash
# Install GNOME Stocks Widget (Phase 2)
# Installs the desktop entry, app icon, and API server systemd service.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WIDGET_DIR="$SCRIPT_DIR"
DAEMON_DIR="$SCRIPT_DIR/../stocks-daemon"

echo "═══ GNOME Stocks Widget Installer ═══"

# 1. Install Python dependencies
echo "[1/5] Installing Python dependencies..."
pip3 install --user yfinance flask groq 2>/dev/null || echo "  (packages may already be installed)"

# 2. Install API server systemd service
echo "[2/5] Installing API server systemd service..."
mkdir -p ~/.config/systemd/user
cp "$DAEMON_DIR/gnome-stocks-api.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable gnome-stocks-api.service
systemctl --user restart gnome-stocks-api.service
echo "  ✔ gnome-stocks-api.service enabled & started"

# 3. Install desktop icon
echo "[3/5] Installing desktop application icon..."
mkdir -p ~/.local/share/icons/hicolor/scalable/apps/
cp "$WIDGET_DIR/io.github.harshitworkmain.GnomeStocks.svg" ~/.local/share/icons/hicolor/scalable/apps/
gtk-update-icon-cache ~/.local/share/icons/hicolor 2>/dev/null || true
echo "  ✔ Desktop application icon installed"

# 4. Install desktop entry
echo "[4/5] Installing desktop entry..."
mkdir -p ~/.local/share/applications/
cp "$WIDGET_DIR/gnome-stocks-widget.desktop" ~/.local/share/applications/io.github.harshitworkmain.GnomeStocks.desktop
sed -i "s|^Exec=.*|Exec=python3 $WIDGET_DIR/widget.py|" ~/.local/share/applications/io.github.harshitworkmain.GnomeStocks.desktop
echo "  ✔ Desktop entry installed"

# 5. Make widget executable
echo "[5/5] Making widget executable..."
chmod +x "$WIDGET_DIR/widget.py"

echo ""
echo "═══ Installation complete! ═══"
echo "  Launch: python3 $WIDGET_DIR/widget.py"
echo "  Or find 'GNOME Stocks Widget' in your application launcher"
echo ""
echo "  API server: http://localhost:5005/api/health"
echo "  To enable autostart, edit ~/.local/share/applications/io.github.harshitworkmain.GnomeStocks.desktop"
echo "  and set X-GNOME-Autostart-enabled=true, then copy to ~/.config/autostart/"

