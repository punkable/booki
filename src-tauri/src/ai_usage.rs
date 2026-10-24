//! Opt-in AI usage for the AI widget, computed only from the usage logs that
//! Claude Code and the Codex CLI already write on this PC. Cursor and
//! OpenCode expose presence through folder metadata only, without quota.
//!
//! Privacy contract: this module never reads, uses, stores or sends any
//! sign-in, token or credential, and makes no network request. It only opens
//! the tools' session logs (`*.jsonl`) read-only, and of each line it keeps
//! the usage numbers and timestamps; message text is never kept.
//!
//! - Claude Code: `<config dir>/projects/**/*.jsonl`. Local logs carry no plan
//!   limits, so Claude reports tokens in the current 5-hour block and in the
//!   last 7 days, plus when the block ends.
//! - Codex CLI: `<codex home>/sessions/**/*.jsonl`. Its `token_count` events
//!   carry the plan's own rate-limit percentages, which are shown as is.
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

/// Only logs touched within this window are opened.
const WEEK: i64 = 7 * 86_400;
/// Claude's session window.
const BLOCK: i64 = 5 * 3600;
/// Upper bound on log bytes read per provider and poll.
const MAX_BYTES: u64 = 64 * 1024 * 1024;
/// How deep the log folders are walked.
const MAX_DEPTH: usize = 6;

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct UsageWindow {
    /// "5h", "week", or a window length such as "2h"/"3d".
    pub label: String,
    /// Share of the window already used, 0–100 (as reported by the tool).
    pub percent: f64,
    /// When the window resets, as Unix seconds (0 when unknown).
    pub resets_at: i64,
}

/// Claude's current 5-hour block, from its local logs.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct UsageBlock {
    /// Tokens (input + output + cache writes + cache reads) in the block.
    pub tokens: u64,
    /// Block start (the first message's hour, floored), Unix seconds.
    pub started_at: i64,
    /// When the block ends, Unix seconds.
    pub resets_at: i64,
    /// Share of the 5 hours already elapsed, 0–100. Time, not a plan limit.
    pub elapsed_percent: f64,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct ProviderUsage {
    pub id: &'static str,
    pub name: &'static str,
    /// Local tool data exists; false means discovery found no source on this PC.
    pub detected: bool,
    /// Plan windows with real percentages when published in Codex logs.
    pub windows: Vec<UsageWindow>,
    /// The active 5-hour block (Claude), None when idle for 5 hours.
    pub block: Option<UsageBlock>,
    /// Tokens in the last 7 days.
    pub week_tokens: u64,
    /// Last logged activity, Unix seconds (0 when none in 7 days).
    pub last_activity: i64,
}

/// The four supported providers, with explicit source discovery. An absent
/// source is represented instead of silently removing the provider.
pub fn usage() -> Vec<ProviderUsage> {
    usage_from_roots(
        &claude_dirs(),
        &codex_homes(),
        &cursor_data_dirs(),
        &opencode_data_dirs(),
        now_secs(),
    )
}

fn usage_from_roots(
    claude: &[PathBuf],
    codex: &[PathBuf],
    cursor: &[PathBuf],
    opencode: &[PathBuf],
    now: i64,
) -> Vec<ProviderUsage> {
    let mut entries = Vec::new();
    let roots: Vec<_> = claude.iter().map(|d| d.join("projects")).collect();
    read_logs(&roots, now, |line| {
        if let Some(entry) = parse_claude_line(line) {
            entries.push(entry);
        }
    });
    let mut claude_usage = claude_usage(entries, now);
    claude_usage.detected = claude.iter().any(|path| path.is_dir());
    let mut events = Vec::new();
    let roots: Vec<_> = codex
        .iter()
        .flat_map(|dir| [dir.join("sessions"), dir.join("archived_sessions")])
        .collect();
    read_logs_from(&roots, now, |path, line| {
        if let Some(mut event) = parse_codex_line(line) {
            event.session = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            events.push(event);
        }
    });
    let mut codex_usage = codex_usage(events, now);
    codex_usage.detected = codex.iter().any(|path| path.is_dir());
    // Cursor/OpenCode discovery uses directory metadata only. Their account
    // databases and credentials are never opened for a subscription allowance.
    vec![
        claude_usage,
        codex_usage,
        discovered("cursor", "Cursor", cursor),
        discovered("opencode", "OpenCode", opencode),
    ]
}

