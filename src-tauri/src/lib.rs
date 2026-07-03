//! Booki Dock — Tauri backend.
//!
//! Owns the frameless always-on-top dock window, the system-tray icon, config
//! persistence, app launching and (on Windows) native window management.

mod apps;
mod config;
mod util;
mod win;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use config::Config;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// Set when the changelog was requested before the settings window existed; the
/// settings page asks for it on mount (`take_pending_changelog`). A plain flag —
/// never a URL hash — so the settings window always loads its normal, known-good
/// URL (a hash in the app URL made the window come up blank on Windows).
static PENDING_CHANGELOG: AtomicBool = AtomicBool::new(false);

/// Tab the settings window should open on (e.g. "apps" from the empty dock's
/// "+" tile). Same read-and-clear pattern as PENDING_CHANGELOG.
static PENDING_TAB: Mutex<Option<String>> = Mutex::new(None);

/// Generation counter for the notch preview: each preview bumps it, and only the
/// timer holding the LATEST generation hides the notch again (rapid style
/// changes in settings keep the preview alive instead of blinking it away).
static NOTCH_PREVIEW_GEN: AtomicU64 = AtomicU64::new(0);

// ─────────────────────────────── Commands ───────────────────────────────

#[tauri::command]
fn get_config() -> Config {
    config::load()
}

#[tauri::command]
fn save_config(config: Config) -> Result<(), String> {
    config::save(&config)
}

#[tauri::command]
fn launch_app(path: String, args: Option<Vec<String>>) -> Result<(), String> {
    apps::launch(&path, &args.unwrap_or_default())
}

/// Return the app's icon as a base64 PNG data URI (Windows only; None elsewhere).
#[tauri::command]
fn app_icon(path: String) -> Option<String> {
    win::app_icon_data_uri(&path)
}

#[tauri::command]
fn list_windows() -> Vec<win::WindowInfo> {
    win::list_windows()
}

#[tauri::command]
fn focus_window(hwnd: i64) -> bool {
    win::focus_window(hwnd as isize)
}

/// Re-anchor the dock window to the given screen edge.
#[tauri::command]
fn reposition_dock(window: WebviewWindow, edge: String) -> Result<(), String> {
    position_dock(&window, &edge)
}

/// Resize the dock window to fit its content (plus magnify headroom) and
/// re-anchor it to the given edge. Called by the frontend after layout.
///
/// `hidden` tells us whether this frame is the small "notch" (auto-hidden) or
/// the full dock. We only record the full-size geometry as the occlusion
/// watcher's home rect, so smart-hide never measures the shrunken notch.
#[tauri::command]
fn set_dock_frame(
    window: WebviewWindow,
    edge: String,
    width: u32,
    height: u32,
    hidden: Option<bool>,
) -> Result<(), String> {
    // Floor at a few px so the thin auto-hide reveal strip is preserved.
    let w = width.max(8);
    let h = height.max(8);
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    position_dock(&window, &edge)?;
    let _ = hidden;
    Ok(())
}

/// Convert an image file to a data URI (for custom tile icons).
#[tauri::command]
fn image_data_uri(path: String) -> Option<String> {
    util::read_image_data_uri(&path)
}

