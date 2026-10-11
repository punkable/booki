//! Website pin icons, fetched once when a site is pinned.

/// Fetch a website's favicon as a PNG data URI, so a pinned website shows its
/// real icon. Uses Google's favicon service (one well-known host) and caches the
/// bytes into the pin's icon, so it only hits the network when you add the site.
/// The request blocks for up to 6 s, so it runs on the blocking pool.
#[tauri::command]
pub(crate) async fn fetch_favicon(url: String) -> Option<String> {
    let host = favicon_host(&url)?;
    crate::util::blocking(move || download(&host))
        .await
        .ok()
        .flatten()
}

/// The host whose favicon a pin should show, or None for anything that is not
/// a plain http(s) website.
fn favicon_host(url: &str) -> Option<String> {
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
    let host = without_scheme
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
    // Some brands are pinned by a short domain whose favicon is not the
    // product's; map those to the host that has it (e.g. Gmail's envelope, not
    // the generic Google "G").
    Some(match host.as_str() {
        "gmail.com" => "mail.google.com".to_string(),
        "youtu.be" => "youtube.com".to_string(),
        _ => host,
    })
}

fn download(host: &str) -> Option<String> {
    use base64::Engine;
    use std::io::Read;
    // sz=128 → a crisp icon on high-DPI tiles (downscaled cleanly when small).
    let api = format!("https://www.google.com/s2/favicons?sz=128&domain={host}");
    let mut resp = ureq::get(&api)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(6)))
        .build()
        .call()
        .ok()?;
    let mut bytes: Vec<u8> = Vec::new();
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

#[cfg(test)]
mod tests {
    use super::favicon_host;

    #[test]
    fn host_parsing_keeps_only_plain_web_hosts() {
        assert_eq!(
            favicon_host("https://www.Example.com/path?q=1").as_deref(),
            Some("example.com")
        );
        assert_eq!(
            favicon_host("http://user@site.org:8080/").as_deref(),
            Some("site.org")
        );
        assert_eq!(
            favicon_host("gmail.com").as_deref(),
            Some("mail.google.com")
        );
        assert_eq!(
            favicon_host("https://youtu.be/abc").as_deref(),
            Some("youtube.com")
        );
        assert_eq!(favicon_host("file:///C:/x"), None);
        assert_eq!(favicon_host("https://bad host"), None);
        assert_eq!(favicon_host(""), None);
    }
}
