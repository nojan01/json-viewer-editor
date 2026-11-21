# MVMS Excel Watcher
# Ueberwacht den Ordner auf neue JSON-Dateien und fuehrt automatisch Update-Excel.ps1 aus

param(
    [string]$WatchFolder = $PSScriptRoot,
    [string]$TargetWorkbook,
    [string]$TargetSheet
)

# Pfade
$scriptPath = Join-Path $PSScriptRoot "Update-Excel.ps1"
$processedFolder = Join-Path $WatchFolder "verarbeitet"

# Ordner fuer verarbeitete Dateien erstellen
if (-not (Test-Path $processedFolder)) {
    New-Item -ItemType Directory -Path $processedFolder -Force | Out-Null
}

# Pruefe ob Update-Excel.ps1 existiert
if (-not (Test-Path $scriptPath)) {
    Write-Host "FEHLER: Update-Excel.ps1 nicht gefunden in $WatchFolder" -ForegroundColor Red
    Read-Host "Druecken Sie Enter zum Beenden"
    exit 1
}

# ImportExcel Modul pruefen
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Write-Host "ImportExcel Modul wird installiert..." -ForegroundColor Yellow
    Install-Module ImportExcel -Scope CurrentUser -Force
}

Write-Host ""
Write-Host "MVMS Excel Watcher gestartet" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ueberwache: $WatchFolder" -ForegroundColor Yellow
Write-Host ""
Write-Host "Warte auf *_transfer_*.json Dateien..." -ForegroundColor Gray
Write-Host "Druecken Sie Ctrl+C zum Beenden" -ForegroundColor Gray
Write-Host ""

# The operator selects the destination once per watcher session.
if (!$TargetWorkbook) { $TargetWorkbook = Read-Host "Name der freigegebenen XLSX-Datei im überwachten Ordner" }
if (!$TargetSheet) { $TargetSheet = Read-Host "Name des freigegebenen Zielblatts" }
if ([string]::IsNullOrWhiteSpace($TargetSheet) -or
    $TargetWorkbook -notmatch '^[^\\/:*?"<>|]+\.xlsx$') {
    throw "Ungültige Zielmappe oder leeres Zielblatt."
}
$targetPath = Join-Path (Get-Item -LiteralPath $WatchFolder).FullName $TargetWorkbook
$settings = @{ Workbook = $TargetWorkbook; Sheet = $TargetSheet; Path = $targetPath; Script = $scriptPath }

# FileSystemWatcher erstellen (da alles erlaubt ist)
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WatchFolder
$watcher.Filter = "*_transfer_*.json"
$watcher.EnableRaisingEvents = $true

# Event-Handler
$action = {
    $filePath = $Event.SourceEventArgs.FullPath
    $fileName = $Event.SourceEventArgs.Name
    
    # Kurz warten bis Datei vollstaendig geschrieben ist
    Start-Sleep -Milliseconds 500
    
    if (Test-Path $filePath) {
        Write-Host ""
        Write-Host ">>> Neue Datei: $fileName" -ForegroundColor Cyan
        
        try {
            # JSON lesen
            $json = Get-Content -LiteralPath $filePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $settings = $Event.MessageData
            if ($json.excelFile -ne $settings.Workbook -or $json.sheetName -ne $settings.Sheet) {
                throw "Transferziel wurde für diesen Watcher nicht freigegeben."
            }
            $target = Get-Item -LiteralPath $settings.Path -ErrorAction Stop
            if ($target.PSIsContainer -or ($target.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw "Die Zielmappe muss eine reguläre XLSX-Datei sein."
            }
            $watchFolder = Split-Path $filePath -Parent
            & $settings.Script -JsonFile $filePath -ExcelFile $settings.Path -SheetName $settings.Sheet
            if (!$?) { throw "Übertragung fehlgeschlagen." }

            # Datei in verarbeitet-Ordner verschieben
            $processedFolder = Join-Path $watchFolder "verarbeitet"
            $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
            $newName = "$timestamp`_$fileName"
            Move-Item -LiteralPath $filePath -Destination (Join-Path $processedFolder $newName) -Force
            
            Write-Host "    Verschoben nach: verarbeitet\$newName" -ForegroundColor Gray
            
        } catch {
            Write-Host "    FEHLER: $_" -ForegroundColor Red
        }
    }
}

# Event registrieren
Register-ObjectEvent $watcher "Created" -MessageData $settings -Action $action | Out-Null

# Warten (Ctrl+C zum Beenden)
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    $watcher.EnableRaisingEvents = $false
    Get-EventSubscriber | Unregister-Event
    Write-Host "Watcher beendet." -ForegroundColor Yellow
}