fn discovered(id: &'static str, name: &'static str, roots: &[PathBuf]) -> ProviderUsage {
    ProviderUsage {
        id,
        name,
        detected: roots.iter().any(|path| path.is_dir()),
        windows: Vec::new(),
        block: None,
        week_tokens: 0,
        last_activity: 0,
    }
}

fn unique_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

pub(crate) fn cursor_data_dirs() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".cursor"));
    }
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("Cursor"));
    }
    if let Some(data) = dirs::data_local_dir() {
        paths.push(data.join("Cursor"));
    }
    unique_paths(paths)
}

pub(crate) fn opencode_data_dirs() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(data) = std::env::var_os("XDG_DATA_HOME").filter(|value| !value.is_empty()) {
        paths.push(PathBuf::from(data).join("opencode"));
    }
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".local").join("share").join("opencode"));
    }
    if let Some(data) = dirs::data_local_dir() {
        paths.push(data.join("opencode"));
    }
    if let Some(config) = dirs::config_dir() {
        paths.push(config.join("opencode"));
    }
    unique_paths(paths)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ───────────────────────────── Log files ─────────────────────────────

/// Calls `each` with every line (that may hold usage) of the `.jsonl` files
/// under `roots` modified in the last 7 days, newest first, until the byte
/// budget runs out. Files are opened read-only and streamed.
fn read_logs(roots: &[PathBuf], now: i64, mut each: impl FnMut(&[u8])) {
    read_logs_from(roots, now, |_, line| each(line));
}

fn read_logs_from(roots: &[PathBuf], now: i64, mut each: impl FnMut(&Path, &[u8])) {
    let mut files = Vec::new();
    for root in roots {
        collect_jsonl(root, now - WEEK, 0, &mut files);
    }
    files.sort_by_key(|f| std::cmp::Reverse(f.1));
    let mut budget = MAX_BYTES;
    let mut line = Vec::new();
    for (path, _) in files {
        if budget == 0 {
            break;
        }
        let Ok(file) = std::fs::File::open(&path) else {
            continue;
        };
        let mut reader = BufReader::new(file.take(budget));
        loop {
            line.clear();
            match reader.read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    budget = budget.saturating_sub(n as u64);
                    each(&path, &line);
                }
            }
        }
        line.clear();
    }
}

pub(crate) fn collect_jsonl(dir: &Path, since: i64, depth: usize, out: &mut Vec<(PathBuf, i64)>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_dir() {
            collect_jsonl(&path, since, depth + 1, out);
        } else if kind.is_file() && path.extension().is_some_and(|e| e == "jsonl") {
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            if modified >= since {
                out.push((path, modified));
            }
        }
    }
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

// ───────────────────────────── Claude Code ─────────────────────────────

/// $CLAUDE_CONFIG_DIR (comma-separated list allowed), else ~/.claude and
/// ~/.config/claude.
pub(crate) fn claude_dirs() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(list) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        paths.extend(
            list.to_string_lossy()
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(PathBuf::from),
        );
    }
    if let Some(home) = dirs::home_dir() {
        paths.extend([home.join(".claude"), home.join(".config").join("claude")]);
    }
    if let Some(config) = std::env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
        paths.push(PathBuf::from(config).join("claude"));
    }
    unique_paths(paths)
}

