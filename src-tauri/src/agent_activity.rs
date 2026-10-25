//! "Agents working in the notch": notices when Claude Code, Codex (the
//! ChatGPT coding agent on this PC), Cursor, or OpenCode is working, waiting,
//! or done.
//!
//! Privacy contract (same as `ai_usage`): only the tools' own session logs
//! (`*.jsonl`) are opened, read-only; no credential, token or auth file is
//! ever touched and nothing goes over the network. Of each log line only the
//! event type, stop reason and tool-call ids are deserialized; message text
//! is skipped by serde and never kept.
//!
//! How it works: a background thread polls every 1.5 s. Every few seconds it
//! re-finds the most recently written session file of each tool (directory
//! walk, stat only); in between it only stats that one file and, when it
//! grew, reads just the appended bytes. A small state machine per tool turns
//! the events into idle / working / waiting / done, and a Tauri event
//! (`booki://agent-activity`) goes out only when a tool's state changes.
//!
//! Exact signals vs heuristics:
//! - Claude working / done: exact. A user prompt, a tool result or an
//!   assistant message that is not finished means working; an assistant
//!   message with `stop_reason: "end_turn"` means done.
//! - Claude waiting for permission: HEURISTIC. Claude Code does not log the
//!   permission prompt. While it waits, the transcript holds an assistant
//!   `tool_use` with no matching `tool_result` and stops growing; we call it
//!   "waiting" after `WAIT_AFTER_MS` of that silence. A tool that simply runs
//!   long (a slow build) looks the same.
//! - Codex: `task_started` / `task_complete` / `turn_aborted` and the
//!   `*_approval_request` events are exact when the log carries them; without
//!   them the same pending-call + silence heuristic applies to
//!   `function_call` / `function_call_output` items.
//! - Stale: no writes for `STALE_MS` while "working" = idle, without a notice
//!   (the tool was closed or interrupted).
//! - Quiet end: HEURISTIC fallback for transcripts whose last reply carries
//!   no stop reason — no pending tool and `QUIET_DONE_MS` of silence after a
//!   reply counts as done.
//! - Claude desktop app: size only, its claude.ai IndexedDB log. Growth
//!   while it answers means working; HEURISTIC, as other writes there
//!   (opening a chat) also count.
//! - Cursor, OpenCode, Gemini CLI, Windsurf, Goose, Cline and Continue: size
//!   only. The file is never opened. Growth means working; a pause means
//!   waiting; a longer quiet means done. Auth, account and settings files
//!   are never named and never opened. Aider has no stable home session
//!   path, so it is not watched.
use serde::de::IgnoredAny;
use serde::Deserialize;
use std::collections::HashSet;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Mutex;

pub const EVENT: &str = "booki://agent-activity";
const POLL_MS: u64 = 1500;
/// With every tool idle the loop waits for a folder-change notice; this is
/// only the fallback for a missed one (or a root that cannot be watched).
const IDLE_MS: u64 = 15_000;
/// Re-find the newest session file every this many polls.
const DISCOVER_EVERY: u32 = 3;
/// Pending tool call + silence for this long = waiting (heuristic).
const WAIT_AFTER_MS: i64 = 6_000;
/// No writes for this long while working = idle, no notice.
const STALE_MS: i64 = 120_000;
/// Reply without a stop reason + silence = done (heuristic fallback).
const QUIET_DONE_MS: i64 = 30_000;
/// Cursor: growth stopped, but not long enough to call the turn finished.
const CURSOR_PAUSE_MS: i64 = 20_000;
/// Cursor: no growth for this long ends the turn. The file is never read.
const CURSOR_DONE_MS: i64 = 90_000;
/// How long "done" is reported before it settles to idle.
const DONE_HOLD_MS: i64 = 10_000;
/// Bytes of an already-existing file read to learn where it stands.
const SEED_BYTES: u64 = 256 * 1024;
/// Upper bound on appended bytes read per poll.
const MAX_READ: u64 = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    Claude,
    Codex,
    /// Cursor's agent. Booki only watches whether a transcript file grows.
    /// The file is never opened, so chats and keys stay unread.
    Cursor,
    /// OpenCode. Same size-only contract as Cursor: the database growing
    /// means a turn is in progress. Auth files are never opened.
    OpenCode,
    /// Gemini CLI. Size of a session file under `~/.gemini/tmp`.
    Gemini,
    /// Windsurf / Codeium cascade. Size only, under `~/.codeium/windsurf`.
    Windsurf,
    /// Goose. Size of a session file, never its config.
    Goose,
    /// Cline, in the editor's globalStorage tasks folder.
    Cline,
    /// Continue. Size of a file under `~/.continue/sessions`.
    Continue,
    /// The Claude desktop app. It keeps no activity log, but while it
    /// answers its claude.ai IndexedDB write-ahead log grows. Size only; the
    /// file is never opened.
    ClaudeApp,
}

