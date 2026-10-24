//! Opt-in bridge to Claude Code, the way notch apps and usage bars do it,
//! without credentials and without the network.
//!
//! * Status line: Claude Code hands its status-line command a JSON document
//!   on stdin that includes the plan's real 5-hour and 7-day usage
//!   (`rate_limits`). Booki registers itself as that command, keeps only
//!   those percentages and reset times, and runs the user's own status line
//!   (if any) so it keeps showing.
//! * Hooks: Claude Code runs a command on prompt, tool use, notifications and
//!   stop. Booki records only the event kind per session, so "working",
//!   "waiting for permission" and "done" are exact instead of guessed from
//!   log silence.
//!
//! What is written: `%LOCALAPPDATA%\Booki\claude\limits.json` and
//! `sessions.json`. Prompts, paths, tool input and transcripts on stdin are
//! never kept. `settings.json` is backed up once before the first change and
//! only Booki's own entries are added or removed.

use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const STATUSLINE_ARG: &str = "--claude-statusline";
const HOOK_ARG: &str = "--claude-hook";
const HOOK_EVENTS: [&str; 5] = [
    "UserPromptSubmit",
    "PostToolUse",
    "Notification",
    "Stop",
    "SessionEnd",
];
/// A recorded session counts for this long without a new event.
const SESSION_TTL_SECS: i64 = 2 * 3600;
/// "Done" shows this long after Stop, then the session is idle.
const DONE_SECS: i64 = 10;

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Booki's own folder for what the bridge writes.
pub fn dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("Booki").join("claude"))
}

fn write_atomic(path: &Path, value: &Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value).unwrap_or_default())?;
    std::fs::rename(&tmp, path)
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

// ───────────────────────── Command-line entry ─────────────────────────

/// Handles `--claude-statusline` / `--claude-hook` before any window exists.
/// Returns true when this process was such a call and must exit.
pub fn run_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == STATUSLINE_ARG) {
        statusline();
        return true;
    }
    if args.iter().any(|a| a == HOOK_ARG) {
        hook();
        return true;
    }
    false
}

fn stdin_text() -> String {
    let mut text = String::new();
    let _ = std::io::stdin()
        .take(4 * 1024 * 1024)
        .read_to_string(&mut text);
    text
}

