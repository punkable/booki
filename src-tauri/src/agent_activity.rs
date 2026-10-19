//! "Agents working in the notch": notices when Claude Code or the Codex CLI
//! is working on this PC, waiting for the person's approval, or done.
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
use serde::de::IgnoredAny;
use serde::Deserialize;
use std::collections::HashSet;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Mutex;

pub const EVENT: &str = "booki://agent-activity";
const POLL_MS: u64 = 1500;
/// Re-find the newest session file every this many polls.
const DISCOVER_EVERY: u32 = 3;
/// Pending tool call + silence for this long = waiting (heuristic).
const WAIT_AFTER_MS: i64 = 6_000;
/// No writes for this long while working = idle, no notice.
const STALE_MS: i64 = 120_000;
/// Reply without a stop reason + silence = done (heuristic fallback).
const QUIET_DONE_MS: i64 = 30_000;
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
}

impl Provider {
    fn id(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Idle,
    Working,
    Waiting,
    Done,
}

impl State {
    fn id(self) -> &'static str {
        match self {
            State::Idle => "idle",
            State::Working => "working",
            State::Waiting => "waiting",
            State::Done => "done",
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
        }
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
            Phase::Approval if quiet < STALE_MS => State::Waiting,
            Phase::Approval => State::Idle,
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
            Provider::Codex => crate::ai_usage::codex_home()
                .map(|h| vec![h.join("sessions")])
                .unwrap_or_default(),
        }
    }

    /// Switches to the most recently written file, if it changed.
    fn discover(&mut self, now: i64) {
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

    /// Learns where a newly found file stands from its tail.
    fn seed(&mut self, now: i64) {
        self.machine = Machine::new(self.provider);
        self.carry.clear();
        self.offset = 0;
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
        let mut watches = [Watch::new(Provider::Claude), Watch::new(Provider::Codex)];
        let mut tick: u32 = 0;
        loop {
            let now = now_ms();
            let on = enabled();
            for watch in watches.iter_mut() {
                let change = if on {
                    if tick % DISCOVER_EVERY == 0 {
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
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
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
}
