; Electron's single-instance lock handles any live app process. Skip the
; electron-builder path scan, which can report stale helper processes.
!macro customCheckAppRunning
!macroend
