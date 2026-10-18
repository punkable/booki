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
        // Favorites stay first in line for a slot, but the list keeps its
        // newest-first order: the oldest non-favorites are the ones dropped.
        let favorites = hist
            .iter()
            .filter(|entry| entry.favorite)
            .count()
            .min(limit);
        let mut favorite_slots = favorites;
        let mut other_slots = limit - favorites;
        hist.retain(|entry| {
            let slots = if entry.favorite {
                &mut favorite_slots
            } else {
                &mut other_slots
            };
            if *slots == 0 {
                return false;
            }
            *slots -= 1;
            true
        });
    }
    hist.len() != before
}

/// Serializes every write of the history file. The copy is taken while this
/// lock is held, so the last write always carries the newest list. With the
/// old clone-then-write order the watcher could clone, the user could clear
/// and save the empty list, and the watcher's older clone would then land last
/// and bring the history back on the next start.
static CLIP_PERSIST: Mutex<()> = Mutex::new(());

/// Persist the current history. Callers must NOT hold the CLIP_HISTORY guard.
/// The history lock is held only for the copy, so a slow disk never stalls
/// readers of the list (save_config takes it on the UI thread).
pub(crate) fn clip_persist(cfg: &Config) {
    let _write = CLIP_PERSIST.lock().unwrap_or_else(|e| e.into_inner());
    let snapshot = CLIP_HISTORY.lock().unwrap().clone();
    clip_write_disk(&snapshot, cfg);
}

/// Encrypt (DPAPI) and write one copy of the history. Only `clip_persist`
/// calls this, with the persist lock held.
fn clip_write_disk(hist: &[ClipEntry], cfg: &Config) {
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
    // Nothing left to keep (cleared or last item deleted): remove the file,
    // so a failed encryption can never bring deleted items back.
    if persistable.is_empty() {
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(clip_legacy_history_path());
        CLIP_STORAGE_FAILED.store(false, Ordering::Relaxed);
        return;
    }
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
    clip_prune_locked(&mut CLIP_HISTORY.lock().unwrap(), cfg);
    clip_persist(cfg);
}

pub(crate) fn clip_load_from_disk() {
    let cfg = config::load();
    if !cfg.clipboard_persist {
        let _ = fs::remove_file(clip_history_path());
        let _ = fs::remove_file(clip_legacy_history_path());
        return;
    }
    // A file that exists but can't be read now (DPAPI hiccup, mid-write) must
    // not be overwritten with an empty list: keep it for the next start.
    let unreadable = fs::read(clip_history_path())
        .ok()
        .is_some_and(|bytes| clip_parse_disk(&bytes).is_none());
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
    *CLIP_HISTORY.lock().unwrap() = hist;
    if !unreadable && (loaded_legacy || cfg.clipboard_persist) {
        clip_persist(&cfg);
    }
}