impl Provider {
    fn id(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
            Provider::Cursor => "cursor",
            Provider::OpenCode => "opencode",
            Provider::Gemini => "gemini",
            Provider::Windsurf => "windsurf",
            Provider::Goose => "goose",
            Provider::Cline => "cline",
            Provider::Continue => "continue",
            Provider::ClaudeApp => "claude-app",
        }
    }

    /// These tools are noticed by file size. Their bytes are never read.
    fn size_only(self) -> bool {
        !matches!(self, Provider::Claude | Provider::Codex)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Idle,
    Working,
    Waiting,
    Done,
    Error,
}

impl State {
    fn id(self) -> &'static str {
        match self {
            State::Idle => "idle",
            State::Working => "working",
            State::Waiting => "waiting",
            State::Done => "done",
            State::Error => "error",
        }
    }
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct Activity {
    pub provider: &'static str,
    pub state: &'static str,
    /// When this state began, Unix milliseconds.
    pub since: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Idle,
    Working,
    /// The log itself says an approval is pending (Codex).
    Approval,
    Done,
    Error,
}

/// The per-tool state machine. Times are Unix milliseconds.
#[derive(Debug)]
pub struct Machine {
    provider: Provider,
    phase: Phase,
    /// Tool-call ids announced but not answered yet.
    pending: HashSet<String>,
    /// The last event was the agent's reply (not a prompt or tool result).
    after_reply: bool,
    last_write: i64,
    done_at: i64,
}

impl Machine {
    pub fn new(provider: Provider) -> Self {
        Machine {
            provider,
            phase: Phase::Idle,
            pending: HashSet::new(),
            after_reply: false,
            last_write: 0,
            done_at: 0,
        }
    }

    /// Feeds one complete log line written at `now`.
    pub fn feed(&mut self, line: &[u8], now: i64) {
        self.last_write = self.last_write.max(now);
        match self.provider {
            Provider::Claude => self.feed_claude(line, now),
            Provider::Codex => self.feed_codex(line, now),
            Provider::Cursor
            | Provider::OpenCode
            | Provider::Gemini
            | Provider::Windsurf
            | Provider::Goose
            | Provider::Cline
            | Provider::Continue
            | Provider::ClaudeApp => {}
        }
    }

    /// Cursor only: the transcript got longer. The bytes themselves are not read.
    pub fn note_growth(&mut self, now: i64) {
        self.last_write = now;
        self.pending.clear();
        self.after_reply = false;
        self.phase = Phase::Working;
    }

    fn work(&mut self) {
        if self.phase != Phase::Working {
            self.phase = Phase::Working;
        }
    }

    fn finish(&mut self, now: i64) {
        self.pending.clear();
        self.after_reply = false;
        self.phase = Phase::Done;
        self.done_at = now;
    }

    fn rest(&mut self) {
        self.pending.clear();
        self.after_reply = false;
        self.phase = Phase::Idle;
    }

    fn feed_claude(&mut self, line: &[u8], now: i64) {
        // An interrupted turn ends without a reply; matched on the raw bytes
        // and dropped, the text itself is never kept.
        if contains(line, b"[Request interrupted by user") {
            self.rest();
            return;
        }
        let Ok(entry) = serde_json::from_slice::<ClaudeLine>(line) else {
            return;
        };
        let items = match entry.message.as_ref().and_then(|m| m.content.as_ref()) {
            Some(ClaudeContent::Items(items)) => items.as_slice(),
            _ => &[],
        };
        match entry.kind.as_deref() {
            Some("user") => {
                let mut results = false;
                for item in items {
                    if item.kind.as_deref() == Some("tool_result") {
                        results = true;
                        if let Some(id) = &item.tool_use_id {
                            self.pending.remove(id);
                        }
                    }
                }
                if !results {
                    // A new prompt starts a fresh turn.
                    self.pending.clear();
                }
                self.after_reply = false;
                self.work();
            }
            Some("assistant") => {
                let stop = entry
                    .message
                    .as_ref()
                    .and_then(|m| m.stop_reason.as_deref());
                let mut calls = false;
                for item in items {
                    if item.kind.as_deref() == Some("tool_use") {
                        calls = true;
                        if let Some(id) = &item.id {
                            self.pending.insert(id.clone());
                        }
                    }
                }
                if stop == Some("end_turn") && !calls {
                    self.finish(now);
                } else {
                    self.after_reply = !calls && stop != Some("tool_use");
                    self.work();
                }
            }
            _ => {}
        }
    }

