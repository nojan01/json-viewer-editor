# Updates und Release 1.4.1

Die App prüft beim Start still auf Updates. Über den „Update“-Button rechts neben „?“ in der oberen Werkzeugleiste oder über „Hilfe → Nach Updates suchen…“ wird die Prüfung manuell gestartet. Eine gefundene Version wird erst nach Zustimmung heruntergeladen. Ungespeicherte Tabs müssen zuvor gespeichert oder ausdrücklich verworfen werden. Signaturfehler brechen die Installation ab; nach erfolgreicher Installation erfolgt der Neustart. Windows startet dazu seinen Installer.

## Erster Umstieg

Version 1.3.7 hat noch keinen Updater und benötigt einmalig die normale Installation von 1.4.0. Ab 1.4.0 verwenden Updates das Release-Asset:

`https://github.com/nojan01/json-viewer-editor/releases/latest/download/latest.json`

Solange dort kein Manifest veröffentlicht wurde, liefert die manuelle Prüfung eine Fehlermeldung. Die automatische Startprüfung bleibt in diesem Fall still. Eine echte Aktualisierung benötigt eine signierte, höhere Version; es wird weder ein fremdes Update noch ein künstlicher Versionssprung auf der installierten App getestet.

## Signierschlüssel

Die CLI ist auf 2.11.4 festgelegt. Ältere Versionen 2.9.3 bis 2.10.0 konnten bei leerem Passwort ungültige Schlüssel erzeugen; siehe [Tauri-Releasehinweise](https://v2.tauri.app/release/%40tauri-apps/cli/). Der hier verwendete Schlüssel wurde mit der korrigierten CLI erzeugt und durch Signieren geprüft.

Für dieses Projekt wurde ein eigener Updater-Schlüssel erzeugt. Der öffentliche Schlüssel steht in `src-tauri/tauri.conf.json`. Der private Schlüssel liegt ausschließlich lokal unter `.updater/json-viewer.key`, mit eingeschränkten Dateirechten und über `.gitignore` vom Repository ausgeschlossen. Diesen Schlüssel sicher sichern; bestehende Installationen vertrauen genau dem zugehörigen öffentlichen Schlüssel.

`npm run build` verwendet automatisch den lokalen Schlüssel, sofern `TAURI_SIGNING_PRIVATE_KEY` nicht bereits gesetzt ist. Auf Build-Rechnern wird `TAURI_SIGNING_PRIVATE_KEY` als Dateipfad oder Schlüsselinhalt und optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` verwendet.

Für GitHub Actions müssen die Repository-Secrets `TAURI_SIGNING_PRIVATE_KEY` (Inhalt der lokalen Schlüsseldatei) und optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` eingerichtet werden. Der lokal erzeugte Schlüssel hat kein Passwort. Schlüssel nie in Logs, Issues, Versionsverwaltung oder Release-Assets aufnehmen. Diese Secrets wurden bei der lokalen Implementierung nicht auf GitHub gesetzt.

Apple Developer-ID-Signierung und Notarisierung bleiben zusätzlich erforderlich; die Updater-Signatur ersetzt sie nicht.

## Plattformen und Veröffentlichung

Der Release-Workflow baut Windows x64, Windows ARM64, Linux x64 und macOS Apple Silicon. Er erzeugt die Installationsdateien, ihre Updater-Signaturen und ein gemeinsames `latest.json`. Das Manifest wird nur mit vollständigen Artefakten aller vier Plattformen veröffentlicht. `build_macos: false` erlaubt Teil-Builds ohne Veröffentlichung. Die macOS-Architektur ist im Build explizit auf `aarch64-apple-darwin` festgelegt.

- macOS: `.app.tar.gz` und `.sig`
- Windows: NSIS `.exe` und `.sig`
- Linux: `.AppImage` und `.sig`
- Linux-DEB/RPM: manuelle Paketaktualisierung; der integrierte Installer erklärt diese Einschränkung

`release-macos.sh` erzeugt das Updater-Archiv **nach** der abschließenden Signierung und dem Stapeln des Apple-Tickets neu. Anschließend wird genau dieses Archiv signiert. Das lokal erzeugte `latest.json` enthält nur macOS und darf nicht ungeprüft das gemeinsame Manifest eines plattformübergreifenden Releases ersetzen.

Für ein Release müssen Paketversionen und Git-Tag übereinstimmen. Der Workflow baut den Tag und prüft ihn vorab. Die Implementierung ist auf 1.4.1 gesetzt.

## Validierung

```sh
npm test
cd src-tauri
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Ein lokaler Test-Build ohne Release-Notarisierung:

```sh
npm run build -- --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false,"macOS":{"signingIdentity":"-"}}}'
```

Die Tests decken unter anderem kombinierte Tabellenfilter, Datentypen, Maskierung aller Datensätze, Sonderzeichen in Feldnamen, unveränderte Quellen, getrennte Tab-Zustände, fehlgeschlagene Dateioperationen, Update-Abbrüche, Installationsfehler und Manifestprüfung ab. Die bestehenden Regressionstests für 205.265 Zeilen bleiben erhalten.

## Verhalten der neuen Funktionen

Spalteneinstellungen und Tabellenfilter bleiben im geöffneten Tab erhalten. Beim Beenden werden ausschließlich Dateipfade und Baumnavigation gespeichert, keine JSON-Nutzdaten, Suchtexte oder Undo-Snapshots. Beim nächsten Start wird zunächst die zuletzt aktive lokale Datei geladen; andere Tabs laden bei Auswahl. Änderungen werden nicht automatisch auf die Festplatte geschrieben. Dateien aus dem Browser-Dateidialog oder REST-Antworten ohne lokalen Pfad lassen sich erst nach Speichern als lokale Datei in einer späteren Sitzung wiederherstellen.

Der maskierte Export arbeitet auf dem gesamten JSON-Dokument. Er ersetzt exakt ausgewählte Feldnamen auf allen Ebenen, auch in Arrays; ein ausgewähltes Objektfeld wird als Ganzes ersetzt. Der Ersatz ist immer ein JSON-String. Die Vorschau ist bei großen Dateien gekürzt, der Export vollständig. Verkettete Eingaben werden dabei als ein JSON-Array exportiert. Die Funktion behauptet keine automatische Erkennung aller personenbezogenen Daten.
