; Booki — NSIS installer/uninstaller hooks.
; User config lives in %APPDATA%\Booki (not Tauri's bundle-id folder). Preserve
; it across uninstall/reinstall by default; only wipe when the user checks
; "Delete app data" and this is not an updater (/UPDATE) run.

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean Explorer "Booki" shell verbs (registry only — never touch config).
  DeleteRegKey HKCU "Software\Classes\*\shell\Booki"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Booki"

  ; Wipe per-user data only when the uninstaller checkbox is checked.
  ; $DeleteAppDataCheckboxState / $UpdateMode come from Tauri's NSIS template.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; Real Booki data dir (config.json, profiles, clipboard, logs).
    RMDir /r "$APPDATA\Booki"
    ; Install dir / local cache leftovers (not used for config, but tidy).
    RMDir /r "$LOCALAPPDATA\Booki"
  ${EndIf}
!macroend