#[tauri::command]
fn set_always_on_top(window: WebviewWindow, value: bool) -> Result<(), String> {
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Reset appearance/behavior to defaults, keeping the user's pinned items.
#[tauri::command]
fn reset_config() -> Result<Config, String> {
    let mut c = Config::default();
    c.pinned = config::load().pinned;
    config::save(&c)?;
    Ok(c)
}

// NOTE: commands that CREATE a window must be `async`. A synchronous command
// runs on the main thread, and building a webview needs that same thread to
// pump messages → deadlock on Windows (white window, app frozen).
#[tauri::command]
async fn open_settings(app: AppHandle) {
    open_settings_window(&app);
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// Open the containing folder of a pinned item (selecting it on Windows).
#[tauri::command]
fn open_location(path: String) -> Result<(), String> {
    apps::reveal(&path)
}

#[derive(serde::Serialize)]
struct MonitorInfo {
    index: i32,
    name: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    primary: bool,
}

/// List the available monitors so the user can choose where the dock lives.
#[tauri::command]
fn list_monitors(window: WebviewWindow) -> Vec<MonitorInfo> {
    let primary = window
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().cloned());
    window
        .available_monitors()
        .map(|ms| {
            ms.iter()
                .enumerate()
                .map(|(i, m)| MonitorInfo {
                    index: i as i32,
                    name: m.name().cloned().unwrap_or_else(|| format!("Monitor {}", i + 1)),
                    x: m.position().x,
                    y: m.position().y,
                    w: m.size().width,
                    h: m.size().height,
                    primary: m.name().cloned() == primary,
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Kept for IPC compatibility; the dock's translucency is now CSS-only.
#[tauri::command]
fn set_material(_app: AppHandle, _strength: u32) -> Result<(), String> {
    // No-op: the dock's translucency is now a pure-CSS acrylic driven by the
    // `--material` variable in the frontend (see styles.css / dock.js). Kept so
    // the existing IPC call from settings stays valid.
    Ok(())
}

/// The Windows accent/colorization color as a `#rrggbb` hex string, so the user
/// can match the dock to their system accent. None off-Windows / on failure.
#[tauri::command]
fn system_accent() -> Option<String> {
    #[cfg(windows)]
    {
        #[link(name = "dwmapi")]
        extern "system" {
            fn DwmGetColorizationColor(pcrcolorization: *mut u32, pfopaqueblend: *mut i32) -> i32;
        }
        let mut color: u32 = 0;
        let mut opaque: i32 = 0;
        let hr = unsafe { DwmGetColorizationColor(&mut color, &mut opaque) };
        if hr == 0 {
            let r = (color >> 16) & 0xff;
            let g = (color >> 8) & 0xff;
            let b = color & 0xff;
            return Some(format!("#{:02x}{:02x}{:02x}", r, g, b));
        }
    }
    None
}

/// Live system metrics for the dock widgets (CPU %, memory, network throughput).
static SYS: Mutex<Option<sysinfo::System>> = Mutex::new(None);
static NETS: Mutex<Option<(sysinfo::Networks, std::time::Instant)>> = Mutex::new(None);

#[derive(serde::Serialize)]
struct SystemStats {
    cpu: f32,
    mem: f32,
    mem_used_mb: u64,
    mem_total_mb: u64,
    net_down_kbps: u64,
    net_up_kbps: u64,
    disk: f32,
    disk_used_gb: u64,
    disk_total_gb: u64,
    uptime_secs: u64,
    battery: i32,
    charging: bool,
}

/// Sample CPU/memory/network. Keeps persistent handles so CPU usage and network
/// deltas are measured between calls (the dock polls this every couple seconds,
/// and only while it's visible — so idle cost stays near zero).
#[tauri::command]
fn system_stats() -> SystemStats {
    let mut guard = SYS.lock().unwrap();
    let sys = guard.get_or_insert_with(sysinfo::System::new);
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu = sys.global_cpu_usage();
    let total = sys.total_memory().max(1);
    let used = sys.used_memory();
    let mem = (used as f64 / total as f64 * 100.0) as f32;

    let mut nguard = NETS.lock().unwrap();
    let entry = nguard.get_or_insert_with(|| {
        (sysinfo::Networks::new_with_refreshed_list(), std::time::Instant::now())
    });
    entry.0.refresh();
    let secs = entry.1.elapsed().as_secs_f64().max(0.001);
    entry.1 = std::time::Instant::now();
    let (mut down, mut up) = (0u64, 0u64);
    for (_name, data) in entry.0.iter() {
        down += data.received();
        up += data.transmitted();
    }
    // Disk usage (aggregate across mounted disks) + system uptime.
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let (mut dtotal, mut davail) = (0u64, 0u64);
    for d in disks.iter() {
        dtotal += d.total_space();
        davail += d.available_space();
    }
    let dused = dtotal.saturating_sub(davail);
    let disk = if dtotal > 0 { (dused as f64 / dtotal as f64 * 100.0) as f32 } else { 0.0 };
    let gb = 1024 * 1024 * 1024;

    // Battery (Windows only). -1 = no battery (e.g. a desktop).
    #[cfg(windows)]
    let (battery, charging) = unsafe {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut s = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut s).is_ok() && s.BatteryFlag & 128 == 0 && s.BatteryLifePercent != 255 {
            (s.BatteryLifePercent as i32, s.ACLineStatus == 1)
        } else {
            (-1, false)
        }
    };
    #[cfg(not(windows))]
    let (battery, charging) = (-1i32, false);

    SystemStats {
        cpu,
        mem,
        mem_used_mb: used / 1024 / 1024,
        mem_total_mb: total / 1024 / 1024,
        net_down_kbps: (down as f64 / secs / 1024.0) as u64,
        net_up_kbps: (up as f64 / secs / 1024.0) as u64,
        disk,
        disk_used_gb: dused / gb,
        disk_total_gb: dtotal / gb,
        uptime_secs: sysinfo::System::uptime(),
        battery,
        charging,
    }
}

/// Fetch a website's favicon as a PNG data URI, so a pinned website shows its
/// real icon. Uses Google's favicon service (one well-known host) and caches the
/// bytes into the pin's icon, so it only hits the network when you add the site.
#[tauri::command]
fn fetch_favicon(url: String) -> Option<String> {
    use base64::Engine;
    let host = url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();
    if host.is_empty() {
        return None;
    }
    let api = format!("https://www.google.com/s2/favicons?sz=64&domain={host}");
    let resp = ureq::get(&api)
        .timeout(std::time::Duration::from_secs(6))
        .call()
        .ok()?;
    let mut bytes: Vec<u8> = Vec::new();
    use std::io::Read;
    resp.into_reader()
        .take(1_000_000)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() < 64 {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Hide the dock into the notch: show the small always-on, click-reliable notch
/// window and hide the (full-size) dock window. No resizing of the dock window,
/// so there's no WebView2 repaint race or erratic shrink.
#[tauri::command]
fn hide_dock(app: AppHandle, edge: String) {
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = position_notch(&notch, &edge);
        let _ = notch.show();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
}

/// Bring the dock back: hide the notch window and show the dock window. Called by
/// the dock frontend itself (it then slides the bar back in). Does NOT emit, so a
/// boot/config-reload window-sync never spuriously pins the dock open.
#[tauri::command]
fn reveal_dock(app: AppHandle) {
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.hide();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.show();
    }
}

/// Fired by the notch window when the user clicks it: just signal the dock to
/// reveal+pin itself (the dock owns the hide/show state and calls reveal_dock).
#[tauri::command]
fn notch_reveal(app: AppHandle) {
    let _ = app.emit("booki://reveal", ());
}

/// Set the dock's anchored edge (used when the user drags the notch to a screen
/// edge, or clicks a notch that lives on another edge). Persists, repositions
/// both windows, and tells the dock to re-read. The notch goes back to "auto"
/// (follow the dock): after an explicit move the two belong together again —
/// otherwise a stale explicit notch edge keeps tucking the dock toward a side
/// the user just moved away from.
#[tauri::command]
fn set_dock_edge(app: AppHandle, edge: String) {
    let mut cfg = config::load();
    cfg.edge = edge.clone();
    cfg.notch_edge = "auto".into();
    let _ = config::save(&cfg);
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &edge);
    }
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = position_notch(&notch, &edge);
    }
    let _ = app.emit("booki://config-changed", ());
}

/// Show the "What's new" changelog. To avoid a fragile extra window (which on
/// some setups came up blank and could crash the app), it's shown INSIDE the
/// stable settings window: if settings is open we just signal it; otherwise we
/// set a flag the settings page picks up on mount and open settings normally.
#[tauri::command]
async fn open_changelog(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = app.emit("booki://show-changelog", ());
        let _ = w.set_focus();
    } else {
        PENDING_CHANGELOG.store(true, Ordering::Relaxed);
        open_settings_window(&app);
    }
}

/// Read-and-clear the "open on the changelog" flag (asked by settings on mount).
#[tauri::command]
fn take_pending_changelog() -> bool {
    PENDING_CHANGELOG.swap(false, Ordering::Relaxed)
}

/// Open settings directly on a specific tab (e.g. "apps").
#[tauri::command]
async fn open_settings_tab(app: AppHandle, tab: String) {
    *PENDING_TAB.lock().unwrap() = Some(tab);
    if let Some(w) = app.get_webview_window("settings") {
        let _ = app.emit("booki://show-tab", ());
        let _ = w.set_focus();
    } else {
        open_settings_window(&app);
    }
}

/// Read-and-clear the tab settings should show (asked on mount / on signal).
#[tauri::command]
fn take_pending_tab() -> Option<String> {
    PENDING_TAB.lock().unwrap().take()
}

/// Export the current config to a JSON file the user picked.
#[tauri::command]
fn export_config(path: String) -> Result<(), String> {
    let cfg = config::load();
    let text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Import config from a JSON file, replacing the current one. Returns the new config.
#[tauri::command]
fn import_config(path: String) -> Result<Config, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut cfg: Config = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    // Machine-specific bits don't travel: the monitor layout of the exporting
    // PC rarely matches this one (paths DO travel — settings flags the ones
    // that don't exist here and offers to reassign them).
    cfg.monitor = -1;
    config::save(&cfg)?;
    Ok(cfg)
}

// ─────────────────────────── Dock profiles ───────────────────────────
// Full config snapshots the user can switch between with one click (e.g.
// "Trabajo" / "Gaming"). Stored as %APPDATA%\Booki\profiles\{name}.json.

fn profiles_dir() -> std::path::PathBuf {
    config::config_dir().join("profiles")
}

/// Sanitized file path for a profile name (no separators/dots → no traversal).
fn profile_file(name: &str) -> Result<std::path::PathBuf, String> {
    let safe: String = name
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .collect();
    let safe = safe.trim().to_string();
    if safe.is_empty() || safe.len() > 40 {
        return Err("invalid profile name".into());
    }
    Ok(profiles_dir().join(format!("{safe}.json")))
}

#[tauri::command]
fn profile_list() -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(profiles_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(stem.to_string());
                }
            }
        }
    }
    names.sort_by_key(|n| n.to_lowercase());
    names
}