    fn feed_codex(&mut self, line: &[u8], now: i64) {
        let Ok(entry) = serde_json::from_slice::<CodexLine>(line) else {
            return;
        };
        let Some(payload) = entry.payload else {
            return;
        };
        let kind = payload.kind.as_deref().unwrap_or("");
        match (entry.kind.as_deref(), kind) {
            (Some("event_msg"), "error") => {
                self.pending.clear();
                self.after_reply = false;
                self.phase = Phase::Error;
                self.done_at = now;
            }
            (Some("event_msg"), "task_started" | "user_message") => {
                self.pending.clear();
                self.after_reply = false;
                self.phase = Phase::Working;
            }
            (Some("event_msg"), "task_complete") => self.finish(now),
            (Some("event_msg"), "turn_aborted") => self.rest(),
            (Some("event_msg"), k) if k.ends_with("approval_request") => {
                self.phase = Phase::Approval;
            }
            (Some("event_msg"), "agent_message") => {
                if self.phase != Phase::Idle && self.phase != Phase::Done {
                    self.after_reply = true;
                    self.phase = Phase::Working;
                }
            }
            (Some("event_msg"), "token_count") => {}
            (Some("response_item"), k) if k.ends_with("call") => {
                if let Some(id) = payload.call_id {
                    self.pending.insert(id);
                }
                self.after_reply = false;
                if self.phase != Phase::Done {
                    self.phase = Phase::Working;
                }
            }
            (Some("response_item"), k) if k.ends_with("call_output") => {
                if let Some(id) = &payload.call_id {
                    self.pending.remove(id);
                }
                self.after_reply = false;
                if self.phase != Phase::Done {
                    self.phase = Phase::Working;
                }
            }
            _ => {}
        }
    }

    /// Where the tool stands at `now`.
    pub fn state(&self, now: i64) -> State {
        let quiet = now - self.last_write;
        match self.phase {
            Phase::Idle => State::Idle,
            Phase::Done if now - self.done_at < DONE_HOLD_MS => State::Done,
            Phase::Done => State::Idle,
            Phase::Error if now - self.done_at < DONE_HOLD_MS => State::Error,
            Phase::Error => State::Idle,
            Phase::Approval if quiet < STALE_MS => State::Waiting,
            Phase::Approval => State::Idle,
            Phase::Working
                if self.provider.size_only()
                    && (CURSOR_PAUSE_MS..CURSOR_DONE_MS).contains(&quiet) =>
            {
                State::Waiting
            }
            Phase::Working if quiet >= STALE_MS => State::Idle,
            // Heuristic: a tool call left unanswered while the log is silent
            // is most likely blocked on the permission prompt.
            Phase::Working if !self.pending.is_empty() && quiet >= WAIT_AFTER_MS => State::Waiting,
            // Heuristic: a reply with no stop reason followed by a long
            // silence is the end of the turn.
            Phase::Working
                if self.after_reply && self.pending.is_empty() && quiet >= QUIET_DONE_MS =>
            {
                State::Done
            }
            Phase::Working => State::Working,
        }
    }
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

// Only the fields the state machine needs; message text is IgnoredAny.
#[derive(Deserialize)]
struct ClaudeLine {
    #[serde(rename = "type")]
    kind: Option<String>,
    message: Option<ClaudeMessage>,
}

#[derive(Deserialize)]
struct ClaudeMessage {
    stop_reason: Option<String>,
    content: Option<ClaudeContent>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ClaudeContent {
    Items(Vec<ClaudeItem>),
    #[allow(dead_code)]
    Other(IgnoredAny),
}

#[derive(Deserialize)]
struct ClaudeItem {
    #[serde(rename = "type")]
    kind: Option<String>,
    id: Option<String>,
    tool_use_id: Option<String>,
}

#[derive(Deserialize)]
struct CodexLine {
    #[serde(rename = "type")]
    kind: Option<String>,
    payload: Option<CodexPayload>,
}

#[derive(Deserialize)]
struct CodexPayload {
    #[serde(rename = "type")]
    kind: Option<String>,
    call_id: Option<String>,
}

// ───────────────────────────── Watcher ─────────────────────────────

/// Follows the newest session file of one tool.
struct Watch {
    provider: Provider,
    path: Option<PathBuf>,
    offset: u64,
    modified: Option<std::time::SystemTime>,
    carry: Vec<u8>,
    machine: Machine,
    reported: State,
    since: i64,
}

impl Watch {
    fn new(provider: Provider) -> Self {
        Watch {
            provider,
            path: None,
            offset: 0,
            modified: None,
            carry: Vec::new(),
            machine: Machine::new(provider),
            reported: State::Idle,
            since: 0,
        }
    }

