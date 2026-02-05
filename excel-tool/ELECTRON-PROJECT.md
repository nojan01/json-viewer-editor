# MVMS-Tool: Electron Desktop-App

## Projektübersicht

Dieses Dokument beschreibt die Umwandlung der bestehenden Web-App in eine Electron Desktop-Anwendung mit direktem Excel-Zugriff.

---

## 1. Voraussetzungen (Windows Server 2022)

### 1.1 Node.js installieren

**Option A: Manueller Download (empfohlen für Server)**
1. Gehe zu: https://nodejs.org/en/download/
2. Lade "Windows Installer (.msi)" - **LTS Version** (z.B. 20.x)
3. Installiere mit Standardeinstellungen

**Option B: Via winget (wenn verfügbar)**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Option C: Via Chocolatey**
```powershell
# Falls Chocolatey installiert ist:
choco install nodejs-lts
```

### 1.2 Installation prüfen

```powershell
# PowerShell öffnen und prüfen:
node --version    # Sollte: v20.x.x oder v18.x.x
npm --version     # Sollte: 10.x.x oder 9.x.x
```

### 1.3 Speicherplatz

| Komponente | Größe |
|------------|-------|
| Node.js | ~100 MB |
| Projekt + Dependencies | ~400 MB |
| Fertige EXE | ~150-200 MB |
| **Gesamt** | **~700 MB** |

---

## 2. Projekt erstellen

### 2.1 Projektordner anlegen

```powershell
# Wechsle in gewünschtes Verzeichnis
cd C:\Projekte

# Ordner erstellen
mkdir mvms-tool-electron
cd mvms-tool-electron
```

### 2.2 npm-Projekt initialisieren

```powershell
npm init -y
```

### 2.3 Abhängigkeiten installieren

```powershell
# Electron und Build-Tools
npm install electron --save-dev
npm install electron-builder --save-dev

# Excel-Bibliothek (wie in der Web-App)
npm install exceljs

# Optional: Für Entwicklung
npm install electron-reload --save-dev
```

---

## 3. Projektstruktur

Nach Abschluss der Einrichtung sollte die Struktur so aussehen:

```
mvms-tool-electron/
├── package.json           # Projektkonfiguration
├── main.js                # Electron Hauptprozess
├── preload.js             # Sicherheits-Bridge
├── src/
│   ├── index.html         # Kopie der bestehenden UI
│   ├── styles.css         # (optional: CSS auslagern)
│   └── renderer.js        # Frontend-Anpassungen
├── assets/
│   └── icon.ico           # App-Icon (256x256)
└── node_modules/          # (automatisch erstellt)
```

---

## 4. Dateien erstellen

### 4.1 package.json

Ersetze den Inhalt mit:

```json
{
  "name": "mvms-tool",
  "version": "1.0.0",
  "description": "MVMS-Vertragslisten Tool",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder --win portable",
    "build:installer": "electron-builder --win nsis"
  },
  "build": {
    "appId": "de.mvms.tool",
    "productName": "MVMS-Tool",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "src/**/*",
      "node_modules/**/*"
    ],
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "assets/icon.ico"
    },
    "portable": {
      "artifactName": "MVMS-Tool.exe"
    }
  },
  "author": "Norbert Jander",
  "license": "MIT",
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0"
  },
  "dependencies": {
    "exceljs": "^4.4.0"
  }
}
```

### 4.2 main.js (Electron Hauptprozess)

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

let mainWindow;

// ============================================
// FENSTER ERSTELLEN
// ============================================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        title: 'MVMS-Tool',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('src/index.html');
    
    // DevTools öffnen (nur während Entwicklung)
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
    
    // Menüleiste ausblenden (optional)
    mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================
// DATEI-DIALOGE
// ============================================

// Datei öffnen Dialog
ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || 'Datei öffnen',
        filters: options.filters || [
            { name: 'Excel-Dateien', extensions: ['xlsx', 'xls'] },
            { name: 'Alle Dateien', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    
    if (result.canceled) return null;
    return result.filePaths[0];
});

