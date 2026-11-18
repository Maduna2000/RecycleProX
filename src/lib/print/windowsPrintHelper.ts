/**
 * Long-lived PowerShell print helper for the Windows print-queue transport.
 *
 * Starting powershell.exe and compiling the winspool P/Invoke type (Add-Type)
 * costs several seconds on a typical till PC. The original transport paid
 * that on EVERY print, every cash-drawer kick and every 30-second printer
 * status poll. This starts ONE PowerShell, compiles once, then reads one JSON
 * job per line on stdin and answers with one JSON line per job.
 *
 * If the helper cannot start, callers fall back to the original one-shot
 * path (see windowsQueuePrinter.ts), so printing never gets worse than before.
 *
 * Server-side only; meaningful on win32 only.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const START_TIMEOUT_MS = 60_000
const JOB_TIMEOUT_MS = 20_000
const RETRY_AFTER_FAILURE_MS = 60_000

const HELPER_PS = `
$ErrorActionPreference = 'Stop'
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

function Reply($id, $ok, $err) {
  $o = @{ id = $id; ok = $ok }
  if ($err) { $o.error = [string]$err }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Test-Printer([string]$name) {
  $h = [IntPtr]::Zero
  if (-not [RawPrint.Spool]::OpenPrinter($name, [ref]$h, [IntPtr]::Zero)) { return $false }
  [RawPrint.Spool]::ClosePrinter($h) | Out-Null
  return $true
}

function Send-Raw([string]$name, [byte[]]$bytes) {
  $h = [IntPtr]::Zero
  if (-not [RawPrint.Spool]::OpenPrinter($name, [ref]$h, [IntPtr]::Zero)) {
    throw "OpenPrinter failed for '$name' (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
  }
  try {
    $di = New-Object RawPrint.Spool+DOCINFOA
    $di.pDocName = 'Renovo Pro Receipt'
    $di.pDataType = 'RAW'
    if (-not [RawPrint.Spool]::StartDocPrinter($h, 1, [ref]$di)) { throw 'StartDocPrinter failed' }
    try {
      if (-not [RawPrint.Spool]::StartPagePrinter($h)) { throw 'StartPagePrinter failed' }
      $written = 0
      if (-not [RawPrint.Spool]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }
      [RawPrint.Spool]::EndPagePrinter($h) | Out-Null
    } finally {
      [RawPrint.Spool]::EndDocPrinter($h) | Out-Null
    }
  } finally {
    [RawPrint.Spool]::ClosePrinter($h) | Out-Null
  }
}

# Pay PowerShell's one-time first-use costs (JSON cmdlets, first spooler
# lookup, the print path) BEFORE announcing READY. Measured on a till PC: the
# first real job otherwise took ~10s, close to the app's per-job timeout.
try { $null = '{"id":0,"op":"warm"}' | ConvertFrom-Json } catch {}
try { $null = (@{ id = 0; ok = $true } | ConvertTo-Json -Compress) } catch {}
try { $null = Test-Printer 'Renovo warm-up (not a real printer)' } catch {}
try { Send-Raw 'Renovo warm-up (not a real printer)' ([byte[]]@(0)) } catch {}

[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim().Length -eq 0) { continue }
  $id = 0
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    if ($req.op -eq 'check') {
      Reply $id (Test-Printer $req.printer) $null
    } elseif ($req.op -eq 'print') {
      Send-Raw $req.printer ([Convert]::FromBase64String($req.data))
      Reply $id $true $null
    } else {
      Reply $id $false "Unknown operation '$($req.op)'"
    }
  } catch {
    Reply $id $false $_.Exception.Message
  }
}
`

/** The printer itself refused the job — report it, never re-send. */
export class PrinterRejectedError extends Error {}

/**
 * The helper could not be started, so nothing was sent to the printer and the
 * one-shot path is safe to use. Errors from a job already in flight (timeout,
 * helper exit) deliberately do NOT use this: the receipt may still print, and
 * retrying would produce a duplicate.
 */