    fn roots(&self) -> Vec<PathBuf> {
        match self.provider {
            Provider::Claude => crate::ai_usage::claude_dirs()
                .into_iter()
                .map(|d| d.join("projects"))
                .collect(),
            Provider::Codex => crate::ai_usage::codex_homes()
                .into_iter()
                .map(|home| home.join("sessions"))
                .collect(),
            Provider::Cursor => cursor_roots(),
            // The database only. account.json, auth.json and mcp-auth.json
            // are never named here.
            Provider::OpenCode => crate::ai_usage::opencode_data_dirs()
                .into_iter()
                .flat_map(|base| [base.join("opencode.db"), base.join("opencode.db-wal")])
                .collect(),
            Provider::Gemini => dirs::home_dir()
                .map(|h| vec![h.join(".gemini").join("tmp")])
                .unwrap_or_default(),
            Provider::Windsurf => dirs::home_dir()
                .map(|h| vec![h.join(".codeium").join("windsurf")])
                .unwrap_or_default(),
            Provider::Goose => goose_roots(),
            Provider::Cline => cline_roots(),
            Provider::Continue => dirs::home_dir()
                .map(|h| vec![h.join(".continue").join("sessions")])
                .unwrap_or_default(),
            Provider::ClaudeApp => claude_app_logs(),
        }
    }

    /// Switches to the most recently written file, if it changed.
    fn discover(&mut self, now: i64) {
        if matches!(self.provider, Provider::OpenCode | Provider::ClaudeApp) {
            self.discover_files(now);
            return;
        }
        if self.provider.size_only() {
            self.discover_sessions(now);
            return;
        }
        let mut files = Vec::new();
        for root in self.roots() {
            crate::ai_usage::collect_jsonl(&root, now / 1000 - STALE_MS / 1000, 0, &mut files);
        }
        let Some((newest, _)) = files.into_iter().max_by_key(|f| f.1) else {
            return;
        };
        if self.path.as_ref() == Some(&newest) {
            return;
        }
        self.path = Some(newest);
        self.seed(now);
    }

    /// OpenCode: pick the newer of the database and its wal. Switching files
    /// keeps the current turn and only adopts the new length.
    fn discover_files(&mut self, now: i64) {
        let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
        for path in self.roots() {
            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
            if best.as_ref().map(|(_, t)| modified > *t).unwrap_or(true) {
                best = Some((path, modified));
            }
        }
        // Older releases write one folder per session under storage/message.
        // The folder's own timestamp moves when a message lands in it, so the
        // newest folder is watched by metadata, without listing its files.
        let legacy = (self.provider == Provider::OpenCode)
            .then(crate::ai_usage::opencode_data_dirs)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|base| newest_child_dir(&base.join("storage").join("message")))
            .max_by_key(|(_, modified)| *modified);
        if let Some((path, modified)) = legacy {
            if best
                .as_ref()
                .map_or(true, |(_, previous)| modified > *previous)
            {
                best = Some((path, modified));
            }
        }
        let Some((newest, _)) = best else {
            return;
        };
        if self.path.as_ref() == Some(&newest) {
            return;
        }
        let switching = self.path.is_some();
        let len = std::fs::metadata(&newest).map(|m| m.len()).unwrap_or(0);
        self.path = Some(newest);
        if switching {
            self.offset = len;
            self.modified = std::fs::metadata(self.path.as_ref().unwrap())
                .ok()
                .and_then(|meta| meta.modified().ok());
            self.machine.note_growth(now);
            return;
        }
        self.seed(now);
    }

    /// Gemini, Windsurf, Goose, Cline, Continue: the newest session file.
    /// Switching sessions starts a fresh size watch and does not read bytes.
    fn discover_sessions(&mut self, now: i64) {
        let Some((newest, _)) = newest_session(&self.roots()) else {
            return;
        };
        if self.path.as_ref() == Some(&newest) {
            return;
        }
        self.path = Some(newest);
        self.seed(now);
    }

    /// Learns where a newly found file stands from its tail.
    fn seed(&mut self, now: i64) {
        self.machine = Machine::new(self.provider);
        self.carry.clear();
        self.offset = 0;
        if self.provider.size_only() {
            // Remember current metadata and ignore everything already written.
            let metadata = self
                .path
                .as_ref()
                .and_then(|path| std::fs::metadata(path).ok());
            self.offset = metadata.as_ref().map_or(0, |meta| meta.len());
            self.modified = metadata.and_then(|meta| meta.modified().ok());
            return;
        }
        let Some(path) = self.path.clone() else {
            return;
        };
        let Ok(meta) = std::fs::metadata(&path) else {
            return;
        };
        let written = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(now, |d| d.as_millis() as i64);
        let len = meta.len();
        let start = len.saturating_sub(SEED_BYTES);
        let mut bytes = read_range(&path, start, len - start);
        if start > 0 {
            // Drop the partial first line.
            match bytes.iter().position(|b| *b == b'\n') {
                Some(i) => {
                    bytes.drain(..=i);
                }
                None => bytes.clear(),
            }
        }
        self.offset = len;
        self.consume(bytes, written);
        // A turn that finished before we looked is old news.
        if self.machine.phase == Phase::Done {
            self.machine.rest();
        }
    }

