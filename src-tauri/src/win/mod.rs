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
}

#[cfg(windows)]
mod windows_impl;
#[cfg(windows)]
pub use windows_impl::{
    app_icon_data_uri, empty_trash, focus_window, foreground_occludes, get_autostart,
    is_fullscreen, list_windows, set_autostart, trash_is_empty, trash_paths, work_area,
};

#[cfg(not(windows))]
mod stub;
#[cfg(not(windows))]
pub use stub::{
    app_icon_data_uri, empty_trash, focus_window, foreground_occludes, get_autostart,
    is_fullscreen, list_windows, set_autostart, trash_is_empty, trash_paths, work_area,
};
