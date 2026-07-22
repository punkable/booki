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
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// Set when the changelog was requested before the settings window existed; the
/// settings page asks for it on mount (`take_pending_changelog`). A plain flag —
/// never a URL hash — so the settings window always loads its normal, known-good
/// URL (a hash in the app URL made the window come up blank on Windows).
static PENDING_CHANGELOG: AtomicBool = AtomicBool::new(false);

/// True while hide_all has blacked out dock + notch for a fullscreen app.
/// Reveal / tray / save_config must not resurface Booki until the frontend
/// clears this after fullscreen ends.
static FULLSCREEN_BLACKOUT: AtomicBool = AtomicBool::new(false);

/// Tab the settings window should open on (e.g. "apps" from the empty dock's
/// "+" tile). Same read-and-clear pattern as PENDING_CHANGELOG.
static PENDING_TAB: Mutex<Option<String>> = Mutex::new(None);

/// Interactive regions of the dock "stage" window, reported by the frontend
/// (window-relative CSS px). The stage is a fixed-size transparent window that
/// never resizes for flyouts/menus; a cursor watcher flips it click-through
/// whenever the cursor isn't over one of these rects. `bool` = the whole
/// window is interactive (edge-move overlay, internal drags).
#[allow(clippy::type_complexity)]
static HIT_RECTS: Mutex<(Vec<(f64, f64, f64, f64)>, bool)> = Mutex::new((Vec::new(), true));

/// Same contract as HIT_RECTS, but for the notch window. The notch OS window is
/// intentionally larger than the painted pill (hover/glow room); without this,
/// transparent padding would block clicks on apps behind it.
#[allow(clippy::type_complexity)]
static NOTCH_HIT_RECTS: Mutex<(Vec<(f64, f64, f64, f64)>, bool)> =
    Mutex::new((Vec::new(), false));

static DOCK_HOME_RECT: Mutex<(i32, i32, i32, i32)> = Mutex::new((0, 0, 0, 0));

/// One clipboard-history entry (newest first). `text` is capped to keep the
/// list light; ids are monotonic so the frontend can key list items stably.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ClipEntry {
    id: u64,
    text: String,
    ts: u64,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    private: bool,
}
const CLIP_HISTORY_MAX: usize = 60;
const CLIP_HISTORY_HARD_MAX: usize = 200;
const CLIP_TEXT_MAX: usize = 8000; // guard against pasting a huge document
const CLIP_DPAPI_MAGIC: &[u8] = b"booki-dpapi-v1\n";
const CLIP_JSON_MAGIC: &[u8] = b"booki-json-v1\n";
static CLIP_HISTORY: Mutex<Vec<ClipEntry>> = Mutex::new(Vec::new());
static CLIP_NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn clip_history_path() -> std::path::PathBuf {
    config::config_dir().join("clipboard-history.dat")
}

fn clip_legacy_history_path() -> std::path::PathBuf {
    config::config_dir().join("clipboard-history.json")
}

fn clip_limit(cfg: &Config) -> usize {
    (cfg.clipboard_history_limit as usize).clamp(1, CLIP_HISTORY_HARD_MAX)
}

