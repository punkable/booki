//! Clipboard history: the in-memory list, its encrypted on-disk copy and the
//! commands the clipboard widget calls.

use super::*;

/// One clipboard-history entry (newest first). `text` is capped to keep the
/// list light; ids are monotonic so the frontend can key list items stably.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ClipEntry {
    pub(crate) id: u64,
    pub(crate) text: String,
    pub(crate) ts: u64,
    #[serde(default)]
    pub(crate) favorite: bool,
    #[serde(default)]
    pub(crate) private: bool,
}

pub(crate) const CLIP_HISTORY_MAX: usize = 60;

pub(crate) const CLIP_HISTORY_HARD_MAX: usize = 200;

pub(crate) const CLIP_TEXT_MAX: usize = 8000; // guard against pasting a huge document

pub(crate) const CLIP_DPAPI_MAGIC: &[u8] = b"booki-dpapi-v1\n";

pub(crate) static CLIP_STORAGE_FAILED: AtomicBool = AtomicBool::new(false);

pub(crate) const CLIP_JSON_MAGIC: &[u8] = b"booki-json-v1\n";

pub(crate) static CLIP_HISTORY: Mutex<Vec<ClipEntry>> = Mutex::new(Vec::new());

pub(crate) static CLIP_NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) fn clip_history_path() -> std::path::PathBuf {
    config::config_dir().join("clipboard-history.dat")
}

pub(crate) fn clip_legacy_history_path() -> std::path::PathBuf {
    config::config_dir().join("clipboard-history.json")
}

pub(crate) fn clip_limit(cfg: &Config) -> usize {
    (cfg.clipboard_history_limit as usize).clamp(1, CLIP_HISTORY_HARD_MAX)
}

pub(crate) fn clip_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Keep clipboard history bounded by the user's privacy and size policy.
pub(crate) fn clip_prune_locked(hist: &mut Vec<ClipEntry>, cfg: &Config) -> bool {
    let before = hist.len();
    if cfg.clipboard_retention_days > 0 {
        let days = cfg.clipboard_retention_days.min(365) as u64;
        let max_age = days.saturating_mul(24 * 60 * 60 * 1000);
        let cutoff = clip_now_ms().saturating_sub(max_age);
        hist.retain(|entry| entry.favorite || entry.ts >= cutoff);
    }
    let limit = clip_limit(cfg);
    if hist.len() > limit {
        let mut kept = Vec::with_capacity(limit);
        for entry in hist.iter().filter(|entry| entry.favorite).take(limit) {
            kept.push(entry.clone());
        }
        if kept.len() < limit {
            for entry in hist.iter().filter(|entry| !entry.favorite) {
                if kept.len() >= limit {
                    break;
                }
                kept.push(entry.clone());
            }
        }
        *hist = kept;
    }
    hist.len() != before
}

/// Encrypt (DPAPI) and persist the history.
///
/// Callers must NOT hold the CLIP_HISTORY guard while calling this. It was
/// previously invoked from inside the lock at all nine call sites, and
/// save_config — a synchronous command, so it runs on the UI thread — takes the
/// same lock, which meant a slow disk could freeze the whole dock. Mutate under
/// the guard, clone a snapshot, drop the guard, then call this.
pub(crate) fn clip_write_disk(hist: &[ClipEntry], cfg: &Config) {
    let path = clip_history_path();
    if !cfg.clipboard_persist {
        CLIP_STORAGE_FAILED.store(false, Ordering::Relaxed);
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(clip_legacy_history_path());
        return;
    }
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let persistable: Vec<ClipEntry> = hist
        .iter()
        .filter(|entry| !entry.private)
        .cloned()
        .collect();
    if let Ok(text) = serde_json::to_vec_pretty(&persistable) {
        let result = clipboard_storage::payload(&text, win::protect_data(&text), cfg!(windows))
            .map_err(str::to_string)
            .and_then(|payload| snapshot::write_bytes(&path, &payload));
        CLIP_STORAGE_FAILED.store(result.is_err(), Ordering::Relaxed);
        match result {
            Ok(()) => {
                let _ = fs::remove_file(clip_legacy_history_path());
            }
            Err(error) => log::warn!("Clipboard history could not be saved: {error}"),
        }
    }
}

