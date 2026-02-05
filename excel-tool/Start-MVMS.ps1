# MVMS Starter
# Startet den Excel-Watcher und oeffnet die Web-App im Browser

$scriptFolder = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MVMS Vertragslisten-Tool             " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Pruefung aller relevanten Dateien
# ============================================

Write-Host "Pruefe Voraussetzungen..." -ForegroundColor Yellow
Write-Host ""

$allFilesOk = $true
$requiredFiles = @(
    @{ Name = "Start-ExcelWatcher.ps1"; Desc = "Watcher-Skript" },
    @{ Name = "Update-Excel.ps1"; Desc = "Excel-Update-Skript" },
    @{ Name = "index.html"; Desc = "Web-Anwendung" }
)

foreach ($file in $requiredFiles) {
    $filePath = Join-Path $scriptFolder $file.Name
    if (Test-Path $filePath) {
        Write-Host "  [OK] $($file.Desc): $($file.Name)" -ForegroundColor Green
    } else {
        Write-Host "  [FEHLT] $($file.Desc): $($file.Name)" -ForegroundColor Red
        $allFilesOk = $false
    }
}

# Excel-Dateien suchen
Write-Host ""
Write-Host "Suche Excel-Dateien..." -ForegroundColor Yellow
$excelFiles = Get-ChildItem -Path $scriptFolder -Filter "*.xlsx" -File -ErrorAction SilentlyContinue
if ($excelFiles.Count -eq 0) {
    Write-Host "  [WARNUNG] Keine Excel-Dateien (.xlsx) gefunden!" -ForegroundColor Yellow
    Write-Host "            Bitte Excel-Dateien in den Ordner kopieren." -ForegroundColor Gray
} else {
    foreach ($excel in $excelFiles) {
        Write-Host "  [OK] $($excel.Name)" -ForegroundColor Green
    }
}

# ImportExcel Modul pruefen
Write-Host ""
Write-Host "Pruefe ImportExcel Modul..." -ForegroundColor Yellow
if (Get-Module -ListAvailable -Name ImportExcel) {
    Write-Host "  [OK] ImportExcel ist installiert" -ForegroundColor Green
} else {
    Write-Host "  [FEHLT] ImportExcel Modul nicht gefunden" -ForegroundColor Red
    Write-Host "          Wird beim ersten Start automatisch installiert." -ForegroundColor Gray
}

# Abbruch bei fehlenden Dateien
if (-not $allFilesOk) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  FEHLER: Nicht alle Dateien vorhanden!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Read-Host "Druecken Sie Enter zum Beenden"
    exit 1
}

# ============================================
# Start
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Alle Pruefungen bestanden!           " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Browser mit index.html oeffnen
$htmlFile = Join-Path $scriptFolder "index.html"
try {
    Start-Process $htmlFile
    Write-Host "[OK] Browser geoeffnet: index.html" -ForegroundColor Green
} catch {
    Write-Host "[FEHLER] Browser konnte nicht geoeffnet werden: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Watcher starten
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starte Excel-Watcher...              " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "TIPP: Zum Beenden dieses Fensters:" -ForegroundColor Yellow
Write-Host "      - Druecken Sie Ctrl+C" -ForegroundColor White
Write-Host "      - Oder schliessen Sie dieses Fenster" -ForegroundColor White
Write-Host ""

$watcherScript = Join-Path $scriptFolder "Start-ExcelWatcher.ps1"

try {
    & $watcherScript
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  FEHLER beim Watcher!                 " -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fehlermeldung: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "Druecken Sie Enter zum Beenden"
    exit 1
}
