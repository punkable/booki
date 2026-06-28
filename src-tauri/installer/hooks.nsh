; Booki — NSIS installer/uninstaller hooks.
; Keeps the machine tidy: on uninstall, remove Booki's per-user data (config and
; logs) so nothing is left behind. Tauri invokes these macros at the matching
; points of the (un)install flow.

!macro NSIS_HOOK_POSTUNINSTALL
  ; Per-user app data: %APPDATA%\Booki (config.json, logs, any temp).
  RMDir /r "$APPDATA\Booki"
  ; Local cache, if WebView2/user-data ever spilled there.
  RMDir /r "$LOCALAPPDATA\Booki"
!macroend
