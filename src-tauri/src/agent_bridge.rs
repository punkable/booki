//! Opt-in bridge to AI coding agents, the way notch apps and usage bars do
//! it, without credentials and without the network.
//!
//! * Claude Code status line: Claude Code hands its status-line command a
//!   JSON document on stdin that includes the plan's real 5-hour and 7-day
//!   usage (`rate_limits`). Booki registers itself as that command, keeps
//!   only those percentages and reset times, and runs the user's own status
//!   line (if any) so it keeps showing.
//! * Hooks (Claude Code, Codex, Gemini CLI, Cursor): each agent runs a
//!   command on prompt, tool use, permission requests and stop. Booki
//!   records only the event kind per session, so "working", "waiting for
//!   permission" and "done" are exact instead of guessed from log silence.
//!
//! What is written: `%LOCALAPPDATA%\Booki\agents\limits.json` and
//! `sessions.json`. Prompts, paths, tool input and transcripts on stdin are
//! never kept. Each agent's config file is backed up once before the first
//! change and only Booki's own entries are added or removed.

use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const STATUSLINE_ARG: &str = "--claude-statusline";
const HOOK_ARG: &str = "--agent-hook";
/// A recorded session counts for this long without a new event.
const SESSION_TTL_SECS: i64 = 2 * 3600;
/// "Done" shows this long after the stop event, then the session is idle.
const DONE_SECS: i64 = 10;

/// The agents with a hook system, each with its own file and event names.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Agent {
    Claude,
    Codex,
    Gemini,
    Cursor,
}

pub const AGENTS: [Agent; 4] = [Agent::Claude, Agent::Codex, Agent::Gemini, Agent::Cursor];

impl Agent {
    pub fn id(self) -> &'static str {
        match self {
            Agent::Claude => "claude",
            Agent::Codex => "codex",
            Agent::Gemini => "gemini",
            Agent::Cursor => "cursor",
        }
    }

    fn from_id(id: &str) -> Option<Agent> {
        AGENTS.into_iter().find(|a| a.id() == id)
    }

    /// The agent's home folder, when it is installed for this user.
    fn home(self) -> Option<PathBuf> {
        let home = dirs::home_dir();
        let candidates: Vec<PathBuf> = match self {
            Agent::Claude => crate::ai_usage::claude_dirs(),
            Agent::Codex => crate::ai_usage::codex_homes(),
            Agent::Gemini => home.map(|h| vec![h.join(".gemini")]).unwrap_or_default(),
            Agent::Cursor => home.map(|h| vec![h.join(".cursor")]).unwrap_or_default(),
        };
        candidates
            .iter()
            .find(|d| d.join(self.file_name()).is_file())
            .or_else(|| candidates.iter().find(|d| d.is_dir()))
            .cloned()
    }

    fn file_name(self) -> &'static str {
        match self {
            Agent::Claude | Agent::Gemini => "settings.json",
            Agent::Codex | Agent::Cursor => "hooks.json",
        }
    }

    fn config_path(self) -> Option<PathBuf> {
        self.home().map(|d| d.join(self.file_name()))
    }

    /// Events Booki listens to, as each agent names them.
    fn events(self) -> &'static [&'static str] {
        match self {
            Agent::Claude => &[
                "UserPromptSubmit",
                "PostToolUse",
                "Notification",
                "Stop",
                "SessionEnd",
            ],
            Agent::Codex => &[
                "UserPromptSubmit",
                "PostToolUse",
                "PermissionRequest",
                "Stop",
            ],
            Agent::Gemini => &[
                "BeforeAgent",
                "AfterTool",
                "Notification",
                "AfterAgent",
                "SessionEnd",
            ],
            Agent::Cursor => &["beforeSubmitPrompt", "postToolUse", "stop", "sessionEnd"],
        }
    }

    /// The hook entry Booki adds for one event.
    fn entry(self, event: &str, command: &str) -> Value {
        match self {
            // Cursor lists commands directly under the event.
            Agent::Cursor => json!({ "command": command }),
            _ => {
                // Gemini counts the timeout in milliseconds, the others in seconds.
                let timeout = if self == Agent::Gemini { 5000 } else { 5 };
                let mut group = json!({ "hooks": [{ "type": "command", "command": command, "timeout": timeout }] });
                if matches!(event, "PostToolUse" | "AfterTool") {
                    group["matcher"] = json!("*");
                }
                group
            }
        }
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Booki's own folder for what the bridge writes.
pub fn dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("Booki").join("agents"))
}