fn clip_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn apply_capture_policy(app: &AppHandle, visible: bool) {
    #[cfg(windows)]
    {
        for label in ["dock", "notch"] {
            if let Some(window) = app.get_webview_window(label) {
                if let Ok(hwnd) = window.hwnd() {
                    win::set_capture_visible(hwnd.0 as isize, visible);
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, visible);
    }
}

/// Keep clipboard history bounded by the user's privacy and size policy.
fn clip_prune_locked(hist: &mut Vec<ClipEntry>, cfg: &Config) -> bool {
    let before = hist.len();
    if cfg.clipboard_retention_days > 0 {
        let days = cfg.clipboard_retention_days.min(365) as u64;
        let max_age = days.saturating_mul(24 * 60 * 60 * 1000);
        let cutoff = clip_now_ms().saturating_sub(max_age);
        hist.retain(|entry| entry.favorite || entry.ts >= cutoff);
    }
    let limit = clip_limit(cfg);
    if hist.len() > limit {
        let mut kept = Vec::with_capacity(limit);
        for entry in hist.iter().filter(|entry| entry.favorite).take(limit) {
            kept.push(entry.clone());
        }
        if kept.len() < limit {
            for entry in hist.iter().filter(|entry| !entry.favorite) {
                if kept.len() >= limit {
                    break;
                }
                kept.push(entry.clone());
            }
        }
        *hist = kept;
    }
    hist.len() != before
}

fn clip_write_disk(hist: &[ClipEntry], cfg: &Config) {
    let path = clip_history_path();
    if !cfg.clipboard_persist {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(clip_legacy_history_path());
        return;
    }
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let persistable: Vec<ClipEntry> = hist.iter().filter(|entry| !entry.private).cloned().collect();
    if let Ok(text) = serde_json::to_vec_pretty(&persistable) {
        let payload = if let Some(protected) = win::protect_data(&text) {
            [CLIP_DPAPI_MAGIC, protected.as_slice()].concat()
        } else {
            [CLIP_JSON_MAGIC, text.as_slice()].concat()
        };
        let tmp = path.with_extension("json.tmp");
        if fs::write(&tmp, payload).is_ok() {
            let _ = fs::rename(tmp, path);
            let _ = fs::remove_file(clip_legacy_history_path());
        }
    }
}

fn clip_parse_disk(bytes: &[u8]) -> Option<Vec<ClipEntry>> {
    if let Some(body) = bytes.strip_prefix(CLIP_DPAPI_MAGIC) {
        let plain = win::unprotect_data(body)?;
        return serde_json::from_slice::<Vec<ClipEntry>>(&plain).ok();
    }
    if let Some(body) = bytes.strip_prefix(CLIP_JSON_MAGIC) {
        return serde_json::from_slice::<Vec<ClipEntry>>(body).ok();
    }
    serde_json::from_slice::<Vec<ClipEntry>>(bytes).ok()
}

fn clip_apply_config(cfg: &Config) {
    let mut hist = CLIP_HISTORY.lock().unwrap();
    clip_prune_locked(&mut hist, cfg);
    clip_write_disk(&hist, cfg);
}

fn clip_load_from_disk() {
    let cfg = config::load();
    if !cfg.clipboard_persist {
        let _ = fs::remove_file(clip_history_path());
        let _ = fs::remove_file(clip_legacy_history_path());
        return;
    }
    let (mut hist, loaded_legacy) = fs::read(clip_history_path())
        .ok()
        .and_then(|bytes| clip_parse_disk(&bytes).map(|hist| (hist, false)))
        .or_else(|| {
            fs::read(clip_legacy_history_path())
                .ok()
                .and_then(|bytes| clip_parse_disk(&bytes).map(|hist| (hist, true)))
        })
        .unwrap_or_default();
    clip_prune_locked(&mut hist, &cfg);
    let next_id = hist
        .iter()
        .map(|entry| entry.id)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    CLIP_NEXT_ID.store(next_id.max(1), Ordering::Relaxed);
    let mut current = CLIP_HISTORY.lock().unwrap();
    *current = hist;
    if loaded_legacy || cfg.clipboard_persist {
        clip_write_disk(&current, &cfg);
    }
}

fn clip_enforce_current_policy() {
    let cfg = config::load();
    let mut hist = CLIP_HISTORY.lock().unwrap();
    if clip_prune_locked(&mut hist, &cfg) || !cfg.clipboard_persist {
        clip_write_disk(&hist, &cfg);
    }
}

fn clip_looks_sensitive(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 8 {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("-----begin ") && lower.contains(" private key-----") {
        return true;
    }
    if lower.starts_with("bearer ") && trimmed.len() > 20 {
        return true;
    }
    if lower.matches('.').count() == 2 && lower.starts_with("eyj") && trimmed.len() > 80 {
        return true;
    }
    for prefix in ["sk-", "ghp_", "gho_", "github_pat_", "xoxb-", "xoxp-", "akia"] {
        if lower.starts_with(prefix) && trimmed.len() >= 20 {
            return true;
        }
    }
    let has_secret_label = [
        "password",
        "passwd",
        "pwd",
        "contraseña",
        "contrasena",
        "api_key",
        "apikey",
        "access_key",
        "client_secret",
        "private_key",
        "secret",
        "token",
    ]
    .iter()
    .any(|label| lower.contains(label));
    has_secret_label && (lower.contains('=') || lower.contains(':')) && trimmed.len() <= 2000
}

/// Add or move to front a piece of clipboard text.
fn clip_remember(text: &str) {
    let cfg = config::load();
    let text = if text.chars().count() > CLIP_TEXT_MAX {
        text.chars().take(CLIP_TEXT_MAX).collect::<String>()
    } else {
        text.to_string()
    };
    if text.trim().is_empty() {
        return;
    }
    if cfg.clipboard_sensitive_guard && clip_looks_sensitive(&text) {
        return;
    }
    let mut hist = CLIP_HISTORY.lock().unwrap();
    let pruned = clip_prune_locked(&mut hist, &cfg);
    if hist.first().map(|e| e.text == text).unwrap_or(false) {
        if pruned || !cfg.clipboard_persist {
            clip_write_disk(&hist, &cfg);
        }
        return; // already the most recent entry — nothing changed
    }
    let (favorite, private) = hist
        .iter()
        .find(|entry| entry.text == text)
        .map(|entry| (entry.favorite, entry.private))
        .unwrap_or((false, false));
    hist.retain(|e| e.text != text); // de-dupe: re-copying an older entry moves it up
    hist.insert(
        0,
        ClipEntry {
            id: CLIP_NEXT_ID.fetch_add(1, Ordering::Relaxed),
            text,
            ts: clip_now_ms(),
            favorite,
            private,
        },
    );
    clip_prune_locked(&mut hist, &cfg);
    clip_write_disk(&hist, &cfg);
}

fn clipboard_feature_active(cfg: &config::Config) -> bool {
    fn has_pin(items: &[config::PinnedApp]) -> bool {
        items.iter().any(|item| {
            item.widget.as_deref() == Some("clipboard") || has_pin(&item.children)
        })
    }
    cfg.clipboard_persist || has_pin(&cfg.pinned)
}


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
fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    let result = config::save(&config);
    if result.is_ok() {
        clip_apply_config(&config);
        apply_always_on_top(&app);
        apply_capture_policy(&app, config.capture_visible);
        // Keep notch window geometry + visibility in sync with settings.
        if let Some(notch) = app.get_webview_window("notch") {
            let _ = position_notch(&notch, &config.edge);
            let dock_visible = app
                .get_webview_window("dock")
                .map(|d| d.is_visible().unwrap_or(true))
                .unwrap_or(true);
            if config.notch_always_visible {
                // Don't resurrect the notch over a fullscreen blackout.
                if !FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
                    let _ = notch.show();
                }
            } else if dock_visible {
                // Dock is out → notch is off-duty unless always-visible.
                let _ = notch.hide();
            }
        }
    }
    result
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
    home_width: Option<u32>,
    home_height: Option<u32>,
) -> Result<(), String> {
    // Floor at a few px so the thin auto-hide reveal strip is preserved.
    let w = width.max(8);
    let h = height.max(8);
    let (x, y) = dock_xy(&window, &edge, w as i32, h as i32)?;
    if hidden != Some(true) {
        // Occlusion uses the painted bar rect when provided — not the tall
        // stage that includes flyout PANEL_ROOM (that made smart-hide fire for
        // windows that never touched the visible dock).
        let hw = home_width.unwrap_or(w).max(8);
        let hh = home_height.unwrap_or(h).max(8);
        let (hx, hy) = dock_xy(&window, &edge, hw as i32, hh as i32).unwrap_or((x, y));
        *DOCK_HOME_RECT.lock().unwrap() = (hx, hy, hx + hw as i32, hy + hh as i32);
    }
    // Resize + reposition in ONE SetWindowPos: the old set_size-then-set_position
    // pair painted an intermediate frame (resized but not yet moved), which read
    // as a blink every time a menu/group flyout grew or shrank the window.
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            win::move_window(hwnd.0 as isize, x, y, w as i32, h as i32);
            let _ = hidden;
            return Ok(());
        }
    }
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    let _ = hidden;
    Ok(())
}

/// The frontend reports which regions of the stage window are actually
/// interactive (the bar with its halo, an open flyout/menu/popover). The
/// cursor watcher consumes this to toggle click-through, so the big
/// transparent window never blocks clicks meant for the apps behind it.
#[tauri::command]
fn set_hit_rects(rects: Vec<(f64, f64, f64, f64)>, all: bool) {
    *HIT_RECTS.lock().unwrap() = (rects, all);
}

/// Interactive regions of the notch window (window-relative CSS px). Same
/// click-through contract as `set_hit_rects`, scoped to the notch.
#[tauri::command]
fn set_notch_hit_rects(rects: Vec<(f64, f64, f64, f64)>, all: bool) {
    *NOTCH_HIT_RECTS.lock().unwrap() = (rects, all);
}

/// Grow the dock window to cover the whole work area so it can host the
/// edge-move overlay (the 4 anchor targets + ghost preview shown while the
/// user drags the bar to another edge). Returns the CSS size of the work area
/// so the frontend can lay the overlay out in logical pixels. Restored by the
/// usual applyFrame() path when the drag ends.
#[tauri::command]
fn dock_cover_workarea(window: WebviewWindow) -> Result<(f64, f64), String> {
    let monitor = pick_monitor(&window).ok_or_else(|| "no monitor found".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let dpr = window.scale_factor().unwrap_or(1.0);
    let (ax, ay, aw, ah) = win::work_area(
        mpos.x + msize.width as i32 / 2,
        mpos.y + msize.height as i32 / 2,
    )
    .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));
    window
        .set_size(PhysicalSize::new(aw.max(8) as u32, ah.max(8) as u32))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(ax, ay))
        .map_err(|e| e.to_string())?;
    Ok((aw as f64 / dpr, ah as f64 / dpr))
}

/// Convert an image file to a data URI (for custom tile icons).
#[tauri::command]
fn image_data_uri(path: String) -> Option<String> {
    util::read_image_data_uri(&path)
}

/// Explorer-grade thumbnail for a file in the folder flyout (async: the shell
/// call + PNG encode stay off the main thread).
#[tauri::command]
async fn file_thumbnail(path: String) -> Option<String> {
    // Network paths can hang for seconds when the share is unreachable — a
    // skeleton that resolves to the type icon beats a stuck cell.
    if path.starts_with("\\\\") {
        return None;
    }
    win::file_thumbnail(&path, 96)
}

