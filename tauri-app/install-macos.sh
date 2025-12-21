#!/bin/bash

# JSON Viewer - macOS Installer
# Dieses Skript installiert die App und entfernt das Quarantäne-Attribut

APP_NAME="JSON Viewer.app"
INSTALL_DIR="/Applications"

echo "=========================================="
echo "  JSON Viewer - macOS Installer"
echo "=========================================="
echo ""

# Prüfen ob die App im gleichen Verzeichnis liegt
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$SCRIPT_DIR/$APP_NAME" ]; then
    APP_SOURCE="$SCRIPT_DIR/$APP_NAME"
elif [ -d "./$APP_NAME" ]; then
    APP_SOURCE="./$APP_NAME"
else
    echo "❌ Fehler: '$APP_NAME' nicht gefunden."
    echo "   Bitte führen Sie dieses Skript im gleichen Ordner wie die App aus."
    exit 1
fi

echo "📦 Installiere $APP_NAME nach $INSTALL_DIR..."

# Alte Version entfernen falls vorhanden
if [ -d "$INSTALL_DIR/$APP_NAME" ]; then
    echo "🗑️  Entferne vorherige Installation..."
    rm -rf "$INSTALL_DIR/$APP_NAME"
fi

# App kopieren
cp -R "$APP_SOURCE" "$INSTALL_DIR/"

if [ $? -ne 0 ]; then
    echo "❌ Fehler beim Kopieren. Benötigen Sie Administrator-Rechte?"
    echo "   Versuchen Sie: sudo $0"
    exit 1
fi

# Quarantäne-Attribut entfernen
echo "🔓 Entferne Gatekeeper-Quarantäne..."
xattr -cr "$INSTALL_DIR/$APP_NAME"

echo ""
echo "✅ Installation erfolgreich!"
echo ""
echo "Sie können JSON Viewer jetzt verwenden:"
echo "  • Starten Sie die App aus dem Applications-Ordner"
echo "  • Rechtsklick auf JSON-Dateien → Öffnen mit → JSON Viewer"
echo ""