fn write_atomic(path: &Path, value: &Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("booki-tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value).unwrap_or_default())?;
    std::fs::rename(&tmp, path)
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

// ───────────────────────── Command-line entry ─────────────────────────

/// Handles `--claude-statusline` / `--agent-hook <agent>` before any window
/// exists. Returns true when this process was such a call and must exit.
pub fn run_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == STATUSLINE_ARG) {
        statusline();
        return true;
    }
    if let Some(i) = args.iter().position(|a| a == HOOK_ARG) {
        if let Some(agent) = args.get(i + 1).and_then(|id| Agent::from_id(id)) {
            hook(agent);
        }
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
pub fn state_for_event(agent: Agent, event: &str, payload: &Value) -> Option<&'static str> {
    let text = |key: &str| payload.get(key).and_then(Value::as_str).unwrap_or("");
    match (agent, event) {
        (_, "UserPromptSubmit" | "PostToolUse" | "BeforeAgent" | "AfterTool")
        | (Agent::Cursor, "beforeSubmitPrompt" | "postToolUse") => Some("working"),
        (Agent::Codex, "PermissionRequest") => Some("waiting"),
        (Agent::Claude, "Notification") => {
            // Only a permission request waits on the user; the "still idle"
            // reminder after a finished turn does not.
            let kind = text("notification_type");
            let permission = kind == "permission_prompt"
                || (kind.is_empty() && text("message").to_ascii_lowercase().contains("permission"));
            permission.then_some("waiting")
        }
        (Agent::Gemini, "Notification") => {
            (text("notification_type") == "ToolPermission").then_some("waiting")
        }
        (Agent::Cursor, "stop") => Some(if text("status") == "error" {
            "error"
        } else {
            "done"
        }),
        (_, "Stop" | "AfterAgent") => Some("done"),
        (_, "SessionEnd") | (Agent::Cursor, "sessionEnd") => Some("idle"),
        _ => None,
    }
}

fn hook(agent: Agent) {
    let input = stdin_text();
    let Ok(doc) = serde_json::from_str::<Value>(&input) else {
        return;
    };
    let event = doc
        .get("hook_event_name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let session = ["session_id", "conversation_id"]
        .iter()
        .find_map(|k| doc.get(*k).and_then(Value::as_str))
        .unwrap_or("default");
    let Some(state) = state_for_event(agent, event, &doc) else {
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
    let key = format!("{}:{session}", agent.id());
    if state == "idle" {
        sessions.remove(&key);
    } else {
        sessions.insert(
            key,
            json!({ "agent": agent.id(), "state": state, "at": now }),
        );
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

/// An agent's state from its hooks across sessions, when its hooks are
/// installed: waiting beats working, a fresh stop shows as done.
pub fn hook_state(agent_id: &str, now_ms: i64) -> Option<&'static str> {
    let agent = Agent::from_id(agent_id)?;
    if !installed_cached(agent) {
        return None;
    }
    let now = now_ms / 1000;
    let rank = |s: &str| match s {
        "waiting" => 4,
        "error" => 3,
        "working" => 2,
        "done" => 1,
        _ => 0,
    };
    let mut best: &'static str = "idle";
    let Some(doc) = dir().and_then(|d| read_json(&d.join("sessions.json"))) else {
        return Some(best);
    };
    for v in doc.as_object().into_iter().flat_map(|m| m.values()) {
        if v.get("agent").and_then(Value::as_str) != Some(agent.id()) {
            continue;
        }
        let at = v.get("at").and_then(Value::as_i64).unwrap_or(0);
        if now - at >= SESSION_TTL_SECS {
            continue;
        }
        let state = match v.get("state").and_then(Value::as_str).unwrap_or("") {
            "waiting" => "waiting",
            "working" => "working",
            "done" if now - at < DONE_SECS => "done",
            "error" if now - at < DONE_SECS => "error",
            _ => "idle",
        };
        if rank(state) > rank(best) {
            best = state;
        }
    }
    Some(best)
}

/// Per agent: 0 unknown, 1 installed, 2 not installed. Reset on every change.
static INSTALLED: [std::sync::atomic::AtomicU8; 4] =
    [const { std::sync::atomic::AtomicU8::new(0) }; 4];
fn installed_cached(agent: Agent) -> bool {
    use std::sync::atomic::Ordering::Relaxed;
    let slot = &INSTALLED[AGENTS.iter().position(|a| *a == agent).unwrap_or(0)];
    match slot.load(Relaxed) {
        1 => true,
        2 => false,
        _ => {
            let on = agent
                .config_path()
                .and_then(|p| read_json(&p))
                .is_some_and(|doc| hooks_present(agent, &doc));
            slot.store(if on { 1 } else { 2 }, Relaxed);
            on
        }
    }
}

// ───────────────────────── Agent config files ─────────────────────────

fn own_command(args: &str) -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    // Forward slashes work in cmd and in the Git Bash these agents use.
    let exe = exe.to_string_lossy().replace('\\', "/");
    Some(format!("\"{exe}\" {args}"))
}

fn is_ours(command: &str, arg: &str) -> bool {
    command.contains(arg)
}

/// Every command string in an agent's hooks section.
fn hook_commands(agent: Agent, doc: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for groups in doc
        .get("hooks")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|h| h.values())
    {
        for entry in groups.as_array().into_iter().flatten() {
            if agent == Agent::Cursor {
                if let Some(c) = entry.get("command").and_then(Value::as_str) {
                    out.push(c.to_owned());
                }
            } else {
                for h in entry
                    .get("hooks")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if let Some(c) = h.get("command").and_then(Value::as_str) {
                        out.push(c.to_owned());
                    }
                }
            }
        }
    }
    out
}

pub fn hooks_present(agent: Agent, doc: &Value) -> bool {
    hook_commands(agent, doc)
        .iter()
        .any(|c| is_ours(c, HOOK_ARG))
}

pub fn statusline_present(doc: &Value) -> bool {
    doc.pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(|c| is_ours(c, STATUSLINE_ARG))
}

/// Adds or removes Booki's status line in Claude's settings. The user's
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
pub fn apply_hooks(agent: Agent, settings: &mut Map<String, Value>, on: bool, ours: &str) {
    if agent == Agent::Cursor && on {
        settings.entry("version").or_insert(json!(1));
    }
    let hooks = settings.entry("hooks").or_insert_with(|| json!({}));
    let Some(hooks) = hooks.as_object_mut() else {
        return;
    };
    let mine = |v: &Value| {
        v.get("command")
            .and_then(Value::as_str)
            .is_some_and(|c| is_ours(c, HOOK_ARG))
    };
    for event in agent.events() {
        let list = hooks.entry(*event).or_insert_with(|| json!([]));
        let Some(groups) = list.as_array_mut() else {
            continue;
        };
        // Drop ours first, so turning it on twice never duplicates it.
        if agent == Agent::Cursor {
            groups.retain(|entry| !mine(entry));
        } else {
            for group in groups.iter_mut() {
                if let Some(inner) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                    inner.retain(|h| !mine(h));
                }
            }
            groups.retain(|g| {
                g.get("hooks")
                    .and_then(Value::as_array)
                    .map_or(true, |inner| !inner.is_empty())
            });
        }
        if on {
            groups.push(agent.entry(event, ours));
        }
    }
    hooks.retain(|_, v| v.as_array().map_or(true, |a| !a.is_empty()));
    if hooks.is_empty() {
        settings.remove("hooks");
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct AgentStatus {
    pub id: &'static str,
    /// The agent's folder exists on this PC.
    pub available: bool,
    pub hooks: bool,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct BridgeStatus {
    /// Booki's Claude Code status line is installed.
    pub statusline: bool,
    pub agents: Vec<AgentStatus>,
}

pub fn status() -> BridgeStatus {
    let doc = |a: Agent| {
        a.config_path()
            .and_then(|p| read_json(&p))
            .unwrap_or_else(|| json!({}))
    };
    BridgeStatus {
        statusline: statusline_present(&doc(Agent::Claude)),
        agents: AGENTS
            .into_iter()
            .map(|a| AgentStatus {
                id: a.id(),
                available: a.home().is_some(),
                hooks: hooks_present(a, &doc(a)),
            })
            .collect(),
    }
}

/// Reads an agent's config, lets `change` edit it, backs the original up
/// once and writes it back.
fn edit_config(
    agent: Agent,
    change: impl FnOnce(&mut Map<String, Value>) -> Result<(), String>,
) -> Result<(), String> {
    let path = agent.config_path().ok_or("not installed")?;
    let original = std::fs::read(&path).ok();
    let mut doc = match &original {
        Some(bytes) if !bytes.iter().all(u8::is_ascii_whitespace) => {
            serde_json::from_slice::<Value>(bytes).map_err(|_| {
                format!(
                    "{} is not valid JSON; it was left untouched",
                    path.display()
                )
            })?
        }
        _ => json!({}),
    };
    let map = doc
        .as_object_mut()
        .ok_or("the config file is not a JSON object")?;
    change(map)?;
    if let Some(bytes) = &original {
        let backup = path.with_extension("json.booki-backup");
        if !backup.exists() {
            std::fs::write(&backup, bytes).map_err(|e| e.to_string())?;
        }
    }
    write_atomic(&path, &doc).map_err(|e| e.to_string())
}

/// Turns Booki's Claude Code status line on or off.
pub fn set_statusline(on: bool) -> Result<BridgeStatus, String> {
    let wrapped_path = dir()
        .ok_or("no local data folder")?
        .join("statusline-wrapped.json");
    let mut wrapped = read_json(&wrapped_path)
        .and_then(|v| v.get("command").and_then(Value::as_str).map(str::to_owned));
    let ours = own_command(STATUSLINE_ARG).ok_or("no executable path")?;
    edit_config(Agent::Claude, |map| {
        apply_statusline(map, on, &ours, &mut wrapped);
        Ok(())
    })?;
    match wrapped {
        Some(command) => write_atomic(&wrapped_path, &json!({ "command": command })),
        None => match std::fs::remove_file(&wrapped_path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        },
    }
    .map_err(|e| e.to_string())?;
    if !on {
        if let Some(d) = dir() {
            let _ = std::fs::remove_file(d.join("limits.json"));
        }
    }
    Ok(status())
}

/// Turns Booki's hooks on or off for one agent.
pub fn set_hooks(agent_id: &str, on: bool) -> Result<BridgeStatus, String> {
    let agent = Agent::from_id(agent_id).ok_or("unknown agent")?;
    let ours = own_command(&format!("{HOOK_ARG} {}", agent.id())).ok_or("no executable path")?;
    edit_config(agent, |map| {
        apply_hooks(agent, map, on, &ours);
        Ok(())
    })?;
    INSTALLED[AGENTS.iter().position(|a| *a == agent).unwrap_or(0)]
        .store(0, std::sync::atomic::Ordering::Relaxed);
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
    fn hook_events_map_to_states_per_agent() {
        let none = json!({});
        assert_eq!(
            state_for_event(Agent::Claude, "UserPromptSubmit", &none),
            Some("working")
        );
        assert_eq!(state_for_event(Agent::Claude, "Stop", &none), Some("done"));
        assert_eq!(
            state_for_event(
                Agent::Claude,
                "Notification",
                &json!({ "notification_type": "permission_prompt" })
            ),
            Some("waiting")
        );
        assert_eq!(
            state_for_event(
                Agent::Claude,
                "Notification",
                &json!({ "notification_type": "idle_prompt" })
            ),
            None
        );
        assert_eq!(
            state_for_event(
                Agent::Claude,
                "Notification",
                &json!({ "message": "Claude needs your permission to use Bash" })
            ),
            Some("waiting")
        );
        assert_eq!(
            state_for_event(Agent::Codex, "PermissionRequest", &none),
            Some("waiting")
        );
        assert_eq!(
            state_for_event(Agent::Gemini, "BeforeAgent", &none),
            Some("working")
        );
        assert_eq!(
            state_for_event(
                Agent::Gemini,
                "Notification",
                &json!({ "notification_type": "ToolPermission" })
            ),
            Some("waiting")
        );
        assert_eq!(
            state_for_event(Agent::Gemini, "AfterAgent", &none),
            Some("done")
        );
        assert_eq!(
            state_for_event(Agent::Cursor, "beforeSubmitPrompt", &none),
            Some("working")
        );
        assert_eq!(
            state_for_event(Agent::Cursor, "stop", &json!({ "status": "error" })),
            Some("error")
        );
        assert_eq!(
            state_for_event(Agent::Cursor, "stop", &json!({ "status": "completed" })),
            Some("done")
        );
        assert_eq!(state_for_event(Agent::Claude, "SubagentStop", &none), None);
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
        apply_hooks(Agent::Claude, map, true, "\"B\" --agent-hook claude");
        apply_hooks(Agent::Claude, map, true, "\"B\" --agent-hook claude");
        assert_eq!(map["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert!(hooks_present(Agent::Claude, &Value::Object(map.clone())));
        apply_hooks(Agent::Claude, map, false, "\"B\" --agent-hook claude");
        assert_eq!(
            map["hooks"]["Stop"],
            json!([{ "hooks": [{ "type": "command", "command": "notify-me" }] }])
        );
        assert!(map["hooks"].get("UserPromptSubmit").is_none());
    }

    #[test]
    fn cursor_hooks_are_flat_and_versioned() {
        let mut s = json!({ "hooks": { "stop": [{ "command": "./mine.sh" }] } });
        let map = s.as_object_mut().unwrap();
        apply_hooks(Agent::Cursor, map, true, "\"B\" --agent-hook cursor");
        assert_eq!(map["version"], 1);
        assert_eq!(
            map["hooks"]["stop"][1],
            json!({ "command": "\"B\" --agent-hook cursor" })
        );
        assert!(hooks_present(Agent::Cursor, &Value::Object(map.clone())));
        apply_hooks(Agent::Cursor, map, false, "\"B\" --agent-hook cursor");
        assert_eq!(map["hooks"]["stop"], json!([{ "command": "./mine.sh" }]));
    }

    #[test]
    fn gemini_timeout_is_in_milliseconds() {
        let mut s = json!({});
        let map = s.as_object_mut().unwrap();
        apply_hooks(Agent::Gemini, map, true, "\"B\" --agent-hook gemini");
        assert_eq!(map["hooks"]["AfterTool"][0]["hooks"][0]["timeout"], 5000);
        assert_eq!(map["hooks"]["AfterTool"][0]["matcher"], "*");
    }
}