/// Copy plain text to the clipboard (e.g. a file's path from the flyout).
#[tauri::command]
fn copy_text(text: String) -> bool {
    win::set_clipboard_text(&text)
}

/// Windows "Open with…" dialog for a file.
#[tauri::command]
fn open_with(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .arg("shell32.dll,OpenAs_RunDLL")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

fn apply_always_on_top(app: &AppHandle) {
    let cfg = config::load();
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.set_always_on_top(cfg.always_on_top);
    }
    // The notch remains reachable while the dock is hidden. This does not
    // raise or focus the larger dock window.
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.set_always_on_top(true);
    }
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, value: bool) -> Result<(), String> {
    let mut cfg = config::load();
    cfg.always_on_top = value;
    config::save(&cfg)?;
    apply_always_on_top(&app);
    if let Some(dock) = app.get_webview_window("dock") {
        dock.set_always_on_top(value).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Place helpers for notch modes (attached / floating / smart).
fn notch_mode_of(cfg: &Config) -> &str {
    match cfg.notch_mode.as_str() {
        "floating" | "smart" | "attached" => cfg.notch_mode.as_str(),
        _ if cfg.multi_notch_enabled => "smart",
        _ if !cfg.notch_peek => "floating",
        _ => "attached",
    }
}

/// Across-edge CSS depth the painted notch occupies from its outer margin
/// (pill + inner pad), plus a small air gap — used to stack the dock inward
/// when the notch stays visible with the bar.
fn notch_stack_depth_css(cfg: &Config) -> u32 {
    let scale = (cfg.notch_scale as f64).clamp(0.7, 1.5);
    let painted = match notch_mode_of(cfg) {
        // Smart circle ~20 + centering pad inside the ~36 window.
        "smart" => 28.0 * scale,
        // Floating capsule ~16 + soft pad.
        "floating" => 26.0 * scale,
        // Attached peek tab.
        _ => 14.0 * scale,
    };
    (painted + 8.0).ceil() as u32
}

/// Current foreground app (kept for UI/debug; smart notch no longer keys off it).
#[tauri::command]
fn current_foreground_app() -> serde_json::Value {
    let app = win::foreground_app_name().unwrap_or_default();
    serde_json::json!({ "app": app, "dot": false })
}

/// Reset appearance/behavior to defaults, keeping the user's pinned items.
#[tauri::command]
fn reset_config(app: AppHandle) -> Result<Config, String> {
    let mut c = Config::default();
    c.pinned = config::load().pinned;
    c.always_on_top = true;
    config::save(&c)?;
    apply_always_on_top(&app);
    apply_capture_policy(&app, c.capture_visible);
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
static DISKS: Mutex<Option<sysinfo::Disks>> = Mutex::new(None);

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
    // Disk usage (aggregate across mounted disks) + system uptime. Keep the disk
    // list cached and just refresh its figures each poll — re-enumerating every
    // volume (opening handles) on every tick was needless work.
    let mut dguard = DISKS.lock().unwrap();
    let disks = dguard.get_or_insert_with(sysinfo::Disks::new_with_refreshed_list);
    disks.refresh();
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
async fn fetch_favicon(url: String) -> Option<String> {
    use base64::Engine;
    let raw = url.trim();
    // Only http(s) website pins — never arbitrary schemes or local paths.
    let without_scheme = if let Some(rest) = raw.strip_prefix("https://") {
        rest
    } else if let Some(rest) = raw.strip_prefix("http://") {
        rest
    } else if !raw.contains("://") {
        raw
    } else {
        return None;
    };
    let mut host = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split('@')
        .next_back()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    if host.is_empty() || host.len() > 253 {
        return None;
    }
    // Hostname labels only (no spaces / path injection into the Google URL).
    if !host
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
    {
        return None;
    }
    // Some brands live on a subdomain but are pinned by their short name; map those
    // to the host whose favicon is actually the product's (e.g. Gmail's envelope,
    // not the generic Google "G").
    host = match host.as_str() {
        "gmail.com" | "google.com/gmail" => "mail.google.com".to_string(),
        "maps.google.com" | "google.com/maps" => "maps.google.com".to_string(),
        "meet.google.com" => "meet.google.com".to_string(),
        "drive.google.com" => "drive.google.com".to_string(),
        "youtu.be" => "youtube.com".to_string(),
        "x.com" => "x.com".to_string(),
        _ => host,
    };
    // sz=128 → a crisp icon on high-DPI tiles (downscaled cleanly when small).
    let api = format!("https://www.google.com/s2/favicons?sz=128&domain={host}");
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
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    if let Some(notch) = app.get_webview_window("notch") {
        // Re-assert topmost every time the notch surfaces so it never slides
        // behind a swarm of newly-opened windows.
        let _ = notch.set_always_on_top(true);
        let _ = position_notch(&notch, &edge);
        let _ = notch.show();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
}

/// Bring the dock back: hide the notch window (unless notch_always_visible is on)
/// and show the dock window. Used for hover / automatic reveals that must NOT
/// steal keyboard focus. Emits `booki://soft-reveal` so the frontend can clear
/// its hidden state without pinning the dock open (unlike notch click).
#[tauri::command]
fn reveal_dock(app: AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    let cfg = config::load();
    if let Some(notch) = app.get_webview_window("notch") {
        if cfg.notch_always_visible {
            // Toast / preview may have resized the window — restore geometry.
            let _ = position_notch(&notch, &cfg.edge);
            let _ = notch.show();
        } else {
            let _ = notch.hide();
        }
    }
    if let Some(dock) = app.get_webview_window("dock") {
        // Automatic/hover reveals must not steal keyboard focus from the app
        // the user is working in. A direct notch click uses notch_reveal below.
        let _ = position_dock(&dock, &cfg.edge);
        let _ = dock.set_ignore_cursor_events(false);
        let _ = dock.set_always_on_top(cfg.always_on_top);
        let _ = dock.show();
    }
    let _ = app.emit("booki://soft-reveal", ());
}

fn lift_dock_window(dock: &tauri::WebviewWindow) {
    let cfg = config::load();
    if cfg.always_on_top {
        let _ = dock.set_always_on_top(false);
        let _ = dock.set_always_on_top(true);
    } else {
        let _ = dock.set_always_on_top(false);
    }
    let _ = dock.show();
    let _ = dock.set_focus();
}

/// Fired by the notch window when the user clicks it: just signal the dock to
/// reveal+pin itself (the dock owns the hide/show state and calls reveal_dock).
#[tauri::command]
fn notch_reveal(app: AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    let cfg = config::load();
    if let Some(notch) = app.get_webview_window("notch") {
        if cfg.notch_always_visible {
            let _ = position_notch(&notch, &cfg.edge);
            let _ = notch.show();
        } else {
            let _ = notch.hide();
        }
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
        let _ = dock.set_ignore_cursor_events(false);
        lift_dock_window(&dock);
    }
    let _ = app.emit("booki://reveal", ());
}

/// Bring the already-running Booki's dock to the front (used when a second
/// instance is launched). Shows + focuses the dock window, hides the notch
/// (unless notch_always_visible is on), and tells the frontend to un-hide and
/// pin itself open.
fn reveal_running_dock(app: &AppHandle) {
    let cfg = config::load();
    if let Some(notch) = app.get_webview_window("notch") {
        if !cfg.notch_always_visible {
            let _ = notch.hide();
        }
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
        let _ = dock.set_ignore_cursor_events(false);
        lift_dock_window(&dock);
    }
    let _ = app.emit("booki://reveal", ());
}

/// The user's important shell folders for the Settings search ((key, path)).
#[tauri::command]
fn known_folders() -> Vec<(String, String)> {
    win::known_folders()
}

/// Install/refresh (or remove) the Explorer "Booki" right-click menu. The
/// frontend sends the already-localized labels (`label_group` is a template
/// with `{name}`); the group list comes from the current config, so removed
/// groups drop off the menu on the next sync.
#[tauri::command]
fn sync_context_menu(enabled: bool, label_pin: String, label_group: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let cfg = config::load();
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.to_string_lossy().to_string();
        let groups: Vec<(String, String)> = cfg
            .pinned
            .iter()
            .filter(|p| p.kind == "group")
            .map(|p| (p.id.clone(), label_group.replace("{name}", &p.name)))
            .collect();
        win::sync_context_menu(enabled, &exe, &label_pin, &groups)
    }
    #[cfg(not(windows))]
    {
        let _ = (enabled, label_pin, label_group);
        Ok(())
    }
}

/// Handle `--pin <path>` / `--pin-group <id> <path>` from the Explorer context
/// menu: add the item to the config (top-level or inside the group), save, and
/// tell every window to re-read. Works both when Booki is already running (via
/// the single-instance callback) and on a cold start (argv of this process).
/// Returns true when a pin argument was actually handled.
fn handle_pin_argv(app: &AppHandle, argv: &[String]) -> bool {
    let mut path: Option<String> = None;
    let mut group: Option<String> = None;
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--pin" => {
                path = argv.get(i + 1).cloned();
                i += 2;
            }
            "--pin-group" => {
                group = argv.get(i + 1).cloned();
                path = argv.get(i + 2).cloned();
                i += 3;
            }
            _ => i += 1,
        }
    }
    let Some(path) = path else { return false };
    if path.is_empty() {
        return false;
    }
    let p = std::path::Path::new(&path);
    let name = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let kind = if p.is_dir() { "folder" } else { "app" };
    let item = config::PinnedApp {
        id: format!(
            "cm{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ),
        name,
        path,
        args: vec![],
        kind: kind.into(),
        widget: None,
        style: None,
        icon: None,
        children: vec![],
        recents: vec![],
    };
    let mut cfg = config::load();
    match group.and_then(|gid| cfg.pinned.iter_mut().find(|g| g.kind == "group" && g.id == gid)) {
        Some(g) => g.children.push(item),
        None => cfg.pinned.push(item),
    }
    let _ = config::save(&cfg);
    let _ = app.emit("booki://config-changed", ());
    true
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
fn import_config(app: AppHandle, path: String) -> Result<Config, String> {
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut cfg: Config = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    // Machine-specific bits don't travel: the monitor layout of the exporting
    // PC rarely matches this one (paths DO travel — settings flags the ones
    // that don't exist here and offers to reassign them).
    cfg.monitor = -1;
    config::save(&cfg)?;
    clip_apply_config(&cfg);
    apply_always_on_top(&app);
    apply_capture_policy(&app, cfg.capture_visible);
    let _ = app.emit("booki://config-changed", ());
    // Return the migrated/healed config — raw import JSON skips load() revs.
    Ok(config::load())
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
    // Same as import: always hand Settings a load()-migrated snapshot.
    Ok(config::load())
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
        .map(|p| {
            let p = p.trim();
            // Web links (pinned URLs) aren't files — never flag them "not found".
            if p.starts_with("http://") || p.starts_with("https://") {
                return true;
            }
            !p.is_empty() && std::path::Path::new(p).exists()
        })
        .collect()
}

/// Offset a window of size `win` along an edge that spans `[start, start+span)`,
/// honoring the chosen along-edge slot ("start" | "center" | "end"). The result
/// is clamped on-screen without panicking when the span is tiny. Shared by the
/// notch and the dock so they land aligned (the dock stays "parallel" to the notch).
fn along_offset(start: i32, span: i32, win: i32, position: &str) -> i32 {
    // A stage window that fills (or exceeds) the whole span just pins to the
    // start — the bar aligns itself inside via CSS.
    if win >= span {
        return start;
    }
    let want = match position {
        "start" => start + span / 6 - win / 2,
        "end" => start + span - span / 6 - win / 2,
        _ => start + (span - win) / 2,
    };
    let lo = start + 4;
    let hi = (start + span - win - 4).max(lo);
    want.max(lo).min(hi)
}

/// Place the small notch window centered on the dock's anchored edge.
fn position_notch(notch: &WebviewWindow, edge: &str) -> Result<(), String> {
    let monitor = pick_monitor(notch).ok_or_else(|| "no monitor found".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let dpr = notch.scale_factor().unwrap_or(1.0);
    let cfg = config::load();
    let (ax, ay, aw, ah) = win::work_area_ex(
        mpos.x + msize.width as i32 / 2,
        mpos.y + msize.height as i32 / 2,
        cfg.taskbar_follow,
    )
    .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));

    // The notch can live on its own edge ("auto" = follow the dock).
    let edge: &str = if cfg.notch_edge == "auto" {
        edge
    } else {
        cfg.notch_edge.as_str()
    };
    let vertical = edge == "left" || edge == "right";
    let mode = notch_mode_of(&cfg);
    let attached = mode == "attached";
    let smart = mode == "smart";
    // Smart is always a circle (no per-app whitelist).
    let scale = (cfg.notch_scale as f64).clamp(0.7, 1.5);

    // Window sized just large enough for the painted pill + a small hover/glow
    // pad. Transparent padding must stay click-through via NOTCH_HIT_RECTS —
    // never rely on CSS pointer-events alone (WebView2 still eats OS hits).
    let (lw, lh): (f64, f64) = if smart {
        // Circle ~20px + modest pad for soft shadow / hover grow.
        let s = 36.0 * scale;
        (s, s)
    } else if attached {
        match vertical {
            true => (28.0 * scale, 140.0 * scale),
            false => (140.0 * scale, 28.0 * scale),
        }
    } else {
        match vertical {
            true => (40.0 * scale, 156.0 * scale),
            false => (156.0 * scale, 40.0 * scale),
        }
    };
    let ww = (lw * dpr).round() as i32;
    let wh = (lh * dpr).round() as i32;
    let _ = notch.set_size(PhysicalSize::new(ww as u32, wh as u32));

    // Attached: flush to the work-area edge (iPhone tab).
    // Floating / smart: sit at the user's edge gap (0 = glued). When the dock
    // is also visible (always-visible notch), the dock stacks inward via
    // notch_stack_depth_css — the notch keeps the outer slot so they don't collide.
    let margin: i32 = if attached {
        0
    } else {
        ((cfg.edge_gap.min(96) as f64) * dpr).round() as i32
    };

    let along =
        |start: i32, span: i32, win: i32| along_offset(start, span, win, cfg.notch_position.as_str());
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

/// Briefly show a calm status chip on the notch (fullscreen hide notice).
/// `detail` is optional secondary line; empty keeps a single-line toast.
#[tauri::command]
fn notch_toast(app: AppHandle, title: String, detail: Option<String>) {
    // Treat toast as the start of a fullscreen blackout so tray/hover cannot
    // resurrect the dock over the game while the chip is still showing.
    FULLSCREEN_BLACKOUT.store(true, Ordering::Relaxed);
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
            let m = (14.0 * dpr).round() as i32;
            let detail_len = detail.as_ref().map(|s| s.chars().count()).unwrap_or(0);
            let chars = title.chars().count().max(detail_len);
            let desired_w = ((chars as f64 * 7.2) + 72.0).clamp(280.0, 420.0);
            let max_w = ((aw - m * 2).max(240) as f64 / dpr).max(240.0);
            let ww = (desired_w.min(max_w) * dpr).round() as i32;
            let two_line = detail.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
            let wh = ((if two_line { 56.0 } else { 44.0 }) * dpr).round() as i32;
            let _ = notch.set_size(PhysicalSize::new(ww as u32, wh as u32));
            // Show the toast on the dock's anchored edge — a side-docked bar
            // must not flash a pill at the bottom of the screen.
            let (x, y) = match config::load().edge.as_str() {
                "top" => (ax + (aw - ww) / 2, ay + m),
                "left" => (ax + m, ay + (ah - wh) / 2),
                "right" => (ax + aw - ww - m, ay + (ah - wh) / 2),
                _ => (ax + (aw - ww) / 2, ay + ah - wh - m),
            };
            let _ = notch.set_position(PhysicalPosition::new(x, y));
        }
        let _ = notch.show();
        let _ = notch.set_ignore_cursor_events(false);
        let _ = app.emit(
            "booki://notch-toast",
            serde_json::json!({
                "title": title,
                "detail": detail.unwrap_or_default(),
            }),
        );
    }
}