pub(crate) fn clip_enforce_current_policy() {
    let cfg = config::load();
    let changed = clip_prune_locked(&mut CLIP_HISTORY.lock().unwrap(), &cfg);
    if changed || !cfg.clipboard_persist {
        clip_persist(&cfg);
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
    let should_write = {
        let mut hist = CLIP_HISTORY.lock().unwrap();
        let pruned = clip_prune_locked(&mut hist, &cfg);
        if hist.first().map(|e| e.text == text).unwrap_or(false) {
            // Already the most recent entry — nothing changed.
            pruned || !cfg.clipboard_persist
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
            true
        }
    };
    if should_write {
        clip_persist(&cfg);
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

#[tauri::command]
pub(crate) fn clipboard_storage_failed() -> bool {
    CLIP_STORAGE_FAILED.load(Ordering::Relaxed)
}

// Every command below can encrypt and fsync the history file, and that write
// waits for any write already in progress, so they all run on the blocking
// pool instead of the UI thread.

/// Clipboard history for the widget flyout (newest first).
#[tauri::command]
pub(crate) async fn clipboard_history(limit: Option<usize>) -> Vec<ClipEntry> {
    util::blocking(move || {
        clip_enforce_current_policy();
        let cfg = config::load();
        let cap = limit.unwrap_or(CLIP_HISTORY_MAX).min(clip_limit(&cfg));
        let hist = CLIP_HISTORY.lock().unwrap();
        hist.iter().take(cap).cloned().collect()
    })
    .await
    .unwrap_or_default()
}

/// Just the count, for the widget's badge (cheap to poll often).
#[tauri::command]
pub(crate) async fn clipboard_count() -> usize {
    util::blocking(|| {
        clip_enforce_current_policy();
        CLIP_HISTORY.lock().unwrap().len()
    })
    .await
    .unwrap_or_default()
}

#[derive(serde::Serialize, Default)]
pub(crate) struct ClipSummary {
    pub(crate) count: usize,
    pub(crate) preview: Option<String>,
}

/// Count + the newest entry's text in ONE round trip — the bar widget shows a
/// live preview of what you last copied, not just a bare number.
#[tauri::command]
pub(crate) async fn clipboard_summary() -> ClipSummary {
    util::blocking(|| {
        clip_enforce_current_policy();
        let hist = CLIP_HISTORY.lock().unwrap();
        ClipSummary {
            count: hist.len(),
            preview: hist.first().map(|e| e.text.clone()),
        }
    })
    .await
    .unwrap_or_default()
}

/// Put a history entry (or freshly-edited text) back on the OS clipboard, and
/// record/bump it in history immediately — instant UI feedback instead of
/// waiting for the background watcher's next tick.
#[tauri::command]
pub(crate) async fn clipboard_copy(text: String) -> bool {
    util::blocking(move || {
        let ok = win::set_clipboard_text(&text);
        if ok {
            clip_remember(&text);
        }
        ok
    })
    .await
    .unwrap_or(false)
}

/// Change the in-memory list, then persist it, off the UI thread.
async fn clip_edit(edit: impl FnOnce(&mut Vec<ClipEntry>, &Config) + Send + 'static) {
    let _ = util::blocking(move || {
        let cfg = config::load();
        edit(&mut CLIP_HISTORY.lock().unwrap(), &cfg);
        clip_persist(&cfg);
    })
    .await;
}

#[tauri::command]
pub(crate) async fn clipboard_delete(id: u64) {
    clip_edit(move |hist, _| hist.retain(|e| e.id != id)).await;
}

#[tauri::command]
pub(crate) async fn clipboard_favorite(id: u64, favorite: bool) {
    clip_edit(move |hist, cfg| {
        if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
            entry.favorite = favorite;
        }
        clip_prune_locked(hist, cfg);
    })
    .await;
}

#[tauri::command]
pub(crate) async fn clipboard_private(id: u64, private: bool) {
    clip_edit(move |hist, _| {
        if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
            entry.private = private;
        }
    })
    .await;
}

#[tauri::command]
pub(crate) async fn clipboard_clear() {
    clip_edit(|hist, _| hist.clear()).await;
}

#[cfg(test)]
mod prune_tests {
    use super::*;

    fn entry(id: u64, favorite: bool) -> ClipEntry {
        ClipEntry {
            id,
            text: id.to_string(),
            ts: clip_now_ms(),
            favorite,
            private: false,
        }
    }

    #[test]
    fn pruning_keeps_newest_first_and_drops_the_oldest_non_favorites() {
        let cfg = Config {
            clipboard_history_limit: 3,
            clipboard_retention_days: 0,
            ..Config::default()
        };
        // Newest first; the favorite (3) is older than the newest copies.
        let mut hist = vec![
            entry(5, false),
            entry(4, false),
            entry(3, true),
            entry(2, false),
            entry(1, false),
        ];
        assert!(clip_prune_locked(&mut hist, &cfg));
        let ids: Vec<u64> = hist.iter().map(|e| e.id).collect();
        assert_eq!(ids, vec![5, 4, 3]);
    }
}
