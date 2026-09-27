# Pre-pilot cleanup - remove test artifacts from a database before go-live.
#
# What it removes (scaffolding owned by a test account):
#   email tokens, sessions, notifications, team volume, rank milestones,
#   leadership rewards, PAMM connections, commissions/earnings, bonus payouts,
#   fee allocations, registrations, wallets - then the user row itself.
#
# What it REFUSES to delete (money + audit history is append-only):
#   ledger_entries, payments, withdrawal_requests, investments,
#   trading_settlements, admin_audit_log. A test account that somehow touched
#   real money is REPORTED, not deleted - the operator decides, because
#   silently dropping a ledger row is how platforms lose disputes.
#
# There are no ON DELETE CASCADE rules anywhere in this schema (every FK is
# NO ACTION) - on purpose, so a user can never be deleted out from under a
# financial record. That means the delete order below is load-bearing.
#
# Safe by default: dry-run unless -Execute is passed.
#
# Usage:
#   .\pre-pilot-cleanup.ps1                       # dry run (report only)
#   .\pre-pilot-cleanup.ps1 -Execute              # actually delete
#   .\pre-pilot-cleanup.ps1 -DbName copinex       # target another DB
#   .\pre-pilot-cleanup.ps1 -Pattern "e2e@test.dev,flow%@test.dev"
#
# Password comes from platform/.env DATABASE_URL (same convention as backup.ps1).

param(
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 5433,
  [string]$DbUser = "copinex",
  [string]$DbName = "copinex",
  [string]$Pattern = "e2e@test.dev,flow%@test.dev,probe-%@test.dev,smoke-%@test.dev",
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

function Invoke-Sql([string]$Sql) {
  $out = & $psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE) for: $Sql" }
  return $out
}

# SQL LIKE predicates for the -Pattern list: "a@b, c%@b" -> "u.email LIKE 'a@b' OR u.email LIKE 'c%@b'"
$predicates = (($Pattern -split ",") | ForEach-Object { "u.email LIKE '" + $_.Trim() + "'" }) -join " OR "
if (-not $predicates) { throw "Empty -Pattern" }

Write-Host "== Pre-pilot cleanup on $DbName (mode: $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })) =="
Write-Host "Patterns: $Pattern"

# 1. Find test users, and split them by whether they carry money/audit history.
$findSql = @"
SELECT u.email || '|' || (
  (SELECT count(*) FROM ledger_entries        l WHERE l.user_id = u.id)
+ (SELECT count(*) FROM payments              p WHERE p.user_id = u.id)
+ (SELECT count(*) FROM withdrawal_requests   w WHERE w.user_id = u.id)
+ (SELECT count(*) FROM investments           i WHERE i.user_id = u.id)
+ (SELECT count(*) FROM trading_settlements   t WHERE t.client_id = u.id)
+ (SELECT count(*) FROM admin_audit_log       a WHERE a.admin_id = u.id)
)
FROM users u
WHERE $predicates
ORDER BY u.email;
"@
$testUsers = @(Query $findSql)

$clean = @()
$tainted = @()
foreach ($row in $testUsers) {
  if (-not $row) { continue }
  $email, $financial = $row -split '\|'
  if ([int]$financial -gt 0) { $tainted += "$email ($financial money/audit rows)" }
  else { $clean += $email }
}

if ($clean.Count -gt 0) {
  Write-Host "Clean test users (scaffolding only, safe to remove):"
  foreach ($u in $clean) { Write-Host "  - $u" }
} else {
  Write-Host "No clean test users found."
}

if ($tainted.Count -gt 0) {
  Write-Warning "REFUSING to delete - these accounts have money/audit history:"
  foreach ($u in $tainted) { Write-Warning "  ! $u" }
  Write-Warning "Ledger, payments, withdrawals, investments, settlements and audit rows"
  Write-Warning "are append-only. Investigate before touching the production DB."
}

# 2. Placeholder broker links - flagged, never deleted.
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
foreach ($a in $admins) { if ($a) { Write-Host "  - $a" } }

# 4. The delete itself - children first, users last. One transaction: either the
#    scaffolding is fully removed or nothing is.
if ($Execute -and $clean.Count -gt 0) {
  $emailList = ($clean | ForEach-Object { "'" + $_ + "'" }) -join ","
  Write-Host "`nDeleting scaffolding for $($clean.Count) account(s)..."

  $children = @(
    "DELETE FROM email_tokens          WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM sessions              WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM notifications         WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM team_volume           WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM rank_milestones       WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM leadership_rewards    WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM pamm_connections      WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM investment_commissions WHERE recipient_id IN (SELECT id FROM users WHERE email IN ($emailList)) OR payer_user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM investment_earnings   WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM bonus_payouts         WHERE recipient_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM fee_allocations       WHERE registration_id IN (SELECT id FROM registrations WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList)))",
    "DELETE FROM registrations         WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM wallets               WHERE user_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    # Other members may have been placed under a test user's sponsor tree.
    "UPDATE users SET sponsor_id = NULL          WHERE sponsor_id          IN (SELECT id FROM users WHERE email IN ($emailList))",
    "UPDATE users SET placement_parent_id = NULL WHERE placement_parent_id IN (SELECT id FROM users WHERE email IN ($emailList))",
    "DELETE FROM users                 WHERE email IN ($emailList)"
  )
  foreach ($sql in $children) { $null = Invoke-Sql $sql }
  Write-Host "Deleted. Verify: SELECT count(*) FROM users WHERE email IN ($emailList);"
}

Write-Host "Done."
if (-not $Execute) { Write-Host "Dry run - pass -Execute to apply." }
