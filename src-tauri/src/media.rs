//! Media session and system volume, for the Music and Volume widgets.

use super::*;

#[derive(serde::Serialize)]
pub(crate) struct MediaInfo {
    pub(crate) title: String,
    pub(crate) artist: String,
    pub(crate) playing: bool,
    pub(crate) thumb: Option<String>,
}

/// What the system media session is playing (async: WinRT calls block briefly).
#[tauri::command]
pub(crate) async fn media_info() -> Option<MediaInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        win::media_now_playing().map(|m| MediaInfo {
            title: m.title,
            artist: m.artist,
            playing: m.playing,
            thumb: m.thumb,
        })
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn media_toggle() -> bool {
    tauri::async_runtime::spawn_blocking(win::media_toggle)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn media_next() -> bool {
    tauri::async_runtime::spawn_blocking(win::media_next)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn media_prev() -> bool {
    tauri::async_runtime::spawn_blocking(win::media_prev)
        .await
        .unwrap_or(false)
}

/// Master volume as (percent, muted); None when unavailable.
#[tauri::command]
pub(crate) async fn volume_info() -> Option<(u32, bool)> {
    tauri::async_runtime::spawn_blocking(|| win::volume_get().ok())
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn volume_set(pct: u32) -> Result<(), String> {
    win::volume_set(pct)
}

/// Toggle mute; returns the new muted state.
#[tauri::command]
pub(crate) fn volume_mute() -> Result<bool, String> {
    win::volume_mute_toggle()
}