    /// Reads what was appended since the last poll.
    fn poll(&mut self, now: i64) {
        if self.provider.size_only() {
            self.poll_size(now);
            return;
        }
        let Some(path) = self.path.clone() else {
            return;
        };
        let Ok(meta) = std::fs::metadata(&path) else {
            return;
        };
        let len = meta.len();
        if len < self.offset {
            // Truncated or replaced: start over from its tail.
            self.seed(now);
            return;
        }
        if len == self.offset {
            return;
        }
        let take = (len - self.offset).min(MAX_READ);
        let bytes = read_range(&path, self.offset, take);
        self.offset += bytes.len() as u64;
        self.consume(bytes, now);
    }

    /// Metadata-only providers: compare length and modification time. Never open it.
    fn poll_size(&mut self, now: i64) {
        let Some(path) = self.path.clone() else {
            return;
        };
        let Ok(meta) = std::fs::metadata(&path) else {
            return;
        };
        let len = meta.len();
        let modified = meta.modified().ok();
        // SQLite/WAL and older JSON storage can be rewritten in place. A
        // changed timestamp is activity even when the byte length is equal.
        let changed = len != self.offset
            || modified.is_some_and(|time| self.modified.is_some_and(|previous| time > previous));
        self.offset = len;
        self.modified = modified;
        if changed {
            self.machine.note_growth(now);
            return;
        }
        if self.machine.phase == Phase::Working && now - self.machine.last_write >= CURSOR_DONE_MS {
            self.machine.finish(now);
        }
    }

    fn consume(&mut self, bytes: Vec<u8>, at: i64) {
        self.carry.extend_from_slice(&bytes);
        let Some(last) = self.carry.iter().rposition(|b| *b == b'\n') else {
            if !bytes.is_empty() {
                self.machine.last_write = self.machine.last_write.max(at);
            }
            return;
        };
        let complete: Vec<u8> = self.carry.drain(..=last).collect();
        for line in complete.split(|b| *b == b'\n') {
            if !line.is_empty() {
                self.machine.feed(line, at);
            }
        }
    }

    /// The new state when it changed, to be announced.
    fn change(&mut self, now: i64) -> Option<Activity> {
        let mut state = self.machine.state(now);
        // The agent's own hooks, when installed, say exactly what it is doing.
        if let Some(hooked) = crate::agent_bridge::hook_state(self.provider.id(), now) {
            state = match hooked {
                "working" => State::Working,
                "waiting" => State::Waiting,
                "done" => State::Done,
                "error" => State::Error,
                _ => State::Idle,
            };
        }
        // "Done" only follows real work we saw.
        if state == State::Done
            && !matches!(self.reported, State::Working | State::Waiting | State::Done)
        {
            state = State::Idle;
        }
        if state == self.reported {
            return None;
        }
        self.reported = state;
        self.since = now;
        Some(self.activity())
    }

    fn activity(&self) -> Activity {
        Activity {
            provider: self.provider.id(),
            state: self.reported.id(),
            since: self.since,
        }
    }

    fn reset(&mut self) -> Option<Activity> {
        let was = self.reported;
        *self = Watch::new(self.provider);
        (was != State::Idle).then(|| self.activity())
    }

    fn has_file(&self) -> bool {
        self.path.is_some()
    }
}

/// The Claude app's claude.ai IndexedDB write-ahead logs (`*.log`). LevelDB
/// rotates them, so every current one is a candidate; Local Storage and the
/// blobs beside them are left alone.
fn claude_app_logs() -> Vec<PathBuf> {
    let Some(dir) = dirs::config_dir().map(|c| {
        c.join("Claude")
            .join("IndexedDB")
            .join("https_claude.ai_0.indexeddb.leveldb")
    }) else {
        return Vec::new();
    };
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    read.flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == "log"))
        .collect()
}

fn goose_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(
            home.join(".local")
                .join("share")
                .join("goose")
                .join("sessions"),
        );
    }
    if let Some(config) = dirs::config_dir() {
        roots.push(config.join("goose").join("sessions"));
    }
    roots
}

// Cursor editor transcripts can be plain text; terminal snapshots and MCP
// tool catalogs in the neighboring project folders are not agent activity.
fn cursor_project_roots(projects: &std::path::Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(projects) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path().join("agent-transcripts"))
        .filter(|path| path.is_dir())
        .collect()
}

fn cursor_roots() -> Vec<PathBuf> {
    crate::ai_usage::cursor_data_dirs()
        .into_iter()
        .flat_map(|base| {
            let mut roots = cursor_project_roots(&base.join("projects"));
            roots.push(base.join("chats"));
            roots
        })
        .collect()
}

fn cline_roots() -> Vec<PathBuf> {
    let Some(config) = dirs::config_dir() else {
        return Vec::new();
    };
    ["Code", "Cursor", "Windsurf", "Code - Insiders", "VSCodium"]
        .into_iter()
        .map(|app| {
            config
                .join(app)
                .join("User")
                .join("globalStorage")
                .join("saoudrizwan.claude-dev")
                .join("tasks")
        })
        .collect()
}