/// The two plan windows from a status-line document, if it has them.
pub fn limits_from_status(input: &Value) -> Option<Value> {
    let limits = input.get("rate_limits")?;
    let window = |key: &str| {
        let w = limits.get(key)?;
        let percent = w.get("used_percentage")?.as_f64()?;
        let resets = w
            .get("resets_at")
            .or_else(|| w.get("reset_at"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        Some(json!({ "percent": percent.clamp(0.0, 100.0), "resets_at": resets }))
    };
    let five = window("five_hour");
    let seven = window("seven_day");
    if five.is_none() && seven.is_none() {
        return None;
    }
    Some(json!({ "five_hour": five, "seven_day": seven, "at": now_secs() }))
}

fn statusline() {
    let input = stdin_text();
    if let Ok(doc) = serde_json::from_str::<Value>(&input) {
        if let (Some(limits), Some(dir)) = (limits_from_status(&doc), dir()) {
            let _ = write_atomic(&dir.join("limits.json"), &limits);
        }
    }
    // The user's own status line keeps showing, fed the same document.
    let wrapped = dir()
        .and_then(|d| read_json(&d.join("statusline-wrapped.json")))
        .and_then(|v| v.get("command").and_then(Value::as_str).map(str::to_owned));
    if let Some(command) = wrapped {
        if let Some(out) = run_shell(&command, &input) {
            let _ = std::io::stdout().write_all(&out);
        }
    }
}

/// Runs a status-line command the way Claude Code would: with the shell it
/// was started from (Git Bash sets SHELL), otherwise cmd.
fn run_shell(command: &str, input: &str) -> Option<Vec<u8>> {
    use std::process::{Command, Stdio};
    let mut cmd = match std::env::var_os("SHELL").filter(|s| !s.is_empty()) {
        Some(shell) => {
            let mut c = Command::new(shell);
            c.arg("-c").arg(command);
            c
        }
        None => {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(command);
            c
        }
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    child.wait_with_output().ok().map(|o| o.stdout)
}

/// The state a hook event means, or None for events that change nothing.
pub fn state_for_event(event: &str, payload: &Value) -> Option<&'static str> {
    match event {
        "UserPromptSubmit" | "PostToolUse" | "PreToolUse" => Some("working"),
        "Stop" => Some("done"),
        "SessionEnd" => Some("idle"),
        "Notification" => {
            // Only a permission request waits on the user; the "still idle"
            // reminder after a finished turn does not.
            let kind = payload
                .get("notification_type")
                .and_then(Value::as_str)
                .unwrap_or("");
            let message = payload
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            (kind == "permission_prompt" || (kind.is_empty() && message.contains("permission")))
                .then_some("waiting")
        }
        _ => None,
    }
}

fn hook() {
    let input = stdin_text();
    let Ok(doc) = serde_json::from_str::<Value>(&input) else {
        return;
    };
    let event = doc
        .get("hook_event_name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let session = doc
        .get("session_id")
        .and_then(Value::as_str)
        .unwrap_or("default");
    let Some(state) = state_for_event(event, &doc) else {
        return;
    };
    let Some(dir) = dir() else { return };
    let path = dir.join("sessions.json");
    let now = now_secs();
    let mut sessions = read_json(&path)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    sessions
        .retain(|_, v| now - v.get("at").and_then(Value::as_i64).unwrap_or(0) < SESSION_TTL_SECS);
    if state == "idle" {
        sessions.remove(session);
    } else {
        sessions.insert(session.to_owned(), json!({ "state": state, "at": now }));
    }
    let _ = write_atomic(&path, &Value::Object(sessions));
}

// ───────────────────────── Reading (inside Booki) ─────────────────────────

/// Claude's plan windows from the last status line, while still current.
pub fn plan_windows(now: i64) -> Vec<crate::ai_usage::UsageWindow> {
    let Some(doc) = dir().and_then(|d| read_json(&d.join("limits.json"))) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (key, label) in [("five_hour", "5h"), ("seven_day", "week")] {
        let Some(w) = doc.get(key).filter(|w| !w.is_null()) else {
            continue;
        };
        let resets_at = w.get("resets_at").and_then(Value::as_i64).unwrap_or(0);
        // A window that has already reset says nothing about now.
        if resets_at > 0 && resets_at <= now {
            continue;
        }
        if let Some(percent) = w.get("percent").and_then(Value::as_f64) {
            out.push(crate::ai_usage::UsageWindow {
                label: label.to_owned(),
                percent,
                resets_at,
            });
        }
    }
    out
}

/// Claude's state from its hooks across sessions, when hooks are reporting:
/// waiting beats working, a fresh Stop shows as done.
pub fn hook_state(now_ms: i64) -> Option<&'static str> {
    if !hooks_installed_cached() {
        return None;
    }
    let doc = dir().and_then(|d| read_json(&d.join("sessions.json")))?;
    let now = now_ms / 1000;
    let mut best: Option<&'static str> = Some("idle");
    let rank = |s: &str| match s {
        "waiting" => 3,
        "working" => 2,
        "done" => 1,
        _ => 0,
    };
    for v in doc.as_object()?.values() {
        let at = v.get("at").and_then(Value::as_i64).unwrap_or(0);
        if now - at >= SESSION_TTL_SECS {
            continue;
        }
        let state = match v.get("state").and_then(Value::as_str).unwrap_or("") {
            "waiting" => "waiting",
            "working" => "working",
            "done" if now - at < DONE_SECS => "done",
            _ => "idle",
        };
        if rank(state) > rank(best.unwrap_or("idle")) {
            best = Some(state);
        }
    }
    best
}

static INSTALLED: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);
fn hooks_installed_cached() -> bool {
    match INSTALLED.load(std::sync::atomic::Ordering::Relaxed) {
        1 => true,
        2 => false,
        _ => {
            let on = status().hooks;
            INSTALLED.store(if on { 1 } else { 2 }, std::sync::atomic::Ordering::Relaxed);
            on
        }
    }
}

// ───────────────────────── settings.json ─────────────────────────

fn settings_path() -> Option<PathBuf> {
    let dirs = crate::ai_usage::claude_dirs();
    dirs.iter()
        .find(|d| d.join("settings.json").is_file())
        .or_else(|| dirs.iter().find(|d| d.is_dir()))
        .map(|d| d.join("settings.json"))
}

fn own_command(arg: &str) -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    // Forward slashes work in cmd and in the Git Bash Claude Code uses.
    let exe = exe.to_string_lossy().replace('\\', "/");
    Some(format!("\"{exe}\" {arg}"))
}

fn is_ours(command: &str, arg: &str) -> bool {
    command.contains(arg)
}

