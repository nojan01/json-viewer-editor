#!/bin/bash

# JSON Viewer - macOS Installer
# Lädt die App herunter und installiert sie (ohne Gatekeeper-Problem).
#
# Verwendung - einfach in Terminal einfügen:
#   curl -fsSL https://raw.githubusercontent.com/nojan01/json-viewer-editor/main/tauri-app/install-macos.sh | bash

set -e

APP_NAME="JSON Viewer"
VERSION="1.2.0"
DMG_URL="https://github.com/nojan01/json-viewer-editor/releases/download/v${VERSION}/JSON.Viewer_${VERSION}_aarch64.dmg"
DMG_PATH="/tmp/JSON_Viewer_${VERSION}.dmg"
MOUNT_POINT="/Volumes/${APP_NAME}"
INSTALL_DIR="/Applications"

echo ""
echo "=========================================="
echo "  JSON Viewer v${VERSION} - Installer"
echo "=========================================="
echo ""

# Download
echo "⬇️  Lade JSON Viewer v${VERSION} herunter..."
curl -fSL "$DMG_URL" -o "$DMG_PATH"

# Mount
echo "📀 Mounte DMG..."
hdiutil attach "$DMG_PATH" -nobrowse -quiet

# Alte Version entfernen
if [ -d "$INSTALL_DIR/$APP_NAME.app" ]; then
    echo "🗑️  Entferne vorherige Version..."
    rm -rf "$INSTALL_DIR/$APP_NAME.app"
fi

# Kopieren
echo "📦 Installiere nach $INSTALL_DIR..."
cp -R "$MOUNT_POINT/$APP_NAME.app" "$INSTALL_DIR/"

# Quarantäne entfernen
echo "🔓 Konfiguriere Gatekeeper..."
xattr -cr "$INSTALL_DIR/$APP_NAME.app"

# Aufräumen
echo "🧹 Räume auf..."
hdiutil detach "$MOUNT_POINT" -quiet
rm -f "$DMG_PATH"

echo ""
echo "✅ JSON Viewer v${VERSION} erfolgreich installiert!"
echo "   Starte mit: open -a \"$APP_NAME\""
echo ""
