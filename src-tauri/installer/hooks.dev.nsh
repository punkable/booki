; Booki Dev — NSIS hooks. Touches only the dev install.
; Never deletes %APPDATA%\Booki or the production startup entry.

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode = 1
    StrCpy $DeleteAppDataCheckboxState 0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\*\shell\Booki Dev"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Booki Dev"

  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Booki Dev"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Booki Dev"
  ${EndIf}

  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RMDir /r "$APPDATA\Booki Dev"
    RMDir /r "$LOCALAPPDATA\Booki Dev"
  ${EndIf}
!macroend
