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
    /// Why the windows are empty: "signin" (sign in again in the app) or
    /// "unavailable" (the service did not answer as expected).
    pub error: Option<&'static str>,
}

/// Every provider signed in on this PC; providers without a local sign-in
/// are left out entirely.
pub fn usage() -> Vec<ProviderUsage> {
    let mut out = Vec::new();
    if let Some(token) = claude_token() {
        out.push(claude(token));
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

/// Claude Code keeps its sign-in in ~/.claude/.credentials.json.
fn claude_token() -> Option<String> {
    let json = read_json(dirs::home_dir()?.join(".claude").join(".credentials.json"))?;
    let token = json.get("claudeAiOauth")?.get("accessToken")?.as_str()?;
    (!token.is_empty()).then(|| token.to_string())
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
            let window = json.get(*key)?;
            let percent = window.get("utilization")?.as_f64()?;
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
