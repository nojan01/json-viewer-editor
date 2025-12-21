# Portable Windows Version erstellen

Es gibt mehrere Möglichkeiten, eine portable Version der JSON Viewer App für Windows zu erstellen:

## Option 1: Standalone EXE verwenden (Empfohlen)

Die einfachste Methode ist, die bereits gebaute `.exe` Datei zu verwenden:

1. Build die App für **x64** (normale Windows-PCs):
   ```bash
   npm run tauri build -- --target x86_64-pc-windows-msvc
   ```

2. Die portable EXE befindet sich hier:
   ```
   src-tauri/target/x86_64-pc-windows-msvc/release/app.exe
   ```

3. Diese EXE kann direkt ausgeführt werden ohne Installation:
   - Kopieren Sie `app.exe` auf einen USB-Stick oder in einen Ordner
   - Die App speichert ihre Einstellungen in `%APPDATA%\com.jsonviewer.app\`
   - Keine Registry-Einträge, keine Installation erforderlich

## Wichtig: x64 vs ARM64

?? **Achten Sie auf die richtige Architektur:**

| Target | Für welche PCs? | Anteil |
|--------|----------------|--------|
| **x86_64-pc-windows-msvc** | Normale Windows-PCs (Intel/AMD) | ~99% |
| aarch64-pc-windows-msvc | Windows on ARM (Surface Pro X, etc.) | ~1% |

### Beide Versionen bauen:

```bash
# Für normale PCs (empfohlen)
npm run tauri build -- --target x86_64-pc-windows-msvc

# Für ARM-PCs (optional)
npm run tauri build -- --target aarch64-pc-windows-msvc
```

**Hinweis:** Wenn Sie `npm run tauri build` ohne `--target` ausführen, wird für Ihre aktuelle Systemarchitektur gebaut.

## Option 2: Portable Ordner erstellen

Für eine komplett portable Version, die auch Einstellungen im App-Ordner speichert:

1. Erstellen Sie einen Ordner `JSONViewer-Portable`

2. Kopieren Sie folgende Dateien:
   ```
   JSONViewer-Portable/
   ??? app.exe                    (aus target/x86_64-pc-windows-msvc/release/)
   ??? WebView2Loader.dll         (falls erforderlich)
   ??? settings/                  (wird automatisch erstellt)
   ```

3. Die EXE kann von diesem Ordner aus gestartet werden

## Option 3: ZIP-Archiv erstellen

Erstellen Sie ein ZIP-Archiv für die Verteilung:

```bash
# Nach dem Build für x64
cd src-tauri/target/x86_64-pc-windows-msvc/release
7z a JSONViewer-Portable-v1.0.0-x64.zip app.exe
```

Für ARM64 (optional):
```bash
cd src-tauri/target/aarch64-pc-windows-msvc/release
7z a JSONViewer-Portable-v1.0.0-arm64.zip app.exe
```

Benutzer können dann:
1. ZIP entpacken
2. `app.exe` direkt starten
3. Keine Admin-Rechte erforderlich

## WebView2 Runtime

Die App benötigt Microsoft Edge WebView2, das auf den meisten Windows 10/11 Systemen bereits installiert ist.

Falls nicht vorhanden:
- **Online-Installation**: Wird beim ersten Start automatisch heruntergeladen
- **Offline-Installation**: [WebView2 Runtime herunterladen](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section)

## Unterschiede zwischen Installer und Portable

| Feature | Installer (MSI/NSIS) | Portable (EXE) |
|---------|---------------------|----------------|
| Installation erforderlich | Ja | Nein |
| Admin-Rechte | Ja | Nein |
| Startmenü-Eintrag | Ja | Nein |
| Dateiverknüpfungen (.json) | Ja | Nein (manuell möglich) |
| Auto-Update | Möglich | Nein |
| Portable | Nein | Ja |
| USB-Stick tauglich | Nein | Ja |

## Empfehlung

- **Für normale Benutzer**: MSI- oder NSIS-Installer verwenden (x64)
- **Für USB-Stick/Portable**: Die `app.exe` direkt verwenden (x64)
- **Für Unternehmen**: MSI-Installer (unterstützt Group Policies)
- **Für ARM-PCs**: ARM64-Version bauen und verwenden

## Build-Befehle

```bash
# Standard-Build für x64 (erstellt MSI, NSIS und EXE)
npm run tauri build -- --target x86_64-pc-windows-msvc

# Nur Release-EXE ohne Installer (x64)
cargo build --release --target x86_64-pc-windows-msvc

# ARM64-Version (optional)
npm run tauri build -- --target aarch64-pc-windows-msvc
```

## Verzeichnisstruktur nach Build

Nach dem Build für x64:
```
tauri-app/src-tauri/target/
??? x86_64-pc-windows-msvc/
    ??? release/
        ??? app.exe                                    ? Portable EXE
        ??? bundle/
            ??? msi/
            ?   ??? JSON Viewer_1.0.0_x64_en-US.msi   ? MSI Installer
            ??? nsis/
                ??? JSON Viewer_1.0.0_x64-setup.exe   ? NSIS Installer
```

## Hinweise

1. Die x64-EXE ist **ca. 8-15 MB** groß
2. Funktioniert auf **Windows 10 und 11** (x64)
3. Benötigt **WebView2 Runtime** (meist bereits installiert)
4. Keine Installation, keine Registry-Einträge
5. Einstellungen werden in `%APPDATA%` gespeichert (kann angepasst werden)

## Rust Toolchain Setup

Falls Sie die x64-Toolchain noch nicht installiert haben:

```bash
# x64-Target hinzufügen
rustup target add x86_64-pc-windows-msvc

# ARM64-Target hinzufügen (optional)
rustup target add aarch64-pc-windows-msvc

# Installierte Targets anzeigen
rustup target list --installed
```

## Dateiverknüpfungen manuell erstellen (Optional)

Um `.json` Dateien mit der portablen Version zu öffnen:

1. Rechtsklick auf eine `.json` Datei
2. "Öffnen mit" ? "Andere App auswählen"
3. "Weitere Apps" ? "Andere App auf diesem PC suchen"
4. `app.exe` auswählen
5. "Immer diese App verwenden" aktivieren

## Testen der portablen Version

```bash
# Direkt starten
.\src-tauri\target\x86_64-pc-windows-msvc\release\app.exe

# Mit JSON-Datei öffnen
.\src-tauri\target\x86_64-pc-windows-msvc\release\app.exe test.json
