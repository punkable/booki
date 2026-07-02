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

pub fn foreground_occludes(_dl: i32, _dt: i32, _dr: i32, _db: i32, _self_hwnd: isize) -> bool {
    false
}

pub fn is_fullscreen() -> bool {
    false
}

pub fn set_autostart(_enabled: bool, _exe: &str) -> Result<(), String> {
    Err("autostart is only available on Windows".into())
}

pub fn get_autostart() -> bool {
    false
}

pub fn trash_paths(_paths: &[String]) -> Result<(), String> {
    Err("recycle bin is only available on Windows".into())
}

pub fn trash_is_empty() -> bool {
    true
}

pub fn empty_trash() -> Result<(), String> {
    Err("recycle bin is only available on Windows".into())
}

pub fn wallpaper_accent() -> Option<String> {
    None
}

pub struct MediaSnapshot {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub thumb: Option<String>,
}

pub fn media_now_playing() -> Option<MediaSnapshot> {
    None
}

pub fn media_toggle() -> bool {
    false
}
