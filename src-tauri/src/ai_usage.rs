//! Opt-in AI plan usage for the AI widget: how much of the current usage
//! windows (Claude's 5-hour and weekly limits, ChatGPT/Codex's primary and
//! secondary windows) is spent.
//!
//! Only runs while the widget is on the dock. It reads the sign-in that
//! Claude Code and Codex already keep on this PC, sends it only to the
//! service it belongs to, and never stores, logs or forwards it. These are
//! the services' own app endpoints, not a public API, so any failure is
//! reported as "unavailable" rather than guessed around.
use serde_json::Value;
use std::io::Read;
use std::path::PathBuf;

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct UsageWindow {
    /// "5h", "week", or a window length such as "5h"/"7d" from the service.
    pub label: String,
    /// Share of the window already used, 0–100.
    pub percent: f64,
    /// When the window resets, as Unix seconds (0 when unknown).
    pub resets_at: i64,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct ProviderUsage {
    pub id: &'static str,
    pub name: &'static str,
    pub windows: Vec<UsageWindow>,
    /// Why the windows are empty: "signin" (sign in again in the app),
    /// "expired" (the saved sign-in has lapsed; opening the app renews it),
    /// "nocode" (the app is installed but no sign-in was found on this PC) or
    /// "unavailable" (the service did not answer as expected).
    pub error: Option<&'static str>,
}

/// Every provider signed in on this PC. Claude stays listed with a reason
/// when it is installed but its sign-in can't be used; providers that are
/// not on this PC at all are left out.
pub fn usage() -> Vec<ProviderUsage> {
    let mut out = Vec::new();
    match claude_credentials() {
        // Refreshing would rotate the refresh token and sign Claude Code out,
        // so a lapsed token is reported instead and Claude Code renews it.
        Some(cred) if cred.expired(now_millis()) => out.push(claude_error("expired")),
        Some(cred) => out.push(claude(cred.token)),
        None if claude_installed() => out.push(claude_error("nocode")),
        None => {}
    }
    if let Some(auth) = codex_auth() {
        out.push(codex(auth));
    }
    out
}

fn get(url: &str, headers: &[(&str, &str)]) -> Result<Value, u16> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build()
        .into();
    let mut req = agent.get(url);
    for (key, value) in headers {
        req = req.header(*key, *value);
    }
    let mut response = req.call().map_err(|_| 0u16)?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(status);
    }
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(256 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|_| 0u16)?;
    serde_json::from_slice(&bytes).map_err(|_| 0u16)
}

fn read_json(path: PathBuf) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn failure(status: u16) -> &'static str {
    if status == 401 || status == 403 {
        "signin"
    } else {
        "unavailable"
    }
}

// ───────────────────────────── Claude ─────────────────────────────

struct ClaudeCredentials {
    token: String,
    /// Unix milliseconds after which the token is refused (0 when unknown).
    expires_at: i64,
}

impl ClaudeCredentials {
    /// A minute of slack so a token about to lapse is not sent.
    fn expired(&self, now_ms: i64) -> bool {
        self.expires_at > 0 && self.expires_at <= now_ms.saturating_add(60_000)
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Folders Claude Code may keep its settings in: $CLAUDE_CONFIG_DIR, then
/// ~/.claude, and %USERPROFILE%\.claude when that differs from the home dir.
fn claude_dirs() -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    let candidates = [
        std::env::var_os("CLAUDE_CONFIG_DIR")
            .filter(|d| !d.is_empty())
            .map(PathBuf::from),
        dirs::home_dir().map(|h| h.join(".claude")),
        std::env::var_os("USERPROFILE")
            .filter(|d| !d.is_empty())
            .map(|p| PathBuf::from(p).join(".claude")),
    ];
    for dir in candidates.into_iter().flatten() {
        if !found.contains(&dir) {
            found.push(dir);
        }
    }
    found
}

/// `{"claudeAiOauth": {"accessToken": "…", "refreshToken": "…",
///   "expiresAt": 1760000000000, "scopes": […]}}`
fn parse_claude_credentials(json: &Value) -> Option<ClaudeCredentials> {
    let oauth = json.get("claudeAiOauth")?;
    let token = oauth.get("accessToken")?.as_str()?;
    if token.is_empty() {
        return None;
    }
    let expires_at = oauth
        .get("expiresAt")
        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()))
        .unwrap_or(0);
    Some(ClaudeCredentials {
        token: token.to_string(),
        expires_at,
    })
}

