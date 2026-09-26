# Copinex PostgreSQL backup - pg_dump (custom format) with retention.
#
# Usage:
#   .\backup.ps1                                  # defaults: local copinex DB
#   .\backup.ps1 -DbName copinex_test             # back up the test DB
#   .\backup.ps1 -BackupDir D:\backups -RetentionDays 30
#
# Password: set $env:PGPASSWORD first (or pass -DbPassword). Never commit
# credentials to the script.
#
# Output: <BackupDir>/copinex_<timestamp>.dump (compressed custom format),
# plus a log line to <BackupDir>/backup.log. Old dumps are pruned by age.

param(
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 5433,
  [string]$DbUser = "copinex",
  [string]$DbName = "copinex",
  [string]$DbPassword = "",
  [string]$BackupDir = (Join-Path $PSScriptRoot "backups"),
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$pgDump = Join-Path $pgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) { throw "pg_dump not found at $pgDump" }

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

if (-not $env:PGPASSWORD) {
  if (-not $DbPassword) {
    # Fall back to the password in platform/.env (gitignored) so the scheduled
    # task needs no embedded credentials. Parse it from DATABASE_URL.
    $envFile = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) ".env"
    if (Test-Path $envFile) {
      $line = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1)
      if ($line) {
        $DbPassword = [regex]::Match($line, "://[^:]+:([^@]+)@").Groups[1].Value
      }
    }
    if (-not $DbPassword) { throw "No password: set `$env:PGPASSWORD, pass -DbPassword, or add DATABASE_URL to platform/.env" }
  }
  $env:PGPASSWORD = $DbPassword
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$file = Join-Path $BackupDir ("{0}_{1}.dump" -f $DbName, $stamp)

Write-Host "Backing up $DbName@$DbHost`:$DbPort -> $file"

& $pgDump --host $DbHost --port $DbPort --username $DbUser --dbname $DbName `
  --format=custom --compress=9 --file $file
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

$size = (Get-Item $file).Length
if ($size -eq 0) { Remove-Item $file -Force; throw "Backup file is empty - removed, no backup taken" }

$logLine = "{0}  {1}  {2} bytes" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $file, $size
Add-Content -Path (Join-Path $BackupDir "backup.log") -Value $logLine
Write-Host "OK - $size bytes"

# Retention: prune dumps older than RetentionDays (keep the log).
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem $BackupDir -Filter "*.dump" |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Host "Pruning $($_.Name)"
    Remove-Item $_.FullName -Force
  }

Write-Host "Done. Retention: $RetentionDays days."