/// Ask the notch toast to fade out before the dock blackout hides the window.
#[tauri::command]
fn notch_toast_dismiss(app: AppHandle) {
    let _ = app.emit("booki://notch-toast-out", ());
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
        if dock_visible && !config::load().notch_always_visible {
            if let Some(notch) = app.get_webview_window("notch") {
                let _ = notch.hide();
            }
        }
    });
}

/// Hide both windows (full blackout, e.g. while a fullscreen app is running).
#[tauri::command]
fn hide_all(app: AppHandle) {
    FULLSCREEN_BLACKOUT.store(true, Ordering::Relaxed);
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.hide();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
}

/// Clear the fullscreen blackout latch so reveal/hide can run again. The
/// frontend decides whether to call reveal_dock or hide_dock afterwards.
#[tauri::command]
fn clear_fullscreen_blackout() {
    FULLSCREEN_BLACKOUT.store(false, Ordering::Relaxed);
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
/// async so a large delete never blocks the UI thread.
#[tauri::command]
async fn trash_paths(paths: Vec<String>) -> Result<(), String> {
    let result = win::trash_paths(&paths);
    if let Err(e) = &result {
        log::error!("trash_paths failed: {e}");
    }
    result
}

// async so the Shell query runs off the main thread — SHQueryRecycleBinW can be
// slow on a huge bin, and it runs on the widget poll every few seconds.
#[tauri::command]
async fn trash_is_empty() -> bool {
    win::trash_is_empty()
}

/// How many items are in the Recycle Bin (for the trash tile's badge). async so a
/// slow query never blocks the dock's UI thread.
#[tauri::command]
async fn trash_count() -> u64 {
    win::trash_count().unwrap_or(0)
}

/// Open Booki's data folder (config, backups, logs, crash.log) in the file
/// manager — a one-click way to grab diagnostics when something goes wrong.
#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let dir = config::config_dir();
    let _ = std::fs::create_dir_all(&dir);
    apps::launch(&dir.to_string_lossy(), &[])
}

