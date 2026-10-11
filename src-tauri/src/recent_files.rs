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
/// Reads the folder on the blocking pool, off the UI thread.
#[tauri::command]
pub(crate) async fn recent_files(limit: Option<usize>) -> Vec<RecentFile> {
    util::blocking(move || read_recent(limit.unwrap_or(12).min(40)))
        .await
        .unwrap_or_default()
}

fn read_recent(cap: usize) -> Vec<RecentFile> {
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
/// the REAL file paths (Recent .lnk targets), newest first. Resolving shortcuts
/// and associations does COM and disk work, so it runs on the blocking pool;
/// shortcut_target initializes COM on that thread itself.
#[tauri::command]
pub(crate) async fn recent_files_for(app_path: String, limit: Option<usize>) -> Vec<RecentFile> {
    util::blocking(move || recent_for_app(&app_path, limit.unwrap_or(6).min(20)))
        .await
        .unwrap_or_default()
}

fn recent_for_app(app_path: &str, cap: usize) -> Vec<RecentFile> {
    // Pins are often .lnk shortcuts — compare against the real executable name.
    let exe = if app_path.to_ascii_lowercase().ends_with(".lnk") {
        win::shortcut_target(app_path).unwrap_or_else(|| app_path.to_string())
    } else {
        app_path.to_string()
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
    for r in read_recent(40) {
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

/// Jump List "Recent" items of one app (an .exe, a .lnk or a
/// `shell:AppsFolder\…` entry): up to 10 documents the app or the shell
/// recorded for it, newest first. Empty off-Windows or on any failure. COM
/// work runs on the blocking pool; each helper initialises COM itself.
#[tauri::command]
pub(crate) async fn app_recent_items(path: String) -> Vec<RecentFile> {
    util::blocking(move || jump_list_items(&path, 10))
        .await
        .unwrap_or_default()
}

fn jump_list_items(app_path: &str, cap: usize) -> Vec<RecentFile> {
    let app_path = app_path.trim();
    if app_path.is_empty() {
        return Vec::new();
    }
    let (explicit, exe) = if let Some(id) = apps_folder_id(app_path) {
        (Some(id.to_string()), String::new())
    } else if app_path.to_ascii_lowercase().ends_with(".lnk") {
        (
            win::shortcut_app_id(app_path),
            win::shortcut_target(app_path).unwrap_or_default(),
        )
    } else {
        (None, app_path.to_string())
    };
    let folders = if exe.is_empty() {
        Vec::new()
    } else {
        win::app_id_known_folders()
    };
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for id in app_id_candidates(explicit.as_deref(), &exe, &folders) {
        for (name, path) in win::jump_list_recent(&id, cap) {
            if out.len() >= cap {
                return out;
            }
            if seen.insert(path.to_lowercase()) {
                out.push(RecentFile { name, path });
            }
        }
    }
    out
}

/// The AppUserModelID in a `shell:AppsFolder\<AUMID>` path.
fn apps_folder_id(path: &str) -> Option<&str> {
    const PREFIX: &str = "shell:appsfolder\\";
    let head = path.get(..PREFIX.len())?;
    let id = &path[PREFIX.len()..];
    (head.eq_ignore_ascii_case(PREFIX) && !id.is_empty()).then_some(id)
}

/// AppIDs an app's Jump List may be stored under, most likely first: the
/// explicit AppUserModelID, then the implicit ID Windows derives for a Win32
/// app without one. That implicit ID is the executable path, with a known
/// folder written as its `{GUID}` (`{6D809377-…}\App\app.exe` for Program
/// Files). Which form SetAppID accepts is not documented, so both are tried.
/// An AppUserModelID is at most 128 characters; longer candidates are dropped.
fn app_id_candidates(
    explicit: Option<&str>,
    exe: &str,
    folders: &[(String, String)],
) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let mut push = |id: String| {
        if !id.is_empty()
            && id.chars().count() <= 128
            && !ids.iter().any(|known| known.eq_ignore_ascii_case(&id))
        {
            ids.push(id);
        }
    };
    if let Some(id) = explicit {
        push(id.trim().to_string());
    }
    let exe = exe.trim().replace('/', "\\");
    if exe.to_ascii_lowercase().ends_with(".exe") {
        if let Some(relative) = known_folder_relative(&exe, folders) {
            push(relative);
        }
        push(exe);
    }
    ids
}

/// `exe` rewritten against the deepest known folder that contains it.
fn known_folder_relative(exe: &str, folders: &[(String, String)]) -> Option<String> {
    folders
        .iter()
        .filter_map(|(guid, folder)| {
            let folder = folder.replace('/', "\\");
            let folder = folder.trim_end_matches('\\');
            let rest = exe.get(folder.len()..)?.strip_prefix('\\')?;
            let inside = !folder.is_empty()
                && !rest.is_empty()
                && exe.get(..folder.len())?.eq_ignore_ascii_case(folder);
            inside.then(|| (folder.len(), format!("{guid}\\{rest}")))
        })
        .max_by_key(|(length, _)| *length)
        .map(|(_, id)| id)
}

#[cfg(test)]
mod jump_list_tests {
    use super::{app_id_candidates, apps_folder_id, known_folder_relative};

    fn folders() -> Vec<(String, String)> {
        vec![
            (
                "{6D809377-6AF0-444B-8957-A3773F02200E}".into(),
                r"C:\Program Files".into(),
            ),
            (
                "{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}".into(),
                r"C:\Users\me\AppData\Local".into(),
            ),
            (
                "{5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}".into(),
                r"C:\Users\me\AppData\Local\Programs".into(),
            ),
        ]
    }

    #[test]
    fn rewrites_against_deepest_known_folder() {
        assert_eq!(
            known_folder_relative(r"c:\program files\App\app.exe", &folders()).as_deref(),
            Some(r"{6D809377-6AF0-444B-8957-A3773F02200E}\App\app.exe")
        );
        assert_eq!(
            known_folder_relative(r"C:\Users\me\AppData\Local\Programs\x\x.exe", &folders())
                .as_deref(),
            Some(r"{5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}\x\x.exe")
        );
        // A sibling folder that merely shares a prefix is not inside it.
        assert_eq!(
            known_folder_relative(r"C:\Program Files (x86)\a.exe", &folders()),
            None
        );
    }

    #[test]
    fn candidates_put_explicit_first_and_dedupe() {
        assert_eq!(
            app_id_candidates(
                Some("Vendor.App"),
                "C:/Program Files/App/app.exe",
                &folders()
            ),
            vec![
                "Vendor.App".to_string(),
                r"{6D809377-6AF0-444B-8957-A3773F02200E}\App\app.exe".to_string(),
                r"C:\Program Files\App\app.exe".to_string(),
            ]
        );
        assert_eq!(
            app_id_candidates(None, r"D:\tools\t.exe", &folders()),
            vec![r"D:\tools\t.exe".to_string()]
        );
        assert_eq!(
            app_id_candidates(Some(r"d:\TOOLS\t.exe"), r"D:\tools\t.exe", &[]),
            vec![r"d:\TOOLS\t.exe".to_string()]
        );
        assert!(app_id_candidates(None, r"C:\docs\readme.txt", &folders()).is_empty());
        let long = format!(r"D:\{}\a.exe", "d".repeat(130));
        assert!(app_id_candidates(None, &long, &[]).is_empty());
    }

    #[test]
    fn reads_apps_folder_ids() {
        assert_eq!(
            apps_folder_id(r"shell:AppsFolder\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"),
            Some("Microsoft.WindowsNotepad_8wekyb3d8bbwe!App")
        );
        assert_eq!(apps_folder_id(r"shell:AppsFolder\"), None);
        assert_eq!(apps_folder_id(r"C:\app.exe"), None);
    }
}
