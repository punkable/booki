//! Small cross-platform helpers.

use base64::Engine;
use std::path::Path;

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
    use super::read_image_data_uri;

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