#[derive(serde::Serialize)]
struct RecentFile {
    name: String,
    path: String,
}

/// The system's recently-opened files (newest first), read from the Windows
/// Recent folder. Each entry is a .lnk we can open directly with the shell, so
/// no fragile binary parsing is involved. Empty off-Windows or on any error.
#[tauri::command]
fn recent_files(limit: Option<usize>) -> Vec<RecentFile> {
    let cap = limit.unwrap_or(12).min(40);
    let Some(data) = dirs::data_dir() else {
        return Vec::new();
    };
    let recent = data.join("Microsoft").join("Windows").join("Recent");
    let Ok(entries) = std::fs::read_dir(&recent) else {
        return Vec::new();
    };
    let mut items: Vec<(std::time::SystemTime, RecentFile)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Only the flat .lnk shortcuts (skip the AutomaticDestinations subfolders).
        if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("lnk"))
            != Some(true)
        {
            continue;
        }
        let modified = entry.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        items.push((
            modified,
            RecentFile {
                name,
                path: path.to_string_lossy().to_string(),
            },
        ));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0));
    items.into_iter().take(cap).map(|(_, f)| f).collect()
}

/// Clipboard history for the widget flyout (newest first).
#[tauri::command]
fn clipboard_history(limit: Option<usize>) -> Vec<ClipEntry> {
    clip_enforce_current_policy();
    let hist = CLIP_HISTORY.lock().unwrap();
    let cfg = config::load();
    let cap = limit.unwrap_or(CLIP_HISTORY_MAX).min(clip_limit(&cfg));
    hist.iter().take(cap).cloned().collect()
}

/// Just the count, for the widget's badge (cheap to poll often).
#[tauri::command]
fn clipboard_count() -> usize {
    clip_enforce_current_policy();
    CLIP_HISTORY.lock().unwrap().len()
}

#[derive(serde::Serialize)]
struct ClipSummary {
    count: usize,
    preview: Option<String>,
}

/// Count + the newest entry's text in ONE round trip — the bar widget shows a
/// live preview of what you last copied, not just a bare number.
#[tauri::command]
fn clipboard_summary() -> ClipSummary {
    clip_enforce_current_policy();
    let hist = CLIP_HISTORY.lock().unwrap();
    ClipSummary {
        count: hist.len(),
        preview: hist.first().map(|e| e.text.clone()),
    }
}

/// Put a history entry (or freshly-edited text) back on the OS clipboard, and
/// record/bump it in history immediately — instant UI feedback instead of
/// waiting for the background watcher's next tick.
#[tauri::command]
fn clipboard_copy(text: String) -> bool {
    let ok = win::set_clipboard_text(&text);
    if ok {
        clip_remember(&text);
    }
    ok
}

#[tauri::command]
fn clipboard_delete(id: u64) {
    let cfg = config::load();
    let mut hist = CLIP_HISTORY.lock().unwrap();
    hist.retain(|e| e.id != id);
    clip_write_disk(&hist, &cfg);
}

#[tauri::command]
fn clipboard_favorite(id: u64, favorite: bool) {
    let cfg = config::load();
    let mut hist = CLIP_HISTORY.lock().unwrap();
    if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
        entry.favorite = favorite;
    }
    clip_prune_locked(&mut hist, &cfg);
    clip_write_disk(&hist, &cfg);
}

#[tauri::command]
fn clipboard_private(id: u64, private: bool) {
    let cfg = config::load();
    let mut hist = CLIP_HISTORY.lock().unwrap();
    if let Some(entry) = hist.iter_mut().find(|entry| entry.id == id) {
        entry.private = private;
    }
    clip_write_disk(&hist, &cfg);
}

#[tauri::command]
fn clipboard_clear() {
    let cfg = config::load();
    let mut hist = CLIP_HISTORY.lock().unwrap();
    hist.clear();
    clip_write_disk(&hist, &cfg);
}

