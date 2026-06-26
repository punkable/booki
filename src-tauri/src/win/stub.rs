//! Non-Windows fallbacks. These let the crate compile and the frontend run in a
//! browser during development; native dock behavior is Windows-only.

use super::WindowInfo;

pub fn app_icon_data_uri(_path: &str) -> Option<String> {
    None
}

pub fn list_windows() -> Vec<WindowInfo> {
    Vec::new()
}

pub fn focus_window(_hwnd: isize) -> bool {
    false
}

/// Work area (excluding the taskbar) of the monitor under a point.
/// No native info off-Windows → caller falls back to the full monitor.
pub fn work_area(_x: i32, _y: i32) -> Option<(i32, i32, i32, i32)> {
    None
}
