# Copinex PostgreSQL restore — pg_restore from a custom-format dump.
#
# Usage:
#   .\restore.ps1 -BackupFile .\backups\copinex_20260926_120000.dump
#   .\restore.ps1 -BackupFile <file> -DbName copinex_test
#
# Drops and recreates the target objects (--clean --if-exists). The target
# database must already exist. Password: $env:PGPASSWORD or -DbPassword.
#
# DANGER: this overwrites the target database. Verify the file and target
# before running.

param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 5433,
  [string]$DbUser = "copinex",
  [string]$DbName = "copinex",
  [string]$DbPassword = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) { throw "Backup file not found: $BackupFile" }

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$pgRestore = Join-Path $pgBin "pg_restore.exe"
if (-not (Test-Path $pgRestore)) { throw "pg_restore not found at $pgRestore" }

if (-not $env:PGPASSWORD) {
  if (-not $DbPassword) { throw "No password: set `$env:PGPASSWORD or pass -DbPassword" }
  $env:PGPASSWORD = $DbPassword
}

Write-Host "Restoring $BackupFile -> $DbName@$DbHost`:$DbPort"
Write-Host "WARNING: this drops existing objects in $DbName."

& $pgRestore --host $DbHost --port $DbPort --username $DbUser --dbname $DbName `
  --clean --if-exists --no-owner --no-privileges $BackupFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

Write-Host "Restore complete."