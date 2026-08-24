# JSON Viewer/Editor

Ein schneller, plattformübergreifender JSON Viewer und Editor für **macOS**, **Windows** und **Linux**. Große Dateien lassen sich durchsuchen, bearbeiten, vergleichen, als Tabelle darstellen und in verschiedene Formate exportieren.

[![Latest release](https://img.shields.io/github/v/release/nojan01/json-viewer-editor?label=Release)](https://github.com/nojan01/json-viewer-editor/releases/latest)
[![Build and Release](https://github.com/nojan01/json-viewer-editor/actions/workflows/build-release.yml/badge.svg)](https://github.com/nojan01/json-viewer-editor/actions/workflows/build-release.yml)
[![Platforms](https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-supported-4c8bf5)](#download)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Download

Die aktuellen Installationsdateien befinden sich unter [GitHub Releases](https://github.com/nojan01/json-viewer-editor/releases/latest).

| Plattform | Pakete |
|---|---|
| macOS (Apple Silicon) | Signiertes und von Apple notarisiertes DMG |
| Windows x64 / ARM64 | NSIS-Installer (`.exe`) und MSI-Paket |
| Linux x64 | AppImage, DEB und RPM |

Der Quellcode steht vollständig unter der [MIT-Lizenz](LICENSE) zur Verfügung.

## Features

### Kernfunktionen
- 📂 **JSON-Dateien öffnen** — Per Menü, Drag & Drop oder "Öffnen mit"
- 🌳 **Baumansicht** — Hierarchische Darstellung mit auf-/zuklappbaren Knoten und virtuelles Scrolling für große Dateien (>100 MB)
- ✏️ **Inline-Bearbeitung** — Werte direkt im Baum editieren mit Undo/Redo (⌘Z / ⌘⇧Z)
- 💾 **Speichern** — Geänderte JSON-Dateien speichern (⌘S)
- 🚀 **Große Dateien** — Optimiert für Dateien bis 500 MB+ (Rust-seitiges Parsen, Chunked Reading, In-Memory-Kompaktierung)

### Suche & Navigation
- 🔍 **Volltextsuche** — Keys und Values durchsuchen mit RegEx-Unterstützung
- 🔄 **Suchen & Ersetzen** — Werte im gesamten Dokument finden und ersetzen (⌘H)
- 📍 **JSONPath-Abfragen** — Gezielte Datenextraktion mit JSONPath-Syntax (⌘J)
- 🔢 **Gehe zu Zeile** — Direkt zu einer bestimmten Zeile springen (⇧⌘L)
- 🏷️ **Lesezeichen** — Wichtige Stellen markieren und schnell wiederfinden (⌘B)

### Tabellenansicht & Export
- 📊 **Tabellenansicht** — Arrays als Tabelle mit virtuellem Scrolling, automatischem Flattening verschachtelter Objekte und Spaltenfilter (⌘T)
- 📥 **Excel-Export** — Tabellenansicht direkt als .xlsx exportieren (SheetJS)
- 📤 **CSV-Export** — Daten als CSV exportieren
- 📋 **Suchergebnisse exportieren** — Gefilterte Ergebnisse separat speichern

### Analyse & Vergleich
- 📈 **Statistiken** — Übersicht über Datentypen, Tiefe, Größe und Verteilung (⌘I)
- 🔎 **Duplikate finden** — Doppelte Keys und Werte im Dokument aufspüren
- ⚖️ **Diff-Vergleich** — Zwei JSON-Dateien nebeneinander vergleichen (⌘D)
- ✅ **Schema-Validierung** — JSON-Struktur automatisch analysieren und Schema generieren

### Bearbeitung & Transformation
- 🔧 **Bulk-Operationen** — Massenänderungen an Keys und Values (Umbenennen, Löschen, Transformieren)
- 🩹 **JSON Patch** — RFC 6902 Patch-Operationen exportieren

### REST-Client
- 🌐 **REST-Client** — JSON direkt von URLs laden mit komplettem HTTP-Client
  - Methoden: GET, POST, PUT, DELETE, PATCH
  - **Authentifizierung**: Basic Auth, Bearer Token, API Key
  - Custom Headers und Request Body
  - Passwort-/Token-Felder mit Sichtbarkeits-Toggle

### Darstellung
- 🎨 **Raw-Ansicht** — Formatiertes JSON mit Syntax-Highlighting (⌘R)
- 📏 **Einrückungslinien** — Visuelle Guides für die Baumstruktur
- 🔢 **Zeilennummern** — Ein-/ausblendbar
- 🗺️ **Minimap** — Übersicht über das gesamte Dokument
- 🌙 **Hell/Dunkel-Theme** — Automatisch oder manuell umschaltbar
- 🌍 **Mehrsprachig** — Deutsch und Englisch
- 📐 **Fenster-Position** — Größe und Position werden gespeichert

## Installation

### macOS

1. Das aktuelle macOS-DMG unter [Releases](https://github.com/nojan01/json-viewer-editor/releases/latest) herunterladen.
2. DMG öffnen und **JSON Viewer** in den Ordner **Programme** ziehen.
3. JSON Viewer aus dem Programme-Ordner starten.

Das macOS-Paket ist mit einer Apple Developer ID signiert und von Apple notarisiert. Das Entfernen von Gatekeeper- oder Quarantäneattributen ist nicht erforderlich.

### Windows

1. [NSIS-Installer (.exe) oder MSI herunterladen](https://github.com/nojan01/json-viewer-editor/releases/latest)
2. Installer ausführen
3. App starten

Siehe auch [INSTALL-WINDOWS.md](tauri-app/INSTALL-WINDOWS.md) für Details.

### Linux

1. [DEB, RPM oder AppImage herunterladen](https://github.com/nojan01/json-viewer-editor/releases/latest)
2. Installieren:
   ```bash
   # Debian/Ubuntu
   sudo dpkg -i json-viewer_*.deb

   # Fedora/RHEL
   sudo rpm -i json-viewer_*.rpm

   # AppImage (keine Installation nötig)
   chmod +x JSON_Viewer_*.AppImage && ./JSON_Viewer_*.AppImage
   ```

Siehe auch [INSTALL-LINUX.md](tauri-app/INSTALL-LINUX.md) für Details.

## Tastenkürzel

| Kürzel | Funktion |
|--------|----------|
| ⌘O | Datei öffnen |
| ⌘S | Speichern |
| ⌘F | Suchen |
| ⌘H | Suchen & Ersetzen |
| ⌘Z | Rückgängig |
| ⌘⇧Z | Wiederholen |
| ⌘E | Alle aufklappen |
| ⌘W | Alle zuklappen |
| ⌘T | Tabellenansicht |
| ⌘R | Raw-Ansicht |
| ⌘J | JSONPath-Abfrage |
| ⌘D | Diff-Vergleich |
| ⌘I | Statistiken |
| ⌘B | Lesezeichen |
| ⇧⌘L | Gehe zu Zeile |
| F1 | Hilfe |
| +/- | Ebene auf-/zuklappen |

## Entwicklung

### Voraussetzungen

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/start/)

### Entwicklungsmodus

```bash
cd tauri-app
npm install
npm run dev
```

### Build

```bash
cd tauri-app
npm run build
```

Oder mit den plattformspezifischen Build-Skripten:

```bash
# macOS: Developer-ID-Signierung, Apple-Notarisierung und DMG
./release-macos.sh

# Linux (installiert Abhängigkeiten & baut DEB/AppImage/RPM)
bash build-linux.sh
```

Der macOS-Release-Befehl erwartet ein gültiges `Developer ID Application`-Zertifikat und ein mit `notarytool` gespeichertes Schlüsselbundprofil. Der Profilname kann über `NOTARYTOOL_PROFILE` überschrieben werden.

## Projektstruktur

```
json-viewer-editor/
├── tauri-app/
│   ├── web/
│   │   ├── index.html          # Frontend (HTML/JS/CSS)
│   │   └── xlsx.full.min.js    # SheetJS für Excel-Export
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── lib.rs          # Rust Backend
│   │   │   └── main.rs         # Entry Point
│   │   ├── icons/              # App Icons
│   │   └── tauri.conf.json     # Tauri Konfiguration
│   ├── release-macos.sh        # Signierter und notarisierter macOS-Release
│   ├── repackage-dmg.sh        # DMG mit angeheftetem App-Ticket erzeugen
│   ├── build-linux.sh          # Linux Build Script
│   └── package.json
├── .github/
│   └── workflows/
│       └── build-release.yml   # CI/CD für alle Plattformen
├── releases/                   # Fertige Builds
└── README.md
```

## Technologie

- **Frontend:** HTML, CSS, JavaScript (Vanilla) — Single-File Architecture
- **Backend:** Rust mit Tauri 2.x
- **Plugins:** tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-cli
- **Excel-Export:** SheetJS (xlsx)
- **CI/CD:** GitHub Actions (Windows, Linux, macOS)

## Lizenz

Dieses Projekt steht unter der [MIT License](LICENSE). Der Quellcode darf damit unter den Bedingungen der Lizenz frei verwendet, verändert und weitergegeben werden, auch kommerziell.

Das App-Icon ist eigen erstellt und lizenzfrei.

## Changelog

### v1.3.6 (August 2026)
- **Linux** — Das Menü „Fenster“ enthält nun einen funktionierenden Eintrag zum Minimieren des App-Fensters
- **macOS** — Das DMG ist mit einer Apple Developer ID signiert, von Apple notarisiert und Gatekeeper-geprüft
- **Lizenz** — Der „Über JSON Viewer“-Dialog nennt die MIT-Lizenz; Paket- und Repository-Metadaten wurden vervollständigt
- **Hilfe** — Veraltete feste Versionsnummer aus dem Hilfe-Fußtext entfernt

### v1.3.5 (Juli 2026)
- **Robustes Speichern** — Große Dateien werden atomar gespeichert und Unicode-Zeichen an Chunk-Grenzen sicher behandelt
- **REST-Client** — Abbruch, Timeout, HTTPS-Schutz für Zugangsdaten und begrenztes Streaming großer Antworten
- **macOS** — Verbesserte Dateizuordnung und Vorbereitung für signierte, notarisierten Direktvertrieb

### v1.2.0 (März 2026)
- **Responsive Skalierung** — GUI passt sich jetzt an kleine Monitore an (Toolbar-Umbruch, kompaktes Layout bei ≤800px/≤600px)
- **Flexible Mindestbreiten** — Such-/Ersetzen-Felder, Match-Liste und Goto-Dialog skalieren mit der Fenstergröße
- **Media Queries** — Button-Labels werden bei schmalen Fenstern ausgeblendet, Abstände automatisch reduziert

### v1.1.9 (März 2026)
- **Verkettete JSON-Dateien** — Unterstützt jetzt Dateien mit mehreren hintereinander stehenden JSON-Objekten (z.B. Server-Inventar-Exports mit 575+ Objekten)
- **Parse-Fehler behoben** — "trailing characters" bei großen verketteten JSON-Dateien
- **macOS Installer** — Neues curl-basiertes Install-Script (umgeht Gatekeeper-Quarantäne)

### v1.1.8 (März 2026)
- Build- und Release-Bereinigung

### v1.1.7 (März 2026)
- **Statistik-Balken Fix (Production Build)** — CSP blockierte inline style-Attribute im Tauri-Build; Styles werden jetzt per JavaScript gesetzt

### v1.1.6 (März 2026)
- **Statistik-Balken Fix** — Inline-Styles für zuverlässige Anzeige auf allen Plattformen (macOS, Windows, Linux)

### v1.1.5 (März 2026)
- **Performance: O(1) Ebene auf-/zuklappen** — Ebene+/− nutzt jetzt expandAllMode mit Tiefenlimit statt alle Pfade zu materialisieren
- **__depthSizes Vorberechnung** — Effiziente Größenberechnung pro Tiefenstufe für schnelles Scrolling
- **Stats-Balken Fix** — Absolute Positionierung für zuverlässige Anzeige unter Windows WebView2

### v1.1.4 (März 2026)
- **Große Dateien bis 500 MB+** — Rust-seitiges JSON-Parsen (serde_json) mit In-Memory-Kompaktierung, Chunked Reading (64 MB Blöcke), Raw-Byte IPC
- **Ebene+/−** — Klappt jetzt exakt eine Ebene auf/zu (vorher wurden manchmal mehrere Ebenen gleichzeitig geändert)
- **Tiefenerkennung** — Bis zu 50 Ebenen (vorher max. 5)
- **Statistik-Balken** — Werden jetzt auch unter Windows (WebView2) korrekt angezeigt
- **Windows-Stabilität** — BOM-Handling, Drag & Drop Race Condition, leere IPC-Antworten behoben
- **Plattformübergreifend** — Pfadverarbeitung für Windows-Backslashes

### v1.1.0
- Erste stabile Release mit allen Kernfunktionen
- macOS, Windows und Linux Support
