#!/bin/bash
set -e

EXT_UUID="gnome-stocks@harshitworkmain"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

echo "Installing $EXT_UUID..."

# Create directory
mkdir -p "$EXT_DIR"

# Copy extension files
cp extension.js "$EXT_DIR/"
cp popup.js "$EXT_DIR/"
cp prefs.js "$EXT_DIR/"
cp metadata.json "$EXT_DIR/"
cp stylesheet.css "$EXT_DIR/"
cp -r schemas "$EXT_DIR/"

# Reset old GSettings (schema changed, stale keys cause errors)
echo "Resetting old settings..."
dconf reset -f /org/gnome/shell/extensions/stocks/ 2>/dev/null || true

# Compile schemas
echo "Compiling GSettings schemas..."
glib-compile-schemas "$EXT_DIR/schemas"

# Enable extension
echo "Enabling extension..."
gnome-extensions enable "$EXT_UUID" || true

echo ""
echo "✅ Extension installed!"
echo ""
echo "If you are on X11, press Alt+F2, type 'r', and press Enter to restart GNOME Shell."
echo "If you are on Wayland, please log out and log back in."
echo ""
echo "⚠️  Make sure the stocks daemon is also running:"
echo "   cd ../stocks-daemon && chmod +x install-daemon.sh && ./install-daemon.sh"