/// Claude Code keeps its sign-in in .credentials.json inside its settings
/// folder; some builds keep the same JSON in the Windows Credential Manager
/// instead. With several copies, the one that lasts longest wins.
fn claude_credentials() -> Option<ClaudeCredentials> {
    #[allow(unused_mut)]
    let mut found: Vec<ClaudeCredentials> = claude_dirs()
        .into_iter()
        .filter_map(|dir| read_json(dir.join(".credentials.json")))
        .filter_map(|json| parse_claude_credentials(&json))
        .collect();
    #[cfg(windows)]
    found.extend(
        credential_manager::claude_json()
            .iter()
            .filter_map(parse_claude_credentials),
    );
    found.into_iter().max_by_key(|c| {
        if c.expires_at == 0 {
            i64::MAX
        } else {
            c.expires_at
        }
    })
}

/// Claude Code or the Claude desktop app is on this PC, so a missing sign-in
/// is worth explaining instead of hiding Claude.
fn claude_installed() -> bool {
    claude_dirs().iter().any(|d| d.is_dir())
        || dirs::config_dir().is_some_and(|d| d.join("Claude").is_dir())
        || dirs::data_local_dir().is_some_and(|d| d.join("AnthropicClaude").is_dir())
}

fn claude_error(error: &'static str) -> ProviderUsage {
    ProviderUsage {
        id: "claude",
        name: "Claude",
        windows: Vec::new(),
        error: Some(error),
    }
}

#[cfg(windows)]
mod credential_manager {
    use serde_json::Value;
    use windows::core::PCWSTR;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    /// Generic credentials Claude Code may file its sign-in under.
    const TARGETS: [&str; 2] = ["Claude Code-credentials", "Claude Code"];

    pub fn claude_json() -> Vec<Value> {
        TARGETS.iter().filter_map(|t| read(t)).collect()
    }

    fn read(target: &str) -> Option<Value> {
        let wide: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
        let mut cred: *mut CREDENTIALW = std::ptr::null_mut();
        // SAFETY: `wide` is NUL-terminated and outlives the call; on success
        // `cred` points to a buffer that is copied and then freed with CredFree.
        let blob = unsafe {
            CredReadW(PCWSTR(wide.as_ptr()), CRED_TYPE_GENERIC, None, &mut cred).ok()?;
            let c = &*cred;
            let blob = if c.CredentialBlob.is_null() {
                Vec::new()
            } else {
                std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
            };
            CredFree(cred as *const _);
            blob
        };
        decode(&blob)
    }

    /// The blob is UTF-8 JSON, or UTF-16 when written by Windows tools.
    fn decode(blob: &[u8]) -> Option<Value> {
        if let Ok(v) = serde_json::from_slice(blob) {
            return Some(v);
        }
        let units: Vec<u16> = blob
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .collect();
        let text = String::from_utf16(&units).ok()?;
        serde_json::from_str(text.trim_end_matches('\0')).ok()
    }
}

fn claude(token: String) -> ProviderUsage {
    let auth = format!("Bearer {token}");
    let result = get(
        "https://api.anthropic.com/api/oauth/usage",
        &[
            ("Authorization", auth.as_str()),
            ("anthropic-beta", "oauth-2025-04-20"),
        ],
    );
    let (windows, error) = match result {
        Ok(json) => {
            let windows = parse_claude(&json);
            let error = windows.is_empty().then_some("unavailable");
            (windows, error)
        }
        Err(status) => (Vec::new(), Some(failure(status))),
    };
    ProviderUsage {
        id: "claude",
        name: "Claude",
        windows,
        error,
    }
}

