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
mod windows_impl;
#[cfg(windows)]
pub use windows_impl::{
    app_icon_data_uri, assoc_executable, clipboard_get_text, cursor_at_edge, cursor_in_rects,
    empty_trash, exclude_from_capture, file_thumbnail, focus_window, foreground_app_name,
    foreground_occludes, foreground_window_handle, get_autostart, is_fullscreen, known_folders,
    list_windows, media_next, media_now_playing, media_prev, media_toggle, move_paths, move_window,
    protect_data, set_autostart, set_capture_visible, set_clipboard_text, shortcut_target,
    sync_context_menu, trash_count, trash_is_empty, trash_paths, unprotect_data, volume_get,
    volume_mute_toggle, volume_set, wallpaper_accent, work_area, MediaSnapshot,
};

#[cfg(not(windows))]
mod stub;
#[cfg(not(windows))]
pub use stub::{
    app_icon_data_uri, assoc_executable, clipboard_get_text, cursor_at_edge, cursor_in_rects,
    empty_trash, exclude_from_capture, file_thumbnail, focus_window, foreground_app_name,
    foreground_occludes, foreground_window_handle, get_autostart, is_fullscreen, known_folders,
    list_windows, media_next, media_now_playing, media_prev, media_toggle, move_paths, move_window,
    protect_data, set_autostart, set_capture_visible, set_clipboard_text, shortcut_target,
    sync_context_menu, trash_count, trash_is_empty, trash_paths, unprotect_data, volume_get,
    volume_mute_toggle, volume_set, wallpaper_accent, work_area, MediaSnapshot,
};
