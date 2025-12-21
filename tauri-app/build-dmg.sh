#!/bin/bash

# JSON Viewer - DMG Builder mit Installer
# Erstellt eine DMG mit der App und einem Installer-Skript

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$SCRIPT_DIR/src-tauri"
BUILD_DIR="$TAURI_DIR/target/release/bundle"
DMG_STAGING="$BUILD_DIR/dmg-staging"
APP_NAME="JSON Viewer"
VERSION="1.0.0"
DMG_NAME="${APP_NAME}_${VERSION}_installer.dmg"

echo "=========================================="
echo "  JSON Viewer - DMG Builder"
echo "=========================================="

# Zuerst normale Tauri-Build ausführen
echo "📦 Building Tauri app..."
npm run tauri build

# Staging-Verzeichnis erstellen
echo "📁 Preparing DMG contents..."
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"

# App kopieren
cp -R "$BUILD_DIR/macos/$APP_NAME.app" "$DMG_STAGING/"

# Installer-Skript erstellen
cat > "$DMG_STAGING/Install $APP_NAME.command" << 'EOF'
#!/bin/bash

# JSON Viewer Installer
# Doppelklicken Sie auf diese Datei, um JSON Viewer zu installieren

APP_NAME="JSON Viewer.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/Applications"

clear
echo ""
echo "=========================================="
echo "  JSON Viewer - Installer"
echo "=========================================="
echo ""

if [ ! -d "$SCRIPT_DIR/$APP_NAME" ]; then
    echo "❌ Fehler: $APP_NAME nicht gefunden."
    echo "   Bitte öffnen Sie die DMG-Datei und führen Sie"
    echo "   dieses Skript von dort aus."
    echo ""
    read -p "Drücken Sie Enter zum Beenden..."
    exit 1
fi

echo "📦 Installiere $APP_NAME nach $INSTALL_DIR..."

# Alte Version entfernen
if [ -d "$INSTALL_DIR/$APP_NAME" ]; then
    echo "🗑️  Entferne vorherige Installation..."
    rm -rf "$INSTALL_DIR/$APP_NAME" 2>/dev/null || {
        echo "⚠️  Benötige Administrator-Rechte..."
        sudo rm -rf "$INSTALL_DIR/$APP_NAME"
    }
fi

# App kopieren
cp -R "$SCRIPT_DIR/$APP_NAME" "$INSTALL_DIR/" 2>/dev/null || {
    echo "⚠️  Benötige Administrator-Rechte..."
    sudo cp -R "$SCRIPT_DIR/$APP_NAME" "$INSTALL_DIR/"
}

# Quarantäne-Attribut entfernen (das ist der wichtige Teil!)
echo "🔓 Konfiguriere Gatekeeper..."
xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || sudo xattr -cr "$INSTALL_DIR/$APP_NAME"

echo ""
echo "✅ Installation erfolgreich abgeschlossen!"
echo ""
echo "Sie können JSON Viewer jetzt verwenden:"
echo "  • Starten Sie die App aus dem Applications-Ordner"
echo "  • Rechtsklick auf JSON-Dateien → Öffnen mit → JSON Viewer"
echo ""
read -p "Drücken Sie Enter zum Beenden..."
EOF

chmod +x "$DMG_STAGING/Install $APP_NAME.command"

# Symlink zu Applications
ln -s /Applications "$DMG_STAGING/Applications"

# README erstellen
cat > "$DMG_STAGING/README.txt" << 'EOF'
JSON Viewer - Installation

Option 1 (Empfohlen):
  Doppelklicken Sie auf "Install JSON Viewer.command"
  Dies installiert die App und konfiguriert sie automatisch.

Option 2 (Manuell):
  1. Ziehen Sie "JSON Viewer.app" in den Applications-Ordner
  2. Öffnen Sie Terminal und führen Sie aus:
     xattr -cr "/Applications/JSON Viewer.app"
EOF

# DMG erstellen
echo "💿 Creating DMG..."
DMG_OUTPUT="$BUILD_DIR/dmg/$DMG_NAME"
rm -f "$DMG_OUTPUT"

hdiutil create -volname "$APP_NAME" \
    -srcfolder "$DMG_STAGING" \
    -ov -format UDZO \
    "$DMG_OUTPUT"

# Aufräumen
rm -rf "$DMG_STAGING"

echo ""
echo "✅ DMG erstellt: $DMG_OUTPUT"
echo ""
