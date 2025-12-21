# JSON Viewer/Editor

Ein moderner JSON Viewer und Editor für macOS und Windows, gebaut mit [Tauri](https://tauri.app/).

## Features

- 📂 **JSON-Dateien öffnen** - Per Menü, Drag & Drop oder "Öffnen mit"
- 🌳 **Baumansicht** - Hierarchische Darstellung mit auf-/zuklappbaren Knoten
- 🔍 **Volltextsuche** - Durchsuchen von Keys und Values mit RegEx-Unterstützung
- 🔄 **Suchen & Ersetzen** - Werte im gesamten Dokument finden und ersetzen (Strg+H / ⌘H)
- ✏️ **Bearbeiten** - Werte direkt im Baum editieren mit Undo/Redo
- 💾 **Speichern** - Geänderte JSON-Dateien speichern
- 📤 **Export** - CSV-Export und Suchergebnisse exportieren
- 🌙 **Hell/Dunkel-Theme** - Automatisch oder manuell umschaltbar
- 🌍 **Mehrsprachig** - Deutsch und Englisch
- 📐 **Fenster-Position** - Größe und Position werden gespeichert
- 🖥️ **Cross-Platform** - Läuft auf macOS und Windows

## Installation

### macOS

1. DMG-Datei herunterladen (oder selbst bauen, siehe unten)
2. `JSON Viewer.app` in den Programme-Ordner ziehen
3. App starten

### Windows

**Option 1: Installer verwenden**
1. MSI- oder NSIS-Installer herunterladen
2. Installer ausführen
3. App starten

**Option 2: Selbst bauen**

Siehe Build-Anleitung unten.

## Entwicklung

### Voraussetzungen

**Alle Plattformen:**
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)

**Windows zusätzlich:**
- [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/downloads/)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (meist bereits installiert)

**macOS zusätzlich:**
- Xcode Command Line Tools: `xcode-select --install`

### Build

```bash
cd tauri-app
npm install
npm run tauri build
```

**Build-Ausgaben:**

**macOS:**
- DMG: `src-tauri/target/release/bundle/dmg/JSON Viewer_1.0.0_aarch64.dmg`
- App: `src-tauri/target/release/bundle/macos/JSON Viewer.app`

**Windows:**
- MSI Installer: `src-tauri/target/release/bundle/msi/JSON Viewer_1.0.0_x64_en-US.msi`
- NSIS Installer: `src-tauri/target/release/bundle/nsis/JSON Viewer_1.0.0_x64-setup.exe`
- EXE: `src-tauri/target/release/app.exe`

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
│   │   │   ├── lib.rs      # Rust Backend (Cross-Platform)
│   │   │   └── main.rs     # Entry Point
│   │   ├── icons/          # App Icons
│   │   └── tauri.conf.json # Tauri Konfiguration
│   └── package.json
└── README.md
```

## Plattform-Spezifische Features

### macOS
- Native App-Menü mit "About", "Hide", etc.
- Vollbild-Modus (⌘^F)
- Window State gespeichert in: `~/Library/Application Support/com.jsonviewer.app/`

### Windows
- Standard-Menü (File, Edit, View, Window, Help)
- Window State gespeichert in: `%APPDATA%\com.jsonviewer.app\`
- MSI und NSIS Installer verfügbar

## Technologie

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **Backend:** Rust mit Tauri 2.x
- **Plugins:** tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-cli
- **Cross-Platform:** Conditional compilation für plattformspezifische Features

## Tastenkürzel

| Aktion | Windows | macOS |
|--------|---------|-------|
| Datei öffnen | Strg+O | ⌘O |
| Speichern | Strg+S | ⌘S |
| Suchen | Strg+F | ⌘F |
| Suchen & Ersetzen | Strg+H | ⌘H |
| Alle aufklappen | Strg+E | ⌘E |
| Alle zuklappen | Strg+W | ⌘W |
| Rückgängig | Strg+Z | ⌘Z |
| Wiederholen | Strg+Y / Strg+Shift+Z | ⌘⇧Z |
| Hilfe | F1 | F1 |

## Lizenz

MIT License - Frei verwendbar, auch kommerziell.

Das App-Icon ist eigen erstellt und lizenzfrei.

## Changelog

### Version 1.0.0
- ✨ Initiales Release
- 🖥️ Windows-Support hinzugefügt
- 🍎 macOS-Support
- 🔍 Volltextsuche mit RegEx
- ✏️ Inline-Editing mit Undo/Redo
- 📤 CSV-Export
