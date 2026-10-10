//! Recently used files, overall and per app.

use super::*;

#[derive(serde::Serialize)]
pub(crate) struct RecentFile {
    pub(crate) name: String,
    pub(crate) path: String,
}

/// The system's recently-opened files (newest first), read from the Windows
/// Recent folder. Each entry is a .lnk we can open directly with the shell, so
/// no fragile binary parsing is involved. Empty off-Windows or on any error.
#[tauri::command]
pub(crate) fn recent_files(limit: Option<usize>) -> Vec<RecentFile> {
    let cap = limit.unwrap_or(12).min(40);
    let Some(data) = dirs::data_dir() else {
        return Vec::new();
    };
    let recent = data.join("Microsoft").join("Windows").join("Recent");
    let Ok(entries) = std::fs::read_dir(&recent) else {
        return Vec::new();
    };
    let mut items: Vec<(std::time::SystemTime, RecentFile)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Only the flat .lnk shortcuts (skip the AutomaticDestinations subfolders).
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            != Some(true)
        {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        items.push((
            modified,
            RecentFile {
                name,
                path: path.to_string_lossy().to_string(),
            },
        ));
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.0)); // newest first
    items.into_iter().take(cap).map(|(_, f)| f).collect()
}

/// Recent files RELEVANT to one pinned app: keeps only entries whose default
/// "open" handler is that app (via the shell's file associations), so an app's
/// right-click menu never lists documents it has nothing to do with. Returns
/// the REAL file paths (Recent .lnk targets), newest first. Async — resolving
/// shortcuts + associations does COM work.
#[tauri::command]
pub(crate) async fn recent_files_for(app_path: String, limit: Option<usize>) -> Vec<RecentFile> {
    let cap = limit.unwrap_or(6).min(20);
    // Pins are often .lnk shortcuts — compare against the real executable name.
    let exe = if app_path.to_ascii_lowercase().ends_with(".lnk") {
        win::shortcut_target(&app_path).unwrap_or_else(|| app_path.clone())
    } else {
        app_path.clone()
    };
    let exe_name = std::path::Path::new(&exe)
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if exe_name.is_empty() || !exe_name.ends_with(".exe") {
        return Vec::new();
    }
    let mut assoc_cache: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    let mut out: Vec<RecentFile> = Vec::new();
    for r in recent_files(Some(40)) {
        // Each Recent entry is a .lnk — its target gives the real file + extension.
        let Some(target) = win::shortcut_target(&r.path) else {
            continue;
        };
        let Some(ext) = std::path::Path::new(&target)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        else {
            continue;
        };
        let hit = *assoc_cache.entry(ext.clone()).or_insert_with(|| {
            win::assoc_executable(&ext)
                .and_then(|e| {
                    std::path::Path::new(&e)
                        .file_name()
                        .map(|s| s.to_string_lossy().to_lowercase())
                })
                .map(|n| n == exe_name)
                .unwrap_or(false)
        });
        // exists() on a dead network share can block for seconds — skip UNC.
        if target.starts_with("\\\\") {
            continue;
        }
        if hit && std::path::Path::new(&target).exists() {
            out.push(RecentFile {
                name: r.name,
                path: target,
            });
            if out.len() >= cap {
                break;
            }
        }
    }
    out
}
