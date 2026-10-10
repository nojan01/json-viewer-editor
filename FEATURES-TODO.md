# Feature-To-do

Priorisierte Weiterentwicklung des JSON Viewer/Editor. Erledigte Punkte bleiben zur Dokumentation erhalten.

## 1. Flatten und Unflatten

- [x] Verschachtelte Objekte in flache Pfade umwandeln
- [x] Flache Pfade wieder in verschachtelte Objekte umwandeln
- [x] Trennzeichen Punkt, Unterstrich oder Schrägstrich wählen
- [x] Arrays unverändert lassen oder mit `[0]`, `[1]`, … abbilden
- [x] Schlüssel mit Trennzeichen verlustfrei maskieren
- [x] Gesamtes Dokument oder ausgewählten Knoten transformieren
- [x] Optionale Stichprobenvorschau (maximal 300 Werte); direkte vollständige Transformation über Anwenden oder neuen Tab
- [x] Konflikte beim Unflatten erkennen und melden
- [x] Im aktuellen Dokument mit Undo anwenden
- [x] Ergebnis in einem neuen, ungespeicherten Tab öffnen
- [ ] Aktuelles JSONPath-Ergebnis als Bereich anbieten
- [x] Flatten-Einstellungen als Schritt eines gespeicherten Transformationsprofils verwenden
- [x] Flatten kooperativ in kurzen, abbrechbaren Zeitabschnitten ohne Worker-Vollkopie ausführen; Unflatten verwendet weiterhin einen Worker
- [x] Flatten mit der realen 406-MiB-Testdatei unter Node geprüft: Arrays erhalten 21,6 s / 685 MiB Heap; Arrays auflösen 38,5 s / 1.981 MiB Heap / 5.952.685 Pfade
- [ ] Dieselbe Datei in der nativen Mac-Oberfläche prüfen; Node-Messungen ersetzen diesen Test nicht
- [ ] Speicherarme Datei-Ausgabe für sehr große Flatten-Ergebnisse ergänzen

## 2. Datenprofil und Qualitätsprüfung

Alle Datensätze als Standard, alternativ die ersten 10.000 als ausdrücklich gekennzeichnete Stichprobe. Bis zu 200 Felder, verschachtelte Objektfelder bis Tiefe 20 optional eingeschlossen. Arrays innerhalb von Datensätzen bleiben ein Feld und können separat analysiert werden. Die Analyse ist abbrechbar und kopiert nicht das gesamte Dokument.

- [x] Datentypen, fehlende Werte, Leerstrings und `null` je Feld ermitteln
- [x] Eindeutige skalare Werte und Wiederholungen anzeigen (bis 1.000 verschiedene Werte; bei Überschreitung keine unvollständigen Kennzahlen anzeigen)
- [x] Minimum, Maximum und Durchschnitt für Zahlen berechnen
- [x] Die fünf häufigsten skalaren Werte auflisten
- [x] Gemischte Datentypen hervorheben
- [x] Bericht mit Stichprobenumfang und Grenzen als JSON oder CSV exportieren
- [x] Reale 406-MiB-Datei unter Node geprüft: 205.265 employees-Datensätze, verschachtelte Objektfelder aktiviert, 19 Feldpfade, 10,5 s; maximaler gemessener Heartbeat-Abstand 19,3 ms
- [ ] Bedienung und Darstellung in der nativen Mac-App prüfen

## 3. Transformationsassistent

- [x] Mehrere Operationen zu einer Reihenfolge kombinieren
- [x] Felder umbenennen oder löschen
- [x] Datentypen konvertieren
- [x] Texte trimmen, suchen und ersetzen
- [x] Felder zusammenführen oder aufteilen
- [x] Flatten/Unflatten als Schritt verwenden
- [x] Abläufe benennen, speichern und erneut anwenden
- [x] Vorschau und Undo für den vollständigen Ablauf

- [x] Großdatei-Test unter Node: Trimmen + Umbenennen, 205.265 Datensätze, 23,2 s, maximaler Heartbeat-Abstand 37,9 ms; Original unverändert
- [x] Mac-Bedienprüfung mit Testdatei: Vorschau, Anwenden, Undo und Redo erfolgreich
- [ ] Große Abläufe in der nativen Oberfläche sowie Windows/Linux prüfen

## 4. JSON Lines / NDJSON

- [ ] JSONL- und NDJSON-Dateien zeilenweise laden
- [ ] Große Dateien speichersparend streamen
- [ ] Filtern, bearbeiten und validieren
- [ ] Als JSON, JSONL, CSV und Excel exportieren

## 5. Stapelverarbeitung

- [ ] Mehrere Dateien oder einen Ordner auswählen
- [ ] Validierung, Suche und Maskierung stapelweise ausführen
- [ ] Transformationsprofile auf alle Dateien anwenden
- [ ] Dateien nach CSV oder Excel exportieren
- [ ] Dateien zusammenführen
- [ ] Fortschritt, Fehlerbericht und Abbruch anbieten

## 6. Datensätze zusammenführen

- [ ] Dateien über ein Feld wie `id` oder `hostname` verbinden
- [ ] Inner Join, Left Join und vollständiges Zusammenführen unterstützen
- [ ] Doppelte und fehlende Schlüssel vorab melden
- [ ] Feldkonflikte in einer Vorschau auflösen
- [ ] Ergebnis in einem neuen Tab öffnen oder exportieren

## Plattform und Oberfläche

- [x] Auswahllisten unter Linux vollständig im dunklen App-Stil darstellen
- [ ] Darstellung neuer Funktionen unter macOS, Windows und Linux prüfen
- [x] Tab-Überlappung unter Linux beheben: Tab-Leiste behält Mindestbreite, Bedienelemente brechen in eine zweite Zeile um; Mausrad scrollt Tabs horizontal, aktiver Tab wird eingeblendet
- [x] Update-Funktion in der Linux-App bereitstellen: CI veröffentlicht AppImage und Linux-Eintrag in `latest.json` auch ohne CI-macOS-Build (macOS-Eintrag wird übernommen)
- [ ] Linux-AppImage-Update nach dem nächsten Release in der nativen App prüfen

## Große Dokumente und Tabwechsel

- [x] Vorbereitete Baumzeilen und Metadatenstatus pro Tab erhalten
- [x] Sortierte Objektschlüssel zwischenspeichern und bei Änderungen invalidieren
- [x] Breite Wurzelobjekte virtuell darstellen und direkt zur sichtbaren Zeile springen
- [ ] Tabwechsel mit dem 406-MiB-Original und vollständigem Flatten-Ergebnis in der Mac-Oberfläche messen

- [x] Flatten-Schlüssel bereits beim Erzeugen erfassen (Reihenfolge der Quelldaten)
- [x] Anzeigemetadaten in kurzen Zeitscheiben vorbereiten und beim Öffnen wiederverwenden
- [x] Vollständig flache Objekte auch ohne Tiefenlimit direkt zur Zielzeile überspringen

- [x] Synchrone Analysefunktionen bei Wurzelobjekten mit über 100.000 Feldern mit Begründung deaktivieren; Tastenkürzel absichern und beim Tabwechsel wieder freigeben