/// `{"five_hour": {"utilization": 42.0, "resets_at": "2026-…Z"},
///   "seven_day": {…}}`
fn parse_claude(json: &Value) -> Vec<UsageWindow> {
    [("five_hour", "5h"), ("seven_day", "week")]
        .iter()
        .filter_map(|(key, label)| {
            // An idle window comes back as null or without utilization: 0%.
            let window = json.get(*key)?;
            if window.is_null() {
                return Some(UsageWindow {
                    label: (*label).into(),
                    percent: 0.0,
                    resets_at: 0,
                });
            }
            let percent = window
                .get("utilization")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            let resets_at = window
                .get("resets_at")
                .and_then(Value::as_str)
                .and_then(rfc3339_seconds)
                .unwrap_or(0);
            Some(UsageWindow {
                label: (*label).into(),
                percent: percent.clamp(0.0, 100.0),
                resets_at,
            })
        })
        .collect()
}

/// Seconds since the Unix epoch for an RFC 3339 UTC time such as
/// "2026-10-17T21:00:00.123+00:00" or "…Z". None for anything else.
fn rfc3339_seconds(text: &str) -> Option<i64> {
    let b = text.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return None;
    }
    let num = |range: std::ops::Range<usize>| text.get(range)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
    // Offset, if any, after the seconds and an optional fraction.
    let rest = text[19..].trim_start_matches(|c: char| c == '.' || c.is_ascii_digit());
    let offset = match rest {
        "" | "Z" | "z" => 0,
        _ => {
            let sign = if rest.starts_with('-') { -1 } else { 1 };
            let oh = rest.get(1..3)?.parse::<i64>().ok()?;
            let om = rest.get(4..6)?.parse::<i64>().ok()?;
            sign * (oh * 3600 + om * 60)
        }
    };
    // Days from civil date (Howard Hinnant's algorithm).
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + hh * 3600 + mm * 60 + ss - offset)
}

// ───────────────────────────── Codex / ChatGPT ─────────────────────────────

struct CodexAuth {
    token: String,
    account: Option<String>,
}

/// Codex keeps its ChatGPT sign-in in $CODEX_HOME/auth.json (~/.codex).
fn codex_auth() -> Option<CodexAuth> {
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".codex")))?;
    let json = read_json(home.join("auth.json"))?;
    let tokens = json.get("tokens")?;
    let token = tokens.get("access_token")?.as_str()?.to_string();
    if token.is_empty() {
        return None;
    }
    let account = tokens
        .get("account_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    Some(CodexAuth { token, account })
}

fn codex(auth: CodexAuth) -> ProviderUsage {
    let bearer = format!("Bearer {}", auth.token);
    let mut headers = vec![("Authorization", bearer.as_str())];
    if let Some(account) = auth.account.as_deref() {
        headers.push(("ChatGPT-Account-Id", account));
    }
    let (windows, error) = match get("https://chatgpt.com/backend-api/wham/usage", &headers) {
        Ok(json) => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let windows = parse_codex(&json, now);
            let error = windows.is_empty().then_some("unavailable");
            (windows, error)
        }
        Err(status) => (Vec::new(), Some(failure(status))),
    };
    ProviderUsage {
        id: "chatgpt",
        name: "ChatGPT",
        windows,
        error,
    }
}

