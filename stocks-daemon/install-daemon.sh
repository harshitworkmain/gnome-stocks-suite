#!/bin/bash
set -e

DAEMON_DIR="$HOME/.local/share/gnome-stocks-daemon"
SERVICE_DIR="$HOME/.config/systemd/user"
CONFIG_DIR="$HOME/.config/gnome-stocks"

echo "Installing gnome-stocks-daemon..."

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install --user smartapi-python pyotp logzero websocket-client 2>/dev/null || \
python3 -m pip install --user smartapi-python pyotp logzero websocket-client 2>/dev/null || \
echo "⚠️  Could not auto-install deps. Run: pip3 install smartapi-python pyotp logzero websocket-client"

# Create daemon directory
mkdir -p "$DAEMON_DIR"
cp daemon.py "$DAEMON_DIR/"
chmod +x "$DAEMON_DIR/daemon.py"

# Install systemd service
mkdir -p "$SERVICE_DIR"
cp gnome-stocks-daemon.service "$SERVICE_DIR/"

# Create default config if not exists
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cp config.json.example "$CONFIG_DIR/config.json"
    echo "📝 Default config created at $CONFIG_DIR/config.json"
    echo "   Edit it to add your API keys and symbols."
fi

# Enable and start
systemctl --user daemon-reload
systemctl --user enable gnome-stocks-daemon
systemctl --user restart gnome-stocks-daemon

echo ""
echo "✅ Daemon installed and started!"
echo "   Config: $CONFIG_DIR/config.json"
echo "   Logs:   journalctl --user -u gnome-stocks-daemon -f"
