#!/bin/bash

# JSON Viewer - Linux Build Script
# Installiert Build-Abhängigkeiten und baut die App

set -e

echo "=========================================="
echo "  JSON Viewer - Linux Build"
echo "=========================================="
echo ""

# Prüfen ob wir auf einem Debian-basierten System sind
if ! command -v apt &> /dev/null; then
    echo "❌ Dieses Skript unterstützt nur Debian/Ubuntu-basierte Systeme."
    exit 1
fi

# ============================================
# Phase 1: Build-Abhängigkeiten
# ============================================

echo "📦 Prüfe und installiere Build-Abhängigkeiten..."

# Prüfen ob sudo benötigt wird
SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
fi

$SUDO apt update
$SUDO apt install -y \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    pkg-config

echo ""
echo "✅ Build-Abhängigkeiten installiert"
echo ""

# ============================================
# Phase 2: Rust installieren (falls nicht vorhanden)
# ============================================

if ! command -v rustc &> /dev/null; then
    echo "🦀 Rust nicht gefunden. Installiere Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "✅ Rust ist bereits installiert: $(rustc --version)"
fi

# ============================================
# Phase 3: Node.js prüfen
# ============================================

if ! command -v node &> /dev/null; then
    echo "❌ Node.js nicht gefunden."
    echo "   Bitte installieren Sie Node.js (v18+):"
    echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "   sudo apt install -y nodejs"
    exit 1
else
    echo "✅ Node.js ist installiert: $(node --version)"
fi

# ============================================
# Phase 4: App bauen
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "📦 Installiere npm-Pakete..."
npm install

echo ""
echo "🔨 Baue die App..."
npm run tauri build

echo ""
echo "=========================================="
echo "  Build erfolgreich!"
echo "=========================================="
echo ""
echo "Die fertigen Pakete finden Sie unter:"
echo "  src-tauri/target/release/bundle/"
echo ""
echo "Verfügbare Formate:"

BUNDLE_DIR="$SCRIPT_DIR/src-tauri/target/release/bundle"

if [ -d "$BUNDLE_DIR/deb" ]; then
    echo "  📦 DEB: $(ls "$BUNDLE_DIR/deb/"*.deb 2>/dev/null | head -1)"
fi

if [ -d "$BUNDLE_DIR/appimage" ]; then
    echo "  📦 AppImage: $(ls "$BUNDLE_DIR/appimage/"*.AppImage 2>/dev/null | head -1)"
fi

if [ -d "$BUNDLE_DIR/rpm" ]; then
    echo "  📦 RPM: $(ls "$BUNDLE_DIR/rpm/"*.rpm 2>/dev/null | head -1)"
fi

echo ""
echo "Zur Installation führen Sie aus:"
echo "  sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb"
echo ""
echo "Oder nutzen Sie das Installationsskript:"
echo "  sudo ./install-linux.sh"