export class HelperUnavailableError extends Error {}

interface HelperJob {
  resolve: (r: { ok: boolean; error?: string }) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

class PrintHelper {
  private proc: ChildProcessWithoutNullStreams | null = null
  private scriptFile: string | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<number, HelperJob>()
  private nextId = 1
  private buffer = ''
  private brokenUntil = 0

  /** True while a recent start attempt failed — callers use the one-shot path. */
  get unavailable(): boolean {
    return Date.now() < this.brokenUntil
  }

  private cleanupScript() {
    if (this.scriptFile) {
      const f = this.scriptFile
      this.scriptFile = null
      void unlink(f).catch(() => {})
    }
  }

  private failAll(err: Error) {
    for (const [, job] of this.pending) {
      clearTimeout(job.timer)
      job.reject(err)
    }
    this.pending.clear()
  }

  private start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const file = path.join(tmpdir(), `renovo-print-helper-${randomUUID()}.ps1`)
      this.scriptFile = file
      writeFile(file, HELPER_PS).then(() => {
        const proc = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
          { windowsHide: true },
        )
        this.proc = proc
        this.buffer = ''
        let settled = false

        const startTimer = setTimeout(() => {
          if (settled) return
          settled = true
          proc.kill()
          reject(new Error('Print helper did not start in time'))
        }, START_TIMEOUT_MS)

        proc.stdout.on('data', (chunk) => {
          this.buffer += chunk.toString()
          let nl: number
          while ((nl = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, nl).trim()
            this.buffer = this.buffer.slice(nl + 1)
            if (!line) continue
            if (line === 'READY') {
              if (!settled) {
                settled = true
                clearTimeout(startTimer)
                resolve()
              }
              continue
            }
            try {
              const msg = JSON.parse(line) as { id: number; ok: boolean; error?: string }
              const job = this.pending.get(msg.id)
              if (job) {
                clearTimeout(job.timer)
                this.pending.delete(msg.id)
                job.resolve({ ok: msg.ok, error: msg.error })
              }
            } catch {
              // Non-JSON output (a stray host message) — ignore.
            }
          }
        })
        // Drain stderr so the pipe can never fill and stall the helper.
        proc.stderr.on('data', () => {})

        const onGone = (reason: string) => {
          if (this.proc === proc) {
            this.proc = null
            this.ready = null
          }
          this.cleanupScript()
          clearTimeout(startTimer)
          if (!settled) {
            settled = true
            reject(new Error(reason))
          }
          this.failAll(new Error(reason))
        }
        proc.on('error', (e) => onGone(`Print helper failed to start: ${e.message}`))
        proc.on('close', () => onGone('Print helper exited'))
      }, reject)
    })
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.start().catch((err) => {
        this.ready = null
        this.brokenUntil = Date.now() + RETRY_AFTER_FAILURE_MS
        throw err
      })
    }
    return this.ready
  }

  /** Start compiling in the background so the first real print is fast. */
  warm(): void {
    if (process.platform !== 'win32' || this.unavailable) return
    void this.ensureReady().catch(() => {})
  }

  async request(
    op: 'check' | 'print',
    printer: string,
    data?: Buffer,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.ensureReady()
    } catch (err) {
      throw new HelperUnavailableError(err instanceof Error ? err.message : 'Print helper unavailable')
    }
    const proc = this.proc
    if (!proc) throw new HelperUnavailableError('Print helper is not running')
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Print helper timed out'))
      }, JOB_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      const line =
        JSON.stringify({ id, op, printer, ...(data ? { data: data.toString('base64') } : {}) }) + '\n'
      proc.stdin.write(line, (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  shutdown(): void {
    this.proc?.kill()
    this.cleanupScript()
  }
}

const helper = new PrintHelper()
process.once('exit', () => helper.shutdown())

export const printHelper = helper

/** Begin warming the helper (no-op off Windows or right after a failed start). */
export function warmWindowsPrintHelper(): void {
  helper.warm()
}
