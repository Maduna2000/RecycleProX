<#
  Registers "RenovoProLocalServer" as a Windows Scheduled Task that runs
  launcher.ps1 hidden at every logon for the current user, restarting it if
  it crashes. Run this once per machine, then log off/on (or just run
  launcher.ps1 directly to test immediately without waiting for a logon).

  No admin elevation required - this is a per-user task (-RunLevel Limited).
#>

$ErrorActionPreference = 'Stop'

$taskName    = 'RenovoProLocalServer'
$launcherPath = Join-Path $PSScriptRoot 'launcher.ps1'

if (-not (Test-Path $launcherPath)) {
    Write-Error "launcher.ps1 not found next to this script ($launcherPath)."
    exit 1
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn

# ExecutionTimeLimit defaults to 3 days in Task Scheduler - without
# overriding it to unlimited, this long-lived server task would get
# silently killed every 3 days. MultipleInstances IgnoreNew guards against
# a double-launch on rapid logon/logoff cycling.
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Output "Registered Scheduled Task '$taskName' - it will start automatically at your next logon."
Write-Output "To start it right now without logging off, run: .\launcher.ps1"
Write-Output "To remove it later, run: .\uninstall-task.ps1"
