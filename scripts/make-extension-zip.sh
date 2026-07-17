#!/bin/bash
# Package the GNOME Shell extension into a .zip for extensions.gnome.org
set -e

EXT_DIR="gnome-stocks@harshitworkmain"
OUT_FILE="gnome-stocks@harshitworkmain.zip"

cd "$(dirname "$0")/.."

# Compile schemas
if command -v glib-compile-schemas &>/dev/null; then
  glib-compile-schemas "$EXT_DIR/schemas/"
fi

# Create zip (only include required files)
rm -f "$OUT_FILE"
cd "$EXT_DIR"
zip -r "../$OUT_FILE" \
  metadata.json \
  extension.js \
  popup.js \
  prefs.js \
  stylesheet.css \
  schemas/

cd ..
echo "✓ Packaged: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo "  Upload to: https://extensions.gnome.org/upload/"