/// Snapshot the CURRENT config under the given name (overwrites), and mark it
/// as the active profile.
#[tauri::command]
fn profile_save(app: AppHandle, name: String) -> Result<(), String> {
    let path = profile_file(&name)?;
    std::fs::create_dir_all(profiles_dir()).map_err(|e| e.to_string())?;
    let mut cfg = config::load();
    cfg.last_profile = name.trim().to_string();
    let text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())?;
    config::save(&cfg)?;
    let _ = app.emit("booki://config-changed", ());
    Ok(())
}

/// Make the named profile the active config; repositions windows and tells
/// every surface to re-read. Returns the applied config.
#[tauri::command]
fn profile_apply(app: AppHandle, name: String) -> Result<Config, String> {
    let path = profile_file(&name)?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut cfg: Config = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    cfg.last_profile = name.trim().to_string();
    config::save(&cfg)?;
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
    }
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = position_notch(&notch, &cfg.edge);
    }
    let _ = app.emit("booki://config-changed", ());
    Ok(cfg)
}

#[tauri::command]
fn profile_delete(name: String) -> Result<(), String> {
    let path = profile_file(&name)?;
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

// ─────────────────────────── System volume ───────────────────────────

/// Master volume as (percent, muted); None when unavailable.
#[tauri::command]
fn volume_info() -> Option<(u32, bool)> {
    win::volume_get().ok()
}

#[tauri::command]
fn volume_set(pct: u32) -> Result<(), String> {
    win::volume_set(pct)
}

/// Toggle mute; returns the new muted state.
#[tauri::command]
fn volume_mute() -> Result<bool, String> {
    win::volume_mute_toggle()
}

/// Which of these paths exist on THIS machine (used after importing a config
/// from another PC to flag pins whose program lives somewhere else here).
#[tauri::command]
fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .iter()
        .map(|p| !p.is_empty() && std::path::Path::new(p).exists())
        .collect()
}

