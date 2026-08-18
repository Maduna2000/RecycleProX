/**
 * Windows print-queue fallback transport for node-thermal-printer.
 *
 * Covers the gap the Serial and TCP transports (see printerInterface.ts)
 * don't: a USB thermal printer installed as an ordinary Windows print queue
 * (spooler/winspool) rather than exposed as a COM port or a raw network
 * socket — the common case for cheap Epson/POS-58-class printers plugged
 * in via USB, where Windows just shows them as "POS-58" or similar in
 * Devices and Printers rather than a serial port.
 *
 * Deliberately avoids a native addon (no node-gyp, no prebuild-for-Electron
 * risk) — this exists specifically as a lower-risk fallback for when the
 * Serial/TCP paths (or their native `serialport` dependency) don't work,
 * so adding another native module here would defeat the point. Instead it
 * shells out to a small embedded PowerShell script that P/Invokes
 * winspool.drv directly (OpenPrinter/StartDocPrinter RAW/WritePrinter) to
 * push the exact same ESC/POS byte buffer already built by thermal.ts —
 * this is the same technique widely used by POS software to print RAW
 * jobs on Windows without a native binding. Any local printer queue whose
 * driver advertises the RAW datatype (virtually all of them, including
 * "Generic / Text Only" and the OEM thermal printer drivers) accepts this.
 *
 * Server-side only, and only meaningful on win32 — isPrinterConnected()
 * resolves false immediately on any other platform.
 */
import { spawn } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const PS_TIMEOUT_MS = 8_000

// Raw P/Invoke of winspool.drv — StartDocPrinter with datatype "RAW" skips
// any driver-side rendering/translation and writes the byte stream straight
// through to the device, which is exactly what an ESC/POS buffer needs.
const RAW_PRINT_PS = `
param([string]$PrinterName, [string]$FilePath)
Add-Type -Name Spool -Namespace RawPrint -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
public struct DOCINFOA {
  [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
  [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
  [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}
[DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool ClosePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Ansi)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOCINFOA di);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndDocPrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool StartPagePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool EndPagePrinter(IntPtr hPrinter);
[DllImport("winspool.drv", SetLastError=true)]
public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
'@

$hPrinter = [IntPtr]::Zero
if (-not [RawPrint.Spool]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
  Write-Error "OpenPrinter failed for '$PrinterName'"; exit 1
}
try {
  $di = New-Object RawPrint.Spool+DOCINFOA
  $di.pDocName = "Renovo Pro Receipt"
  $di.pDataType = "RAW"
  if (-not [RawPrint.Spool]::StartDocPrinter($hPrinter, 1, [ref]$di)) { Write-Error "StartDocPrinter failed"; exit 1 }
  try {
    if (-not [RawPrint.Spool]::StartPagePrinter($hPrinter)) { Write-Error "StartPagePrinter failed"; exit 1 }
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    $written = 0
    if (-not [RawPrint.Spool]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)) { Write-Error "WritePrinter failed"; exit 1 }
    [RawPrint.Spool]::EndPagePrinter($hPrinter) | Out-Null
  } finally {
    [RawPrint.Spool]::EndDocPrinter($hPrinter) | Out-Null
  }
} finally {
  [RawPrint.Spool]::ClosePrinter($hPrinter) | Out-Null
}
`

function runPowerShell(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args])
    let stderr = ''
    const timer = setTimeout(() => { proc.kill(); reject(new Error('PowerShell print job timed out')) }, PS_TIMEOUT_MS)
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
    proc.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stderr }) })
  })
}

export class WindowsQueuePrinterInterface {
  constructor(private readonly printerName: string) {}

  toJSON() {
    return { transport: 'windows-queue', printerName: this.printerName }
  }

  async isPrinterConnected(): Promise<boolean> {
    if (process.platform !== 'win32' || !this.printerName) return false
    try {
      const { code } = await runPowerShell([
        '-Command',
        `if (-not (Get-Printer -Name '${this.printerName.replace(/'/g, "''")}' -ErrorAction Stop)) { exit 1 }`,
      ])
      return code === 0
    } catch {
      return false
    }
  }

  async execute(buffer: Buffer): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('Windows print-queue printing is only available on Windows')
    }
    if (!this.printerName) {
      throw new Error('No Windows printer queue selected')
    }

    const tmpFile = path.join(tmpdir(), `renovo-print-${randomUUID()}.bin`)
    await writeFile(tmpFile, buffer)
    try {
      const scriptFile = path.join(tmpdir(), `renovo-print-${randomUUID()}.ps1`)
      await writeFile(scriptFile, RAW_PRINT_PS)
      try {
        const { code, stderr } = await runPowerShell(['-File', scriptFile, '-PrinterName', this.printerName, '-FilePath', tmpFile])
        if (code !== 0) throw new Error(stderr.trim() || 'Windows print job failed')
      } finally {
        await unlink(scriptFile).catch(() => {})
      }
    } finally {
      await unlink(tmpFile).catch(() => {})
    }
  }
}
