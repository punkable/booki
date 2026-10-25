//! Non-Windows fallbacks. These let the crate compile and the frontend run in a
//! browser during development; native dock behavior is Windows-only.
//!
//! Every function here exists to mirror the `windows_impl` surface one-for-one,
//! so `win::foo` resolves on both platforms. Most are therefore never called in
//! a Linux build — that is the point, not an oversight, and `cargo clippy
//! -D warnings` on Linux would otherwise fail on all of them.
#![allow(dead_code)]

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

pub fn toggle_window(_hwnd: isize) -> bool {
    false
}

pub fn close_window(_hwnd: isize) -> bool {
    false
}

pub fn set_capture_visible(_hwnd: isize, _visible: bool) {}
pub fn foreground_is_capture() -> bool {
    false
}

pub fn protect_data(data: &[u8]) -> Option<Vec<u8>> {
    Some(data.to_vec())
}

pub fn unprotect_data(data: &[u8]) -> Option<Vec<u8>> {
    Some(data.to_vec())
}

/// Work area (excluding the taskbar) of the monitor under a point.
/// No native info off-Windows → caller falls back to the full monitor.
pub fn work_area(_x: i32, _y: i32) -> Option<(i32, i32, i32, i32)> {
    None
}

pub fn work_area_ex(_x: i32, _y: i32, _follow_visible_tray: bool) -> Option<(i32, i32, i32, i32)> {
    None
}

/// Auto-hide taskbar state — always false off-Windows.
pub fn taskbar_autohide() -> bool {
    false
}

pub fn foreground_occludes(_dl: i32, _dt: i32, _dr: i32, _db: i32, _self_hwnd: isize) -> bool {
    false
}

pub fn is_fullscreen_on(_dock: isize) -> bool {
    false
}

pub fn set_autostart(_enabled: bool, _exe: &str) -> Result<(), String> {
    Err("autostart is only available on Windows".into())
}

pub fn repair_autostart(_exe: &str) -> Result<(), String> {
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
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    /// App that owns the session (AppUserModelID, lowercased), to match a pinned app.
    pub source: String,
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
pub fn raise_topmost(_hwnd: isize) {}
pub fn set_background_priority(_on: bool) {}

pub fn file_thumbnail(_path: &str, _size: i32) -> Option<String> {
    None
}

pub fn set_clipboard_text(_text: &str) -> bool {
    false
}

pub fn clipboard_get_text() -> Option<String> {
    None
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

pub fn foreground_is_code() -> bool {
    false
}

pub fn foreground_is_video() -> bool {
    false
}

pub fn bluetooth_radio(_set: Option<bool>) -> Option<bool> {
    None
}

pub fn foreground_exe() -> String {
    String::new()
}

pub fn foreground_place() -> &'static str {
    "desk"
}

pub fn desktop_foreground() -> bool {
    false
}

pub fn foreground_maximized_on(_notch: isize) -> bool {
    false
}

pub fn cursor_near_window(_hwnd: isize, _pad: i32) -> bool {
    false
}

pub fn app_identity(path: &str) -> String {
    serde_json::json!([path.replace('\\', "/").to_lowercase(), "", ""]).to_string()
}

pub fn packaged_apps() -> Vec<(String, String)> {
    Vec::new()
}

pub fn quiet_update_supported() -> bool {
    false
}

pub fn set_app_user_model_id(_id: &str) -> bool {
    false
}

pub fn show_toast(_app_id: &str, _xml: &str) -> Result<(), String> {
    Err("toasts are unavailable: Windows only".into())
}

pub fn shortcut_app_id(_lnk: &str) -> Option<String> {
    None
}

pub fn app_id_known_folders() -> Vec<(String, String)> {
    Vec::new()
}

pub fn jump_list_recent(_app_id: &str, _cap: usize) -> Vec<(String, String)> {
    Vec::new()
}
