# JSON Viewer - Windows Installation Guide

Diese Anleitung beschreibt, wie Du die JSON Viewer App auf Windows kompilierst und installierst.

## Systemvoraussetzungen

| Komponente | Minimum | Empfohlen |
|------------|---------|-----------|
| Windows | Windows 10 (64-bit) | Windows 11 |
| RAM | 4 GB | 8 GB+ |
| Festplatte | 10 GB frei | 20 GB frei (für Build Tools) |
| CPU | x64 Prozessor | - |

## Voraussetzungen für den Build

Du benötigst folgende Software, um die App selbst zu bauen:

### 1. Node.js (JavaScript Runtime)

1. Gehe zu https://nodejs.org/
2. Lade die **LTS Version** herunter (z.B. 20.x oder 22.x)
3. Führe den Installer aus und folge den Anweisungen
4. **Wichtig:** Aktiviere die Option "Automatically install the necessary tools"
5. Überprüfe die Installation in PowerShell:
   ```powershell
   node --version    # Sollte v18+ zeigen
   npm --version     # Sollte 9+ zeigen
   ```

### 2. Rust (Programmiersprache)

1. Gehe zu https://rustup.rs/
2. Lade den `rustup-init.exe` Installer herunter
3. Führe den Installer aus:
   - Bei der Frage "Current installation options" drücke **Enter** für Standard-Installation
4. **Schließe PowerShell und öffne es neu**
5. Überprüfe die Installation:
   ```powershell
   rustc --version   # Sollte rustc 1.70+ zeigen
   cargo --version   # Sollte cargo 1.70+ zeigen
   ```

### 3. Visual Studio Build Tools (C++ Compiler)

**Dies ist der wichtigste und größte Schritt!**

1. Gehe zu https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Klicke auf "Download Build Tools"
3. Starte den heruntergeladenen `vs_BuildTools.exe`
4. Im Visual Studio Installer:
   - Wähle den Tab **"Workloads"**
   - Aktiviere **"Desktop development with C++"** ✅
   - Unter "Individual components" stelle sicher, dass ausgewählt ist:
     - "MSVC v143 - VS 2022 C++ x64/x86 build tools"
     - "Windows 11 SDK" (oder Windows 10 SDK)
5. Klicke auf **"Install"** (ca. 6-8 GB Download)
6. Warte bis die Installation abgeschlossen ist
7. **Starte den PC neu**

### 4. Git (optional, aber empfohlen)

```powershell
winget install Git.Git
```

Oder manuell von https://git-scm.com/download/win

### 5. WebView2 Runtime

Windows 10/11 hat WebView2 meist vorinstalliert. Falls beim Starten ein Fehler kommt:
- Download: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### 6. GitHub CLI (optional, für Release-Upload)

```powershell
winget install GitHub.cli
gh auth login
```

## Schnellinstallation mit winget

Falls Du winget hast (Windows 11 oder Windows 10 mit App Installer):

```powershell
# Alle Voraussetzungen auf einmal installieren
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Git.Git

# PowerShell neu starten, dann:
rustup default stable
```

## Projekt bauen

### Option A: Von GitHub klonen (empfohlen)

```powershell
git clone https://github.com/nojan01/json-viewer-editor.git
cd json-viewer-editor\tauri-app
npm install
npm run tauri build
```

### Option B: Ordner manuell kopieren

1. Kopiere den `tauri-app` Ordner auf den Windows-PC
2. Öffne PowerShell und navigiere zum Ordner:
   ```powershell
   cd C:\Pfad\zum\tauri-app
   npm install
   npm run tauri build
   ```

### Build-Dauer

Der erste Build dauert länger, da alle Rust-Dependencies kompiliert werden:
- **Erster Build:** 5-15 Minuten (je nach PC)
- **Folgende Builds:** 30-60 Sekunden

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
- ✅ Volltext-Suche mit RegEx
- ✅ **Suchen & Ersetzen** (Ctrl+H)
- ✅ JSON bearbeiten mit Undo/Redo
- ✅ CSV-Export und Suchergebnisse exportieren
- ✅ Helles & Dunkles Design
- ✅ Deutsch/Englisch Umschaltung
- ✅ Große Dateien (>100 MB) unterstützt

## Tastenkürzel (Windows)

| Aktion | Tastenkürzel |
|--------|--------------|
| Datei öffnen | `Ctrl+O` |
| Speichern | `Ctrl+S` |
| Suchen | `Ctrl+F` |
| **Suchen & Ersetzen** | `Ctrl+H` |
| **Alle ersetzen** | `Ctrl+Shift+H` |
| Nächster Treffer | `Ctrl+G` |
| Vorheriger Treffer | `Ctrl+Shift+G` |
| Alle Treffer anzeigen | `Ctrl+L` |
| Alle aufklappen | `Ctrl+E` |
| Alle zuklappen | `Ctrl+W` |
| Rückgängig | `Ctrl+Z` |
| Wiederholen | `Ctrl+Shift+Z` |
| Gehe zu Zeile | `Ctrl+Shift+L` |
| Pfad-Navigation | `Ctrl+P` |
| Hilfe | `F1` |

## Release zum GitHub hochladen

Nach erfolgreichem Build kannst Du die Installer zum GitHub Release hinzufügen:

```powershell
cd json-viewer-editor
gh release upload v1.0.0 "tauri-app\src-tauri\target\release\bundle\nsis\JSON Viewer_1.0.0_x64-setup.exe"
gh release upload v1.0.0 "tauri-app\src-tauri\target\release\bundle\msi\JSON Viewer_1.0.0_x64_en-US.msi"
```

---

*Letzte Aktualisierung: Dezember 2025*
