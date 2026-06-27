//! Small cross-platform helpers.

use base64::Engine;
use std::path::Path;

/// Read an image file and return it as a `data:` URI, for custom tile icons.
pub fn read_image_data_uri(path: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
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
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}