/// Names that hold credentials or settings, not a turn. Matched on the file
/// or directory name only; the bytes are never read.
fn sensitive_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [
        "auth",
        "account",
        "credential",
        "secret",
        "token",
        "cookie",
        "password",
        "mcp-auth",
        "settings",
        "config",
        "keychain",
        ".env",
    ]
    .iter()
    .any(|part| n.contains(part))
}

fn skip_session_dir(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    sensitive_name(&n)
        || n.contains("cache")
        || n.contains("crashpad")
        || n.contains("blob_storage")
        || n.contains("indexeddb")
        || matches!(
            n.as_str(),
            "node_modules"
                | "logs"
                | "extensions"
                | "local storage"
                | "session storage"
                | "shared proto db"
                | "gpu"
        )
}

const SESSION_WALK_CAP: u32 = 400;
const SESSION_DEPTH: usize = 6;

/// The most recently modified direct subfolder, capped like the session walk.
fn newest_child_dir(dir: &std::path::Path) -> Option<(PathBuf, std::time::SystemTime)> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .take(SESSION_WALK_CAP as usize * 10)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| Some((entry.path(), entry.metadata().ok()?.modified().ok()?)))
        .max_by_key(|(_, modified)| *modified)
}

fn newest_session(roots: &[PathBuf]) -> Option<(PathBuf, std::time::SystemTime)> {
    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    let mut seen = 0u32;
    for root in roots {
        walk_sessions(root, 0, &mut best, &mut seen);
        if seen >= SESSION_WALK_CAP {
            break;
        }
    }
    best
}

fn walk_sessions(
    dir: &std::path::Path,
    depth: usize,
    best: &mut Option<(PathBuf, std::time::SystemTime)>,
    seen: &mut u32,
) {
    if depth > SESSION_DEPTH || *seen >= SESSION_WALK_CAP {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        if *seen >= SESSION_WALK_CAP {
            return;
        }
        *seen += 1;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if !skip_session_dir(&name) {
                walk_sessions(&entry.path(), depth + 1, best, seen);
            }
            continue;
        }
        if !kind.is_file() || sensitive_name(&name) || !session_extension(&entry.path()) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().map(|(_, t)| modified > *t).unwrap_or(true) {
            *best = Some((entry.path(), modified));
        }
    }
}

fn session_extension(path: &std::path::Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("json") | Some("jsonl") | Some("txt") | Some("db") | Some("sqlite")
    )
}

