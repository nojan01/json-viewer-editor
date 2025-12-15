#!/bin/bash

# =============================================================================
# JSON Viewer/Editor - Installationsskript
# © 2025 Norbert Jander
# =============================================================================

set -e

# Farben für Ausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_NAME="JSON Viewer"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║         ${GREEN}JSON Viewer/Editor - Installationsprogramm${BLUE}           ║${NC}"
echo -e "${BLUE}║                     © 2025 Norbert Jander                      ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Hilfsfunktionen
# =============================================================================

check_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
        exit 1
    fi
}

print_step() {
    echo ""
    echo -e "${YELLOW}▶${NC} $1"
    echo "────────────────────────────────────────────────────────────────"
}

# =============================================================================
# Schritt 1: Voraussetzungen prüfen
# =============================================================================

print_step "Prüfe Voraussetzungen..."

# macOS Version prüfen
echo -n "  macOS Version: "
MACOS_VERSION=$(sw_vers -productVersion)
echo -e "${GREEN}$MACOS_VERSION${NC}"

# Xcode Command Line Tools
echo -n "  Xcode Command Line Tools: "
if xcode-select -p &>/dev/null; then
    echo -e "${GREEN}Installiert${NC}"
else
    echo -e "${YELLOW}Nicht gefunden - wird installiert...${NC}"
    xcode-select --install
    echo "Bitte warten Sie, bis die Installation abgeschlossen ist, und führen Sie dieses Skript erneut aus."
    exit 1
fi

# Rust prüfen
echo -n "  Rust: "
if command -v rustc &>/dev/null; then
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    echo -e "${GREEN}$RUST_VERSION${NC}"
else
    echo -e "${YELLOW}Nicht gefunden - wird installiert...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    check_success "Rust installiert"
fi

# Node.js prüfen
echo -n "  Node.js: "
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}$NODE_VERSION${NC}"
else
    echo -e "${RED}Nicht gefunden${NC}"
    echo ""
    echo "  Node.js wird benötigt. Bitte installieren Sie es von:"
    echo "  https://nodejs.org/ oder mit Homebrew: brew install node"
    exit 1
fi

# npm prüfen
echo -n "  npm: "
if command -v npm &>/dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}$NPM_VERSION${NC}"
else
    echo -e "${RED}Nicht gefunden${NC}"
    exit 1
fi

# Cargo prüfen
echo -n "  Cargo: "
if command -v cargo &>/dev/null; then
    CARGO_VERSION=$(cargo --version | cut -d' ' -f2)
    echo -e "${GREEN}$CARGO_VERSION${NC}"
else
    echo -e "${RED}Nicht gefunden${NC}"
    echo "  Bitte installieren Sie Rust erneut."
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Alle Voraussetzungen erfüllt!${NC}"

# =============================================================================
# Schritt 2: Dependencies installieren
# =============================================================================

print_step "Installiere Dependencies..."

cd "$SCRIPT_DIR"

# npm dependencies
echo "  npm install..."
npm install --silent
check_success "npm Dependencies installiert"

# Rust dependencies werden automatisch beim Build geladen

# =============================================================================
# Schritt 3: App bauen
# =============================================================================

print_step "Baue die Applikation (Release-Modus)..."
echo "  Dies kann einige Minuten dauern..."
echo ""

npx tauri build

check_success "Build erfolgreich!"

# =============================================================================
# Schritt 4: App im Applications-Ordner installieren
# =============================================================================

print_step "Installation..."

# Pfad zur gebauten App
APP_PATH="$SCRIPT_DIR/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DMG_PATH="$SCRIPT_DIR/src-tauri/target/release/bundle/dmg"

if [ -d "$APP_PATH" ]; then
    echo "  Gefundene App: $APP_PATH"
    echo ""
    
    # Fragen ob installiert werden soll
    echo -e "${YELLOW}Möchten Sie die App im Applications-Ordner installieren? (j/n)${NC}"
    read -r INSTALL_CHOICE
    
    if [ "$INSTALL_CHOICE" = "j" ] || [ "$INSTALL_CHOICE" = "J" ] || [ "$INSTALL_CHOICE" = "y" ] || [ "$INSTALL_CHOICE" = "Y" ]; then
        # Alte Version entfernen falls vorhanden
        if [ -d "/Applications/${APP_NAME}.app" ]; then
            echo "  Entferne alte Version..."
            rm -rf "/Applications/${APP_NAME}.app"
        fi
        
        # App kopieren
        echo "  Kopiere App nach /Applications..."
        cp -R "$APP_PATH" "/Applications/"
        check_success "App erfolgreich installiert!"
        
        # Quarantine-Attribut entfernen (für nicht-signierte Apps)
        echo "  Entferne Quarantine-Attribut..."
        xattr -rd com.apple.quarantine "/Applications/${APP_NAME}.app" 2>/dev/null || true
        
        echo ""
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}✓ Installation abgeschlossen!${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "  Die App wurde installiert unter:"
        echo -e "  ${BLUE}/Applications/${APP_NAME}.app${NC}"
        echo ""
        echo -e "  ${YELLOW}Möchten Sie die App jetzt starten? (j/n)${NC}"
        read -r START_CHOICE
        
        if [ "$START_CHOICE" = "j" ] || [ "$START_CHOICE" = "J" ] || [ "$START_CHOICE" = "y" ] || [ "$START_CHOICE" = "Y" ]; then
            open "/Applications/${APP_NAME}.app"
        fi
    else
        echo "  Installation übersprungen."
    fi
else
    echo -e "${RED}  App-Bundle nicht gefunden!${NC}"
    echo "  Erwarteter Pfad: $APP_PATH"
fi

# =============================================================================
# DMG Info
# =============================================================================

echo ""
print_step "Erstellte Dateien:"

echo "  App-Bundle:"
if [ -d "$APP_PATH" ]; then
    APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
    echo -e "    ${GREEN}✓${NC} $APP_PATH ($APP_SIZE)"
fi

echo ""
echo "  DMG-Installer:"
if [ -d "$DMG_PATH" ]; then
    for dmg in "$DMG_PATH"/*.dmg; do
        if [ -f "$dmg" ]; then
            DMG_SIZE=$(du -sh "$dmg" | cut -f1)
            echo -e "    ${GREEN}✓${NC} $dmg ($DMG_SIZE)"
        fi
    done
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo "  Tipp: Die DMG-Datei kann an andere Benutzer weitergegeben werden."
echo "  Sie enthält einen Installer mit Drag & Drop Funktionalität."
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