/// Only the fields needed for usage; everything else in the line (message
/// text, tool calls…) is skipped by serde and never kept.
#[derive(Deserialize)]
struct ClaudeLine {
    timestamp: Option<String>,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    message: Option<ClaudeMessage>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    id: Option<String>,
    usage: Option<ClaudeTokens>,
}

#[derive(Deserialize, Default)]
struct ClaudeTokens {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
}

#[derive(Debug, Clone, PartialEq)]
struct ClaudeEntry {
    at: i64,
    tokens: u64,
    /// message.id + requestId, when both are present (streaming repeats).
    key: Option<String>,
}

fn parse_claude_line(line: &[u8]) -> Option<ClaudeEntry> {
    if !contains(line, b"\"usage\"") {
        return None;
    }
    let parsed: ClaudeLine = serde_json::from_slice(line).ok()?;
    let at = rfc3339_seconds(parsed.timestamp.as_deref()?)?;
    let message = parsed.message?;
    let u = message.usage?;
    let tokens = u.input_tokens
        + u.output_tokens
        + u.cache_creation_input_tokens
        + u.cache_read_input_tokens;
    let key = match (message.id, parsed.request_id) {
        (Some(m), Some(r)) => Some(format!("{m}:{r}")),
        _ => None,
    };
    Some(ClaudeEntry { at, tokens, key })
}

/// Drops repeats of the same message/request and anything older than 7 days,
/// sorted by time.
fn dedup_claude(entries: Vec<ClaudeEntry>, now: i64) -> Vec<ClaudeEntry> {
    let mut seen = HashSet::new();
    let mut kept: Vec<ClaudeEntry> = entries
        .into_iter()
        .filter(|e| e.at >= now - WEEK && e.at <= now + 300)
        .filter(|e| e.key.as_ref().map_or(true, |k| seen.insert(k.clone())))
        .collect();
    kept.sort_by_key(|e| e.at);
    kept
}

/// The 5-hour block still running at `now`, like ccusage: a block starts at
/// its first message's hour, floored, and lasts 5 hours; a message more than
/// 5 hours after the block start (or after the previous message) opens a new
/// one. `entries` must be sorted by time.
fn current_block(entries: &[ClaudeEntry], now: i64) -> Option<UsageBlock> {
    let mut start: Option<i64> = None;
    let mut last = 0;
    let mut tokens = 0u64;
    for e in entries {
        match start {
            Some(s) if e.at - s < BLOCK && e.at - last < BLOCK => tokens += e.tokens,
            _ => {
                start = Some(e.at - e.at.rem_euclid(3600));
                tokens = e.tokens;
            }
        }
        last = e.at;
    }
    let start = start?;
    let end = start + BLOCK;
    if now >= end || now - last >= BLOCK {
        return None;
    }
    let elapsed = ((now - start) as f64 / BLOCK as f64 * 100.0).clamp(0.0, 100.0);
    Some(UsageBlock {
        tokens,
        started_at: start,
        resets_at: end,
        elapsed_percent: elapsed,
    })
}

fn claude_usage(entries: Vec<ClaudeEntry>, now: i64) -> ProviderUsage {
    let entries = dedup_claude(entries, now);
    ProviderUsage {
        id: "claude",
        name: "Claude",
        detected: true,
        // Real plan percentages, when the opt-in status line has reported them.
        windows: crate::agent_bridge::plan_windows(now),
        block: current_block(&entries, now),
        week_tokens: entries.iter().map(|e| e.tokens).sum(),
        last_activity: entries.last().map_or(0, |e| e.at),
    }
}

// ───────────────────────────── Codex CLI ─────────────────────────────

/// Custom and default Codex homes, so a stale override cannot hide local sessions.
pub(crate) fn codex_homes() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = std::env::var_os("CODEX_HOME").filter(|value| !value.is_empty()) {
        paths.push(PathBuf::from(home));
    }
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".codex"));
    }
    unique_paths(paths)
}

