# Copinex service supervisor - start/stop/restart/status/watch for API + web.
#
# Usage:
#   .\copinex-service.ps1 start     # start API (:4000) + web (:3000), health-checked
#   .\copinex-service.ps1 stop      # stop both (graceful via PID files)
#   .\copinex-service.ps1 restart   # stop + start
#   .\copinex-service.ps1 status    # PIDs, ports, health
#   .\copinex-service.ps1 watch     # restart whatever is down (health-watch task)
#
# PIDs live in this folder (*.pid); logs in ..\logs with simple rotation
# (api.log -> api.log.1 -> api.log.2, same for web). The API reads its own
# config from platform/.env - no credentials are embedded here.
#
# NOTE: registered as interactive-logon tasks for now. For headless operation
# (machine reboot with nobody logged in), re-register the tasks as SYSTEM from
# an elevated shell - see DEPLOYMENT.md.

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status', 'watch')]
  [string]$Command = 'status'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # platform/
$apiDir = Join-Path $root 'apps\api'
$webDir = Join-Path $root 'apps\web'
$logDir = Join-Path $PSScriptRoot '..\logs'
$apiPidFile = Join-Path $PSScriptRoot 'api.pid'
$webPidFile = Join-Path $PSScriptRoot 'web.pid'
$apiLog = Join-Path $logDir 'api.log'
$webLog = Join-Path $logDir 'web.log'

$API_PORT = 4000
$WEB_PORT = 3000
$API_HEALTH = "http://localhost:$API_PORT/api/health"
$WEB_HEALTH = "http://localhost:$WEB_PORT/api/health"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Rotate-Log([string]$Path) {
  if (Test-Path "$Path.2") { Remove-Item "$Path.2" -Force }
  if (Test-Path "$Path.1") { Move-Item "$Path.1" "$Path.2" -Force }
  if (Test-Path $Path) { Move-Item $Path "$Path.1" -Force }
}

function Get-PidFromFile([string]$File) {
  if (-not (Test-Path $File)) { return $null }
  $pidValue = [int](Get-Content $File -ErrorAction SilentlyContinue)
  if ($pidValue -le 0) { return $null }
  $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if (-not $proc) { return $null }
  return $pidValue
}

function Test-Port([int]$Port) {
  return [bool](netstat -ano | Select-String ":$Port\s" | Select-String 'LISTENING')
}

function Start-One {
  param([string]$Name, [string]$Cwd, [string]$Exe, [string[]]$ProcArgs, [string]$PidFile, [string]$LogFile, [int]$Port, [string]$HealthUrl)

  $existing = Get-PidFromFile $PidFile
  if ($existing) {
    Write-Host "$Name already running (PID $existing) - skipping"
    return
  }
  if (Test-Port $Port) {
    Write-Warning "${Name}: port $Port is occupied by an unknown process. Kill it first (netstat -ano | findstr :$Port)."
    return
  }

  Rotate-Log $LogFile
  $proc = Start-Process -FilePath $Exe -ArgumentList $ProcArgs -WorkingDirectory $Cwd `
    -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" `
    -PassThru -WindowStyle Hidden
  Set-Content -Path $PidFile -Value $proc.Id
  Write-Host "$Name started (PID $($proc.Id)) - waiting for health..."

  $healthy = $false
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
      $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
      if ($res.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
  }
  if ($healthy) {
    Write-Host "$Name healthy at $HealthUrl"
  } else {
    Write-Warning "$Name did not become healthy within 15s - check $LogFile"
  }
}

function Stop-One {
  param([string]$Name, [string]$PidFile, [int]$Port)

  $pidValue = Get-PidFromFile $PidFile
  if ($pidValue) {
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "$Name stopped (PID $pidValue)"
  } elseif (Test-Port $Port) {
    Write-Warning "${Name}: no PID file but port $Port is listening - stop manually."
  } else {
    Write-Host "$Name not running"
  }
}

switch ($Command) {
  'start' {
    Start-One -Name 'API' -Cwd $apiDir -Exe 'node' -ProcArgs @('dist/index.js') `
      -PidFile $apiPidFile -LogFile $apiLog -Port $API_PORT -HealthUrl $API_HEALTH
    Start-One -Name 'WEB' -Cwd $webDir -Exe 'node' -ProcArgs @('node_modules/next/dist/bin/next', 'start', '-p', "$WEB_PORT") `
      -PidFile $webPidFile -LogFile $webLog -Port $WEB_PORT -HealthUrl $WEB_HEALTH
  }
  'stop' {
    Stop-One -Name 'WEB' -PidFile $webPidFile -Port $WEB_PORT
    Stop-One -Name 'API' -PidFile $apiPidFile -Port $API_PORT
  }
  'restart' {
    & $PSCommandPath stop
    Start-Sleep -Seconds 2
    & $PSCommandPath start
  }
  'watch' {
    # Health-watch task: restart whatever is down. Quiet unless something moves.
    $apiPid = Get-PidFromFile $apiPidFile
    $webPid = Get-PidFromFile $webPidFile
    $apiUp = $apiPid -and (Test-Port $API_PORT)
    $webUp = $webPid -and (Test-Port $WEB_PORT)
    if (-not $apiUp -or -not $webUp) {
      Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') watch: API up=$apiUp WEB up=$webUp - restarting"
      & $PSCommandPath restart
    }
  }
  default {
    $apiPid = Get-PidFromFile $apiPidFile
    $webPid = Get-PidFromFile $webPidFile
    $apiPidText = if ($null -eq $apiPid) { 'none' } else { $apiPid }
    $webPidText = if ($null -eq $webPid) { 'none' } else { $webPid }
    Write-Host "API  : PID $apiPidText  port $API_PORT  listening=$(Test-Port $API_PORT)"
    Write-Host "WEB  : PID $webPidText  port $WEB_PORT  listening=$(Test-Port $WEB_PORT)"
    Write-Host "Logs : $logDir"
  }
}
