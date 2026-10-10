//! Platform integration layer.
//!
//! The real implementation lives in [`windows_impl`] and is compiled only on
//! Windows. On other platforms (e.g. local frontend development on Linux/macOS)
//! the [`stub`] module provides no-op fallbacks so the rest of the crate builds.

use serde::Serialize;

/// A top-level window discovered on the desktop.
#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    /// Native window handle, passed back to [`focus_window`].
    pub hwnd: isize,
    pub title: String,
    /// Full path of the process that owns the window (lowercased), for reliably
    /// matching a pinned app to its live window. Empty if it couldn't be read.
    #[serde(default)]
    pub exe: String,
}

#[cfg(windows)]
pub mod material;
#[cfg(windows)]
pub mod platform;
#[cfg(windows)]
pub mod system_events;
#[cfg(windows)]
mod windows_impl;
#[cfg(windows)]
pub use windows_impl::{
    app_icon_data_uri, app_identity, assoc_executable, clipboard_get_text, close_window,
    cursor_at_edge, cursor_in_rects, desktop_foreground, empty_trash, file_thumbnail, focus_window,
    foreground_occludes, get_autostart, is_fullscreen, known_folders, list_windows, media_next,
    media_now_playing, media_prev, media_toggle, move_paths, move_window, packaged_apps,
    protect_data, quiet_update_supported, set_autostart, set_capture_visible, set_clipboard_text,
    shortcut_target, sync_context_menu, taskbar_autohide, toggle_window, trash_count,
    trash_is_empty, trash_paths, unprotect_data, volume_get, volume_mute_toggle, volume_set,
    wallpaper_accent, work_area, work_area_ex,
};

#[cfg(not(windows))]
mod stub;
// The Linux build only calls a handful of these — the rest are re-exported so
// `win::foo` type-checks in code that is itself cfg'd to Windows.
#[cfg(not(windows))]
#[allow(unused_imports)]
pub use stub::{
    app_icon_data_uri, app_identity, assoc_executable, clipboard_get_text, close_window,
    cursor_at_edge, cursor_in_rects, desktop_foreground, empty_trash, file_thumbnail, focus_window,
    foreground_occludes, get_autostart, is_fullscreen, known_folders, list_windows, media_next,
    media_now_playing, media_prev, media_toggle, move_paths, move_window, packaged_apps,
    protect_data, quiet_update_supported, set_autostart, set_capture_visible, set_clipboard_text,
    shortcut_target, sync_context_menu, taskbar_autohide, toggle_window, trash_count,
    trash_is_empty, trash_paths, unprotect_data, volume_get, volume_mute_toggle, volume_set,
    wallpaper_accent, work_area, work_area_ex,
};