/// Recent files RELEVANT to one pinned app: keeps only entries whose default
/// "open" handler is that app (via the shell's file associations), so an app's
/// right-click menu never lists documents it has nothing to do with. Returns
/// the REAL file paths (Recent .lnk targets), newest first. Async — resolving
/// shortcuts + associations does COM work.
#[tauri::command]
async fn recent_files_for(app_path: String, limit: Option<usize>) -> Vec<RecentFile> {
    let cap = limit.unwrap_or(6).min(20);
    // Pins are often .lnk shortcuts — compare against the real executable name.
    let exe = if app_path.to_ascii_lowercase().ends_with(".lnk") {
        win::shortcut_target(&app_path).unwrap_or_else(|| app_path.clone())
    } else {
        app_path.clone()
    };
    let exe_name = std::path::Path::new(&exe)
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if exe_name.is_empty() || !exe_name.ends_with(".exe") {
        return Vec::new();
    }
    let mut assoc_cache: std::collections::HashMap<String, bool> = std::collections::HashMap::new();
    let mut out: Vec<RecentFile> = Vec::new();
    for r in recent_files(Some(40)) {
        // Each Recent entry is a .lnk — its target gives the real file + extension.
        let Some(target) = win::shortcut_target(&r.path) else {
            continue;
        };
        let Some(ext) = std::path::Path::new(&target)
            .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        else {
            continue;
        };
        let hit = *assoc_cache.entry(ext.clone()).or_insert_with(|| {
            win::assoc_executable(&ext)
            .and_then(|e| {
                std::path::Path::new(&e)
                    .file_name()
                    .map(|s| s.to_string_lossy().to_lowercase())
            })
            .map(|n| n == exe_name)
            .unwrap_or(false)
        });
        // exists() on a dead network share can block for seconds — skip UNC.
        if target.starts_with("\\\\") {
            continue;
        }
        if hit && std::path::Path::new(&target).exists() {
            out.push(RecentFile {
                name: r.name,
                path: target,
            });
            if out.len() >= cap {
                break;
            }
        }
    }
    out
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

// async: emptying the Recycle Bin can take a while (many/large files), and a sync
// command would run on the main thread and freeze the whole dock until it's done.
#[tauri::command]
async fn empty_trash() -> Result<(), String> {
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
async fn list_dir(path: String) -> Vec<DirItem> {
    let mut out: Vec<DirItem> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&path) {
        for e in rd.flatten() {
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
            // Cap AFTER the hidden filter, so a full flyout reliably means
            // "there may be more" (the UI shows an open-in-Explorer row at 80).
            if out.len() >= 80 {
                break;
            }
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
/// Where a dock window of `ww`×`wh` px should sit for `edge` — shared by
/// position_dock (reposition only) and set_dock_frame (atomic resize+move).
fn dock_xy(window: &WebviewWindow, edge: &str, ww: i32, wh: i32) -> Result<(i32, i32), String> {
    let monitor = pick_monitor(window).ok_or_else(|| "no monitor found".to_string())?;
    let mpos = monitor.position();
    let msize = monitor.size();

    // Use the monitor's WORK AREA (excludes the taskbar — including a
    // temporarily revealed auto-hide bar when taskbar_follow is on) so the dock
    // never sits on top of it. Falls back to the full monitor off-Windows.
    let cfg = config::load();
    let (ax, ay, aw, ah) = win::work_area_ex(
        mpos.x + msize.width as i32 / 2,
        mpos.y + msize.height as i32 / 2,
        cfg.taskbar_follow,
    )
    .unwrap_or((mpos.x, mpos.y, msize.width as i32, msize.height as i32));

    // edge_gap = visual distance from the screen edge to the OUTERMOST Booki
    // chrome (CSS px). 0 = as flush as the stage pad allows.
    // When the notch stays painted with the dock, keep that outer gap for the
    // notch and push the dock inward by the notch's painted depth + air — so
    // they stack (edge → notch → dock) instead of colliding. The slider still
    // goes to 0; clearance is additive, not a silent floor replacing the value.
    let dpr = window.scale_factor().unwrap_or(1.0);
    let mut gap = cfg.edge_gap.min(96);
    if cfg.notch_always_visible {
        gap = gap
            .saturating_add(notch_stack_depth_css(&cfg))
            .min(140);
    }
    let margin: i32 = ((gap.saturating_sub(18) as f64) * dpr).round() as i32;

    // Align the dock with the notch's along-edge slot so the two stay parallel:
    // if the notch sits at the top-left, the dock reveals at the left too (not
    // stuck in the center). Only meaningful when the dock is narrower than the
    // span; a full-width dock simply clamps to filling it.
    let slot = cfg.notch_position.as_str();
    Ok(match edge {
        "top" => (along_offset(ax, aw, ww, slot), ay + margin),
        "left" => (ax + margin, along_offset(ay, ah, wh, slot)),
        "right" => (ax + aw - ww - margin, along_offset(ay, ah, wh, slot)),
        // default: bottom
        _ => (along_offset(ax, aw, ww, slot), ay + ah - wh - margin),
    })
}

fn position_dock(window: &WebviewWindow, edge: &str) -> Result<(), String> {
    let wsize = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y) = dock_xy(window, edge, wsize.width as i32, wsize.height as i32)?;
    *DOCK_HOME_RECT.lock().unwrap() = (
        x,
        y,
        x + wsize.width as i32,
        y + wsize.height as i32,
    );
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
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    // Let the dock frontend tuck/summon so hiddenState, polls, and the notch
    // stay in sync — bare show/hide left JS thinking the opposite of reality.
    let _ = app.emit("booki://toggle-dock", ());
}

// ──────────────────────────────── Entry ─────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Append any panic (with location + version + timestamp) to a crash log next to
/// the config, written directly so it survives even if logging is down. With
/// `panic = "abort"` this runs just before the process exits, turning an opaque
/// crash into a debuggable line the user can send us.
fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "?".into());
        let line = format!(
            "[t={secs}] Booki {} panicked at {loc}: {info}\n",
            env!("CARGO_PKG_VERSION")
        );
        let dir = config::config_dir();
        let _ = std::fs::create_dir_all(&dir);
        let crash_path = dir.join("crash.log");
        // Start fresh if a crash-loop ever bloated the file — never grow unbounded.
        let too_big = std::fs::metadata(&crash_path).map(|m| m.len() > 128 * 1024).unwrap_or(false);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(!too_big)
            .truncate(too_big)
            .write(true)
            .open(&crash_path)
        {
            use std::io::Write;
            let _ = f.write_all(line.as_bytes());
        }
        log::error!("{line}");
        prev(info);
    }));
}

