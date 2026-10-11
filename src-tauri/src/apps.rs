//! Launching pinned apps. Uses std::process so it works without extra
//! Win32 bindings; falls back to the shell for non-executable targets.

use std::path::Path;
use std::process::Command;

/// Reject empty / NUL / clearly dangerous URI schemes before ShellExecute.
fn validate_launch_target(path: &str) -> Result<&str, String> {
    let path = path.trim();
    if path.is_empty() || path.contains('\0') {
        return Err("invalid launch path".into());
    }
    let lower = path.to_ascii_lowercase();
    // Block script / remote-code schemes; allow http(s), file paths, shell:,
    // ms-settings:, and other Windows protocol handlers users pin intentionally.
    const BLOCKED: &[&str] = &[
        "javascript:",
        "vbscript:",
        "data:",
        "ms-msdt:",
        "ms-search:",
        "search-ms:",
    ];
    for prefix in BLOCKED {
        if lower.starts_with(prefix) {
            return Err(format!("blocked launch scheme: {prefix}"));
        }
    }
    Ok(path)
}

/// Launch an app/file/shortcut by path with optional arguments.
pub fn launch(path: &str, args: &[String]) -> Result<(), String> {
    let path = validate_launch_target(path)?;
    let p = Path::new(path);

    // Direct spawn works for plain executables.
    let is_exe = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);

    if is_exe {
        let mut cmd = Command::new(path);
        // Cap args so a corrupt pin cannot flood CreateProcess.
        for a in args.iter().take(32) {
            if a.contains('\0') {
                continue;
            }
            cmd.arg(a);
        }
        // No CREATE_NO_WINDOW: it hid console programs (cmd, PowerShell, CLI
        // tools), which then ran with no window at all. Start in the app's own
        // folder, as Explorer does, not in Booki's (System32 at sign-in).
        if let Some(dir) = Path::new(path).parent().filter(|d| d.is_dir()) {
            cmd.current_dir(dir);
        }
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("failed to launch {path}: {e}"));
    }

    // For shortcuts (.lnk), folders, documents or URLs, defer to the shell.
    shell_open(path, args)
}

/// Launch with the shell's "runas" verb: Windows shows the UAC prompt and the
/// app runs as administrator. ShellExecuteW waits for the prompt, so callers
/// keep this off the UI thread.
pub fn launch_elevated(path: &str, args: &[String]) -> Result<(), String> {
    let path = validate_launch_target(path)?;
    shell_execute(path, args, Some("runas"))
}

/// Open the file's containing folder in the file manager (selecting it on Windows).
pub fn reveal(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let parent = Path::new(path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".into());
        let opener = if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        Command::new(opener)
            .arg(parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
fn shell_open(path: &str, args: &[String]) -> Result<(), String> {
    shell_execute(path, args, None)
}

#[cfg(windows)]
fn shell_execute(path: &str, args: &[String], verb: Option<&str>) -> Result<(), String> {
    // ShellExecuteW resolves shortcuts, folders, documents and URLs directly —
    // no cmd.exe in between, so paths/URLs can never be re-parsed as shell
    // syntax (%VAR% expansion, metacharacters), and no console can flash.
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |s: &str| {
        s.encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let wpath = wide(path);
    let params = args
        .iter()
        .take(32)
        .filter(|a| !a.contains('\0'))
        .map(|a| {
            format!(
                "\"{}\"",
                a.replace('"', "").chars().take(1024).collect::<String>()
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    let wparams = wide(&params);
    let wverb = verb.map(wide);
    // A verb launch runs on a worker thread; ShellExecuteW may hand the work
    // to shell extensions, which expect COM on the calling thread. Only the
    // reference taken here is released.
    let com = verb.is_some()
        && unsafe {
            use windows::Win32::System::Com::{
                CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
            };
            CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).is_ok()
        };
    let code = unsafe {
        ShellExecuteW(
            None,
            wverb
                .as_ref()
                .map_or(PCWSTR::null(), |verb| PCWSTR(verb.as_ptr())),
            PCWSTR(wpath.as_ptr()),
            if args.is_empty() {
                PCWSTR::null()
            } else {
                PCWSTR(wparams.as_ptr())
            },
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if com {
        unsafe { windows::Win32::System::Com::CoUninitialize() };
    }
    // Per the API contract, values > 32 mean success.
    if code.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("failed to open {path} (code {})", code.0 as isize))
    }
}

#[cfg(not(windows))]
fn shell_execute(_path: &str, _args: &[String], _verb: Option<&str>) -> Result<(), String> {
    Err("running as administrator is only available on Windows".into())
}

#[cfg(not(windows))]
fn shell_open(path: &str, args: &[String]) -> Result<(), String> {
    // Best-effort cross-platform opener (used during local frontend dev).
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    Command::new(opener)
        .arg(path)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open {path}: {e}"))
}
