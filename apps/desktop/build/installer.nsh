; Match the application executable, not every process under $INSTDIR. The
; upstream path scan can mistake an installer/uninstaller for the app itself.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 500
    ${EndIf}
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      ${nsProcess::Unload}
      SetErrorLevel 2
      Abort "Kansoku is still running. Close Kansoku before installing."
    ${EndIf}
  ${EndIf}
  ${nsProcess::Unload}
!macroend

; NSIS Rename cannot cross volumes. electron-builder's --updated removal
; moves files into $PLUGINSDIR (usually C:), so an installation on D: fails.
; Rename the complete directory to a unique sibling instead. This keeps the
; operation on the same volume and leaves the original intact if it fails.
!macro customRemoveFiles
  Var /GLOBAL kansokuOldInstall
  SetOutPath "$TEMP"
  ${If} ${isUpdated}
    ${GetParent} "$INSTDIR" $R0
    ClearErrors
    GetTempFileName $kansokuOldInstall "$R0"
    ${If} ${Errors}
      SetErrorLevel 2
      Abort "Unable to create an installation backup beside $INSTDIR."
    ${EndIf}
    Delete "$kansokuOldInstall"
    ClearErrors
    Rename "$INSTDIR" "$kansokuOldInstall"
    ${If} ${Errors}
      SetErrorLevel 2
      Abort "Unable to move the old installation at $INSTDIR."
    ${EndIf}
    RMDir /r "$kansokuOldInstall"
    ${If} ${Errors}
      DetailPrint "Old application files remain at $kansokuOldInstall."
      ClearErrors
    ${EndIf}
  ${Else}
    ClearErrors
    RMDir /r "$INSTDIR"
    ${If} ${Errors}
      SetErrorLevel 2
      Abort "Unable to remove the application files at $INSTDIR."
    ${EndIf}
  ${EndIf}
!macroend
