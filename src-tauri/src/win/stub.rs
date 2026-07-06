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

pub fn exclude_from_capture(_hwnd: isize) {}

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

pub fn trash_count() -> Option<u64> {
    None
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

pub fn media_next() -> bool {
    false
}

pub fn media_prev() -> bool {
    false
}

pub fn move_paths(_paths: &[String], _dest: &str) -> Result<(), String> {
    Err("moving files is only available on Windows".into())
}

pub fn volume_get() -> Result<(u32, bool), String> {
    Err("system volume is only available on Windows".into())
}

pub fn volume_set(_pct: u32) -> Result<(), String> {
    Err("system volume is only available on Windows".into())
}

pub fn volume_mute_toggle() -> Result<bool, String> {
    Err("system volume is only available on Windows".into())
}

pub fn known_folders() -> Vec<(String, String)> {
    Vec::new()
}

pub fn move_window(_hwnd: isize, _x: i32, _y: i32, _w: i32, _h: i32) {}

pub fn file_thumbnail(_path: &str, _size: i32) -> Option<String> {
    None
}

pub fn set_clipboard_text(_text: &str) -> bool {
    false
}

pub fn shortcut_target(_path: &str) -> Option<String> {
    None
}

pub fn assoc_executable(_ext: &str) -> Option<String> {
    None
}

pub fn cursor_in_rects(_hwnd: isize, _rects: &[(f64, f64, f64, f64)], _all: bool) -> Option<bool> {
    None
}

pub fn sync_context_menu(
    _enabled: bool,
    _exe: &str,
    _label_pin: &str,
    _group_entries: &[(String, String)],
) -> Result<(), String> {
    Ok(())
}

pub fn cursor_at_edge(_edge: &str) -> bool {
    false
}
