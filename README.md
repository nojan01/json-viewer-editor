# JSON Viewer/Editor

Ein moderner JSON Viewer und Editor für macOS (und Windows), gebaut mit [Tauri](https://tauri.app/).

## Features

- 📂 **JSON-Dateien öffnen** - Per Menü, Drag & Drop oder "Öffnen mit"
- 🌳 **Baumansicht** - Hierarchische Darstellung mit auf-/zuklappbaren Knoten
- 🔍 **Volltextsuche** - Durchsuchen von Keys und Values mit RegEx-Unterstützung
- 🔄 **Suchen & Ersetzen** - Werte im gesamten Dokument finden und ersetzen (⌘H)
- ✏️ **Bearbeiten** - Werte direkt im Baum editieren mit Undo/Redo
- 💾 **Speichern** - Geänderte JSON-Dateien speichern
- 📤 **Export** - CSV-Export und Suchergebnisse exportieren
- 🌙 **Hell/Dunkel-Theme** - Automatisch oder manuell umschaltbar
- 🌍 **Mehrsprachig** - Deutsch und Englisch
- 📐 **Fenster-Position** - Größe und Position werden gespeichert

## Installation

### macOS

1. DMG-Datei herunterladen
2. `JSON Viewer.app` in den Programme-Ordner ziehen
3. App starten

### Windows

Siehe [INSTALL-WINDOWS.md](tauri-app/INSTALL-WINDOWS.md) für Build-Anleitung.

## Entwicklung

### Voraussetzungen

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Build

```bash
cd tauri-app
npm install
npm run tauri build
```

### Entwicklungsmodus

```bash
cd tauri-app
npm run tauri dev
```

## Projektstruktur

```
json-viewer-editor/
├── tauri-app/
│   ├── web/
│   │   └── index.html      # Frontend (HTML/JS/CSS)
│   ├── src-tauri/
│   │   ├── src/
│   │   │   └── lib.rs      # Rust Backend
│   │   ├── icons/          # App Icons
│   │   └── tauri.conf.json # Tauri Konfiguration
│   └── package.json
└── README.md
```

## Technologie

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **Backend:** Rust mit Tauri 2.x
- **Plugins:** tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-cli

## Lizenz

MIT License - Frei verwendbar, auch kommerziell.

Das App-Icon ist eigen erstellt und lizenzfrei.
