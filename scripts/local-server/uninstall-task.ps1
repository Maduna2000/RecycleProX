<#
  Removes the "RenovoProLocalServer" Scheduled Task registered by
  install-task.ps1. Does not stop an already-running launcher.ps1/node
  process from this session — close those manually via Task Manager if
  needed (look for powershell.exe and node.exe under your user).
#>

$ErrorActionPreference = 'Stop'

$taskName = 'RenovoProLocalServer'

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Output "No Scheduled Task named '$taskName' was found — nothing to do."
    exit 0
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Output "Removed Scheduled Task '$taskName'."