// Datei speichern Dialog
ipcMain.handle('dialog:saveFile', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || 'Datei speichern',
        defaultPath: options.defaultPath,
        filters: options.filters || [
            { name: 'Excel-Dateien', extensions: ['xlsx'] }
        ]
    });
    
    if (result.canceled) return null;
    return result.filePath;
});

// ============================================
// EXCEL OPERATIONEN
// ============================================

// Excel-Datei lesen
ipcMain.handle('excel:readFile', async (event, filePath) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const sheets = workbook.worksheets.map(ws => ws.name);
        
        return {
            success: true,
            fileName: path.basename(filePath),
            filePath: filePath,
            sheets: sheets
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Sheet-Daten lesen
ipcMain.handle('excel:readSheet', async (event, filePath, sheetName) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
            return { success: false, error: `Sheet "${sheetName}" nicht gefunden` };
        }
        
        const data = [];
        const headers = [];
        
        worksheet.eachRow((row, rowNumber) => {
            const rowData = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                // Header-Zeile
                if (rowNumber === 1) {
                    headers[colNumber - 1] = cell.text || `Spalte ${colNumber}`;
                }
                rowData[colNumber - 1] = cell.text || '';
            });
            
            // Zeilen auffüllen bis zur maximalen Spaltenanzahl
            while (rowData.length < headers.length) {
                rowData.push('');
            }
            
            data.push(rowData);
        });
        
        return {
            success: true,
            headers: headers,
            data: data
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Zeilen in Excel einfügen (MIT Formatierungserhalt!)
ipcMain.handle('excel:insertRows', async (event, { filePath, sheetName, rows, startColumn }) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
            return { success: false, error: `Sheet "${sheetName}" nicht gefunden` };
        }
        
        // Letzte nicht-leere Zeile finden
        let lastRow = 1;
        worksheet.eachRow((row, rowNumber) => {
            let isEmpty = true;
            row.eachCell(cell => {
                if (cell.value !== null && cell.value !== '') {
                    isEmpty = false;
                }
            });
            if (!isEmpty) {
                lastRow = rowNumber;
            }
        });
        
        // Neue Zeilen einfügen
        let insertedCount = 0;
        for (const row of rows) {
            const newRowNum = lastRow + insertedCount + 1;
            const newRow = worksheet.getRow(newRowNum);
            
            // Flag in Spalte A
            if (row.flag && row.flag !== 'leer') {
                newRow.getCell(1).value = row.flag;
            }
            
            // Kommentar in Spalte B
            if (row.comment) {
                newRow.getCell(2).value = row.comment;
            }
            
            // Daten ab Startspalte
            if (row.data && row.flag !== 'leer') {
                row.data.forEach((value, index) => {
                    if (value !== null && value !== undefined && value !== '') {
                        newRow.getCell(startColumn + index).value = value;
                    }
                });
            }
            
            newRow.commit();
            insertedCount++;
        }
        
        // Speichern
        await workbook.xlsx.writeFile(filePath);
        
        return { 
            success: true, 
            message: `${insertedCount} Zeile(n) eingefügt`,
            insertedCount: insertedCount
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Datei kopieren (für "Neuer Monat")
ipcMain.handle('excel:copyFile', async (event, { sourcePath, targetPath, sheetName, keepHeader }) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(sourcePath);
        
        const worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) {
            return { success: false, error: `Sheet "${sheetName}" nicht gefunden` };
        }
        
        // Zeilen löschen (außer Header)
        if (keepHeader) {
            const rowCount = worksheet.rowCount;
            for (let i = rowCount; i > 1; i--) {
                worksheet.spliceRows(i, 1);
            }
        }
        
        await workbook.xlsx.writeFile(targetPath);
        
        return { success: true, message: `Datei erstellt: ${targetPath}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ============================================
// KONFIGURATION
// ============================================

// Config speichern
ipcMain.handle('config:save', async (event, { filePath, config }) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Config laden
ipcMain.handle('config:load', async (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'Datei nicht gefunden' };
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return { success: true, config: JSON.parse(content) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// App-Pfad ermitteln (für Config im Programmordner)
ipcMain.handle('app:getPath', async (event) => {
    return {
        appPath: app.getAppPath(),
        userData: app.getPath('userData'),
        exe: app.getPath('exe')
    };
});
```

### 4.3 preload.js (Sicherheits-Bridge)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Sichere API für das Frontend bereitstellen
contextBridge.exposeInMainWorld('electronAPI', {
    // Dialoge
    openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    
    // Excel-Operationen
    readExcelFile: (filePath) => ipcRenderer.invoke('excel:readFile', filePath),
    readExcelSheet: (filePath, sheetName) => ipcRenderer.invoke('excel:readSheet', filePath, sheetName),
    insertExcelRows: (params) => ipcRenderer.invoke('excel:insertRows', params),
    copyExcelFile: (params) => ipcRenderer.invoke('excel:copyFile', params),
    
    // Konfiguration
    saveConfig: (filePath, config) => ipcRenderer.invoke('config:save', { filePath, config }),
    loadConfig: (filePath) => ipcRenderer.invoke('config:load', filePath),
    
    // App-Infos
    getAppPath: () => ipcRenderer.invoke('app:getPath')
});
```

### 4.4 src/index.html

**Kopiere die bestehende `index.html` in den `src/` Ordner.**

Dann diese Änderungen vornehmen:

#### Änderung 1: Script-Imports entfernen (Zeilen 8-11)

```html
<!-- ENTFERNEN: -->
<!-- <script src="xlsx.full.min.js"></script> -->
<!-- <script src="exceljs.min.js"></script> -->
```

#### Änderung 2: Neue Funktionen für Electron hinzufügen

Am Ende der `<script>`-Sektion (vor `</script>`) diese Funktionen hinzufügen:

```javascript
// ============================================
// ELECTRON-SPEZIFISCHE FUNKTIONEN
// ============================================

// Prüfen ob wir in Electron laufen
const isElectron = typeof window.electronAPI !== 'undefined';

if (isElectron) {
    console.log('🚀 Electron-Modus aktiv');
    
    // Datei 1 laden (Electron)
    async function loadFile1Electron() {
        const filePath = await window.electronAPI.openFileDialog({
            title: 'Quelldatei (Datei 1) öffnen',
            filters: [{ name: 'Excel-Dateien', extensions: ['xlsx', 'xls'] }]
        });
        
        if (!filePath) return;
        
        const result = await window.electronAPI.readExcelFile(filePath);
        if (!result.success) {
            showStatus(elements.file1Info, `Fehler: ${result.error}`, 'error');
            return;
        }
        
        state.file1.name = result.fileName;
        state.file1.filePath = result.filePath;
        state.file1.sheets = result.sheets;
        
        // Sheet-Dropdown aktualisieren
        elements.selectSheet1.innerHTML = result.sheets
            .map(s => `<option value="${s}">${s}</option>`)
            .join('');
        elements.selectSheet1.disabled = false;
        
        showStatus(elements.file1Info, `✓ ${result.fileName} (${result.sheets.length} Sheets)`, 'success');
        
        // Erstes Sheet laden
        await loadSheet1Electron(result.sheets[0]);
    }
    
    async function loadSheet1Electron(sheetName) {
        const result = await window.electronAPI.readExcelSheet(state.file1.filePath, sheetName);
        if (!result.success) {
            showStatus(elements.file1Info, `Fehler: ${result.error}`, 'error');
            return;
        }
        
        state.file1.selectedSheet = sheetName;
        state.file1.headers = result.headers;
        state.file1.data = result.data.slice(1); // Ohne Header-Zeile
        
        // Mapping aktualisieren
        if (state.mapping.sourceColumns.length === 0) {
            state.mapping.sourceColumns = state.file1.headers.map((_, i) => i);
        }
        updateMappingUI();
    }
    
    // Datei 2 laden (Electron)
    async function loadFile2Electron() {
        const filePath = await window.electronAPI.openFileDialog({
            title: 'Zieldatei (Datei 2) öffnen',
            filters: [{ name: 'Excel-Dateien', extensions: ['xlsx', 'xls'] }]
        });
        
        if (!filePath) return;
        
        const result = await window.electronAPI.readExcelFile(filePath);
        if (!result.success) {
            showStatus(elements.file2Info, `Fehler: ${result.error}`, 'error');
            return;
        }
        
        state.file2.name = result.fileName;
        state.file2.filePath = result.filePath;
        state.file2.sheets = result.sheets;
        
        elements.selectSheet2.innerHTML = result.sheets
            .map(s => `<option value="${s}">${s}</option>`)
            .join('');
        elements.selectSheet2.disabled = false;
        
        showStatus(elements.file2Info, `✓ ${result.fileName}`, 'success');
        
        await loadSheet2Electron(result.sheets[0]);
    }
    
    async function loadSheet2Electron(sheetName) {
        const result = await window.electronAPI.readExcelSheet(state.file2.filePath, sheetName);
        if (!result.success) return;
        
        state.file2.selectedSheet = sheetName;
        state.file2.headers = result.headers;
        state.file2.data = result.data.slice(1);
        
        elements.btnNewMonth.disabled = false;
        elements.btnExportPS.disabled = state.transferQueue.length === 0;
    }
    
    // Warteschlange direkt übertragen (Electron)
    async function transferQueueElectron() {
        if (state.transferQueue.length === 0) {
            showStatus(elements.transferStatus, 'Keine Zeilen in der Warteschlange', 'error');
            return;
        }
        
        if (!state.file2.filePath) {
            showStatus(elements.transferStatus, 'Keine Zieldatei ausgewählt', 'error');
            return;
        }
        
        // Zeilen für Excel vorbereiten
        const rows = state.transferQueue.map(item => {
            const rowData = [];
            state.mapping.sourceColumns.forEach((srcColIndex, i) => {
                rowData[i] = item.data[srcColIndex] || '';
            });
            return {
                flag: item.flag,
                comment: item.comment,
                data: rowData
            };
        });
        
        const result = await window.electronAPI.insertExcelRows({
            filePath: state.file2.filePath,
            sheetName: state.file2.selectedSheet,
            rows: rows,
            startColumn: state.mapping.targetStartColumn
        });
        
        if (result.success) {
            // History aktualisieren
            state.transferQueue.forEach(item => {
                state.history.unshift({
                    time: new Date().toLocaleTimeString(),
                    flag: item.flag,
                    searchValue: item.checkValue,
                    preview: String(item.checkValue || item.data[0] || '').substring(0, 30)
                });
            });
            if (state.history.length > 20) state.history = state.history.slice(0, 20);
            updateHistoryDisplay();
            
            // Warteschlange leeren
            state.transferQueue = [];
            updateQueueDisplay();
            
            // Datei 2 neu laden
            await loadSheet2Electron(state.file2.selectedSheet);
            
            showStatus(elements.transferStatus, 
                `✅ ${result.insertedCount} Zeile(n) direkt in Excel eingefügt!`, 'success');
        } else {
            showStatus(elements.transferStatus, `❌ Fehler: ${result.error}`, 'error');
        }
    }
    
    // Event-Handler überschreiben
    elements.btnLoadFile1.onclick = loadFile1Electron;
    elements.btnLoadFile2.onclick = loadFile2Electron;
    elements.selectSheet1.onchange = (e) => loadSheet1Electron(e.target.value);
    elements.selectSheet2.onchange = (e) => loadSheet2Electron(e.target.value);
    
    // "Export zur Zieldatei" wird zu "Direkt übertragen"
    elements.btnExportPS.onclick = transferQueueElectron;
    elements.btnExportPS.innerHTML = '✅ Direkt in Excel übertragen';
    elements.btnExportPS.title = 'Überträgt Warteschlange direkt in die Excel-Datei';
}
```

---

## 5. Build-Prozess

### 5.1 Entwicklung starten

```powershell
cd C:\Projekte\mvms-tool-electron

# App im Entwicklungsmodus starten
npm start

# Mit DevTools
npm run dev
```

### 5.2 Portable EXE erstellen

```powershell
# Portable EXE (ohne Installation)
npm run build

# Ergebnis: dist/MVMS-Tool.exe (~150 MB)
```

### 5.3 Installer erstellen (optional)

```powershell
# Windows Installer (.exe Setup)
npm run build:installer

# Ergebnis: dist/MVMS-Tool Setup 1.0.0.exe
```

---

## 6. Checkliste

### Vor dem Start:

- [ ] Node.js installiert (`node --version`)
- [ ] Projektordner erstellt
- [ ] `npm init -y` ausgeführt
- [ ] Dependencies installiert (`npm install`)

### Dateien erstellt:

- [ ] `package.json` (angepasst)
- [ ] `main.js`
- [ ] `preload.js`
- [ ] `src/index.html` (kopiert + angepasst)
- [ ] `assets/icon.ico` (optional)

### Befehle:

| Befehl | Aktion |
|--------|--------|
| `npm start` | App starten (Entwicklung) |
| `npm run dev` | App mit DevTools |
| `npm run build` | Portable EXE erstellen |

---

## 7. Vorteile gegenüber Web-Version

| Funktion | Web-Version | Electron-Version |
|----------|-------------|------------------|
| Excel öffnen | File-Dialog im Browser | System-Dialog |
| Excel speichern | Download + manuell verschieben | Direkt speichern |
| Zeilen übertragen | JSON Export → Watcher → PowerShell | Direkt in Datei |
| Formatierung | Geht verloren | Bleibt erhalten! |
| Offline-Nutzung | Ja | Ja |
| Dateipfade merken | Session-basiert | Persistent |

---

## 8. Troubleshooting

### Problem: "npm not found"

```powershell
# Neue PowerShell-Sitzung öffnen nach Node.js Installation
# Oder Pfad manuell aktualisieren:
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
```

### Problem: "electron not found"

```powershell
# Dependencies neu installieren
npm install
```

### Problem: Build schlägt fehl

```powershell
# Cache löschen und neu installieren
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
npm run build
```

### Problem: App startet nicht

```powershell
# Mit Logging starten
npx electron . --enable-logging
```

---

## 9. Dateien zum Kopieren

Diese Dateien aus dem bestehenden `excel-tool` Ordner werden NICHT mehr benötigt:

- ❌ `xlsx.full.min.js` (wird durch npm exceljs ersetzt)
- ❌ `exceljs.min.js` (wird durch npm exceljs ersetzt)
- ❌ `Start-MVMS.ps1` (nicht mehr nötig)
- ❌ `Start-ExcelWatcher.ps1` (nicht mehr nötig)
- ❌ `Update-Excel.ps1` (nicht mehr nötig)

Diese Datei wird kopiert und angepasst:

- ✅ `index.html` → `src/index.html`

---

## 10. Geschätzter Zeitaufwand

| Schritt | Zeit |
|---------|------|
| Node.js installieren | 10 Min |
| Projekt einrichten | 15 Min |
| Dateien erstellen | 30 Min |
| index.html anpassen | 30 Min |
| Testen | 30 Min |
| Build erstellen | 15 Min |
| **Gesamt** | **~2 Stunden** |

---

## 11. Support

Bei Fragen oder Problemen:
1. `npm run dev` starten
2. DevTools öffnen (F12)
3. Console-Ausgaben prüfen
4. Fehlermeldung notieren

Erstellt: 27. Dezember 2025