/// Place the small notch window centered on the dock's anchored edge.
fn position_notch(notch: &WebviewWindow, edge: &str) -> Result<(), String> {
    let monitor = pick_monitor(notch).ok_or_else(|| "no monitor found".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let dpr = notch.scale_factor().unwrap_or(1.0);
    let (ax, ay, aw, ah) = win::work_area(
        mpos.x + msize.width as i32 / 2,
        mpos.y + msize.height as i32 / 2,
    )
    .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));

    let cfg = config::load();
    // The notch can live on its own edge ("auto" = follow the dock).
    let edge: &str = if cfg.notch_edge == "auto" {
        edge
    } else {
        cfg.notch_edge.as_str()
    };
    let vertical = edge == "left" || edge == "right";
    // Peek style → a thinner pill flush to the edge (a subtle "tab"); otherwise a
    // slightly larger pill with a small margin. The window must be a bit larger
    // than the pill's HOVER size (156×11) or the grow animation gets clipped.
    let (lw, lh): (f64, f64) = match (cfg.notch_peek, vertical) {
        (true, true) => (28.0, 170.0),
        (true, false) => (170.0, 28.0),
        (false, true) => (32.0, 184.0),
        (false, false) => (184.0, 32.0),
    };
    let ww = (lw * dpr).round() as i32;
    let wh = (lh * dpr).round() as i32;
    let _ = notch.set_size(PhysicalSize::new(ww as u32, wh as u32));

    // Peek style sits FLUSH against the work-area edge (touching the taskbar).
    // Never overlap into the taskbar band: the notch is topmost, so any overlap
    // would draw ON TOP of the bar. The flush pill with only its outward corners
    // rounded (CSS) already reads as a tab attached to the bar.
    let margin: i32 = if cfg.notch_peek { 0 } else { 3 };
    // Offset along the anchored edge so it can dodge subtitles / chat boxes.
    let along = |start: i32, span: i32, win: i32| -> i32 {
        let want = match cfg.notch_position.as_str() {
            "start" => start + span / 6 - win / 2,
            "end" => start + span - span / 6 - win / 2,
            _ => start + (span - win) / 2,
        };
        // Keep on-screen without panicking when the span is tiny (lo>hi → clamp panics).
        let lo = start + 4;
        let hi = (start + span - win - 4).max(lo);
        want.max(lo).min(hi)
    };
    let (x, y) = match edge {
        "top" => (along(ax, aw, ww), ay + margin),
        "left" => (ax + margin, along(ay, ah, wh)),
        "right" => (ax + aw - ww - margin, along(ay, ah, wh)),
        _ => (along(ax, aw, ww), ay + ah - wh - margin),
    };
    notch
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Briefly show a message on the notch window (used for "Booki se ocultó …").
#[tauri::command]
fn notch_toast(app: AppHandle, text: String) {
    // The toast replaces the bar — hide the dock window while it shows.
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
    if let Some(notch) = app.get_webview_window("notch") {
        if let Ok(Some(mon)) = notch.current_monitor() {
            let dpr = notch.scale_factor().unwrap_or(1.0);
            let mpos = mon.position();
            let msize = mon.size();
            let (ax, ay, aw, ah) = win::work_area(
                mpos.x + msize.width as i32 / 2,
                mpos.y + msize.height as i32 / 2,
            )
            .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));
            let ww = (320.0 * dpr).round() as i32;
            let wh = (48.0 * dpr).round() as i32;
            let _ = notch.set_size(PhysicalSize::new(ww as u32, wh as u32));
            // Show the toast on the dock's anchored edge — a side-docked bar
            // must not flash a pill at the bottom of the screen.
            let m = (14.0 * dpr).round() as i32;
            let (x, y) = match config::load().edge.as_str() {
                "top" => (ax + (aw - ww) / 2, ay + m),
                "left" => (ax + m, ay + (ah - wh) / 2),
                "right" => (ax + aw - ww - m, ay + (ah - wh) / 2),
                _ => (ax + (aw - ww) / 2, ay + ah - wh - m),
            };
            let _ = notch.set_position(PhysicalPosition::new(x, y));
        }
        let _ = notch.show();
        let _ = app.emit("booki://notch-toast", text);
    }
}