pub(crate) fn clip_parse_disk(bytes: &[u8]) -> Option<Vec<ClipEntry>> {
    if let Some(body) = bytes.strip_prefix(CLIP_DPAPI_MAGIC) {
        let plain = win::unprotect_data(body)?;
        return serde_json::from_slice::<Vec<ClipEntry>>(&plain).ok();
    }
    if let Some(body) = bytes.strip_prefix(CLIP_JSON_MAGIC) {
        return serde_json::from_slice::<Vec<ClipEntry>>(body).ok();
    }
    serde_json::from_slice::<Vec<ClipEntry>>(bytes).ok()
}

pub(crate) fn clip_apply_config(cfg: &Config) {
    let snapshot = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        clip_prune_locked(&mut hist, cfg);
        hist.clone()
    };
    clip_write_disk(&snapshot, cfg);
}

pub(crate) fn clip_load_from_disk() {
    let cfg = config::load();
    if !cfg.clipboard_persist {
        let _ = fs::remove_file(clip_history_path());
        let _ = fs::remove_file(clip_legacy_history_path());
        return;
    }
    let (mut hist, loaded_legacy) = fs::read(clip_history_path())
        .ok()
        .and_then(|bytes| clip_parse_disk(&bytes).map(|hist| (hist, false)))
        .or_else(|| {
            fs::read(clip_legacy_history_path())
                .ok()
                .and_then(|bytes| clip_parse_disk(&bytes).map(|hist| (hist, true)))
        })
        .unwrap_or_default();
    clip_prune_locked(&mut hist, &cfg);
    let next_id = hist
        .iter()
        .map(|entry| entry.id)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    CLIP_NEXT_ID.store(next_id.max(1), Ordering::Relaxed);
    let snapshot = {
        let mut current = CLIP_HISTORY.lock().unwrap();
        *current = hist;
        current.clone()
    };
    if loaded_legacy || cfg.clipboard_persist {
        clip_write_disk(&snapshot, &cfg);
    }
}

pub(crate) fn clip_enforce_current_policy() {
    let cfg = config::load();
    let (changed, snapshot) = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        (clip_prune_locked(&mut hist, &cfg), hist.clone())
    };
    if changed || !cfg.clipboard_persist {
        clip_write_disk(&snapshot, &cfg);
    }
}

pub(crate) fn clip_looks_sensitive(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 8 {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("-----begin ") && lower.contains(" private key-----") {
        return true;
    }
    if lower.starts_with("bearer ") && trimmed.len() > 20 {
        return true;
    }
    if lower.matches('.').count() == 2 && lower.starts_with("eyj") && trimmed.len() > 80 {
        return true;
    }
    for prefix in [
        "sk-",
        "ghp_",
        "gho_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
        "akia",
    ] {
        if lower.starts_with(prefix) && trimmed.len() >= 20 {
            return true;
        }
    }
    let has_secret_label = [
        "password",
        "passwd",
        "pwd",
        "contraseña",
        "contrasena",
        "api_key",
        "apikey",
        "access_key",
        "client_secret",
        "private_key",
        "secret",
        "token",
    ]
    .iter()
    .any(|label| lower.contains(label));
    has_secret_label && (lower.contains('=') || lower.contains(':')) && trimmed.len() <= 2000
}

/// Add or move to front a piece of clipboard text.
pub(crate) fn clip_remember(text: &str) {
    let cfg = config::load();
    let text = if text.chars().count() > CLIP_TEXT_MAX {
        text.chars().take(CLIP_TEXT_MAX).collect::<String>()
    } else {
        text.to_string()
    };
    if text.trim().is_empty() {
        return;
    }
    if cfg.clipboard_sensitive_guard && clip_looks_sensitive(&text) {
        return;
    }
    let (should_write, snapshot) = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        let pruned = clip_prune_locked(&mut hist, &cfg);
        if hist.first().map(|e| e.text == text).unwrap_or(false) {
            // Already the most recent entry — nothing changed.
            (pruned || !cfg.clipboard_persist, hist.clone())
        } else {
            let (favorite, private) = hist
                .iter()
                .find(|entry| entry.text == text)
                .map(|entry| (entry.favorite, entry.private))
                .unwrap_or((false, false));
            hist.retain(|e| e.text != text); // de-dupe: re-copying an older entry moves it up
            hist.insert(
                0,
                ClipEntry {
                    id: CLIP_NEXT_ID.fetch_add(1, Ordering::Relaxed),
                    text,
                    ts: clip_now_ms(),
                    favorite,
                    private,
                },
            );
            clip_prune_locked(&mut hist, &cfg);
            (true, hist.clone())
        }
    };
    if should_write {
        clip_write_disk(&snapshot, &cfg);
    }
}

