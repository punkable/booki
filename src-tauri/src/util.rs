//! Small cross-platform helpers.

use base64::Engine;
use std::path::Path;

/// Run blocking work (disk, shell, network, COM) on the blocking thread pool.
/// Sync commands run on the UI thread and plain `async fn` bodies hold an
/// async worker, so slow work in either freezes the dock or starves other
/// commands. Shell helpers initialize COM on their own thread, so they work
/// unchanged here.
pub async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|error| error.to_string())
}

/// Check a path before it goes into a shell file operation. SHFileOperationW
/// takes a list of NUL-separated paths that ends at an empty one, so an empty
/// path or one containing NUL would silently cut the list. A relative path is
/// resolved against the working directory, which is System32 when Booki starts
/// with Windows. Only drive paths (`C:\…`) and UNC paths (`\\server\share…`)
/// are accepted.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn check_shell_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("empty path".into());
    }
    if path.contains('\0') {
        return Err("path contains a NUL character".into());
    }
    let bytes = path.as_bytes();
    let is_sep = |b: u8| b == b'\\' || b == b'/';
    let drive =
        bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && is_sep(bytes[2]);
    let unc = bytes.len() > 2 && is_sep(bytes[0]) && is_sep(bytes[1]) && !is_sep(bytes[2]);
    if drive || unc {
        Ok(())
    } else {
        Err(format!("not an absolute path: {path}"))
    }
}

/// Read an image file and return it as a `data:` URI, for custom tile icons.
pub fn read_image_data_uri(path: &str) -> Option<String> {
    let mime = match Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        // Only images: this must not become a general file reader for the webview.
        _ => return None,
    };
    // A tile icon never needs more; a huge file would stall the dock while it loads.
    const MAX_ICON_BYTES: u64 = 8 * 1024 * 1024;
    if std::fs::metadata(path).ok()?.len() > MAX_ICON_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::{check_shell_path, read_image_data_uri};

    #[test]
    fn shell_paths_must_be_absolute_and_clean() {
        assert!(check_shell_path(r"C:\Users\me\file.txt").is_ok());
        assert!(check_shell_path("d:/data").is_ok());
        assert!(check_shell_path(r"\\server\share\x").is_ok());
        assert!(check_shell_path("").is_err());
        assert!(check_shell_path("   ").is_err());
        assert!(check_shell_path("C:\\a\0b").is_err());
        assert!(check_shell_path("file.txt").is_err());
        assert!(check_shell_path(r"C:file.txt").is_err());
        assert!(check_shell_path(r"\Windows").is_err());
        assert!(check_shell_path(r"\\\x").is_err());
    }

    #[test]
    fn icon_reader_only_returns_images() {
        let dir = std::env::temp_dir().join(format!("booki-icon-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let text = dir.join("secret.txt");
        let png = dir.join("icon.png");
        std::fs::write(&text, b"not an icon").unwrap();
        std::fs::write(&png, b"\x89PNG").unwrap();
        assert_eq!(read_image_data_uri(text.to_str().unwrap()), None);
        assert!(read_image_data_uri(png.to_str().unwrap())
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
