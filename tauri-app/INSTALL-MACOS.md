# JSON Viewer - macOS Installation

## Installation

1. Öffnen Sie die `.dmg`-Datei
2. Ziehen Sie **JSON Viewer** in den Applications-Ordner
3. **Wichtig:** Führen Sie den folgenden Schritt aus, bevor Sie die App zum ersten Mal verwenden

## Gatekeeper-Warnung beheben

Da die App nicht mit einem Apple Developer Certificate signiert ist, zeigt macOS möglicherweise eine Fehlermeldung an:

> „JSON Viewer" ist beschädigt und kann nicht geöffnet werden.

### Lösung

Öffnen Sie **Terminal** (Programme → Dienstprogramme → Terminal) und führen Sie folgenden Befehl aus:

```bash
xattr -cr "/Applications/JSON Viewer.app"
```

Falls Sie die App in einem anderen Ordner installiert haben, passen Sie den Pfad entsprechend an.

### Alternative: Rechtsklick-Methode

1. Klicken Sie mit der **rechten Maustaste** (oder Ctrl+Klick) auf die App
2. Wählen Sie **Öffnen**
3. Klicken Sie im Dialog auf **Öffnen**

Diese Methode funktioniert nur für das erste Öffnen der App selbst, nicht für "Öffnen mit" im Kontextmenü.

## Verwendung

- **App starten:** Doppelklick auf JSON Viewer
- **Datei öffnen:** 
  - Drag & Drop einer JSON-Datei auf das App-Fenster
  - Menü: Datei → Öffnen
  - Rechtsklick auf JSON-Datei → Öffnen mit → JSON Viewer (nach dem xattr-Befehl)

## Deinstallation

Ziehen Sie die App einfach in den Papierkorb.