/// Is anything actually consuming clipboard history right now? Only the
/// Windows-only watcher thread asks, so the whole helper is cfg'd with it.
#[cfg(windows)]
pub(crate) fn clipboard_feature_active(cfg: &config::Config) -> bool {
    fn has_pin(items: &[config::PinnedApp]) -> bool {
        items
            .iter()
            .any(|item| item.widget.as_deref() == Some("clipboard") || has_pin(&item.children))
    }
    cfg.clipboard_persist || has_pin(&cfg.pinned)
}

/// Clipboard history for the widget flyout (newest first).
#[tauri::command]
pub(crate) fn clipboard_storage_failed() -> bool {
    CLIP_STORAGE_FAILED.load(Ordering::Relaxed)
}

#[tauri::command]
pub(crate) fn clipboard_history(limit: Option<usize>) -> Vec<ClipEntry> {
    clip_enforce_current_policy();
    let hist = CLIP_HISTORY.lock().unwrap();
    let cfg = config::load();
    let cap = limit.unwrap_or(CLIP_HISTORY_MAX).min(clip_limit(&cfg));
    hist.iter().take(cap).cloned().collect()
}

/// Just the count, for the widget's badge (cheap to poll often).
#[tauri::command]
pub(crate) fn clipboard_count() -> usize {
    clip_enforce_current_policy();
    CLIP_HISTORY.lock().unwrap().len()
}

#[derive(serde::Serialize)]
pub(crate) struct ClipSummary {
    pub(crate) count: usize,
    pub(crate) preview: Option<String>,
}

/// Count + the newest entry's text in ONE round trip — the bar widget shows a
/// live preview of what you last copied, not just a bare number.
#[tauri::command]
pub(crate) fn clipboard_summary() -> ClipSummary {
    clip_enforce_current_policy();
    let hist = CLIP_HISTORY.lock().unwrap();
    ClipSummary {
        count: hist.len(),
        preview: hist.first().map(|e| e.text.clone()),
    }
}

/// Put a history entry (or freshly-edited text) back on the OS clipboard, and
/// record/bump it in history immediately — instant UI feedback instead of
/// waiting for the background watcher's next tick.
#[tauri::command]
pub(crate) fn clipboard_copy(text: String) -> bool {
    let ok = win::set_clipboard_text(&text);
    if ok {
        clip_remember(&text);
    }
    ok
}

#[tauri::command]
pub(crate) fn clipboard_delete(id: u64) {
    let cfg = config::load();
    let snapshot = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        hist.retain(|e| e.id != id);
        hist.clone()
    };
    clip_write_disk(&snapshot, &cfg);
}

#[tauri::command]
pub(crate) fn clipboard_favorite(id: u64, favorite: bool) {
    let cfg = config::load();
    let snapshot = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
            entry.favorite = favorite;
        }
        clip_prune_locked(&mut hist, &cfg);
        hist.clone()
    };
    clip_write_disk(&snapshot, &cfg);
}

#[tauri::command]
pub(crate) fn clipboard_private(id: u64, private: bool) {
    let cfg = config::load();
    let snapshot = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
            entry.private = private;
        }
        hist.clone()
    };
    clip_write_disk(&snapshot, &cfg);
}

#[tauri::command]
pub(crate) fn clipboard_clear() {
    let cfg = config::load();
    let snapshot = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        hist.clear();
        hist.clone()
    };
    clip_write_disk(&snapshot, &cfg);
}
