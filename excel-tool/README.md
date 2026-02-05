# MVMS-Vertragslisten aktualisieren

Eine Browser-basierte Anwendung zum Kopieren von Zeilen aus einer Excel-Datei in eine andere, mit Flag- und Kommentar-Funktion.

## Funktionen

- **Quelldatei durchsuchen**: Suchen Sie nach Seriennummern oder Text mit Wildcard-Unterstützung (`*` und `?`)
- **Multi-Select**: Mehrere Zeilen gleichzeitig auswählen und übertragen
- **Warteschlange**: Zeilen sammeln und als Batch übertragen
- **Neue Zeile erstellen**: Manuell Zeilen eingeben (auch Leerzeilen)
- **Zeilen kopieren**: Ausgewählte Zeilen in die Zieldatei übertragen
- **Flag setzen**: Jede übertragene Zeile mit A (Add), D (Delete) oder C (Change) markieren
- **Kommentar hinzufügen**: Freier Text für jede übertragene Zeile
- **Arbeitsblatt-Auswahl**: Wählen Sie für beide Dateien das gewünschte Arbeitsblatt
- **Spalten-Mapping**: Konfigurieren Sie, welche Spalten kopiert werden
- **Direktes Speichern**: Änderungen werden direkt in Datei 2 gespeichert (kein Download)
- **Neuer Monat**: Datei 2 kopieren und Sheet für neuen Monat leeren
- **Duplikat-Erkennung**: Verhindert doppelte Einträge
- **Export/Import**: Konfiguration als JSON-Datei sichern und wiederherstellen

## Installation

Keine Installation erforderlich! Einfach den `excel-tool`-Ordner auf Ihren Windows-PC kopieren.

## Verwendung

### Starten

Doppelklicken Sie auf `START.bat` oder öffnen Sie `index.html` direkt im Browser (Chrome oder Edge empfohlen).

### Workflow

1. **Quelldatei laden** (Datei 1)
   - Klicken Sie auf "Quelldatei laden"
   - Wählen Sie die Excel-Datei aus der Sie kopieren möchten
   - Wählen Sie das gewünschte Arbeitsblatt

2. **Zieldatei laden** (Datei 2)
   - Klicken Sie auf "Zieldatei laden"
   - Wählen Sie die Excel-Datei in die Sie kopieren möchten
   - Wählen Sie das Ziel-Arbeitsblatt

3. **Spalten konfigurieren**
   - Klicken Sie auf "Spalten konfigurieren"
   - Wählen Sie welche Spalten aus Datei 1 kopiert werden sollen
   - Wählen Sie die Spalte für Duplikat-Erkennung
   - Die Daten werden ab Spalte C eingefügt (A = Flag, B = Kommentar)

4. **Suchen und Übertragen**
   - Geben Sie eine Seriennummer oder Text in das Suchfeld ein
   - Wildcards: `*` = beliebig viele Zeichen, `?` = genau ein Zeichen
   - Beispiele: `ABC*`, `*123*`, `A?C`
   - Klicken Sie auf die gewünschten Zeilen (Checkboxen oder Klick auf Zeile)
   - Setzen Sie Flag (A/D/C) und optional einen Kommentar
   - Klicken Sie auf "Zur Warteschlange" oder "Direkt übertragen"

5. **Neue Zeile manuell erstellen**
   - Klicken Sie auf "➕ Neue Zeile"
   - Füllen Sie die Felder aus (oder lassen Sie sie leer für eine Leerzeile)
   - Setzen Sie Flag und Kommentar
   - Klicken Sie auf "Zur Warteschlange" oder "Direkt übertragen"

6. **Warteschlange übertragen**
   - Sammeln Sie mehrere Zeilen in der Warteschlange
   - Klicken Sie auf "✅ Alle übertragen" um alle auf einmal zu übertragen

7. **Speichern**
   - Klicken Sie auf "💾 Datei 2 speichern"
   - Die Datei wird in den Download-Ordner heruntergeladen
   - Verschieben Sie die Datei an den gewünschten Speicherort (überschreiben Sie ggf. die alte Datei)

