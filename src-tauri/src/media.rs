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

// Core Audio calls can stall while the audio service is busy (device switch,
// driver restart), so they stay off the UI thread. AudioRuntime initializes
// COM on the blocking thread. Off the UI thread, two wheel steps can run at
// once, so changes take turns and each applies the newest requested level:
// the last one to run always leaves the newest level set.
static VOLUME_TURN: Mutex<()> = Mutex::new(());
static VOLUME_WANTED: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[tauri::command]
pub(crate) async fn volume_set(pct: u32) -> Result<(), String> {
    VOLUME_WANTED.store(pct, Ordering::SeqCst);
    util::blocking(|| {
        let _turn = VOLUME_TURN.lock().unwrap_or_else(|e| e.into_inner());
        win::volume_set(VOLUME_WANTED.load(Ordering::SeqCst))
    })
    .await?
}

/// Toggle mute; returns the new muted state.
#[tauri::command]
pub(crate) async fn volume_mute() -> Result<bool, String> {
    util::blocking(|| {
        let _turn = VOLUME_TURN.lock().unwrap_or_else(|e| e.into_inner());
        win::volume_mute_toggle()
    })
    .await?
}
