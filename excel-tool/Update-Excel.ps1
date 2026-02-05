<# 
.SYNOPSIS
    MVMS-Vertragslisten aktualisieren - PowerShell Excel Update Script
.DESCRIPTION
    Liest eine JSON-Datei mit zu uebertragenden Zeilen und fuegt diese in eine Excel-Datei ein.
    Verwendet das ImportExcel Modul (kein COM, kein Excel noetig).
.PARAMETER JsonFile
    Pfad zur JSON-Datei mit den zu uebertragenden Zeilen (exportiert aus der Web-App)
.PARAMETER ExcelFile
    Pfad zur Ziel-Excel-Datei (Datei 2)
.PARAMETER SheetName
    Name des Arbeitsblatts in der Zieldatei
.EXAMPLE
    .\Update-Excel.ps1 -JsonFile "transfer.json" -ExcelFile "Vertragsliste.xlsx" -SheetName "REQUEST FOR CHANGE"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$JsonFile,
    
    [Parameter(Mandatory=$true)]
    [string]$ExcelFile,
    
    [Parameter(Mandatory=$true)]
    [string]$SheetName
)

# Modulpfad: Erst lokal im Programmordner suchen, dann normal
$localModulePath = Join-Path $PSScriptRoot "Modules"
if (Test-Path $localModulePath) {
    $env:PSModulePath = $localModulePath + ";" + $env:PSModulePath
}

# ImportExcel Modul pruefen/installieren
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Write-Host "ImportExcel Modul wird installiert..." -ForegroundColor Yellow
    Install-Module ImportExcel -Scope CurrentUser -Force
}
Import-Module ImportExcel

# Pruefe ob Dateien existieren
if (-not (Test-Path $JsonFile)) {
    Write-Host "FEHLER: JSON-Datei nicht gefunden: $JsonFile" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ExcelFile)) {
    Write-Host "FEHLER: Excel-Datei nicht gefunden: $ExcelFile" -ForegroundColor Red
    exit 1
}

# JSON laden
Write-Host "Lade Transferdaten aus: $JsonFile" -ForegroundColor Cyan
$jsonContent = Get-Content $JsonFile -Raw -Encoding UTF8
$transferData = $jsonContent | ConvertFrom-Json

if ($null -eq $transferData.rows -or $transferData.rows.Count -eq 0) {
    Write-Host "Keine Zeilen zum Uebertragen gefunden." -ForegroundColor Yellow
    exit 0
}

$rowCount = $transferData.rows.Count
Write-Host "Gefunden: $rowCount Zeile(n) zum Uebertragen" -ForegroundColor Green

# Excel-Datei laden
Write-Host "Oeffne Excel-Datei: $ExcelFile" -ForegroundColor Cyan
$excelPath = (Resolve-Path $ExcelFile).Path

# Excel-Paket oeffnen um letzte Zeile zu ermitteln
$excel = Open-ExcelPackage -Path $excelPath
$worksheet = $excel.Workbook.Worksheets[$SheetName]

if ($null -eq $worksheet) {
    Write-Host "FEHLER: Arbeitsblatt nicht gefunden: $SheetName" -ForegroundColor Red
    Close-ExcelPackage $excel -NoSave
    exit 1
}

# Letzte NICHT-LEERE Zeile ermitteln (suche von unten nach oben)
$lastRow = 1  # Mindestens Header in Zeile 1
$maxRow = $worksheet.Dimension.End.Row
$maxCol = $worksheet.Dimension.End.Column

if ($null -ne $maxRow -and $maxRow -gt 0) {
    # Suche von der letzten Zeile aufwaerts nach einer nicht-leeren Zeile
    for ($row = $maxRow; $row -ge 1; $row--) {
        $isEmpty = $true
        for ($col = 1; $col -le $maxCol; $col++) {
            $cellValue = $worksheet.Cells[$row, $col].Value
            if ($null -ne $cellValue -and $cellValue.ToString().Trim() -ne "") {
                $isEmpty = $false
                break
            }
        }
        if (-not $isEmpty) {
            $lastRow = $row
            break
        }
    }
}
Write-Host "Aktuelle letzte Zeile (nicht-leer): $lastRow" -ForegroundColor Gray

# Startspalte
$startCol = 3
if ($transferData.targetStartColumn) {
    $startCol = $transferData.targetStartColumn
}
Write-Host "Startspalte: $startCol" -ForegroundColor Gray

# Debug: Zeige JSON-Daten
Write-Host "DEBUG - Anzahl Zeilen in JSON: $($transferData.rows.Count)" -ForegroundColor Magenta

# Zeilen einfuegen
$insertedCount = 0
foreach ($row in $transferData.rows) {
    $newRowNum = $lastRow + $insertedCount + 1
    
    Write-Host "DEBUG - Verarbeite Zeile $newRowNum, Flag='$($row.flag)', Daten=$($row.data.Count) Werte" -ForegroundColor Magenta
    
    # Leerzeile: Nichts schreiben, nur Zeile reservieren
    if ($row.flag -eq "leer") {
        $insertedCount = $insertedCount + 1
        Write-Host "  Zeile ${newRowNum} - Leerzeile eingefuegt" -ForegroundColor Gray
        continue
    }
    
    # Flag in Spalte A (1)
    if ($row.flag) {
        $worksheet.Cells[$newRowNum, 1].Value = $row.flag
        Write-Host "DEBUG - Flag '$($row.flag)' in A$newRowNum geschrieben" -ForegroundColor Magenta
    }
    
    # Kommentar in Spalte B (2)
    if ($row.comment) {
        $worksheet.Cells[$newRowNum, 2].Value = $row.comment
        Write-Host "DEBUG - Kommentar in B$newRowNum geschrieben" -ForegroundColor Magenta
    }
    
    # Daten ab Startspalte
    $colIndex = $startCol
    foreach ($value in $row.data) {
        if ($null -ne $value -and $value -ne "") {
            $worksheet.Cells[$newRowNum, $colIndex].Value = $value
            Write-Host "DEBUG - Wert '$value' in Spalte $colIndex, Zeile $newRowNum" -ForegroundColor Magenta
        }
        $colIndex = $colIndex + 1
    }
    
    $insertedCount = $insertedCount + 1
    Write-Host "  Zeile $newRowNum eingefuegt: Flag=$($row.flag)" -ForegroundColor Gray
}

# Speichern - explizit mit -Save Parameter
Write-Host "DEBUG - Speichere Excel-Datei..." -ForegroundColor Magenta
Close-ExcelPackage $excel -Save

Write-Host "" -ForegroundColor Green
Write-Host "$insertedCount Zeile(n) erfolgreich eingefuegt!" -ForegroundColor Green
Write-Host "Datei gespeichert: $ExcelFile" -ForegroundColor Green
