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
