# Alternative: Tauri Desktop-App

Diese Datei dokumentiert eine elegantere Alternative zur aktuellen PowerShell-Lösung.

## Aktuelle Lösung (PowerShell)

```
index.html → Export JSON → Watcher erkennt → PowerShell → Excel
```

**Dateien:**
- `Start-MVMS.ps1` (Starter)
- `Start-ExcelWatcher.ps1` (Überwachung)
- `Update-Excel.ps1` (Excel-Bearbeitung)
- `index.html` (Web-App)

**Nachteile:**
- 4 separate Dateien
- Watcher muss laufen
- JSON als Zwischenschritt
- PowerShell-Fenster bleibt offen

---

## Alternative: Tauri

Eine Desktop-App, die alles in einer einzigen `.exe` vereint.

### Vorteile

| Aspekt | PowerShell | Tauri |
|--------|------------|-------|
| Dateien | 4 Skripte + HTML | 1 EXE |
| Start | PowerShell ausführen | Doppelklick |
| Excel-Zugriff | Über Watcher/JSON | Direkt |
| Watcher nötig | Ja | Nein |
| UI | Web (HTML/CSS/JS) | Web (gleich) |
| Größe | ~3 MB | ~5-10 MB |

### Architektur

```
┌─────────────────────────────────────────────┐
│  MVMS-Tool.exe                              │
├─────────────────────────────────────────────┤
│  Frontend (index.html - fast unverändert)   │
│    Button: "Warteschlange übertragen"       │
│              │                              │
│              ▼                              │
│    JavaScript:                              │
│    invoke('update_excel', { rows, file })   │
├─────────────────────────────────────────────┤
│  Backend (Rust)                             │
│    → Öffnet Excel-Datei direkt              │
│    → Fügt Zeilen ein                        │
│    → Speichert                              │
│    → Gibt Erfolg/Fehler zurück              │
└─────────────────────────────────────────────┘
```

### Workflow-Vergleich

**PowerShell (aktuell):**
1. User startet `Start-MVMS.ps1`
2. Browser öffnet sich, Watcher läuft
3. User klickt "Warteschlange exportieren"
4. JSON wird gespeichert
5. Watcher erkennt Datei
6. PowerShell bearbeitet Excel
7. ✓ Fertig

**Tauri:**
1. User startet `MVMS-Tool.exe`
2. App öffnet sich
3. User klickt "Warteschlange übertragen"
4. ✓ Fertig (Excel direkt bearbeitet)

### Benötigte Technologien

**Zum Entwickeln (Build-PC):**
- Node.js (für Frontend-Build)
- Rust + Cargo (für Backend)
- Tauri CLI

**Zum Ausführen (Ziel-PC):**
- Nur die `.exe` - keine Abhängigkeiten!

### Rust-Bibliotheken für Excel

- `calamine` - Excel-Dateien lesen
- `rust_xlsxwriter` - Excel-Dateien schreiben/bearbeiten

### Beispiel: Rust Backend-Funktion

```rust
#[tauri::command]
fn update_excel(
    excel_file: String,
    sheet_name: String,
    rows: Vec<RowData>
) -> Result<String, String> {
    // Excel öffnen
    let mut workbook = Workbook::open(&excel_file)
        .map_err(|e| e.to_string())?;
    
    // Sheet finden und Zeilen einfügen
    // ...
    
    // Speichern
    workbook.save(&excel_file)
        .map_err(|e| e.to_string())?;
    
    Ok(format!("{} Zeilen eingefügt", rows.len()))
}
```

### Beispiel: JavaScript-Aufruf

```javascript
// Statt JSON-Export:
async function transferQueue() {
    const { invoke } = window.__TAURI__.tauri;
    
    try {
        const result = await invoke('update_excel', {
            excelFile: 'Vertragsliste.xlsx',
            sheetName: 'REQUEST FOR CHANGE',
            rows: transferQueue
        });
        showSuccess(result);
    } catch (error) {
        showError(error);
    }
}
```

### Aufwand-Schätzung

- Projektgerüst erstellen: 30 Min
- Rust-Backend für Excel: 2-3 Std
- Frontend anpassen: 1 Std
- Build + Test: 1 Std

**Gesamt: ~5 Stunden**

### Fazit

Tauri ist die elegantere Lösung wenn:
- Eine einzelne EXE gewünscht ist
- Kein PowerShell-Fenster im Hintergrund laufen soll
- Der direkte Excel-Zugriff ohne Zwischenschritt bevorzugt wird

Die aktuelle PowerShell-Lösung funktioniert aber einwandfrei und ist schneller umgesetzt.
