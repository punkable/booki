//! Media session and system volume, for the Music and Volume widgets.

use super::*;

#[derive(serde::Serialize)]
pub(crate) struct MediaInfo {
    pub(crate) title: String,
    pub(crate) artist: String,
    pub(crate) playing: bool,
    pub(crate) thumb: Option<String>,
    pub(crate) position_ms: Option<u64>,
    pub(crate) duration_ms: Option<u64>,
    pub(crate) source: String,
}

/// Set while a media query runs, so a stalled media service holds one thread
/// instead of a new one per poll.
static MEDIA_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// The same for play/pause/next/previous, so a button press never waits on
/// (or is dropped behind) a poll.
static CONTROL_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Run a media call on its own thread and give up after a few seconds. The
/// system media service can stall; without a limit every later poll queued
/// behind it and the widgets froze until Booki restarted.
fn bounded<T: Send + Default + 'static>(
    busy: &'static std::sync::atomic::AtomicBool,
    f: impl FnOnce() -> T + Send + 'static,
) -> T {
    use std::sync::atomic::Ordering;
    if busy.swap(true, Ordering::AcqRel) {
        return T::default();
    }
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let out = f();
        busy.store(false, Ordering::Release);
        let _ = tx.send(out);
    });
    rx.recv_timeout(std::time::Duration::from_secs(3))
        .unwrap_or_default()
}

/// What the system media session is playing (async: WinRT calls block briefly).
#[tauri::command]
pub(crate) async fn media_info() -> Option<MediaInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        bounded(&MEDIA_BUSY, || {
            win::media_now_playing().map(|m| MediaInfo {
                title: m.title,
                artist: m.artist,
                playing: m.playing,
                thumb: m.thumb,
                position_ms: m.position_ms,
                duration_ms: m.duration_ms,
                source: m.source,
            })
        })
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub(crate) async fn media_toggle() -> bool {
    tauri::async_runtime::spawn_blocking(|| bounded(&CONTROL_BUSY, win::media_toggle))
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn media_next() -> bool {
    tauri::async_runtime::spawn_blocking(|| bounded(&CONTROL_BUSY, win::media_next))
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn media_prev() -> bool {
    tauri::async_runtime::spawn_blocking(|| bounded(&CONTROL_BUSY, win::media_prev))
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
static VOLUME_WANTED: Mutex<(u32, Option<bool>)> = Mutex::new((0, None));

fn apply_volume_request() -> Result<(), String> {
    let (percent, muted) = *VOLUME_WANTED.lock().unwrap_or_else(|e| e.into_inner());
    #[cfg(windows)]
    if let Some(muted) = muted {
        return win::volume_set_state(percent, muted);
    }
    let _ = muted;
    win::volume_set(percent)
}

#[tauri::command]
pub(crate) async fn volume_set(pct: u32) -> Result<(), String> {
    *VOLUME_WANTED.lock().unwrap_or_else(|e| e.into_inner()) = (pct, None);
    util::blocking(|| {
        let _turn = VOLUME_TURN.lock().unwrap_or_else(|e| e.into_inner());
        apply_volume_request()
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

#[tauri::command]
pub(crate) async fn app_volumes() -> Result<Vec<win::AppVolume>, String> {
    #[cfg(windows)]
    {
        util::blocking(win::app_volumes).await?
    }
    #[cfg(not(windows))]
    {
        Err("Core Audio requires Windows".into())
    }
}

#[tauri::command]
pub(crate) async fn app_volume_set(id: String, percent: u32, muted: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        util::blocking(move || win::app_volume_set(&id, percent, muted)).await?
    }
    #[cfg(not(windows))]
    {
        let _ = (id, percent, muted);
        Err("Core Audio requires Windows".into())
    }
}

#[tauri::command]
pub(crate) async fn volume_set_state(percent: u32, muted: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        *VOLUME_WANTED.lock().unwrap_or_else(|e| e.into_inner()) = (percent, Some(muted));
        util::blocking(|| {
            let _turn = VOLUME_TURN.lock().unwrap_or_else(|e| e.into_inner());
            apply_volume_request()
        })
        .await?
    }
    #[cfg(not(windows))]
    {
        let _ = (percent, muted);
        Err("Core Audio requires Windows".into())
    }
}
