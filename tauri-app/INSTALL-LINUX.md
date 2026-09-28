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
sudo apt install ./JSON.Viewer_*_amd64.deb

# Falls Abhängigkeiten fehlen:
sudo apt install -f
```

### Option 3: AppImage (portable, keine Installation nötig)

```bash
# Ausführbar machen
chmod +x JSON.Viewer_*_amd64.AppImage

# Starten
./JSON.Viewer_*_amd64.AppImage
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
  - Terminal: `app` (aktueller DEB-Programmname)
  
- **Datei öffnen:** 
  - Drag & Drop einer JSON-Datei auf das App-Fenster
  - Menü: Datei → Öffnen
  - Rechtsklick auf JSON-Datei → Öffnen mit → JSON Viewer

- **Kommandozeile:**
  ```bash
  app /pfad/zur/datei.json
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

### Absturz unter XFCE mit falscher AT-SPI-Bus-Adresse

Wenn die App kurz ein Fenster zeigt und mit `Speicherzugriffsfehler` endet,
hilft ein Stacktrace bei der Unterscheidung zwischen App-, WebKit- und
Sitzungsfehlern:

```bash
gdb -q -batch -ex run -ex 'bt 20' --args /usr/bin/app
```

Steht im Stacktrace `spi_register_object_to_path` aus
`libatk-bridge-2.0.so.0` und erscheint gleichzeitig eine Meldung über
`/root/.cache/at-spi/bus_0.0`, obwohl die App als normaler Benutzer läuft,
prüfen Sie die AT-SPI-Adresse auf dem X11-Bildschirm:

```bash
xprop -root AT_SPI_BUS
```

Zeigt die Adresse auf `/root/`, entfernen Sie den falschen Eintrag für die
laufende Sitzung und starten Sie die App erneut:

```bash
xprop -root -remove AT_SPI_BUS
app
```

Bei erneutem Auftreten nach dem nächsten Login muss die Ursache in der
Sitzungs-/Display-Manager-Konfiguration behoben werden. Bei LightDM kann
`xserver-share=false` unter `[Seat:*]` in
`/etc/lightdm/lightdm.conf.d/99-at-spi-isolation.conf` verhindern, dass
der X-Server des Anmeldebildschirms samt dessen AT-SPI-Eintrag in der
Benutzersitzung weiterverwendet wird. Die Änderung gilt ab der nächsten
Anmeldung und lässt sich durch Entfernen dieser Konfigurationsdatei
rückgängig machen. `NO_AT_BRIDGE=1 app` ist nur ein Diagnosetest: Er
deaktiviert die Anbindung an Bildschirmleser für diesen App-Start.
Die [AT-SPI-Dokumentation](https://github.com/GNOME/at-spi2-core/blob/main/bus/README.md)
beschreibt die X11-Eigenschaft und den Zugänglichkeitsbus;
die [LightDM-Konfiguration](https://github.com/ubuntu/lightdm/blob/main/data/lightdm.conf)
beschreibt `xserver-share`.

### WebKit-Fehler

Falls die App nicht startet und WebKit-Fehler anzeigt:

```bash
sudo apt install --reinstall libwebkit2gtk-4.1-0
```

### Fehlende Bibliotheken

```bash
# Zeige fehlende Abhängigkeiten
ldd /usr/bin/app | grep "not found"

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
