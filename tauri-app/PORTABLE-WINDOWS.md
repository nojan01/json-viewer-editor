# Portable Windows Version erstellen

Es gibt mehrere Möglichkeiten, eine portable Version der JSON Viewer App für Windows zu erstellen:

## Option 1: Standalone EXE verwenden (Empfohlen)

Die einfachste Methode ist, die bereits gebaute `.exe` Datei zu verwenden:

1. Build die App:
   ```bash
   npm run tauri build
   ```

2. Die portable EXE befindet sich hier:
   ```
   src-tauri/target/release/app.exe
   ```

3. Diese EXE kann direkt ausgeführt werden ohne Installation:
   - Kopieren Sie `app.exe` auf einen USB-Stick oder in einen Ordner
   - Die App speichert ihre Einstellungen in `%APPDATA%\com.jsonviewer.app\`
   - Keine Registry-Einträge, keine Installation erforderlich

## Option 2: Portable Ordner erstellen

Für eine komplett portable Version, die auch Einstellungen im App-Ordner speichert:

1. Erstellen Sie einen Ordner `JSONViewer-Portable`

2. Kopieren Sie folgende Dateien:
   ```
   JSONViewer-Portable/
   ??? app.exe                    (aus src-tauri/target/release/)
   ??? WebView2Loader.dll         (falls erforderlich)
   ??? settings/                  (wird automatisch erstellt)
   ```

3. Die EXE kann von diesem Ordner aus gestartet werden

## Option 3: ZIP-Archiv erstellen

Erstellen Sie ein ZIP-Archiv für die Verteilung:

```bash
# Nach dem Build
cd src-tauri/target/release
7z a JSONViewer-Portable-v1.0.0.zip app.exe
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

- **Für normale Benutzer**: MSI- oder NSIS-Installer verwenden
- **Für USB-Stick/Portable**: Die `app.exe` direkt verwenden
- **Für Unternehmen**: MSI-Installer (unterstützt Group Policies)

## Build-Befehle

```bash
# Standard-Build (erstellt MSI, NSIS und EXE)
npm run tauri build

# Nur Release-EXE ohne Installer
cargo build --release
```

Die portable EXE ist immer verfügbar unter:
```
tauri-app/src-tauri/target/release/app.exe
```

## Hinweise

1. Die EXE ist **ca. 8-15 MB** groß
2. Funktioniert auf **Windows 10 und 11** (x64, ARM64)
3. Benötigt **WebView2 Runtime** (meist bereits installiert)
4. Keine Installation, keine Registry-Einträge
5. Einstellungen werden in `%APPDATA%` gespeichert (kann angepasst werden)

## Dateiverknüpfungen manuell erstellen (Optional)

Um `.json` Dateien mit der portablen Version zu öffnen:

1. Rechtsklick auf eine `.json` Datei
2. "Öffnen mit" ? "Andere App auswählen"
3. "Weitere Apps" ? "Andere App auf diesem PC suchen"
4. `app.exe` auswählen
5. "Immer diese App verwenden" aktivieren
