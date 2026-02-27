# JSON Viewer - Linux Installation

## Unterstützte Distributionen

- Ubuntu 22.04+ / 24.04
- Debian 12+
- Linux Mint 21+
- Andere Debian-basierte Distributionen

## Schnellinstallation

### Option 1: Installationsskript (empfohlen)

```bash
# .deb oder .AppImage in den tauri-app Ordner legen, dann:
sudo ./install-linux.sh
```

Das Skript installiert automatisch alle Abhängigkeiten und die App.

### Option 2: .deb-Paket manuell installieren

```bash
# Abhängigkeiten installieren
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1

# App installieren
sudo dpkg -i json-viewer_1.0.0_amd64.deb

# Falls Abhängigkeiten fehlen:
sudo apt install -f
```

### Option 3: AppImage (portable, keine Installation nötig)

```bash
# Ausführbar machen
chmod +x JSON-Viewer_1.0.0_amd64.AppImage

# Starten
./JSON-Viewer_1.0.0_amd64.AppImage
```

## Selbst bauen

### Voraussetzungen

- Node.js 18+ (`node --version`)
- Rust (`rustc --version`)
- Build-Tools

### Build-Skript verwenden

```bash
cd tauri-app
chmod +x build-linux.sh
./build-linux.sh
```

Das Skript installiert alle nötigen Abhängigkeiten automatisch.

### Manueller Build

```bash
# 1. Build-Abhängigkeiten installieren
sudo apt update
sudo apt install -y \
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

# 2. Rust installieren (falls nicht vorhanden)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 3. App bauen
cd tauri-app
npm install
npm run tauri build
```

Die fertigen Pakete finden Sie unter:
- `src-tauri/target/release/bundle/deb/*.deb`
- `src-tauri/target/release/bundle/appimage/*.AppImage`

## Verwendung

- **App starten:** 
  - Über das Anwendungsmenü
  - Terminal: `json-viewer`
  
- **Datei öffnen:** 
  - Drag & Drop einer JSON-Datei auf das App-Fenster
  - Menü: Datei → Öffnen
  - Rechtsklick auf JSON-Datei → Öffnen mit → JSON Viewer

- **Kommandozeile:**
  ```bash
  json-viewer /pfad/zur/datei.json
  ```

## Deinstallation

### .deb-Paket

```bash
sudo apt remove json-viewer
```

### AppImage (mit install-linux.sh installiert)

```bash
sudo rm -rf /opt/json-viewer
sudo rm /usr/local/bin/json-viewer
sudo rm /usr/share/applications/json-viewer.desktop
```

## Fehlerbehebung

### WebKit-Fehler

Falls die App nicht startet und WebKit-Fehler anzeigt:

```bash
sudo apt install --reinstall libwebkit2gtk-4.1-0
```

### Fehlende Bibliotheken

```bash
# Zeige fehlende Abhängigkeiten
ldd /usr/bin/json-viewer | grep "not found"

# Installiere fehlende Pakete
sudo apt install -f
```

### AppImage startet nicht

```bash
# FUSE installieren (für ältere Systeme)
sudo apt install libfuse2

# Oder AppImage entpacken und direkt starten
./JSON-Viewer.AppImage --appimage-extract
./squashfs-root/AppRun
```
