<#
  Renovo Pro - Local Hardware-Bridge Server launcher.

  Loads local-server.env (next to this script), then runs the standalone
  Next.js server as a supervised child process, restarting it if it ever
  exits. Meant to be run hidden via a Scheduled Task (see install-task.ps1),
  so a log file is the only way anyone will ever see what happened - nothing
  here should rely on console output being visible.
#>

$ErrorActionPreference = 'Stop'

$standaloneDir = Join-Path $PSScriptRoot 'standalone'
$serverJs      = Join-Path $standaloneDir 'server.js'
$envFile       = Join-Path $PSScriptRoot 'local-server.env'
$logsDir       = Join-Path $PSScriptRoot 'logs'
$logFile       = Join-Path $logsDir 'local-server.log'

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

if (-not (Test-Path $serverJs)) {
    Write-Log "FATAL: $serverJs not found. Re-run 'npm run package:local-server' and re-copy this folder."
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Log "FATAL: $envFile not found. Copy local-server.env.example to local-server.env and fill in real values first."
    exit 1
}

# --- Load local-server.env into the process environment ---
foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }

    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 0) { continue }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()

    # Strip one layer of surrounding quotes, if present.
    if ($value.Length -ge 2) {
        $isDoubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
        $isSingleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
        if ($isDoubleQuoted -or $isSingleQuoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }

    Set-Item -Path "Env:$key" -Value $value
}

# This mode always talks to the shared Postgres database - never the
# Electron desktop build's isolated local SQLite copy. Force this even if
# it somehow ended up in local-server.env or the ambient environment.
Remove-Item Env:DATABASE_PROVIDER -ErrorAction SilentlyContinue

if (-not $env:PORT)     { $env:PORT = '3200' }
if (-not $env:HOSTNAME) { $env:HOSTNAME = '127.0.0.1' }
$env:NODE_ENV = 'production'

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Log "FATAL: Node.js was not found on PATH. Install Node.js LTS from https://nodejs.org/ and try again."
    exit 1
}
$nodeExe = $nodeCmd.Source

Write-Log "Launcher starting. Node: $nodeExe  Port: $env:PORT  Hostname: $env:HOSTNAME"

while ($true) {
    Write-Log 'Starting server.js'
    try {
        # server.js's own path must be explicitly quoted here - Start-Process's
        # -ArgumentList does not reliably quote paths containing spaces on its
        # own, and an unquoted path breaks node.exe's argument parsing.
        $quotedServerJs = '"' + $serverJs + '"'
        $proc = Start-Process -FilePath $nodeExe -ArgumentList $quotedServerJs -WorkingDirectory $standaloneDir `
            -WindowStyle Hidden -PassThru -Wait
        Write-Log "server.js exited with code $($proc.ExitCode) - restarting in 5s"
    } catch {
        Write-Log "Failed to start server.js: $($_.Exception.Message) - retrying in 5s"
    }
    Start-Sleep -Seconds 5
}