/// Briefly show the notch while the user is tweaking its style/position in
/// settings — normally it only appears when the dock is tucked away, so there'd
/// be nothing to look at. Repeated calls extend the preview; it hides again a
/// few seconds after the LAST change (unless the dock is actually hidden, in
/// which case the notch is legitimately on duty and stays).
#[tauri::command]
fn notch_preview(app: AppHandle) {
    let gen = NOTCH_PREVIEW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(notch) = app.get_webview_window("notch") {
        let cfg = config::load();
        let _ = position_notch(&notch, &cfg.edge);
        let _ = notch.show();
    }
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2800));
        if NOTCH_PREVIEW_GEN.load(Ordering::SeqCst) != gen {
            return; // a newer preview took over
        }
        let dock_visible = app
            .get_webview_window("dock")
            .map(|d| d.is_visible().unwrap_or(true))
            .unwrap_or(true);
        if dock_visible {
            if let Some(notch) = app.get_webview_window("notch") {
                let _ = notch.hide();
            }
        }
    });
}

/// Hide both windows (full blackout, e.g. while a fullscreen app is running).
#[tauri::command]
fn hide_all(app: AppHandle) {
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.hide();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let result = win::set_autostart(enabled, &exe.to_string_lossy());
    if let Err(e) = &result {
        log::error!("set_autostart({enabled}) failed: {e}");
    }
    result
}

#[tauri::command]
fn get_autostart() -> bool {
    win::get_autostart()
}

/// Move files/folders into a destination folder (drop onto a folder pin).
#[tauri::command]
fn move_paths(paths: Vec<String>, dest: String) -> Result<(), String> {
    let result = win::move_paths(&paths, &dest);
    if let Err(e) = &result {
        log::error!("move_paths failed: {e}");
    }
    result
}

/// Send files/folders to the Recycle Bin (the dock's own UI confirms first).
#[tauri::command]
fn trash_paths(paths: Vec<String>) -> Result<(), String> {
    let result = win::trash_paths(&paths);
    if let Err(e) = &result {
        log::error!("trash_paths failed: {e}");
    }
    result
}

#[tauri::command]
fn trash_is_empty() -> bool {
    win::trash_is_empty()
}

/// Accent color derived from the desktop wallpaper (async: decodes an image).
#[tauri::command]
async fn wallpaper_accent() -> Option<String> {
    win::wallpaper_accent()
}

#[derive(serde::Serialize)]
struct MediaInfo {
    title: String,
    artist: String,
    playing: bool,
    thumb: Option<String>,
}

/// What the system media session is playing (async: WinRT calls block briefly).
#[tauri::command]
async fn media_info() -> Option<MediaInfo> {
    win::media_now_playing().map(|m| MediaInfo {
        title: m.title,
        artist: m.artist,
        playing: m.playing,
        thumb: m.thumb,
    })
}

#[tauri::command]
async fn media_toggle() -> bool {
    win::media_toggle()
}

#[tauri::command]
async fn media_next() -> bool {
    win::media_next()
}

#[tauri::command]
async fn media_prev() -> bool {
    win::media_prev()
}

#[tauri::command]
fn empty_trash() -> Result<(), String> {
    let result = win::empty_trash();
    if let Err(e) = &result {
        log::error!("empty_trash failed: {e}");
    }
    result
}

#[derive(serde::Serialize)]
struct DirItem {
    name: String,
    path: String,
    is_dir: bool,
}

