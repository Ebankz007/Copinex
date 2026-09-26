# Pre-pilot cleanup - remove test artifacts from a database before go-live.
#
# What it removes:
#   - Test users: e2e@test.dev, flow*@test.dev (and everything they own -
#     wallets, investments, payments, PAMM connections, ... via CASCADE)
#
# What it flags (does NOT delete):
#   - Broker PAMM links that still look like placeholders
#   - Any user with a role of ADMIN other than the operator's real admin
#
# Safe by default: dry-run unless -Execute is passed.
#
# Usage:
#   .\pre-pilot-cleanup.ps1                       # dry run (report only)
#   .\pre-pilot-cleanup.ps1 -Execute              # actually delete
#   .\pre-pilot-cleanup.ps1 -DbName copinex       # target another DB
#
# Password comes from platform/.env DATABASE_URL (same convention as backup.ps1).

param(
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 5433,
  [string]$DbUser = "copinex",
  [string]$DbName = "copinex",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$psql = Join-Path $pgBin "psql.exe"
if (-not (Test-Path $psql)) { throw "psql not found at $psql" }

if (-not $env:PGPASSWORD) {
  $envFile = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) ".env"
  if (Test-Path $envFile) {
    $line = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1)
    if ($line) { $env:PGPASSWORD = [regex]::Match($line, "://[^:]+:([^@]+)@").Groups[1].Value }
  }
  if (-not $env:PGPASSWORD) { throw "No password: set `$env:PGPASSWORD or add DATABASE_URL to platform/.env" }
}

function Query([string]$Sql) {
  & $psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -c $Sql
}

Write-Host "== Pre-pilot cleanup on $DbName (mode: $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })) =="

# 1. Test users
$testUsers = @(Query "SELECT email FROM users WHERE email LIKE 'e2e@test.dev' OR email LIKE 'flow%@test.dev'")
if ($testUsers.Count -gt 0 -and $testUsers[0]) {
  Write-Host "Test users found:"
  foreach ($u in $testUsers) { Write-Host "  - $u" }
  if ($Execute) {
    Query "DELETE FROM users WHERE email LIKE 'e2e@test.dev' OR email LIKE 'flow%@test.dev'" | Out-Null
    Write-Host "Deleted."
  }
} else {
  Write-Host "No test users found."
}

# 2. Placeholder broker links
$placeholderBrokers = @(Query "SELECT name || ' -> ' || pamm_link FROM brokers WHERE pamm_link ILIKE '%example%' OR pamm_link ILIKE '%placeholder%' OR pamm_link ILIKE '%/private/copinex'")
if ($placeholderBrokers.Count -gt 0 -and $placeholderBrokers[0]) {
  Write-Host "WARNING - placeholder broker PAMM links (replace via admin UI, not deleted):"
  foreach ($b in $placeholderBrokers) { Write-Host "  - $b" }
} else {
  Write-Host "Broker PAMM links look real."
}

# 3. Admin accounts - just list them; the operator decides who stays
$admins = @(Query "SELECT email FROM users WHERE role = 'ADMIN'")
Write-Host "Admin accounts on this DB (verify each is intentional):"
foreach ($a in $admins) { Write-Host "  - $a" }

Write-Host "Done."
if (-not $Execute) { Write-Host "Dry run - pass -Execute to apply." }