#[derive(serde::Serialize, Default, Clone, Copy, PartialEq, Debug)]
pub struct BridgeStatus {
    /// Claude Code's settings folder exists on this PC.
    pub available: bool,
    pub statusline: bool,
    pub hooks: bool,
}

pub fn status_of(settings: &Value) -> (bool, bool) {
    let statusline = settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(|c| is_ours(c, STATUSLINE_ARG));
    let hooks = settings
        .get("hooks")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|h| h.values())
        .filter_map(Value::as_array)
        .flatten()
        .filter_map(|group| group.get("hooks").and_then(Value::as_array))
        .flatten()
        .filter_map(|h| h.get("command").and_then(Value::as_str))
        .any(|c| is_ours(c, HOOK_ARG));
    (statusline, hooks)
}

pub fn status() -> BridgeStatus {
    let Some(path) = settings_path() else {
        return BridgeStatus::default();
    };
    let settings = read_json(&path).unwrap_or_else(|| json!({}));
    let (statusline, hooks) = status_of(&settings);
    BridgeStatus {
        available: true,
        statusline,
        hooks,
    }
}

/// Adds or removes Booki's status line in a settings document. The user's
/// own command is remembered in `wrapped` and restored on removal.
pub fn apply_statusline(
    settings: &mut Map<String, Value>,
    on: bool,
    ours: &str,
    wrapped: &mut Option<String>,
) {
    let current = settings
        .get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let already = current
        .as_deref()
        .is_some_and(|c| is_ours(c, STATUSLINE_ARG));
    if on && !already {
        *wrapped = current;
        let mut line = settings
            .get("statusLine")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        line.insert("type".into(), json!("command"));
        line.insert("command".into(), json!(ours));
        settings.insert("statusLine".into(), Value::Object(line));
    } else if !on && already {
        match wrapped.take() {
            Some(command) => {
                if let Some(line) = settings
                    .get_mut("statusLine")
                    .and_then(Value::as_object_mut)
                {
                    line.insert("command".into(), json!(command));
                }
            }
            None => {
                settings.remove("statusLine");
            }
        }
    }
}

/// Adds or removes Booki's hook entries, leaving every other hook alone.
pub fn apply_hooks(settings: &mut Map<String, Value>, on: bool, ours: &str) {
    let hooks = settings.entry("hooks").or_insert_with(|| json!({}));
    let Some(hooks) = hooks.as_object_mut() else {
        return;
    };
    for event in HOOK_EVENTS {
        let list = hooks.entry(event).or_insert_with(|| json!([]));
        let Some(groups) = list.as_array_mut() else {
            continue;
        };
        // Drop ours first, so turning it on twice never duplicates it.
        for group in groups.iter_mut() {
            if let Some(inner) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                inner.retain(|h| {
                    !h.get("command")
                        .and_then(Value::as_str)
                        .is_some_and(|c| is_ours(c, HOOK_ARG))
                });
            }
        }
        groups.retain(|g| {
            g.get("hooks")
                .and_then(Value::as_array)
                .map_or(true, |inner| !inner.is_empty())
        });
        if on {
            let mut group =
                json!({ "hooks": [{ "type": "command", "command": ours, "timeout": 5 }] });
            if event == "PostToolUse" {
                group["matcher"] = json!("*");
            }
            groups.push(group);
        }
    }
    hooks.retain(|_, v| v.as_array().map_or(true, |a| !a.is_empty()));
    if hooks.is_empty() {
        settings.remove("hooks");
    }
}

