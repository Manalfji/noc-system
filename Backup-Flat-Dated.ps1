#Requires -Version 2.0

$ErrorActionPreference = "Stop"

$FLCLUSTER_IP = "10.1.1.7"
$DEST_ROOT = "D:\Production"
$CRED_X = "C:\Scripts\backup-cred-x.xml"

# ===== CONFIGURE HERE: How many days back? =====
# 0 = today only, 1 = today + yesterday, 2 = today + 2 days back, etc.
$DaysBack = 1
# ================================================

function Log($msg, $color="White") {
    Write-Host "[$(Get-Date -f 'HH:mm:ss')] $msg" -ForegroundColor $color
}

function Process-Files {
    param(
        [string]$SourceBase,
        [string]$DateString,
        [string]$YearMonth
    )
    
    $files = Get-ChildItem -Path $SourceBase -Recurse -File | Where-Object { $_.Name -like "*_$($DateString)_*" }
    if ($files.Count -eq 0) {
        Log "WARNING: No files found for date $DateString in source" "Yellow"
        return 0
    }
    
    Log "Found $($files.Count) files for date $DateString" "Green"
    foreach ($file in $files) {
        # Extract subfolder path relative to source base, but remove \FULL from path
        $relativePath = $file.FullName.Substring($SourceBase.Length + 1)
        $subDir = Split-Path $relativePath -Parent
        
        # Remove \FULL from path if present (e.g., "AgentsAccounting\FULL" -> "AgentsAccounting")
        $subDir = $subDir -replace "\\FULL$", ""
        if ([string]::IsNullOrEmpty($subDir)) { $subDir = "" }
        
        # Build destination: D:\Production\AgentsAccounting\YYYY-MM\
        $destPath = Join-Path $DEST_ROOT $subDir
        $destPath = Join-Path $destPath $YearMonth
        
        # Create destination folder
        if (!(Test-Path $destPath)) {
            New-Item -ItemType Directory -Force -Path $destPath | Out-Null
        }
        
        # Copy file
        $destFile = Join-Path $destPath $file.Name
        Copy-Item -Path $file.FullName -Destination $destFile -Force
        Log "  Copied: $($file.Name) -> $destPath\" "Gray"
    }
    return $files.Count
}

Log "=== Starting Backup ===" "Cyan"

# Map X: drive
if (!(Test-Path 'X:\')) {
    Log "Mapping X: drive..." "Yellow"
    $cred = Import-Clixml $CRED_X
    New-PSDrive -Name X -PSProvider FileSystem -Root "\\$FLCLUSTER_IP\g$" -Credential $cred -Persist
    Start-Sleep -Seconds 2
}

# Source: flat structure with date in filename
$SourceBase1 = 'X:\BACKUP\FULL\FLCLUSTER$GRDTNT'
$SourceBase2 = 'X:\BACKUP\FULL\Db1$SQLDOTNET'

# Verify source exists
if (!(Test-Path $SourceBase1)) {
    Log "ERROR: Source not found: $SourceBase1" "Red"
    exit 1
}

if (!(Test-Path $SourceBase2)) {
    Log "ERROR: Source not found: $SourceBase2" "Red"
    exit 1
}

# Process each day from today back to DaysBack
for ($i = 0; $i -le $DaysBack; $i++) {
    $TargetDate = (Get-Date).AddDays(-$i)
    $YearMonth = $TargetDate.ToString("yyyy-MM")
    $DateString = $TargetDate.ToString("yyyyMMdd")
    
    Log "Processing date: $DateString ($YearMonth)" "Cyan"
    
    # Process FLCLUSTER$GRDTNT
    $count1 = Process-Files -SourceBase $SourceBase1 -DateString $DateString -YearMonth $YearMonth
    
    # Process Db1$SQLDOTNET
    $count2 = Process-Files -SourceBase $SourceBase2 -DateString $DateString -YearMonth $YearMonth
    
    if ($count1 -eq 0 -and $count2 -eq 0) {
        Log "No files found for $DateString" "Yellow"
    }
}

Log "=== Backup Complete ===" "Green"
