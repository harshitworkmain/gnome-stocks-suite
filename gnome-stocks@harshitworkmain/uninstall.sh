#!/bin/bash

EXT_UUID="gnome-stocks@harshitworkmain"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

echo "Disabling extension..."
gnome-extensions disable "$EXT_UUID" || true

echo "Removing extension files..."
rm -rf "$EXT_DIR"

echo ""
echo "✅ Extension uninstalled."
echo ""
echo "To also stop the daemon:"
echo "   systemctl --user stop gnome-stocks-daemon"
echo "   systemctl --user disable gnome-stocks-daemon"
