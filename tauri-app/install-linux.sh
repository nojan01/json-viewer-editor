#!/bin/bash

# JSON Viewer - Linux Installer
# Dieses Skript installiert die Abhängigkeiten und die App auf Ubuntu/Debian

set -e

APP_NAME="json-viewer"
DESKTOP_NAME="JSON Viewer"

echo "=========================================="
echo "  JSON Viewer - Linux Installer"
echo "=========================================="
echo ""

# Prüfen ob wir auf einem Debian-basierten System sind
if ! command -v apt &> /dev/null; then
    echo "❌ Dieses Skript unterstützt nur Debian/Ubuntu-basierte Systeme."
    echo "   Für andere Distributionen installieren Sie die Abhängigkeiten manuell."
    exit 1
fi

# Root-Check
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Dieses Skript benötigt Root-Rechte für die Installation."
    echo "   Starte neu mit sudo..."
    exec sudo "$0" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ============================================
# Phase 1: Abhängigkeiten installieren
# ============================================

echo "📦 Installiere System-Abhängigkeiten..."
echo ""

apt update

# Laufzeit-Abhängigkeiten
apt install -y \
    libwebkit2gtk-4.1-0 \
    libayatana-appindicator3-1 \
    librsvg2-2

echo ""
echo "✅ Abhängigkeiten installiert"
echo ""

# ============================================
# Phase 2: App installieren
# ============================================

# Suche nach .deb oder .AppImage
DEB_FILE=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.deb" -type f 2>/dev/null | head -1)
APPIMAGE_FILE=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.AppImage" -type f 2>/dev/null | head -1)

if [ -n "$DEB_FILE" ]; then
    echo "📦 Installiere .deb-Paket: $(basename "$DEB_FILE")"
    dpkg -i "$DEB_FILE" || apt install -f -y
    echo ""
    echo "✅ Installation erfolgreich!"
    echo ""
    echo "Sie können JSON Viewer jetzt verwenden:"
    echo "  • Starten Sie die App aus dem Anwendungsmenü"
    echo "  • Oder über das Terminal: json-viewer"
    echo "  • Rechtsklick auf JSON-Dateien → Öffnen mit → JSON Viewer"

elif [ -n "$APPIMAGE_FILE" ]; then
    echo "📦 Installiere AppImage: $(basename "$APPIMAGE_FILE")"
    
    INSTALL_DIR="/opt/$APP_NAME"
    BIN_LINK="/usr/local/bin/$APP_NAME"
    DESKTOP_FILE="/usr/share/applications/$APP_NAME.desktop"
    
    # Installationsverzeichnis erstellen
    mkdir -p "$INSTALL_DIR"
    
    # AppImage kopieren und ausführbar machen
    cp "$APPIMAGE_FILE" "$INSTALL_DIR/$APP_NAME.AppImage"
    chmod +x "$INSTALL_DIR/$APP_NAME.AppImage"
    
    # Symlink für Terminal-Zugriff
    ln -sf "$INSTALL_DIR/$APP_NAME.AppImage" "$BIN_LINK"
    
    # Desktop-Eintrag erstellen
    cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=$DESKTOP_NAME
Comment=JSON Viewer and Editor
Exec=$INSTALL_DIR/$APP_NAME.AppImage %F
Icon=text-x-generic
Terminal=false
Type=Application
Categories=Utility;TextEditor;Development;
MimeType=application/json;
EOF

    # Desktop-Datenbank aktualisieren
    if command -v update-desktop-database &> /dev/null; then
        update-desktop-database /usr/share/applications/
    fi

    echo ""
    echo "✅ Installation erfolgreich!"
    echo ""
    echo "Sie können JSON Viewer jetzt verwenden:"
    echo "  • Starten Sie die App aus dem Anwendungsmenü"
    echo "  • Oder über das Terminal: $APP_NAME"
    echo "  • Rechtsklick auf JSON-Dateien → Öffnen mit → JSON Viewer"

else
    echo "❌ Keine Installationsdatei gefunden (.deb oder .AppImage)"
    echo ""
    echo "Bitte bauen Sie die App zuerst oder laden Sie eine Release-Datei herunter."
    echo ""
    echo "Zum Bauen führen Sie aus:"
    echo "  cd tauri-app"
    echo "  npm install"
    echo "  npm run tauri build"
    exit 1
fi

echo ""
echo "=========================================="
echo "  Installation abgeschlossen!"
echo "=========================================="
