# JSONViewerEditor (SwiftUI, macOS)

Ziele:
- Große JSON-Dateien (>100 MB) laden, anzeigen und bearbeiten.
- Baumansicht + Flatten-Ansicht, Volltextsuche, Editieren von Werten.
- Markierte Inhalte als PDF exportieren.LRLRRRhsajhfjhdsafhAJDSHlrkshdghslhfslfjsadhfjhadshfjahsdjfhjkasfhjahdsgdasgadsddddd
- Installer-Paket bereitstellen.

Aktueller Stand (Gerüst):
- SwiftPM-basiertes SwiftUI-macOS-App-Gerüst (macOS 13+).
- JSON-Loader via `NSOpenPanel`, Baum- und Flat-Ansicht, Volltextsuche (gefiltert), einfache Wert-Editierung (String/Zahl/Bool/Null) und Markieren mit PDF-Export.

Nächste Schritte (geplant):
- Streaming-Parser für große Dateien (line-basiert / JSONDecoder mit InputStream) und inkrementelles Laden.
- Erweiterter Streaming-Parser / Speicher-optimierte Struktur für sehr große Dateien (>500 MB).
- Installer (pkg) bauen.
- Performance-Optimierungen (Virtualized List, Lazy Trees, Hintergrund-Parsing).

## Nutzung (aktuell)

1) App starten (`swift run` oder Xcode).  
2) In der Toolbar auf „Datei öffnen“ klicken und eine JSON-Datei wählen (InputStream-basiert).  
3) Zwischen Baum- und Flat-Ansicht per Segmented Control wechseln.  
4) Mit der Suchleiste filtern (Volltext in Key + Value).  
5) In der Detail-Ansicht primitive Werte (String/Zahl/Bool/Null) bearbeiten und speichern.  
6) Knoten markieren und per Toolbar „Markiertes als PDF“ exportieren.

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