/// `{"rate_limit": {"primary_window": {"used_percent": 12,
///   "limit_window_seconds": 18000, "reset_after_seconds": 3600 | "reset_at": …},
///   "secondary_window": {…}}}`
fn parse_codex(json: &Value, now: i64) -> Vec<UsageWindow> {
    let Some(limits) = json.get("rate_limit") else {
        return Vec::new();
    };
    ["primary_window", "secondary_window"]
        .iter()
        .filter_map(|key| {
            let window = limits.get(*key)?;
            let percent = window.get("used_percent")?.as_f64()?;
            let length = window
                .get("limit_window_seconds")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            let label = match length {
                0 => {
                    if *key == "primary_window" {
                        "5h".to_string()
                    } else {
                        "week".to_string()
                    }
                }
                s if s >= 6 * 86_400 => "week".to_string(),
                s if s % 86_400 == 0 => format!("{}d", s / 86_400),
                s => format!("{}h", (s + 1800) / 3600),
            };
            let resets_at = window
                .get("reset_at")
                .and_then(Value::as_i64)
                .or_else(|| {
                    window
                        .get("reset_after_seconds")
                        .and_then(Value::as_i64)
                        .map(|s| now + s)
                })
                .unwrap_or(0);
            Some(UsageWindow {
                label,
                percent: percent.clamp(0.0, 100.0),
                resets_at,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_windows_read_utilization_and_reset() {
        let json: Value = serde_json::from_str(
            r#"{"five_hour":{"utilization":42.5,"resets_at":"2026-10-17T21:00:00.000+00:00"},
                "seven_day":{"utilization":130,"resets_at":null},"other":{}}"#,
        )
        .unwrap();
        let w = parse_claude(&json);
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].label, "5h");
        assert_eq!(w[0].percent, 42.5);
        assert_eq!(w[0].resets_at, 1_792_270_800);
        assert_eq!(w[1].label, "week");
        assert_eq!(w[1].percent, 100.0);
        assert_eq!(w[1].resets_at, 0);
    }

    #[test]
    fn idle_claude_windows_read_as_zero() {
        let json: Value =
            serde_json::from_str(r#"{"five_hour":null,"seven_day":{"utilization":null}}"#).unwrap();
        let w = parse_claude(&json);
        assert_eq!(w.len(), 2);
        assert!(w.iter().all(|w| w.percent == 0.0));
    }

    #[test]
    fn claude_credentials_read_token_and_expiry() {
        let json = serde_json::json!({"claudeAiOauth": {
            "accessToken": "t", "refreshToken": "r", "expiresAt": 2_000_000_000_000_i64}});
        let c = parse_claude_credentials(&json).unwrap();
        assert_eq!(c.token, "t");
        assert!(!c.expired(1_000_000_000_000));
        assert!(c.expired(2_000_000_000_000));
        let json = serde_json::json!({"claudeAiOauth": {"accessToken": "t"}});
        assert!(!parse_claude_credentials(&json).unwrap().expired(i64::MAX));
        let empty = serde_json::json!({"claudeAiOauth": {"accessToken": ""}});
        assert!(parse_claude_credentials(&empty).is_none());
    }

    #[test]
    fn rfc3339_handles_zulu_and_offsets() {
        assert_eq!(rfc3339_seconds("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(rfc3339_seconds("2000-03-01T00:00:00Z"), Some(951_868_800));
        assert_eq!(rfc3339_seconds("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(rfc3339_seconds("yesterday"), None);
    }

    #[test]
    fn codex_windows_name_their_length_and_resolve_resets() {
        let json: Value = serde_json::from_str(
            r#"{"rate_limit":{
                "primary_window":{"used_percent":12,"limit_window_seconds":18000,"reset_after_seconds":600},
                "secondary_window":{"used_percent":55.5,"limit_window_seconds":604800,"reset_at":2000000000}}}"#,
        )
        .unwrap();
        let w = parse_codex(&json, 1000);
        assert_eq!(w[0].label, "5h");
        assert_eq!(w[0].resets_at, 1600);
        assert_eq!(w[1].label, "week");
        assert_eq!(w[1].resets_at, 2_000_000_000);
        assert!(parse_codex(&serde_json::json!({}), 0).is_empty());
    }
}
