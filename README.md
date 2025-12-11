# JSONViewerEditor (SwiftUI, macOS)

Ziele:
- Große JSON-Dateien (>100 MB) laden, anzeigen und bearbeiten.
- Baumansicht + Flatten-Ansicht, Volltextsuche, Editieren von Werten.
- Markierte Inhalte als PDF exportieren.
- Installer-Paket bereitstellen.

Aktueller Stand (Gerüst):
- SwiftPM-basiertes SwiftUI-macOS-App-Gerüst (macOS 13+).
- Einfacher JSON-Loader (Open Panel), Baumdarstellung, rudimentäre Suche und Preview-Daten.

Nächste Schritte (geplant):
- Streaming-Parser für große Dateien (line-basiert / JSONDecoder mit InputStream) und inkrementelles Laden.
- Flatten-Ansicht + Editier-UI mit Typ-Editor (String/Number/Bool/Null).
- PDF-Export für Auswahl.
- Installer (pkg) bauen.
- Performance-Optimierungen (Virtualized List, Lazy Trees, Hintergrund-Parsing).

Build & Run (SwiftPM):
```bash
cd json-viewer-editor
swift build
swift run
```

Öffnen in Xcode:
```bash
open Package.swift
```

Lizenz: TBD