/// `{"timestamp": "…", "type": "event_msg", "payload": {"type":
/// "token_count", "info": {…}, "rate_limits": {…}}}`. Only the usage fields
/// are deserialized; other payloads are skipped.
#[derive(Deserialize)]
struct CodexLine {
    timestamp: Option<String>,
    payload: Option<CodexPayload>,
}

#[derive(Deserialize)]
struct CodexPayload {
    #[serde(rename = "type")]
    kind: Option<String>,
    info: Option<CodexInfo>,
    rate_limits: Option<Value>,
}

#[derive(Deserialize)]
struct CodexInfo {
    total_token_usage: Option<CodexTokens>,
    last_token_usage: Option<CodexTokens>,
}

#[derive(Deserialize, Clone, Copy)]
struct CodexTokens {
    #[serde(default)]
    total_tokens: u64,
}

#[derive(Debug, Clone, PartialEq)]
struct CodexEvent {
    session: String,
    at: i64,
    /// Tokens of this turn.
    tokens: u64,
    /// Session total so far, to skip repeated events.
    total: u64,
    windows: Vec<UsageWindow>,
}

fn parse_codex_line(line: &[u8]) -> Option<CodexEvent> {
    if !contains(line, b"\"token_count\"") {
        return None;
    }
    let parsed: CodexLine = serde_json::from_slice(line).ok()?;
    let payload = parsed.payload?;
    if payload.kind.as_deref() != Some("token_count") {
        return None;
    }
    let at = rfc3339_seconds(parsed.timestamp.as_deref()?)?;
    let (tokens, total) = match &payload.info {
        Some(info) => (
            info.last_token_usage.map_or(0, |t| t.total_tokens),
            info.total_token_usage.map_or(0, |t| t.total_tokens),
        ),
        None => (0, 0),
    };
    let windows = payload
        .rate_limits
        .as_ref()
        .map(|r| parse_rate_limits(r, at))
        .unwrap_or_default();
    Some(CodexEvent {
        session: String::new(),
        at,
        tokens,
        total,
        windows,
    })
}

fn window_label(minutes: i64, primary: bool) -> String {
    match minutes {
        m if m <= 0 => if primary { "5h" } else { "week" }.to_string(),
        m if m >= 6 * 1440 => "week".to_string(),
        m if m % 1440 == 0 => format!("{}d", m / 1440),
        m => format!("{}h", (m + 30) / 60),
    }
}

/// Reads both shapes Codex has written:
/// - newer: `{"primary": {"used_percent", "window_minutes", "resets_at" |
///   "resets_in_seconds"}, "secondary": {…}}`
/// - older: `{"primary_used_percent", "primary_window_minutes",
///   "primary_resets_in_seconds", "secondary_…"}`
///
/// `at` is the event time, which relative reset times count from.
fn parse_rate_limits(r: &Value, at: i64) -> Vec<UsageWindow> {
    let num = |v: Option<&Value>| {
        v.and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
            .filter(|n| n.is_finite())
    };
    ["primary", "secondary"]
        .iter()
        .filter_map(|key| {
            let nested = r.get(*key).filter(|v| v.is_object());
            let field = |name: &str| match nested {
                Some(w) => num(w.get(name)),
                None => num(r.get(format!("{key}_{name}"))),
            };
            let percent = field("used_percent")?;
            let minutes = field("window_minutes").unwrap_or(0.0) as i64;
            let resets_at = field("resets_at")
                .map(|s| s as i64)
                .or_else(|| field("resets_in_seconds").map(|s| at + s as i64))
                .or_else(|| field("resets_after_seconds").map(|s| at + s as i64))
                .unwrap_or(0);
            Some(UsageWindow {
                label: window_label(minutes, *key == "primary"),
                percent: percent.clamp(0.0, 100.0),
                resets_at,
            })
        })
        .collect()
}

