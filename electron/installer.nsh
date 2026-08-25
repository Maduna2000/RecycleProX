; Custom NSIS hooks for the Renovo Pro installer/uninstaller.
;
; Root cause this addresses: when installing over an existing copy,
; electron-builder's generated installer first runs the PREVIOUS version's
; uninstaller to remove old files before copying the new ones. If Renovo Pro
; (or its background server process) is still running — most commonly left
; behind via the tray icon after the window was closed, or a crashed prior
; session — Windows keeps its .exe/.dll files locked, that uninstall step
; fails partway through, and the installer wizard is left stuck with no
; working Cancel/Close button until it eventually times out.
;
; `preInit` runs at the very start of both the installer AND the uninstaller,
; before electron-builder's own "uninstall the previous version" logic gets
; a chance to run — the earliest hook available for this. Best-effort and
; silent: a machine with nothing running simply has nothing to kill.
!macro preInit
  nsExec::Exec 'taskkill /F /IM "Renovo Pro.exe" /T'
  Sleep 500
!macroend
