# Copinex Backups — PostgreSQL dump + retention

Two scripts around native `pg_dump` / `pg_restore` (PostgreSQL 16 at
`C:\Program Files\PostgreSQL\16\bin`). The local database runs as a Windows
service (`postgresql-x64-16`) on port **5433** — these defaults match `.env`.

## Backup

```powershell
$env:PGPASSWORD = "copinex_dev_password"   # or pass -DbPassword
.\backup.ps1                                # copinex DB -> .\backups\copinex_<ts>.dump
.\backup.ps1 -DbName copinex_test           # test DB
```

- Custom-format dump (compressed, `-Fc`), timestamped, pruned after
  `-RetentionDays` (default 14). Every run logs to `backups\backup.log`.
- Dumps are gitignored (`*.dump`) — customer data never reaches the repo.

## Restore

```powershell
$env:PGPASSWORD = "copinex_dev_password"
.\restore.ps1 -BackupFile .\backups\copinex_20260926_120000.dump
```

Drops and recreates target objects (`--clean --if-exists`). The target
database must exist. **This overwrites data — verify before running.**

## Scheduled daily backup (Windows Task Scheduler)

Register once (run as the current user, no admin needed for a user-level task):

```powershell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\BerfamWorks\COPINEX\platform\infrastructure\backup\backup.ps1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "Copinex-DB-Backup" -Action $action -Trigger $trigger -Settings $settings -Description "Daily pg_dump of the Copinex database (14-day retention)"
```

Verify with `Get-ScheduledTask -TaskName "Copinex-DB-Backup"` and check
`backups\backup.log` after the first run. Unregister with
`Unregister-ScheduledTask -TaskName "Copinex-DB-Backup" -Confirm:$false`.

## Restore drill (recommended)

Run a restore into a scratch database (`copinex_restore_test`) periodically so
a real disaster is a known procedure, not a first-time event:

```powershell
psql -h 127.0.0.1 -p 5433 -U copinex -c "CREATE DATABASE copinex_restore_test"
.\restore.ps1 -BackupFile <latest.dump> -DbName copinex_restore_test
# sanity-check row counts, then drop the scratch DB
```