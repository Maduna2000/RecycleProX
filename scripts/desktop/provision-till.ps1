<#
  Unattended provisioning for a single till/office PC: silently runs the
  Renovo Pro installer (electron-builder's NSIS target already supports
  the standard NSIS "/S" silent flag out of the box — nothing installer-side
  needed for that part) and seeds desktop.env from a network share or local
  path, so a new machine can be set up without anyone clicking through the
  installer wizard or hand-copying a config file.

  Usage:
    .\provision-till.ps1 -InstallerPath \\fileserver\renovopro\RenovoProSetup.exe -DesktopEnvSource \\fileserver\renovopro\desktop.env

  Requires the same admin rights the (now per-machine) installer itself
  needs — run this from an elevated PowerShell prompt.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath,

    [Parameter(Mandatory = $true)]
    [string]$DesktopEnvSource
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InstallerPath)) {
    Write-Error "Installer not found at $InstallerPath"
    exit 1
}
if (-not (Test-Path $DesktopEnvSource)) {
    Write-Error "desktop.env source not found at $DesktopEnvSource"
    exit 1
}

Write-Host "Installing Renovo Pro silently from $InstallerPath ..."
$proc = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru
if ($proc.ExitCode -ne 0) {
    Write-Error "Installer exited with code $($proc.ExitCode) — provisioning aborted."
    exit 1
}

# Matches electron/main.js's getDesktopEnvPath() — package.json's top-level
# "name" field ("renovopro") is what Electron derives this folder name
# from, unless overridden.
$destDir = Join-Path $env:APPDATA 'renovopro'
$destPath = Join-Path $destDir 'desktop.env'

New-Item -ItemType Directory -Path $destDir -Force | Out-Null
Copy-Item -Path $DesktopEnvSource -Destination $destPath -Force

Write-Host "desktop.env copied to $destPath"
Write-Host "Provisioning complete. The app still requires a one-time activation code on first launch — that step is intentionally not automated here (see electron/activation.html)."
