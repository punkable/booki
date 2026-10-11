//! File and folder commands: listing, opening, moving, thumbnails and the
//! Recycle Bin.

use super::*;

/// Which of these paths exist on THIS machine (used after importing a config
/// from another PC to flag pins whose program lives somewhere else here).
/// Off the UI thread: a `\\server` path on a dead share takes seconds to fail.
#[tauri::command]
pub(crate) async fn paths_exist(paths: Vec<String>) -> Result<Vec<bool>, String> {
    util::blocking(move || {
        paths
            .iter()
            .map(|p| {
                let p = p.trim();
                // Web links (pinned URLs) aren't files — never flag them "not found".
                if p.starts_with("http://") || p.starts_with("https://") {
                    return true;
                }
                !p.is_empty() && std::path::Path::new(p).exists()
            })
            .collect()
    })
    .await
}

/// Search and sort the entire directory before slicing the requested page.
#[tauri::command]
pub(crate) async fn list_dir(
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
    query: Option<String>,
    order: Option<String>,
) -> Result<Vec<DirItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        directory::read(
            std::path::Path::new(&path),
            offset.unwrap_or(0),
            limit.unwrap_or(80),
            query.as_deref().unwrap_or(""),
            order.as_deref().unwrap_or("name"),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Windows "Open with…" dialog for a file.
#[tauri::command]
pub(crate) fn open_with(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

/// Open the containing folder of a pinned item (selecting it on Windows).
#[tauri::command]
pub(crate) fn open_location(path: String) -> Result<(), String> {
    apps::reveal(&path)
}

/// Convert an image file to a data URI (for custom tile icons).
#[tauri::command]
pub(crate) async fn image_data_uri(path: String) -> Option<String> {
    util::blocking(move || util::read_image_data_uri(&path))
        .await
        .unwrap_or_default()
}

/// Explorer-grade thumbnail for a file in the folder flyout. The shell call
/// and PNG encode run on the blocking pool (shell_image_png initializes COM on
/// that thread itself).
#[tauri::command]
pub(crate) async fn file_thumbnail(path: String) -> Option<String> {
    // Network paths can hang for seconds when the share is unreachable — a
    // skeleton that resolves to the type icon beats a stuck cell.
    if path.starts_with("\\\\") {
        return None;
    }
    util::blocking(move || win::file_thumbnail(&path, 96))
        .await
        .unwrap_or_default()
}

/// Move files/folders into a destination folder (drop onto a folder pin).
///
/// Deliberately synchronous, so it runs on the UI thread: SHFileOperationW may
/// show the shell's progress and name-collision dialogs, and those need a
/// thread that pumps messages. Moving it to the blocking pool needs a test on
/// Windows first.
#[tauri::command]
pub(crate) fn move_paths(paths: Vec<String>, dest: String) -> Result<(), String> {
    let result = win::move_paths(&paths, &dest);
    if let Err(e) = &result {
        log::error!("move_paths failed: {e}");
    }
    result
}

/// Send files/folders to the Recycle Bin (the dock's own UI confirms first).
/// On the blocking pool so a large delete never blocks the UI thread or an
/// async worker.
#[tauri::command]
pub(crate) async fn trash_paths(paths: Vec<String>) -> Result<(), String> {
    let result = util::blocking(move || win::trash_paths(&paths))
        .await
        .and_then(|result| result);
    if let Err(e) = &result {
        log::error!("trash_paths failed: {e}");
    }
    result
}

// On the blocking pool: SHQueryRecycleBinW can be slow on a huge bin, and it
// runs on the widget poll every few seconds.
#[tauri::command]
pub(crate) async fn trash_is_empty() -> bool {
    util::blocking(win::trash_is_empty).await.unwrap_or(true)
}

/// How many items are in the Recycle Bin (for the trash tile's badge).
#[tauri::command]
pub(crate) async fn trash_count() -> u64 {
    util::blocking(win::trash_count)
        .await
        .ok()
        .flatten()
        .unwrap_or(0)
}

// Emptying the Recycle Bin can take a while (many/large files); on the UI
// thread it would freeze the whole dock until it's done.
#[tauri::command]
pub(crate) async fn empty_trash() -> Result<(), String> {
    let result = util::blocking(win::empty_trash)
        .await
        .and_then(|result| result);
    if let Err(e) = &result {
        log::error!("empty_trash failed: {e}");
    }
    result
}