8. **Neuer Monat**
   - Klicken Sie auf "📅 Neuer Monat"
   - Geben Sie den neuen Dateinamen ein
   - Das Sheet wird geleert (nur Kopfzeile bleibt) und als neue Datei heruntergeladen
   - Verschieben Sie die Datei in den Zielordner

## Tastenkürzel

| Taste | Aktion |
|-------|--------|
| Strg+O | Konfiguration laden |
| Strg+S | Datei 2 speichern |
| Enter | Suche starten |
| F1 | Hilfe anzeigen |
| Esc | Dialog schließen |

## Flags

| Flag | Bedeutung |
|------|-----------|
| A | Add - Zeile hinzufügen |
| D | Delete - Zeile löschen |
| C | Change - Zeile ändern |

## Konfiguration

### Netzwerklaufwerk / Mehrere Nutzer

Diese App ist für die Nutzung auf einem Netzwerklaufwerk mit mehreren Nutzern optimiert:

1. **Erster Nutzer - Konfiguration erstellen:**
   - Laden Sie beide Excel-Dateien
   - Konfigurieren Sie Arbeitsblätter und Spalten-Zuordnung
   - Klicken Sie auf **"config.json speichern"**
   - Speichern Sie die Datei **im Programmordner** (neben index.html)

2. **Alle Nutzer - Konfiguration laden:**
   - Beim Start erscheint der Hinweis: "Lade die gemeinsame config.json"
   - Klicken Sie auf **"📂 config.json laden"** (grüner Button oben)
   - Wählen Sie die `config.json` aus dem Programmordner
   - Alle Excel-Dateien und Einstellungen werden automatisch geladen!

3. **Änderungen speichern:**
   - Wenn sich die Konfiguration ändert, einfach erneut "config.json speichern"
   - Die Datei im Programmordner überschreiben
   - Ab jetzt haben alle Nutzer die aktualisierte Konfiguration

### Automatisches Speichern (lokal)

Zusätzlich werden Einstellungen automatisch im Browser gespeichert:
- Ausgewählte Arbeitsblätter
- Spalten-Zuordnung
- Letzte 20 Übertragungen

## Technische Details

- **Technologie**: HTML, CSS, JavaScript (keine Installation nötig)
- **Excel-Bibliothek**: SheetJS (xlsx.js) - CDN-geladen
- **Speicher**: IndexedDB für große Dateien, LocalStorage für Einstellungen
- **Unterstützte Browser**: Chrome, Edge, Firefox
- **Unterstützte Dateiformate**: .xlsx
- **Speichern**: Dateien werden in den Download-Ordner heruntergeladen und müssen manuell verschoben werden

## Offline-Nutzung

Die App benötigt beim ersten Start eine Internetverbindung um die SheetJS-Bibliothek zu laden. Danach funktioniert sie auch offline (wenn die Bibliothek im Browser-Cache ist).

## Fehlerbehebung

### "Datei kann nicht gelesen werden"
- Stellen Sie sicher, dass die Datei nicht in Excel geöffnet ist
- Prüfen Sie ob es sich um eine gültige .xlsx Datei handelt

### "Suche findet nichts"
- Die Suche durchsucht alle Spalten
- Groß-/Kleinschreibung wird ignoriert
- Wildcards nutzen: `*text*` findet "text" überall
- Prüfen Sie das ausgewählte Arbeitsblatt

### "Änderungen nicht sichtbar in Excel"
- Schließen Sie die Datei in Excel
- Öffnen Sie die Datei erneut

### Konfiguration zurücksetzen
- Drücken Sie F12 → Console
- Eingeben: `localStorage.removeItem('mvmcVertragslistenConfig'); localStorage.removeItem('mvmcVertragslistenLastExport');`
- Seite neu laden

## Bekannte Einschränkungen

- Die Datei muss in Excel geschlossen sein, damit Änderungen dort sichtbar werden
- Firefox unterstützt kein direktes Speichern (Download stattdessen)
- Sehr große Dateien (>50 MB) können langsam laden

## Version

v1.0.0 - © Norbert Jander 2025