fn read_range(path: &PathBuf, start: u64, len: u64) -> Vec<u8> {
    let mut out = Vec::new();
    if let Ok(mut file) = std::fs::File::open(path) {
        if file.seek(SeekFrom::Start(start)).is_ok() {
            let _ = file.take(len).read_to_end(&mut out);
        }
    }
    out
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

static CURRENT: Mutex<Vec<Activity>> = Mutex::new(Vec::new());

/// Every tool that is not idle right now, for a window that just loaded.
pub fn current() -> Vec<Activity> {
    CURRENT.lock().map(|g| g.clone()).unwrap_or_default()
}

/// Starts the background watcher; `emit` receives each state change.
pub fn start(
    enabled: impl Fn() -> bool + Send + 'static,
    emit: impl Fn(&Activity) + Send + 'static,
) {
    std::thread::spawn(move || {
        let mut watches = [
            Watch::new(Provider::Claude),
            Watch::new(Provider::Codex),
            Watch::new(Provider::Cursor),
            Watch::new(Provider::OpenCode),
            Watch::new(Provider::Gemini),
            Watch::new(Provider::Windsurf),
            Watch::new(Provider::Goose),
            Watch::new(Provider::Cline),
            Watch::new(Provider::Continue),
            Watch::new(Provider::ClaudeApp),
        ];
        let mut tick: u32 = 0;
        // Windows tells us when something under a log folder changes, so an
        // idle Booki reads nothing until a tool writes. Paths only: the
        // notice carries no file content, and roots never name credentials.
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if event.is_ok() {
                    let _ = tx.send(());
                }
            })
            .ok();
        let mut watched: HashSet<PathBuf> = HashSet::new();
        let mut woke = false;
        loop {
            let now = now_ms();
            let on = enabled();
            if on && tick % DISCOVER_EVERY == 0 {
                if let Some(w) = watcher.as_mut() {
                    use notify::Watcher;
                    // Booki's own hook records: a write there wakes the loop too.
                    for root in watches
                        .iter()
                        .flat_map(Watch::roots)
                        .chain(crate::agent_bridge::dir())
                    {
                        if watched.contains(&root) || !root.exists() {
                            continue;
                        }
                        let mode = if root.is_dir() {
                            notify::RecursiveMode::Recursive
                        } else {
                            notify::RecursiveMode::NonRecursive
                        };
                        if w.watch(&root, mode).is_ok() {
                            watched.insert(root);
                        }
                    }
                }
            }
            for watch in watches.iter_mut() {
                let change = if on {
                    let heavy = watch.provider.size_only()
                        && !matches!(watch.provider, Provider::Cursor | Provider::OpenCode);
                    // A notice may be a new session file: look for it now.
                    let due = (woke || tick % DISCOVER_EVERY == 0)
                        && (!heavy || !watch.has_file() || tick % (DISCOVER_EVERY * 4) == 0);
                    if due {
                        watch.discover(now);
                    }
                    watch.poll(now);
                    watch.change(now)
                } else {
                    watch.reset()
                };
                if let Some(activity) = change {
                    emit(&activity);
                }
            }
            if let Ok(mut current) = CURRENT.lock() {
                *current = watches
                    .iter()
                    .filter(|w| w.reported != State::Idle)
                    .map(Watch::activity)
                    .collect();
            }
            tick = tick.wrapping_add(1);
            // Busy tools need the clock (silence turns working into waiting or
            // done); idle ones only a notice. Without a watcher, keep polling.
            let busy = watches.iter().any(|w| w.reported != State::Idle);
            if busy || watcher.is_none() || watched.is_empty() {
                std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
                woke = false;
            } else {
                woke = rx
                    .recv_timeout(std::time::Duration::from_millis(IDLE_MS))
                    .is_ok();
                // An app that writes all the time (Cursor's own state) still
                // costs at most one pass per poll interval.
                if woke {
                    std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
                }
            }
            // A burst of writes is one wake-up.
            while rx.try_recv().is_ok() {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed_all(m: &mut Machine, lines: &[&str], at: i64) {
        for l in lines {
            m.feed(l.as_bytes(), at);
        }
    }

    #[test]
    fn claude_working_waiting_done() {
        let mut m = Machine::new(Provider::Claude);
        feed_all(
            &mut m,
            &[r#"{"type":"user","message":{"role":"user","content":"secret prompt"}}"#],
            1_000,
        );
        assert_eq!(m.state(1_500), State::Working);
        feed_all(
            &mut m,
            &[
                r#"{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"x"}}]}}"#,
            ],
            2_000,
        );
        assert_eq!(m.state(4_000), State::Working);
        // Unanswered tool call + silence: the permission prompt (heuristic).
        assert_eq!(m.state(2_000 + WAIT_AFTER_MS), State::Waiting);
        feed_all(
            &mut m,
            &[
                r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"out"}]}}"#,
            ],
            20_000,
        );
        assert_eq!(m.state(30_000), State::Working);
        feed_all(
            &mut m,
            &[
                r#"{"type":"assistant","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"all done"}]}}"#,
            ],
            31_000,
        );
        assert_eq!(m.state(32_000), State::Done);
        assert_eq!(m.state(31_000 + DONE_HOLD_MS), State::Idle);
    }

    #[test]
    fn claude_goes_stale_and_handles_interrupts() {
        let mut m = Machine::new(Provider::Claude);
        feed_all(
            &mut m,
            &[r#"{"type":"user","message":{"content":"go"}}"#],
            0,
        );
        assert_eq!(m.state(STALE_MS), State::Idle);
        feed_all(
            &mut m,
            &[r#"{"type":"user","message":{"content":"go"}}"#],
            0,
        );
        feed_all(
            &mut m,
            &[
                r#"{"type":"user","message":{"content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#,
            ],
            10,
        );
        assert_eq!(m.state(20), State::Idle);
        // Garbage and unrelated lines change nothing.
        feed_all(&mut m, &["not json", r#"{"type":"summary"}"#], 30);
        assert_eq!(m.state(40), State::Idle);
    }

    #[test]
    fn codex_started_approval_complete() {
        let mut m = Machine::new(Provider::Codex);
        feed_all(
            &mut m,
            &[r#"{"timestamp":"t","type":"event_msg","payload":{"type":"task_started"}}"#],
            0,
        );
        assert_eq!(m.state(100), State::Working);
        feed_all(
            &mut m,
            &[
                r#"{"type":"event_msg","payload":{"type":"exec_approval_request","call_id":"c1","command":["rm"]}}"#,
            ],
            200,
        );
        assert_eq!(m.state(300), State::Waiting);
        feed_all(
            &mut m,
            &[
                r#"{"type":"response_item","payload":{"type":"function_call","call_id":"c1","name":"shell"}}"#,
                r#"{"type":"response_item","payload":{"type":"function_call_output","call_id":"c1","output":"x"}}"#,
            ],
            1_000,
        );
        assert_eq!(m.state(1_200), State::Working);
        feed_all(
            &mut m,
            &[
                r#"{"type":"event_msg","payload":{"type":"task_complete","last_agent_message":"hi"}}"#,
            ],
            2_000,
        );
        assert_eq!(m.state(2_100), State::Done);
    }

    #[test]
    fn watcher_reads_appends_and_announces_changes_once() {
        let dir = std::env::temp_dir().join(format!("booki-agent-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("s.jsonl");
        std::fs::write(&path, "").unwrap();
        let mut w = Watch::new(Provider::Codex);
        w.path = Some(path.clone());
        w.seed(0);
        assert_eq!(w.change(0), None);
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        // A line split across two polls is only read once complete.
        f.write_all(br#"{"type":"event_msg","payload":{"type":"task_st"#)
            .unwrap();
        w.poll(1_000);
        assert_eq!(w.change(1_000), None);
        f.write_all(b"arted\"}}\n").unwrap();
        w.poll(2_000);
        assert_eq!(w.change(2_000).map(|a| a.state), Some("working"));
        assert_eq!(w.change(2_500), None);
        f.write_all(b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\"}}\n")
            .unwrap();
        w.poll(3_000);
        assert_eq!(w.change(3_000).map(|a| a.state), Some("done"));
        // Truncation starts over without inventing a notice.
        std::fs::write(&path, "").unwrap();
        w.poll(4_000);
        assert_eq!(w.change(4_000).map(|a| a.state), Some("idle"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_error_is_not_a_success_and_new_work_clears_it() {
        let mut m = Machine::new(Provider::Codex);
        m.feed(
            br#"{"type":"event_msg","payload":{"type":"task_started"}}"#,
            1_000,
        );
        m.feed(
            br#"{"type":"event_msg","payload":{"type":"error","message":"ignored"}}"#,
            2_000,
        );
        assert_eq!(m.state(2_001), State::Error);
        assert_eq!(m.state(2_000 + DONE_HOLD_MS), State::Idle);
        m.feed(
            br#"{"type":"event_msg","payload":{"type":"task_started"}}"#,
            3_000,
        );
        assert_eq!(m.state(3_001), State::Working);
    }

    #[test]
    fn cursor_follows_file_growth_without_reading_it() {
        let mut m = Machine::new(Provider::Cursor);
        m.note_growth(1_000);
        assert_eq!(m.state(5_000), State::Working);
        assert_eq!(m.state(1_000 + CURSOR_PAUSE_MS), State::Waiting);
        m.finish(1_000 + CURSOR_DONE_MS);
        assert_eq!(m.state(1_000 + CURSOR_DONE_MS), State::Done);
        let mut o = Machine::new(Provider::OpenCode);
        o.note_growth(1_000);
        assert_eq!(o.state(1_000 + CURSOR_PAUSE_MS), State::Waiting);
        let mut g = Machine::new(Provider::Gemini);
        g.note_growth(1_000);
        assert_eq!(g.state(1_000 + CURSOR_PAUSE_MS), State::Waiting);
    }

    #[test]
    fn cursor_text_transcripts_exclude_neighboring_terminal_and_mcp_files() {
        let root = std::env::temp_dir().join(format!("booki-cursor-roots-{}", std::process::id()));
        let project = root.join("example-project");
        std::fs::create_dir_all(project.join("agent-transcripts")).unwrap();
        std::fs::create_dir_all(project.join("terminals")).unwrap();
        std::fs::create_dir_all(project.join("mcps")).unwrap();
        std::fs::write(project.join("agent-transcripts/turn.txt"), b"example event").unwrap();
        std::fs::write(project.join("terminals/output.txt"), b"not an agent").unwrap();
        std::fs::write(project.join("mcps/tools.json"), b"{}").unwrap();
        let roots = cursor_project_roots(&root);
        assert_eq!(roots, vec![project.join("agent-transcripts")]);
        let found = newest_session(&roots).unwrap().0;
        assert_eq!(found.file_name().unwrap(), "turn.txt");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn session_walk_skips_auth_and_settings() {
        let dir = std::env::temp_dir().join(format!("booki-sessions-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("auth")).unwrap();
        std::fs::write(dir.join("auth").join("auth.json"), b"nope").unwrap();
        std::fs::write(dir.join("settings.json"), b"{}").unwrap();
        std::fs::write(dir.join("chats.json"), b"{}").unwrap();
        let found = newest_session(std::slice::from_ref(&dir)).map(|(p, _)| p);
        assert_eq!(found.unwrap().file_name().unwrap(), "chats.json");
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn size_watch_detects_equal_length_database_writes_without_reading_content() {
        let path =
            std::env::temp_dir().join(format!("booki-agent-mtime-{}.db", std::process::id()));
        std::fs::write(&path, b"fixture database bytes").unwrap();
        let mut watch = Watch::new(Provider::OpenCode);
        watch.path = Some(path.clone());
        watch.seed(1000);
        // Simulate an earlier metadata observation, with the same byte length.
        watch.modified = Some(std::time::UNIX_EPOCH);
        watch.poll_size(2000);
        assert_eq!(watch.machine.state(2001), State::Working);
        let written = watch.machine.last_write;
        watch.poll_size(3000);
        assert_eq!(watch.machine.last_write, written);
        std::fs::remove_file(path).unwrap();
    }
}
