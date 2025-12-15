# JSON Viewer - Windows Installation Guide

Diese Anleitung beschreibt, wie Du die JSON Viewer App auf Windows kompilierst und installierst.

## Voraussetzungen

### 1. Node.js installieren

1. Gehe zu https://nodejs.org/
2. Lade die **LTS Version** herunter
3. Führe den Installer aus und folge den Anweisungen
4. Überprüfe die Installation:
   ```powershell
   node --version
   npm --version
   ```

### 2. Rust installieren

1. Gehe zu https://rustup.rs/
2. Lade den `rustup-init.exe` Installer herunter
3. Führe den Installer aus und wähle die Standard-Installation
4. Starte PowerShell/Terminal neu
5. Überprüfe die Installation:
   ```powershell
   rustc --version
   cargo --version
   ```

### 3. Visual Studio Build Tools installieren

1. Gehe zu https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Lade "Build Tools for Visual Studio" herunter
3. Im Installer wähle: **"Desktop development with C++"**
4. Klicke auf "Installieren" (ca. 6 GB)

### 4. WebView2 (normalerweise bereits vorhanden)

Windows 10/11 hat WebView2 meist vorinstalliert. Falls nicht:
- Download: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

## Projekt bauen

### Option A: Von GitHub klonen

```powershell
git clone https://github.com/[username]/json-viewer-editor.git
cd json-viewer-editor\tauri-app
npm install
npx tauri build
```

### Option B: Ordner manuell kopieren

1. Kopiere den `tauri-app` Ordner auf den Windows-PC
2. Öffne PowerShell und navigiere zum Ordner:
   ```powershell
   cd C:\Pfad\zum\tauri-app
   npm install
   npx tauri build
   ```

## Build-Ergebnisse

Nach erfolgreichem Build findest Du die Installer unter:

```
tauri-app\src-tauri\target\release\bundle\
├── msi\
│   └── JSON Viewer_1.0.0_x64.msi        # MSI Installer
└── nsis\
    └── JSON Viewer_1.0.0_x64-setup.exe  # EXE Installer
```

### Welchen Installer verwenden?

| Installer | Empfohlen für |
|-----------|---------------|
| `.msi`    | Unternehmensumgebungen, Gruppenrichtlinien, Silent Install |
| `.exe`    | Normale Benutzer, einfache Installation |

## Installation

### EXE Installer
1. Doppelklick auf `JSON Viewer_1.0.0_x64-setup.exe`
2. Folge dem Installationsassistenten

### MSI Installer (Silent Install)
```powershell
msiexec /i "JSON Viewer_1.0.0_x64.msi" /quiet
```

## Entwicklungsmodus (zum Testen)

Um die App im Entwicklungsmodus zu starten:

```powershell
cd tauri-app
npm install
npx tauri dev
```

## Fehlerbehebung

### "cargo not found"
- Starte PowerShell/Terminal neu nach der Rust-Installation
- Oder führe aus: `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")`

### "LINK.exe not found"
- Visual Studio Build Tools sind nicht korrekt installiert
- Stelle sicher, dass "Desktop development with C++" ausgewählt ist

### Build-Fehler wegen fehlender Dependencies
```powershell
npm install
cargo update
npx tauri build
```

### WebView2 Fehler
- Installiere WebView2 manuell von Microsoft

## Funktionsumfang

Die Windows-Version hat den identischen Funktionsumfang wie macOS:

- ✅ JSON Dateien öffnen und anzeigen
- ✅ Baumansicht mit Expand/Collapse
- ✅ Flache Tabellenansicht
- ✅ Volltext-Suche
- ✅ JSON bearbeiten
- ✅ Helles & Dunkles Design
- ✅ Deutsch/Englisch Umschaltung
- ✅ Große Dateien (>100 MB) unterstützt

## Tastenkürzel (Windows)

| Aktion | Tastenkürzel |
|--------|--------------|
| Datei öffnen | `Ctrl+O` |
| Speichern | `Ctrl+S` |
| Speichern unter | `Ctrl+Shift+S` |
| Suchen | `Ctrl+F` |
| Alle erweitern | `Ctrl+E` |
| Alle reduzieren | `Ctrl+Shift+E` |
| Schließen | `Ctrl+W` |

---

*Letzte Aktualisierung: Dezember 2024*
