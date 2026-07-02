//! Launching pinned apps. Uses std::process so it works without extra
//! Win32 bindings; falls back to the shell for non-executable targets.

use std::path::Path;
use std::process::Command;

/// Launch an app/file/shortcut by path with optional arguments.
pub fn launch(path: &str, args: &[String]) -> Result<(), String> {
    let p = Path::new(path);

    // Direct spawn works for plain executables.
    let is_exe = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);

    if is_exe {
        let mut cmd = Command::new(path);
        cmd.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        return cmd
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("failed to launch {path}: {e}"));
    }

    // For shortcuts (.lnk), folders, documents or URLs, defer to the shell.
    shell_open(path, args)
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
        let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        Command::new(opener)
            .arg(parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
fn shell_open(path: &str, args: &[String]) -> Result<(), String> {
    // ShellExecuteW resolves shortcuts, folders, documents and URLs directly —
    // no cmd.exe in between, so paths/URLs can never be re-parsed as shell
    // syntax (%VAR% expansion, metacharacters), and no console can flash.
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let wpath = wide(path);
    let params = args
        .iter()
        .map(|a| format!("\"{}\"", a.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");
    let wparams = wide(&params);
    let code = unsafe {
        ShellExecuteW(
            None,
            PCWSTR::null(),
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
    // Per the API contract, values > 32 mean success.
    if code.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("failed to open {path} (code {})", code.0 as isize))
    }
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