pub fn run() {
    install_panic_hook();
    tauri::Builder::default()
        // MUST be the first plugin: if Booki is already running, a new launch
        // (e.g. clicking the icon while the autostart copy is alive) just brings
        // the existing dock to the front and exits, instead of duplicating
        // everything. Windows startup then never ends up with two docks.
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A context-menu "Add to Booki" click launches a second instance
            // with --pin args: apply them here, then surface the dock so the
            // user SEES the item land on the bar.
            let _ = handle_pin_argv(app, &argv);
            reveal_running_dock(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                // Cap the log so it can never grow without bound; keep just the
                // most recent file. Sustainable for a long-running background app.
                .max_file_size(1_000_000) // ~1 MB
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
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
            set_hit_rects,
            set_notch_hit_rects,
            file_thumbnail,
            copy_text,
            open_with,
            dock_cover_workarea,
            sync_context_menu,
            known_folders,
            hide_dock,
            reveal_dock,
            notch_reveal,
            notch_toast,
            notch_toast_dismiss,
            notch_preview,
            hide_all,
            clear_fullscreen_blackout,
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
            current_foreground_app,
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
            trash_count,
            empty_trash,
            recent_files,
            recent_files_for,
            clipboard_history,
            clipboard_count,
            clipboard_summary,
            clipboard_copy,
            clipboard_delete,
            clipboard_favorite,
            clipboard_private,
            clipboard_clear,
            open_data_dir,
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
            clip_load_from_disk();
            // Cold start from the Explorer context menu ("Add to Booki" while
            // Booki wasn't running): apply the pin args of THIS process before
            // the dock loads, so the item is already on the bar at first paint.
            {
                let argv: Vec<String> = std::env::args().collect();
                let _ = handle_pin_argv(app.handle(), &argv);
            }
            // Self-heal the "start with Windows" entry: if the user has it on,
            // re-assert the Run key to the CURRENT exe on every launch. This fixes
            // a stale/missing entry (e.g. after moving or reinstalling the app) so
            // autostart keeps working without the user toggling it again.
            if config::load().autostart {
                if let Ok(exe) = std::env::current_exe() {
                    let _ = win::set_autostart(true, &exe.to_string_lossy());
                }
            }
            // System tray.
            let toggle = MenuItem::with_id(app, "toggle", "Mostrar / ocultar dock", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Ajustes…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir de Booki", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &settings, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::with_id("booki-tray")
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
                });
            // Only set the tray icon if the bundled default icon is present —
            // never panic the whole app over a missing icon.
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder.build(app)?;

            // The dock/notch windows are created VISIBLE but far off-screen
            // (tauri.conf.json): WebView2 only registers its drag-drop targets
            // for windows that are visible at creation (wry bug — hidden-created
            // windows keep a "forbidden" drop cursor forever). Here we move them
            // into place and set their real visibility.
            if let Some(notch) = app.get_webview_window("notch") {
                let cfg = config::load();
                let _ = position_notch(&notch, &cfg.edge);
                if cfg.notch_always_visible {
                    let _ = notch.show();
                } else {
                    let _ = notch.hide();
                }
                #[cfg(windows)]
                if let Ok(h) = notch.hwnd() {
                    win::set_capture_visible(h.0 as isize, cfg.capture_visible);
                }
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
                #[cfg(windows)]
                if let Ok(h) = dock.hwnd() {
                    win::set_capture_visible(h.0 as isize, cfg.capture_visible);
                }

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
                                // Some apps create their own topmost window after Booki
                                // and can slide above the dock/notch. Re-assert topmost
                                // status every few seconds so both stay reachable.
                                if cfg_cache.always_on_top && watch.is_visible().unwrap_or(false) {
                                    let _ = watch.set_always_on_top(false);
                                    let _ = watch.set_always_on_top(true);
                                }
                                if let Some(notch) = handle.get_webview_window("notch") {
                                    let _ = notch.set_always_on_top(false);
                                    let _ = notch.set_always_on_top(true);
                                }
                            }
                            // foreground_occludes = "the user is in an app". Smart
                            // auto-hide and the smart notch both consume this.
                            if cfg_cache.auto_hide_mode == "smart"
                                || cfg_cache.notch_mode.eq_ignore_ascii_case("smart")
                            {
                                let (dl, dt, dr, db) = *DOCK_HOME_RECT.lock().unwrap();
                                if let Some(v) =
                                    debounce(&mut occ, win::foreground_occludes(dl, dt, dr, db, self_hwnd))
                                {
                                    let _ = handle.emit("booki://occlusion", v);
                                }
                            }
                            // fullscreen game / movie / presentation → get out of the way.
                            // Smart notch also softens the dot while fullscreen.
                            if let Some(v) = debounce(&mut fs, win::is_fullscreen()) {
                                let _ = handle.emit("booki://fullscreen", v);
                            }
                            // Cursor pressed against the dock's edge → reveal signal.
                            if cfg_cache.notch_trigger == "hover" {
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

                // Clipboard watcher: samples the OS clipboard's plain text every
                // ~1000 ms when the feature is active and remembers it if it changed.
                // Polling (vs. the native
                // WM_CLIPBOARDUPDATE listener) keeps this on the same simple
                // thread-per-concern pattern as the rest of the watchers and needs
                // no message-only window; this cadence is imperceptible for a paste
                // history. Windows-only — clipboard_get_text stubs to None
                // elsewhere, so the loop would just spin doing nothing.
                #[cfg(windows)]
                {
                    std::thread::spawn(move || {
                        let mut last: Option<String> = None;
                        let mut active = clipboard_feature_active(&config::load());
                        let mut since_cfg: u8 = 0;
                        loop {
                            // When clipboard memory is off, sleep longer and only
                            // re-read config every few ticks — avoids disk I/O every
                            // second for users who never enable the feature.
                            std::thread::sleep(std::time::Duration::from_millis(
                                if active { 1000 } else { 2500 },
                            ));
                            since_cfg = since_cfg.saturating_add(1);
                            let cfg_every = if active { 3 } else { 2 }; // ~3s on / ~5s off
                            if since_cfg >= cfg_every {
                                since_cfg = 0;
                                active = clipboard_feature_active(&config::load());
                            }
                            if !active {
                                last = None;
                                continue;
                            }
                            if let Some(text) = win::clipboard_get_text() {
                                if last.as_deref() != Some(text.as_str()) {
                                    last = Some(text.clone());
                                    clip_remember(&text);
                                }
                            }
                        }
                    });
                }

                // Cursor watcher for the stage window: at ~30 ms it flips the
                // dock between interactive and click-through against the hit
                // rects reported by the frontend, and tells the frontend when
                // the cursor enters/leaves the dock's live regions (DOM
                // enter/leave events can't see that once the window is
                // ignoring the mouse). GetCursorPos + a few rect tests — the
                // per-tick cost is nanoseconds.
                #[cfg(windows)]
                {
                    let watch = dock.clone();
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        let hwnd = watch.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                        if hwnd == 0 {
                            return;
                        }
                        let mut last: Option<bool> = None;
                        loop {
                            let (rects, all) = HIT_RECTS.lock().unwrap().clone();
                            match win::cursor_in_rects(hwnd, &rects, all) {
                                None => {
                                    // Window hidden → leave it interactive so the
                                    // next reveal is immediately usable; idle slower.
                                    if last != Some(true) {
                                        let _ = watch.set_ignore_cursor_events(false);
                                        last = Some(true);
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(180));
                                }
                                Some(inside) => {
                                    if last != Some(inside) {
                                        // Tauri's own path: applies the style with the
                                        // proper frame refresh on the window's thread —
                                        // a raw SetWindowLongPtr left the window in a
                                        // half-applied state that could stop painting.
                                        let _ = watch.set_ignore_cursor_events(!inside);
                                        last = Some(inside);
                                        let _ = handle.emit("booki://cursor-inside", inside);
                                    }
                                    // Keep the interactive state snappy while the
                                    // cursor is over Booki, and use a lighter scan
                                    // cadence while the window is click-through.
                                    std::thread::sleep(std::time::Duration::from_millis(
                                        if inside { 30 } else { 80 },
                                    ));
                                }
                            }
                        }
                    });
                }

                // Notch hit watcher: same click-through contract as the dock, so
                // transparent padding around the pill never steals clicks from
                // apps underneath (attached / floating / smart alike).
                #[cfg(windows)]
                if let Some(notch_watch) = app.get_webview_window("notch") {
                    std::thread::spawn(move || {
                        let hwnd = notch_watch.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                        if hwnd == 0 {
                            return;
                        }
                        // Start click-through until the frontend reports a pill rect.
                        let _ = notch_watch.set_ignore_cursor_events(true);
                        let mut last: Option<bool> = None;
                        loop {
                            let (rects, all) = NOTCH_HIT_RECTS.lock().unwrap().clone();
                            match win::cursor_in_rects(hwnd, &rects, all) {
                                None => {
                                    if last != Some(true) {
                                        let _ = notch_watch.set_ignore_cursor_events(false);
                                        last = Some(true);
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(180));
                                }
                                Some(inside) => {
                                    if last != Some(inside) {
                                        let _ = notch_watch.set_ignore_cursor_events(!inside);
                                        last = Some(inside);
                                    }
                                    std::thread::sleep(std::time::Duration::from_millis(
                                        if inside { 30 } else { 80 },
                                    ));
                                }
                            }
                        }
                    });
                }

                // Work-area self-heal: some setups change the usable screen space
                // without any window-resize/monitor-change event reaching us — the
                // big ones being Windows' "Automatically hide the taskbar" toggle
                // (grows/shrinks rcWork) and the temporary reveal of an auto-hidden
                // bar (rcWork stays full-screen; only the tray HWND moves). Re-
                // checking here means the dock and notch always sit at the CURRENT
                // edge — above a revealed taskbar, flush to the screen when it
                // hides again. Purely position (never size), so it can't fight the
                // stage window's fixed-size contract.
                //
                // Drop settle: rising with a revealed bar is immediate (so Booki
                // never sits under it), but dropping back to the screen edge waits
                // `taskbar_settle_ms` and holds while the cursor is over the dock
                // or notch — otherwise the bar vanishes before you can use it.
                #[cfg(windows)]
                {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        let mut last_seen: Option<(i32, i32, i32, i32)> = None;
                        let mut last_applied: Option<(i32, i32, i32, i32)> = None;
                        // When Some, waiting to apply a "drop" (taskbar hid again).
                        let mut pending_drop: Option<(std::time::Instant, (i32, i32, i32, i32))> =
                            None;
                        let mut cfg = config::load();
                        let mut cfg_tick: u8 = 0;

                        /// True when `next` means the dock must move inward
                        /// (taskbar revealed on this edge).
                        fn is_rise(
                            prev: (i32, i32, i32, i32),
                            next: (i32, i32, i32, i32),
                            edge: &str,
                        ) -> bool {
                            match edge {
                                "top" => next.1 > prev.1,
                                "left" => next.0 > prev.0,
                                "right" => next.0 + next.2 < prev.0 + prev.2,
                                _ => next.1 + next.3 < prev.1 + prev.3,
                            }
                        }

                        fn cursor_over(win: &tauri::WebviewWindow) -> bool {
                            let Ok(pos) = win.outer_position() else {
                                return false;
                            };
                            let Ok(size) = win.outer_size() else {
                                return false;
                            };
                            let mut p = windows::Win32::Foundation::POINT::default();
                            if unsafe {
                                windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p)
                            }
                            .is_err()
                            {
                                return false;
                            }
                            let l = pos.x;
                            let t = pos.y;
                            let r = pos.x + size.width as i32;
                            let b = pos.y + size.height as i32;
                            p.x >= l && p.x < r && p.y >= t && p.y < b
                        }

                        loop {
                            let autohide = win::taskbar_autohide();
                            std::thread::sleep(std::time::Duration::from_millis(
                                if autohide || pending_drop.is_some() {
                                    80
                                } else {
                                    1200
                                },
                            ));
                            let Some(dock) = handle.get_webview_window("dock") else {
                                continue;
                            };
                            cfg_tick = cfg_tick.wrapping_add(1);
                            let cfg_every = if autohide || pending_drop.is_some() {
                                8
                            } else {
                                5
                            };
                            if cfg_tick % cfg_every == 0 {
                                cfg = config::load();
                            }
                            let Some(monitor) = pick_monitor(&dock) else {
                                continue;
                            };
                            let mpos = monitor.position();
                            let msize = monitor.size();
                            let area = win::work_area_ex(
                                mpos.x + msize.width as i32 / 2,
                                mpos.y + msize.height as i32 / 2,
                                cfg.taskbar_follow,
                            )
                            .unwrap_or((
                                mpos.x,
                                mpos.y,
                                msize.width as i32,
                                msize.height as i32,
                            ));

                            let notch = handle.get_webview_window("notch");
                            let apply = |dock: &tauri::WebviewWindow, edge: &str| {
                                let _ = position_dock(dock, edge);
                                if let Some(ref n) = notch {
                                    let _ = position_notch(n, edge);
                                }
                            };

                            // First observation: establish baseline, don't jump.
                            if last_seen.is_none() {
                                last_seen = Some(area);
                                last_applied = Some(area);
                                continue;
                            }

                            let edge = cfg.edge.as_str();
                            let hovering = cfg.taskbar_hold_while_hover
                                && (cursor_over(&dock)
                                    || notch.as_ref().map(cursor_over).unwrap_or(false));

                            if last_seen != Some(area) {
                                let prev = last_seen.unwrap_or(area);
                                last_seen = Some(area);

                                if !cfg.taskbar_follow {
                                    pending_drop = None;
                                    if last_applied != Some(area) {
                                        apply(&dock, edge);
                                        last_applied = Some(area);
                                    }
                                    continue;
                                }

                                let rising = is_rise(prev, area, edge)
                                    || last_applied
                                        .map(|a| is_rise(a, area, edge))
                                        .unwrap_or(false);
                                if rising {
                                    // Taskbar revealed → climb immediately.
                                    pending_drop = None;
                                    apply(&dock, edge);
                                    last_applied = Some(area);
                                    continue;
                                }

                                if last_applied != Some(area) {
                                    // Taskbar tucked (or other shrink of inset):
                                    // delay the drop so the notch stays reachable.
                                    let settle = cfg.taskbar_settle_ms.clamp(0, 5000);
                                    if settle == 0 {
                                        pending_drop = None;
                                        apply(&dock, edge);
                                        last_applied = Some(area);
                                    } else {
                                        pending_drop = Some((
                                            std::time::Instant::now()
                                                + std::time::Duration::from_millis(settle as u64),
                                            area,
                                        ));
                                    }
                                }
                            }

                            // Hold while hovering Booki: keep the raised seat and
                            // push the settle deadline out so the user can click.
                            if hovering {
                                if let Some((_, pending_area)) = pending_drop {
                                    let settle = cfg.taskbar_settle_ms.clamp(0, 5000);
                                    pending_drop = Some((
                                        std::time::Instant::now()
                                            + std::time::Duration::from_millis(settle as u64),
                                        pending_area,
                                    ));
                                }
                                continue;
                            }

                            if let Some((deadline, pending_area)) = pending_drop {
                                if std::time::Instant::now() >= deadline {
                                    apply(&dock, edge);
                                    last_applied = Some(pending_area);
                                    last_seen = Some(pending_area);
                                    pending_drop = None;
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