/// Turns the status line and the hooks on or off in Claude Code's settings.
pub fn set(statusline: bool, hooks: bool) -> Result<BridgeStatus, String> {
    let path = settings_path().ok_or("Claude Code is not installed")?;
    let original = std::fs::read(&path).ok();
    let mut settings = match &original {
        Some(bytes) if !bytes.iter().all(u8::is_ascii_whitespace) => {
            serde_json::from_slice::<Value>(bytes)
                .map_err(|_| "settings.json is not valid JSON; it was left untouched".to_string())?
        }
        _ => json!({}),
    };
    let map = settings
        .as_object_mut()
        .ok_or("settings.json is not an object")?;
    let wrapped_path = dir()
        .ok_or("no local data folder")?
        .join("statusline-wrapped.json");
    let mut wrapped = read_json(&wrapped_path)
        .and_then(|v| v.get("command").and_then(Value::as_str).map(str::to_owned));
    apply_statusline(
        map,
        statusline,
        &own_command(STATUSLINE_ARG).ok_or("no executable path")?,
        &mut wrapped,
    );
    apply_hooks(
        map,
        hooks,
        &own_command(HOOK_ARG).ok_or("no executable path")?,
    );
    // One backup of the user's file, made before Booki first touches it.
    if let Some(bytes) = &original {
        let backup = path.with_extension("json.booki-backup");
        if !backup.exists() {
            std::fs::write(&backup, bytes).map_err(|e| e.to_string())?;
        }
    }
    write_atomic(&path, &settings).map_err(|e| e.to_string())?;
    match wrapped {
        Some(command) => write_atomic(&wrapped_path, &json!({ "command": command })),
        None => match std::fs::remove_file(&wrapped_path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        },
    }
    .map_err(|e| e.to_string())?;
    if !hooks {
        if let Some(d) = dir() {
            let _ = std::fs::remove_file(d.join("sessions.json"));
        }
    }
    if !statusline {
        if let Some(d) = dir() {
            let _ = std::fs::remove_file(d.join("limits.json"));
        }
    }
    INSTALLED.store(0, std::sync::atomic::Ordering::Relaxed);
    Ok(status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_line_keeps_only_the_plan_windows() {
        let doc = json!({
            "session_id": "s", "cwd": "C:/private", "transcript_path": "C:/t.jsonl",
            "rate_limits": { "five_hour": { "used_percentage": 42.5, "resets_at": 1_900_000_000 },
                             "seven_day": { "used_percentage": 120, "resets_at": 1_900_500_000 } }
        });
        let limits = limits_from_status(&doc).unwrap();
        assert_eq!(limits["five_hour"]["percent"], 42.5);
        assert_eq!(limits["seven_day"]["percent"], 100.0);
        let text = limits.to_string();
        assert!(!text.contains("private") && !text.contains("transcript"));
        assert!(limits_from_status(&json!({ "model": {} })).is_none());
    }

    #[test]
    fn hook_events_map_to_states() {
        let none = json!({});
        assert_eq!(state_for_event("UserPromptSubmit", &none), Some("working"));
        assert_eq!(state_for_event("Stop", &none), Some("done"));
        assert_eq!(
            state_for_event(
                "Notification",
                &json!({ "notification_type": "permission_prompt" })
            ),
            Some("waiting")
        );
        assert_eq!(
            state_for_event(
                "Notification",
                &json!({ "notification_type": "idle_prompt" })
            ),
            None
        );
        assert_eq!(
            state_for_event(
                "Notification",
                &json!({ "message": "Claude needs your permission to use Bash" })
            ),
            Some("waiting")
        );
        assert_eq!(state_for_event("SubagentStop", &none), None);
    }

    #[test]
    fn statusline_wraps_and_restores_the_users_own() {
        let mut s = json!({ "model": "x", "statusLine": { "type": "command", "command": "~/.claude/line.sh", "padding": 0 } });
        let map = s.as_object_mut().unwrap();
        let mut wrapped = None;
        apply_statusline(map, true, "\"B\" --claude-statusline", &mut wrapped);
        assert_eq!(wrapped.as_deref(), Some("~/.claude/line.sh"));
        assert_eq!(map["statusLine"]["command"], "\"B\" --claude-statusline");
        assert_eq!(map["statusLine"]["padding"], 0);
        apply_statusline(map, true, "\"B\" --claude-statusline", &mut wrapped);
        assert_eq!(
            wrapped.as_deref(),
            Some("~/.claude/line.sh"),
            "turning it on twice keeps the user's"
        );
        apply_statusline(map, false, "\"B\" --claude-statusline", &mut wrapped);
        assert_eq!(map["statusLine"]["command"], "~/.claude/line.sh");
        assert_eq!(map["model"], "x");
    }

    #[test]
    fn hooks_are_added_once_and_removed_without_touching_others() {
        let mut s = json!({ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "notify-me" }] }] } });
        let map = s.as_object_mut().unwrap();
        apply_hooks(map, true, "\"B\" --claude-hook");
        apply_hooks(map, true, "\"B\" --claude-hook");
        let stop = map["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(status_of(&Value::Object(map.clone())), (false, true));
        apply_hooks(map, false, "\"B\" --claude-hook");
        assert_eq!(
            map["hooks"]["Stop"],
            json!([{ "hooks": [{ "type": "command", "command": "notify-me" }] }])
        );
        assert!(map["hooks"].get("UserPromptSubmit").is_none());
    }
}
