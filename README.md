# JSON Viewer/Editor

Ein moderner, leistungsstarker JSON Viewer und Editor für **macOS**, **Windows** und **Linux**, gebaut mit [Tauri 2](https://tauri.app/).

![Version](https://img.shields.io/badge/version-1.1.4-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

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

1. [DMG herunterladen](https://github.com/nojan01/json-viewer-editor/releases/latest)
2. `JSON Viewer.app` in den Programme-Ordner ziehen
3. App starten

> **Tipp:** Bei Gatekeeper-Warnung: Rechtsklick → "Öffnen" oder den enthaltenen Installer verwenden.

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
# macOS (erstellt DMG mit Installer)
bash build-dmg.sh

# Linux (installiert Abhängigkeiten & baut DEB/AppImage/RPM)
bash build-linux.sh
```

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
│   ├── build-dmg.sh            # macOS DMG Builder
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

MIT License — Frei verwendbar, auch kommerziell.

Das App-Icon ist eigen erstellt und lizenzfrei.

## Changelog

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
