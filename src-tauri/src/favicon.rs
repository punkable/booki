//! Website pin icons, fetched once when a site is pinned.

/// Fetch a website's favicon as a PNG data URI, so a pinned website shows its
/// real icon. Uses Google's favicon service (one well-known host) and caches the
/// bytes into the pin's icon, so it only hits the network when you add the site.
#[tauri::command]
pub(crate) async fn fetch_favicon(url: String) -> Option<String> {
    use base64::Engine;
    let raw = url.trim();
    // Only http(s) website pins — never arbitrary schemes or local paths.
    let without_scheme = if let Some(rest) = raw.strip_prefix("https://") {
        rest
    } else if let Some(rest) = raw.strip_prefix("http://") {
        rest
    } else if !raw.contains("://") {
        raw
    } else {
        return None;
    };
    let mut host = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split('@')
        .next_back()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    if host.is_empty() || host.len() > 253 {
        return None;
    }
    // Hostname labels only (no spaces / path injection into the Google URL).
    if !host
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
    {
        return None;
    }
    // Some brands live on a subdomain but are pinned by their short name; map those
    // to the host whose favicon is actually the product's (e.g. Gmail's envelope,
    // not the generic Google "G").
    host = match host.as_str() {
        "gmail.com" | "google.com/gmail" => "mail.google.com".to_string(),
        "maps.google.com" | "google.com/maps" => "maps.google.com".to_string(),
        "meet.google.com" => "meet.google.com".to_string(),
        "drive.google.com" => "drive.google.com".to_string(),
        "youtu.be" => "youtube.com".to_string(),
        "x.com" => "x.com".to_string(),
        _ => host,
    };
    // sz=128 → a crisp icon on high-DPI tiles (downscaled cleanly when small).
    let api = format!("https://www.google.com/s2/favicons?sz=128&domain={host}");
    let mut resp = ureq::get(&api)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(6)))
        .build()
        .call()
        .ok()?;
    let mut bytes: Vec<u8> = Vec::new();
    use std::io::Read;
    resp.body_mut()
        .as_reader()
        .take(1_000_000)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() < 64 {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}