/// List a folder's contents for the "stack" flyout.
#[tauri::command]
fn list_dir(path: String) -> Vec<DirItem> {
    let mut out: Vec<DirItem> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&path) {
        for e in rd.flatten().take(80) {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let p = e.path();
            let is_dir = p.is_dir();
            out.push(DirItem {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir,
            });
        }
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

#[tauri::command]
fn is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Scan the Windows Start Menu for installed apps (.lnk shortcuts) so the
/// settings UI can suggest things to pin without browsing the filesystem.
/// Returns deduped, alphabetically-sorted shortcuts. Empty off-Windows.
#[derive(serde::Serialize)]
struct AppGroup {
    name: String,
    items: Vec<DirItem>,
}

#[tauri::command]
fn list_installed_apps() -> Vec<AppGroup> {
    #[cfg(windows)]
    {
        use std::collections::{BTreeMap, HashSet};
        let mut roots: Vec<std::path::PathBuf> = Vec::new();
        if let Ok(appdata) = std::env::var("APPDATA") {
            roots.push(
                std::path::PathBuf::from(appdata)
                    .join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        if let Ok(pd) = std::env::var("ProgramData") {
            roots.push(
                std::path::PathBuf::from(pd).join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        let mut seen: HashSet<String> = HashSet::new();
        // group name → items. "" is the general bucket (top-level apps).
        let mut map: BTreeMap<String, Vec<DirItem>> = BTreeMap::new();
        for root in &roots {
            scan_lnks(root, root, &mut map, &mut seen, 0);
        }
        // Collapse single-item folders into the general bucket so we don't end up
        // with dozens of one-app "groups" — only real groupings get a header.
        let mut general: Vec<DirItem> = map.remove("").unwrap_or_default();
        let mut groups: Vec<AppGroup> = Vec::new();
        for (name, mut items) in map {
            if items.len() <= 1 {
                general.append(&mut items);
            } else {
                items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
                groups.push(AppGroup { name, items });
            }
        }
        groups.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        general.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        if !general.is_empty() {
            groups.push(AppGroup { name: String::new(), items: general });
        }
        groups
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// The top-level Start-menu folder a shortcut lives in (its "group"), or "" if it
/// sits directly under Programs.
#[cfg(windows)]
fn group_of(root: &std::path::Path, p: &std::path::Path) -> String {
    if let Ok(rel) = p.strip_prefix(root) {
        let mut comps = rel.components();
        let first = comps.next();
        let has_subpath = comps.next().is_some();
        if has_subpath {
            if let Some(c) = first {
                return c.as_os_str().to_string_lossy().to_string();
            }
        }
    }
    String::new()
}

#[cfg(windows)]
fn scan_lnks(
    root: &std::path::Path,
    dir: &std::path::Path,
    map: &mut std::collections::BTreeMap<String, Vec<DirItem>>,
    seen: &mut std::collections::HashSet<String>,
    depth: u8,
) {
    if depth > 4 {
        return;
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            scan_lnks(root, &p, map, seen, depth + 1);
            continue;
        }
        let is_lnk = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false);
        if !is_lnk {
            continue;
        }
        let name = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_lowercase();
        // Skip the noise that clutters the Start Menu: uninstallers, docs, help,
        // website links, changelogs, license/EULA, "report a bug", etc. — so the
        // suggestions are real, useful apps, not junk.
        const JUNK: &[&str] = &[
            "uninstall", "readme", "read me", "help", "manual", "documentation",
            "docs", "license", "licence", "eula", "changelog", "release notes",
            "what's new", "whats new", "website", "web site", "home page",
            "homepage", "visit ", "report", "feedback", "support", "faq",
            "register", "activate", "modify", "repair", "update", "updater",
            "command prompt", "powershell", "terminal here",
        ];
        if JUNK.iter().any(|j| lower.contains(j)) {
            continue;
        }
        if seen.insert(lower) {
            let group = group_of(root, &p);
            map.entry(group).or_default().push(DirItem {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: false,
            });
        }
    }
}

/// (Re)register the global hotkey that toggles the dock. Empty = none.
#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let cfg = config::load();
    hotkeys_apply(&app, &accelerator, cfg.position_hotkeys, &cfg.hotkey_modifier)
}

/// Re-register ALL global shortcuts: the toggle hotkey plus (when enabled) the
/// position hotkeys modifier+1…9 that launch the Nth dock item.
fn hotkeys_apply(
    app: &AppHandle,
    toggle: &str,
    positions: bool,
    modifier: &str,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if !toggle.trim().is_empty() {
        gs.register(toggle.trim()).map_err(|e| e.to_string())?;
    }
    if positions {
        for i in 1..=9 {
            // Best-effort: another app may own one of the combos; skip it.
            let _ = gs.register(format!("{modifier}+{i}").as_str());
        }
    }
    Ok(())
}

/// Called from Settings when the position-hotkey options change.
#[tauri::command]
fn apply_hotkeys(
    app: AppHandle,
    toggle: String,
    positions: bool,
    modifier: String,
) -> Result<(), String> {
    hotkeys_apply(&app, &toggle, positions, &modifier)
}

/// Lets the frontend write to the app log file (for diagnosing issues).
#[tauri::command]
fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "frontend", "{message}"),
        "warn" => log::warn!(target: "frontend", "{message}"),
        _ => log::info!(target: "frontend", "{message}"),
    }
}

// ─────────────────────────────── Helpers ────────────────────────────────

/// Pick the configured monitor (config.monitor index, -1 = current/primary).
fn pick_monitor(window: &WebviewWindow) -> Option<tauri::Monitor> {
    let idx = config::load().monitor;
    if idx >= 0 {
        if let Ok(mons) = window.available_monitors() {
            if let Some(m) = mons.into_iter().nth(idx as usize) {
                return Some(m);
            }
        }
    }
    window.current_monitor().ok().flatten()
}

/// Anchor a window to a screen edge of the chosen monitor.
fn position_dock(window: &WebviewWindow, edge: &str) -> Result<(), String> {
    let monitor = pick_monitor(window).ok_or_else(|| "no monitor found".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let wsize = window.outer_size().map_err(|e| e.to_string())?;

    // Use the monitor's WORK AREA (excludes the taskbar) so the dock never
    // sits on top of the taskbar, wherever it is. Falls back to the full
    // monitor off-Windows.
    let (ax, ay, aw, ah) = win::work_area(
        mpos.x + msize.width as i32 / 2,
        mpos.y + msize.height as i32 / 2,
    )
    .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));

    let margin: i32 = 12;
    let ww = wsize.width as i32;
    let wh = wsize.height as i32;

    let (x, y) = match edge {
        "top" => (ax + (aw - ww) / 2, ay + margin),
        "left" => (ax + margin, ay + (ah - wh) / 2),
        "right" => (ax + aw - ww - margin, ay + (ah - wh) / 2),
        // default: bottom
        _ => (ax + (aw - ww) / 2, ay + ah - wh - margin),
    };

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

fn open_settings_window(app: &AppHandle) {
    open_settings_url(app, "settings.html");
}

fn open_settings_url(app: &AppHandle, url: &str) {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("Booki — Ajustes")
        .inner_size(760.0, 800.0)
        .min_inner_size(560.0, 560.0)
        .resizable(true)
        .center()
        .decorations(true)
        .build();
    // NOTE: the settings window is deliberately NOT transparent. A transparent
    // WebView2 window rendered blank/see-through on real Windows (the page never
    // painted). An opaque window always paints; the modern look comes from the
    // floating acrylic-style panels in CSS over a solid background.
    #[cfg(windows)]
    if let Ok(w) = &built {
        // Defeat the WebView2 initial-size race: on first paint the webview can
        // come up smaller than the window. Nudge the size a couple of times so
        // it re-lays-out to fill the client area.
        let w2 = w.clone();
        std::thread::spawn(move || {
            for delay in [120u64, 350] {
                std::thread::sleep(std::time::Duration::from_millis(delay));
                if let Ok(sz) = w2.inner_size() {
                    let _ = w2.set_size(PhysicalSize::new(sz.width + 1, sz.height + 1));
                    std::thread::sleep(std::time::Duration::from_millis(40));
                    let _ = w2.set_size(sz);
                }
            }
            let _ = w2.set_focus();
        });
    }
    let _ = &built;
}

fn toggle_dock(app: &AppHandle) {
    if let Some(dock) = app.get_webview_window("dock") {
        if dock.is_visible().unwrap_or(false) {
            let _ = dock.hide();
        } else {
            let _ = dock.show();
            let _ = dock.set_focus();
        }
    }
}

// ──────────────────────────────── Entry ─────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, ShortcutState};
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    // Digit shortcuts are only ever registered as position
                    // hotkeys (modifier+1…9 → launch the Nth dock item);
                    // anything else is the show/hide toggle.
                    let idx = match shortcut.key {
                        Code::Digit1 => Some(0usize),
                        Code::Digit2 => Some(1),
                        Code::Digit3 => Some(2),
                        Code::Digit4 => Some(3),
                        Code::Digit5 => Some(4),
                        Code::Digit6 => Some(5),
                        Code::Digit7 => Some(6),
                        Code::Digit8 => Some(7),
                        Code::Digit9 => Some(8),
                        _ => None,
                    };
                    match idx {
                        Some(i) => {
                            let _ = app.emit("booki://launch-index", i);
                        }
                        None => toggle_dock(app),
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            launch_app,
            app_icon,
            list_windows,
            focus_window,
            reposition_dock,
            set_dock_frame,
            hide_dock,
            reveal_dock,
            notch_reveal,
            notch_toast,
            notch_preview,
            hide_all,
            profile_list,
            profile_save,
            profile_apply,
            profile_delete,
            volume_info,
            volume_set,
            volume_mute,
            set_dock_edge,
            open_changelog,
            take_pending_changelog,
            open_settings_tab,
            take_pending_tab,
            export_config,
            import_config,
            paths_exist,
            image_data_uri,
            set_always_on_top,
            app_version,
            reset_config,
            open_settings,
            open_location,
            set_hotkey,
            apply_hotkeys,
            move_paths,
            list_monitors,
            set_material,
            system_accent,
            system_stats,
            fetch_favicon,
            set_autostart,
            get_autostart,
            trash_paths,
            trash_is_empty,
            empty_trash,
            wallpaper_accent,
            media_info,
            media_toggle,
            media_next,
            media_prev,
            list_dir,
            is_dir,
            list_installed_apps,
            quit,
            frontend_log,
        ])
        .setup(|app| {
            log::info!("Booki backend started");
            // System tray.
            let toggle = MenuItem::with_id(app, "toggle", "Mostrar / ocultar dock", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Ajustes…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir de Booki", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &settings, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("booki-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Booki")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_dock(app),
                    "settings" => open_settings_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    // Left click toggles the dock; double click opens settings.
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => toggle_dock(tray.app_handle()),
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => open_settings_window(tray.app_handle()),
                    _ => {}
                })
                .build(app)?;

            // The dock/notch windows are created VISIBLE but far off-screen
            // (tauri.conf.json): WebView2 only registers its drag-drop targets
            // for windows that are visible at creation (wry bug — hidden-created
            // windows keep a "forbidden" drop cursor forever). Here we move them
            // into place and set their real visibility.
            if let Some(notch) = app.get_webview_window("notch") {
                let cfg = config::load();
                let _ = position_notch(&notch, &cfg.edge);
                let _ = notch.hide();
            }
            // Position and reveal the dock.
            if let Some(dock) = app.get_webview_window("dock") {
                let cfg = config::load();
                // The dock surface is a custom CSS acrylic (blur + tint) painted on
                // a transparent window — this gives full control of the corner
                // radius and translucency and avoids the native-Mica corner/resize
                // quirks. So no Mica/DWM rounding is applied to the window here.
                let _ = position_dock(&dock, &cfg.edge);
                let _ = dock.set_always_on_top(cfg.always_on_top);
                let _ = dock.show();

                // Register the global hotkey, if configured.
                let _ = hotkeys_apply(
                    app.handle(),
                    &cfg.hotkey,
                    cfg.position_hotkeys,
                    &cfg.hotkey_modifier,
                );

                // Smart auto-hide watcher: emit `booki://occlusion` when the user
                // is working in another app (vs. on the desktop). The frontend
                // decides whether to act (only in "smart" mode). Windows-only.
                #[cfg(windows)]
                {
                    let watch = dock.clone();
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        let self_hwnd = watch.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                        // (last, candidate, streak) for each debounced signal.
                        let mut occ = (false, false, 0u8);
                        let mut fs = (false, false, 0u8);
                        // Debounce helper: returns Some(new) when the value has held
                        // for two polls (so momentary changes can't make it flap).
                        fn debounce(s: &mut (bool, bool, u8), v: bool) -> Option<bool> {
                            if v == s.1 {
                                s.2 = s.2.saturating_add(1);
                            } else {
                                s.1 = v;
                                s.2 = 1;
                            }
                            if s.1 != s.0 && s.2 >= 2 {
                                s.0 = s.1;
                                return Some(s.0);
                            }
                            None
                        }
                        // Hot edge: cached config (re-read every ~3 s, not every
                        // tick), a 2-tick streak so a fast swipe-by can't trigger
                        // it, and a cooldown so it fires once per push.
                        let mut cfg_cache = config::load();
                        let mut tick: u32 = 0;
                        let mut edge_streak: u8 = 0;
                        let mut edge_cooldown: u8 = 0;
                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(300));
                            tick = tick.wrapping_add(1);
                            if tick % 10 == 0 {
                                cfg_cache = config::load();
                            }
                            // foreground_occludes = "the user is in an app".
                            if let Some(v) = debounce(&mut occ, win::foreground_occludes(0, 0, 0, 0, self_hwnd)) {
                                let _ = handle.emit("booki://occlusion", v);
                            }
                            // fullscreen game / movie / presentation → get out of the way.
                            if let Some(v) = debounce(&mut fs, win::is_fullscreen()) {
                                let _ = handle.emit("booki://fullscreen", v);
                            }
                            // Cursor pressed against the dock's edge → reveal signal.
                            if cfg_cache.hot_edge {
                                edge_cooldown = edge_cooldown.saturating_sub(1);
                                if win::cursor_at_edge(&cfg_cache.edge) {
                                    edge_streak = edge_streak.saturating_add(1);
                                } else {
                                    edge_streak = 0;
                                }
                                if edge_streak >= 2 && edge_cooldown == 0 {
                                    edge_cooldown = 6; // ≈1.8 s between triggers
                                    let _ = handle.emit("booki://hot-edge", ());
                                }
                            }
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Booki dock");
}