fn codex_usage(mut events: Vec<CodexEvent>, now: i64) -> ProviderUsage {
    events.retain(|e| e.at >= now - WEEK && e.at <= now + 300);
    events.sort_by_key(|e| e.at);
    // Codex may log the same token_count twice; count each total once.
    let mut seen = HashSet::new();
    let week_tokens = events
        .iter()
        .filter(|e| e.tokens > 0 && seen.insert((e.session.as_str(), e.total, e.tokens)))
        .map(|e| e.tokens)
        .sum();
    // The latest snapshot of the plan's windows; a window whose reset time
    // has passed since then has started over at 0%.
    let windows = events
        .iter()
        .rev()
        .find(|e| !e.windows.is_empty())
        .map(|e| {
            e.windows
                .iter()
                .map(|w| {
                    if w.resets_at > 0 && w.resets_at <= now {
                        UsageWindow {
                            label: w.label.clone(),
                            percent: 0.0,
                            resets_at: 0,
                        }
                    } else {
                        w.clone()
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    // Without rate limits in the logs, the week's token total stands in.
    ProviderUsage {
        id: "codex",
        name: "Codex",
        detected: true,
        windows,
        block: None,
        week_tokens,
        last_activity: events.last().map_or(0, |e| e.at),
    }
}

/// Seconds since the Unix epoch for an RFC 3339 time such as
/// "2026-10-17T21:00:00.123Z" or "…+02:00". None for anything else.
fn rfc3339_seconds(text: &str) -> Option<i64> {
    let b = text.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || (b[10] != b'T' && b[10] != b' ') {
        return None;
    }
    let num = |range: std::ops::Range<usize>| text.get(range)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
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

#[cfg(test)]
mod tests {
    use super::*;

    const T0: &str = "2026-10-17T10:20:00.000Z"; // block starts 10:00
    fn t(s: &str) -> i64 {
        rfc3339_seconds(s).unwrap()
    }
    fn claude_line(ts: &str, id: &str, req: &str, input: u64, output: u64) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{ts}","requestId":"{req}","message":{{"id":"{id}","model":"claude-x","role":"assistant","content":[{{"type":"text","text":"secret words"}}],"usage":{{"input_tokens":{input},"output_tokens":{output},"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}}}}}"#
        )
    }

    #[test]
    fn rfc3339_handles_zulu_and_offsets() {
        assert_eq!(rfc3339_seconds("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(rfc3339_seconds("2000-03-01T00:00:00Z"), Some(951_868_800));
        assert_eq!(rfc3339_seconds("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(rfc3339_seconds("yesterday"), None);
    }

    #[test]
    fn claude_lines_keep_only_usage() {
        let e = parse_claude_line(claude_line(T0, "m1", "r1", 100, 50).as_bytes()).unwrap();
        assert_eq!(e.tokens, 165);
        assert_eq!(e.at, t(T0));
        assert_eq!(e.key.as_deref(), Some("m1:r1"));
        // User lines, garbage and lines without a timestamp are ignored.
        assert!(parse_claude_line(br#"{"type":"user","message":{"content":"hi"}}"#).is_none());
        assert!(parse_claude_line(b"{\"usage\": not json").is_none());
        assert!(parse_claude_line(br#"{"message":{"usage":{"input_tokens":1}}}"#).is_none());
    }

    #[test]
    fn claude_streaming_repeats_count_once() {
        let lines = [
            claude_line(T0, "m1", "r1", 100, 50),
            claude_line(T0, "m1", "r1", 100, 50),
            claude_line("2026-10-17T10:30:00Z", "m2", "r2", 1000, 0),
        ];
        let entries: Vec<_> = lines
            .iter()
            .filter_map(|l| parse_claude_line(l.as_bytes()))
            .collect();
        let now = t("2026-10-17T11:00:00Z");
        let u = claude_usage(entries, now);
        assert_eq!(u.week_tokens, 165 + 1015);
        let block = u.block.unwrap();
        assert_eq!(block.tokens, 1180);
        assert_eq!(block.started_at, t("2026-10-17T10:00:00Z"));
        assert_eq!(block.resets_at, t("2026-10-17T15:00:00Z"));
        assert!((block.elapsed_percent - 20.0).abs() < 1e-9);
        assert_eq!(u.last_activity, t("2026-10-17T10:30:00Z"));
    }

    #[test]
    fn claude_blocks_roll_over_after_five_hours() {
        let e = |s: &str, tokens| ClaudeEntry {
            at: t(s),
            tokens,
            key: None,
        };
        let entries = vec![
            e("2026-10-17T10:20:00Z", 1),
            e("2026-10-17T14:50:00Z", 2),
            // 15:10 is past 10:00 + 5h: a new block from 15:00.
            e("2026-10-17T15:10:00Z", 4),
        ];
        let b = current_block(&entries, t("2026-10-17T16:00:00Z")).unwrap();
        assert_eq!(b.tokens, 4);
        assert_eq!(b.started_at, t("2026-10-17T15:00:00Z"));
        // Idle for 5 hours: no active block, but the week still counts.
        assert!(current_block(&entries, t("2026-10-17T20:00:00Z")).is_none());
        let u = claude_usage(entries, t("2026-10-17T21:00:00Z"));
        assert!(u.block.is_none());
        assert_eq!(u.week_tokens, 7);
        // Older than a week is dropped.
        let old = vec![e("2026-10-01T10:00:00Z", 9)];
        assert_eq!(claude_usage(old, t("2026-10-17T21:00:00Z")).week_tokens, 0);
    }

    #[test]
    fn codex_new_shape_reads_percentages_and_resets() {
        let line = r#"{"timestamp":"2026-10-17T10:00:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":900,"output_tokens":100,"total_tokens":1000},"last_token_usage":{"total_tokens":400}},"rate_limits":{"primary":{"used_percent":12.5,"window_minutes":300,"resets_at":2000000000},"secondary":{"used_percent":40,"window_minutes":10080,"resets_in_seconds":3600}}}}"#;
        let e = parse_codex_line(line.as_bytes()).unwrap();
        assert_eq!(e.tokens, 400);
        assert_eq!(e.windows[0].label, "5h");
        assert_eq!(e.windows[0].percent, 12.5);
        assert_eq!(e.windows[0].resets_at, 2_000_000_000);
        assert_eq!(e.windows[1].label, "week");
        assert_eq!(e.windows[1].resets_at, t("2026-10-17T11:00:00Z"));
        // Twice the same event counts once; a passed reset reads as 0%.
        let u = codex_usage(vec![e.clone(), e], t("2026-10-17T12:00:00Z"));
        assert_eq!(u.week_tokens, 400);
        assert_eq!(u.windows[0].percent, 12.5);
        assert_eq!(u.windows[1].percent, 0.0);
    }

    #[test]
    fn codex_old_shape_and_missing_limits() {
        let line = r#"{"timestamp":"2026-10-17T10:00:00Z","type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":{"primary_used_percent":55,"secondary_used_percent":7,"primary_window_minutes":300,"secondary_window_minutes":10080,"primary_resets_in_seconds":60}}}"#;
        let e = parse_codex_line(line.as_bytes()).unwrap();
        assert_eq!(e.windows.len(), 2);
        assert_eq!(e.windows[0].percent, 55.0);
        assert_eq!(e.windows[0].resets_at, t("2026-10-17T10:01:00Z"));
        assert_eq!(e.windows[1].label, "week");
        let bare = r#"{"timestamp":"2026-10-17T10:00:00Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":5}}}}"#;
        let e = parse_codex_line(bare.as_bytes()).unwrap();
        assert!(e.windows.is_empty());
        let u = codex_usage(vec![e], t("2026-10-17T11:00:00Z"));
        assert!(u.windows.is_empty());
        assert_eq!(u.week_tokens, 5);
        // Messages that merely mention token_count are not events.
        let chat = r#"{"timestamp":"2026-10-17T10:00:00Z","type":"response_item","payload":{"type":"message","content":"token_count"}}"#;
        assert!(parse_codex_line(chat.as_bytes()).is_none());
    }

    #[test]
    fn logs_are_read_from_recent_jsonl_files() {
        let dir = std::env::temp_dir().join(format!("booki-ai-{}", std::process::id()));
        let nested = dir.join("projects").join("p");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(
            nested.join("s.jsonl"),
            format!("{}\nnot json\n", claude_line(T0, "m", "r", 1, 1)),
        )
        .unwrap();
        std::fs::write(nested.join("notes.txt"), "\"usage\"").unwrap();
        let mut n = 0;
        read_logs(&[dir.join("projects")], now_secs(), |l| {
            if parse_claude_line(l).is_some() {
                n += 1;
            }
        });
        std::fs::remove_dir_all(&dir).ok();
        assert_eq!(n, 1);
    }
    #[test]
    fn all_providers_explain_missing_local_sources() {
        let providers = usage_from_roots(&[], &[], &[], &[], t(T0));
        assert_eq!(
            providers
                .iter()
                .map(|provider| provider.id)
                .collect::<Vec<_>>(),
            vec!["claude", "codex", "cursor", "opencode"]
        );
        assert!(providers.iter().all(|provider| !provider.detected
            && provider.windows.is_empty()
            && provider.week_tokens == 0));
    }

    #[test]
    fn provider_discovery_uses_all_homes_archives_and_metadata_only_for_other_tools() {
        let root = std::env::temp_dir().join(format!("booki-ai-discovery-{}", std::process::id()));
        let claude = root.join("claude");
        let codex = root.join("codex");
        let cursor = root.join("cursor");
        let opencode = root.join("opencode");
        for path in [
            claude.join("projects"),
            codex.join("archived_sessions"),
            cursor.clone(),
            opencode.clone(),
        ] {
            std::fs::create_dir_all(path).unwrap();
        }
        std::fs::write(
            claude.join("projects/session.jsonl"),
            claude_line(T0, "fixture", "request", 100, 50),
        )
        .unwrap();
        let event = format!(
            r#"{{"timestamp":"{T0}","payload":{{"type":"token_count","info":null,"rate_limits":{{"primary":{{"used_percent":25,"window_minutes":300}}}}}}}}"#
        );
        std::fs::write(codex.join("archived_sessions/session.jsonl"), &event).unwrap();
        // These fixture files must never become usage sources for these providers.
        std::fs::write(cursor.join("auth.json"), &event).unwrap();
        std::fs::write(opencode.join("opencode.db"), &event).unwrap();
        let providers = usage_from_roots(
            &[root.join("missing-custom"), claude],
            &[root.join("missing-codex"), codex],
            &[cursor],
            &[opencode],
            t(T0),
        );
        assert!(providers.iter().all(|provider| provider.detected));
        assert_eq!(providers[0].week_tokens, 165);
        assert_eq!(providers[1].windows[0].percent, 25.0);
        assert!(providers[2..]
            .iter()
            .all(|provider| provider.windows.is_empty() && provider.week_tokens == 0));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn identical_counters_in_different_codex_sessions_are_not_deduplicated() {
        let line = format!(
            r#"{{"timestamp":"{T0}","payload":{{"type":"token_count","info":{{"last_token_usage":{{"total_tokens":5}},"total_token_usage":{{"total_tokens":5}}}}}}}}"#
        );
        let mut first = parse_codex_line(line.as_bytes()).unwrap();
        first.session = "first.jsonl".into();
        let mut second = first.clone();
        second.session = "second.jsonl".into();
        assert_eq!(
            codex_usage(vec![first.clone(), first, second], t(T0)).week_tokens,
            10
        );
        assert!(parse_rate_limits(
            &serde_json::json!({"primary":{"used_percent":"NaN"}}),
            t(T0)
        )
        .is_empty());
    }
}
