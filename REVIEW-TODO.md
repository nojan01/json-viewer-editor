# Code-Review – Aufgaben

Stand: 14. September 2026. Umsetzung auf Basis des Reviews von v1.3.7.

- [x] Web-App entfernen (vom Benutzer ausdrücklich beauftragt; über Git wiederherstellbar).
- [x] Interne Baum-Metadaten über Symbol-Eigenschaften von JSON-Nutzdaten trennen; Export behält gleichnamige Nutzdaten.
- [x] Eindeutige Pfade für beliebige JSON-Schlüssel in Navigation und Bearbeitung.
- [x] Windows-Überschreiben anhand der Rust-Implementierung prüfen und Regressionstest ergänzen.
- [x] Vergleichsansicht: Escape-Funktion und sicherer Dateiname.
- [x] Verkettetes JSON streng parsen und Format beim Speichern erhalten.
- [x] Gültige Wurzelwerte false, 0, null und leere Zeichenkette unterstützen.
- [x] Bulk-Umbenennung: Kollisionen verhindern, Unterbäume vollständig bearbeiten.
- [x] Benachrichtigungstyp und Anzeigedauer korrekt behandeln.
- [x] Regressionstests und CI-Konfiguration ergänzen.
- [x] Drei Clippy-Befunde korrigieren.
- [x] npm-Lockdatei zur Versionierung aufnehmen und npm ci verwenden.
- [x] Release-Tag, ausgecheckten Quellcode und Paketversion abgleichen.
- [x] Abschlussprüfung und verbleibende Einschränkungen dokumentieren.

## Korrektur zum Review

Der Verdacht, `std::fs::rename` könne unter Windows eine vorhandene Datei grundsätzlich nicht ersetzen, war falsch. Die Rust-Implementierung unterstützt dies. Daher kein unnötiger plattformspezifischer Ersatz; ergänzt wurden Tests zum Ersetzen und zum Erhalt des Originals bei fehlgeschlagenem Commit sowie `sync_all` vor dem Umbenennen.

## Lokal geprüft

- 23 Node-Regressionstests erfolgreich, einschließlich Speichern und Tabellen-Navigation bis zur letzten von 205.265 Zeilen.
- 4 Rust-Tests erfolgreich.
- Clippy für alle Targets ohne Warnungen.
- Tauri macOS-1.4.1-Release-Build und DMG lokal erfolgreich geprüft.
- Nativer Smoke-Test: Update-Button geprüft und 406-MiB-Testdatei in 1,83 Sekunden geladen.

## Noch ausstehende Plattformprüfung

- [ ] Windows- und Linux-CI tatsächlich ausführen (Workflow vorbereitet, noch nicht veröffentlicht).
- [ ] Native interaktive Prüfung auf allen drei Plattformen vor einem Release.

Die automatisierten Frontend-Tests verwenden für einzelne UI-Funktionen DOM-Stubs. Sie prüfen Logik, nicht das native WebView-Verhalten oder die visuelle Scrollbar-Darstellung.
