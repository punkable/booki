//! Booki Dock — Tauri backend.
//!
//! Owns the frameless always-on-top dock window, the system-tray icon, config
//! persistence, app launching and (on Windows) native window management.

mod app_catalog;
mod apps;
mod clipboard;
mod clipboard_storage;
mod config;
mod config_document;
mod config_transaction;
mod directory;
mod dock_window;
mod favicon;
mod files;
mod media;
mod metrics;
mod notch_window;
mod note_journal;
mod profile_store;
mod profiles;
mod recent_files;
mod recovery;
mod shortcuts;
mod snapshot;
mod surface_geometry;
mod update_backup;
mod usage;
mod util;
mod weather;
mod win;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use app_catalog::*;
use clipboard::*;
use config::Config;
use directory::DirItem;
use dock_window::*;
use favicon::*;
use files::*;
use media::*;
use metrics::*;
use notch_window::*;
use profiles::*;
use recent_files::*;
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// Set when the changelog was requested before the settings window existed; the
/// settings page asks for it on mount (`take_pending_changelog`). A plain flag —
/// never a URL hash — so the settings window always loads its normal, known-good
/// URL (a hash in the app URL made the window come up blank on Windows).
static PENDING_CHANGELOG: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn quiet_update_supported() -> bool {
    win::quiet_update_supported()
}

static UPDATE_LOCK: AtomicBool = AtomicBool::new(false);
#[tauri::command]
fn acquire_update_lock() -> bool {
    UPDATE_LOCK
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
}
#[tauri::command]
fn release_update_lock() {
    UPDATE_LOCK.store(false, Ordering::SeqCst);
}
#[tauri::command]
async fn prepare_update() -> Result<(), String> {
    if !UPDATE_LOCK.load(Ordering::SeqCst) {
        return Err("No update session".into());
    }
    if !win::quiet_update_supported() {
        return Err("Use the original installer type to update this MSI or portable copy".into());
    }
    tauri::async_runtime::spawn_blocking(config::backup_for_update)
        .await
        .map_err(|e| e.to_string())?
}

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
/// Clickable regions a window reported, plus whether the whole window is live.
type HitRegions = Mutex<(Vec<(f64, f64, f64, f64)>, bool)>;
static HIT_RECTS: HitRegions = Mutex::new((Vec::new(), true));

/// Same contract as HIT_RECTS, but for the notch window. The notch OS window is
/// intentionally larger than the painted pill (hover/glow room); without this,
/// transparent padding would block clicks on apps behind it.
#[allow(clippy::type_complexity)]
static NOTCH_HIT_RECTS: HitRegions = Mutex::new((Vec::new(), false));

static DOCK_HOME_RECT: Mutex<(i32, i32, i32, i32)> = Mutex::new((0, 0, 0, 0));

#[tauri::command]
async fn read_note_draft(id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        note_journal::read(
            &config::config_dir(),
            &id,
            win::unprotect_data,
            cfg!(windows),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn write_note_draft(id: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        note_journal::write(
            &config::config_dir(),
            &id,
            &text,
            win::protect_data,
            cfg!(windows),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn clear_note_draft(id: String, expected: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        note_journal::clear(
            &config::config_dir(),
            &id,
            &expected,
            win::unprotect_data,
            cfg!(windows),
        )
    })
    .await
    .map_err(|e| e.to_string())?
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

// ─────────────────────────────── Commands ───────────────────────────────

#[tauri::command]
fn get_config() -> Config {
    config::load()
}

#[tauri::command]
fn save_config(
    app: AppHandle,
    config: Option<Config>,
    patch: Option<serde_json::Value>,
    base: Option<serde_json::Value>,
    expected_revision: Option<u64>,
) -> Result<Config, String> {
    let config = if let Some(patch) = patch {
        config::patch_checked(patch, base.as_ref(), expected_revision)?
    } else if let Some(config) = config {
        config::save(&config)?;
        config::load()
    } else {
        return Err("missing config or patch".into());
    };
    {
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
            if dock_visible {
                // Dock is out → the notch is off duty.
                let _ = notch.hide();
            }
        }
    }
    Ok(config)
}

/// Moving into Booki is explicit and limited to the user's desktop.
/// Copy first, commit the new pin path, then remove the old shortcut.
#[tauri::command]
fn relocate_shortcut(app: AppHandle, id: String, to_desktop: bool) -> Result<String, String> {
    fn find(items: &mut [config::PinnedApp], id: &str) -> Option<String> {
        for pin in items {
            if pin.id == id && pin.kind == "app" {
                return Some(pin.path.clone());
            }
            if let Some(path) = find(&mut pin.children, id) {
                return Some(path);
            }
        }
        None
    }
    fn update(items: &mut [config::PinnedApp], original: &str, path: &str) {
        for pin in items {
            if pin.path == original {
                pin.path = path.into();
            }
            update(&mut pin.children, original, path);
        }
    }
    let mut cfg = config::load();
    let original = find(&mut cfg.pinned, &id).ok_or("Shortcut pin not found")?;
    let source = std::path::Path::new(&original);
    let desktop = win::known_folders()
        .into_iter()
        .find(|(key, _)| key == "desktop")
        .map(|(_, path)| std::path::PathBuf::from(path))
        .ok_or("Desktop folder unavailable")?;
    let managed = config::config_dir().join("shortcuts");
    let parent = source
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .ok_or("Shortcut folder unavailable")?;
    let on_desktop = desktop.canonicalize().ok().as_ref() == Some(&parent);
    let in_booki = managed.canonicalize().ok().as_ref() == Some(&parent);
    if to_desktop && on_desktop {
        return Ok(original);
    }
    if !to_desktop && in_booki {
        return Ok(original);
    }
    if !to_desktop && !on_desktop {
        return Err("Only desktop shortcuts can be moved into Booki".into());
    }
    let copied = shortcuts::copy_unique(source, if to_desktop { &desktop } else { &managed })?;
    let next = copied.to_string_lossy().to_string();
    if let Err(err) = config::update(|current| {
        if find(&mut current.pinned, &id).as_deref() != Some(original.as_str()) {
            return Err("Shortcut pin changed during transfer".into());
        }
        update(&mut current.pinned, &original, &next);
        Ok(())
    }) {
        let _ = fs::remove_file(&copied);
        return Err(err);
    }
    // Installed Start Menu shortcuts are copied, never removed. Failure to
    // remove an original leaves two valid shortcuts rather than a broken pin.
    if on_desktop || in_booki {
        if let Err(err) = fs::remove_file(source) {
            log::warn!("Shortcut original retained: {err}");
        }
    }
    let _ = app.emit("booki://config-changed", ());
    Ok(next)
}

#[tauri::command]
fn launch_app(path: String, args: Option<Vec<String>>) -> Result<(), String> {
    apps::launch(&path, &args.unwrap_or_default())?;
    if config::load().usage_recommendations_enabled {
        usage::record_launch(&path);
    }
    Ok(())
}

/// Return the app's icon as a base64 PNG data URI (Windows only; None elsewhere).
#[tauri::command]
async fn app_icon(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || win::app_icon_data_uri(&path))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn app_identities(paths: Vec<String>) -> std::collections::HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .take(2048)
            .map(|path| {
                let identity = win::app_identity(&path);
                (path, identity)
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn list_windows() -> Vec<win::WindowInfo> {
    tauri::async_runtime::spawn_blocking(win::list_windows)
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn focus_window(hwnd: i64) -> bool {
    win::focus_window(hwnd as isize)
}

/// Focus an app's window, or minimize it when it is already in front.
#[tauri::command]
fn toggle_window(hwnd: i64) -> bool {
    win::toggle_window(hwnd as isize)
}

#[tauri::command]
fn close_window(hwnd: i64) -> bool {
    win::close_window(hwnd as isize)
}

#[tauri::command]
async fn clear_app_usage() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(usage::clear_local)
        .await
        .map_err(|e| e.to_string())?
}

/// The apps this user runs most, from Windows' local usage record.
#[tauri::command]
async fn frequent_apps(limit: Option<usize>) -> Vec<usage::UsedApp> {
    let limit = limit.unwrap_or(12).min(50);
    tauri::async_runtime::spawn_blocking(move || usage::suggestions(limit))
        .await
        .unwrap_or_default()
}

/// Native blurred material behind the calling window, clipped to `shapes`
/// (`[x, y, w, h, tl, tr, br, bl]`, window-relative CSS px). `tint` is `#RRGGBBAA`.
/// Returns false where there is no native material (the page keeps its CSS
/// fallback then). An empty list hides it.
#[tauri::command]
fn platform_capabilities() -> serde_json::Value {
    #[cfg(windows)]
    {
        serde_json::to_value(win::platform::capabilities()).unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        serde_json::json!({ "build":0,"systemBackdrop":false,"highContrast":false,"animations":true,"transparency":true })
    }
}

#[tauri::command]
async fn settings_backdrop(
    app: AppHandle,
    window: WebviewWindow,
    enabled: bool,
    dark: Option<bool>,
) -> bool {
    if window.label() != "settings" {
        return false;
    }
    #[cfg(windows)]
    {
        let native_window = window.clone();
        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        let (tx, rx) = std::sync::mpsc::channel();
        if app
            .run_on_main_thread(move || {
                let applied =
                    win::platform::settings_backdrop(hwnd, enabled, dark.unwrap_or(false));
                let color = if applied {
                    tauri::window::Color(0, 0, 0, 0)
                } else if dark.unwrap_or(false) {
                    tauri::window::Color(23, 25, 29, 255)
                } else {
                    tauri::window::Color(251, 251, 253, 255)
                };
                let painted = native_window.set_background_color(Some(color)).is_ok();
                if !painted && applied {
                    win::platform::settings_backdrop(hwnd, false, dark.unwrap_or(false));
                }
                let _ = tx.send(applied && painted);
            })
            .is_err()
        {
            return false;
        }
        tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or(false))
            .await
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, enabled, dark);
        false
    }
}

#[tauri::command]
fn config_recovery_status() -> recovery::RecoveryReport {
    config::recovery_status()
}

#[tauri::command]
fn acknowledge_config_recovery() -> Result<(), String> {
    if config::recovery_status().blocked {
        return Err("BOOKI_RECOVERY_REQUIRED".into());
    }
    config::acknowledge_recovery();
    Ok(())
}

#[tauri::command]
fn start_fresh_config(app: AppHandle) -> Result<Config, String> {
    if !config::recovery_status().blocked {
        return Err("BOOKI_RECOVERY_NOT_REQUIRED".into());
    }
    apply_config_snapshot(&app, Config::default())
}

#[tauri::command]
async fn set_material(
    app: AppHandle,
    window: tauri::WebviewWindow,
    shapes: Vec<surface_geometry::MaterialShape>,
    tint: String,
) -> bool {
    #[cfg(windows)]
    {
        let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
        if owner == 0 {
            return false;
        }
        let hex = tint.trim_start_matches('#');
        let rgba = u32::from_str_radix(hex, 16).unwrap_or(0x1c1c1ea0);
        let argb = if hex.len() == 8 {
            // RRGGBBAA -> AARRGGBB
            rgba.rotate_right(8)
        } else {
            0xff00_0000 | rgba
        };
        let key = window.label().to_string();
        let dpr = window.scale_factor().unwrap_or(1.0);
        let (tx, rx) = std::sync::mpsc::channel();
        if app
            .run_on_main_thread(move || {
                let _ = tx.send(win::material::apply(owner, &key, &shapes, dpr, argb));
            })
            .is_err()
        {
            return false;
        }
        tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or(false))
            .await
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, window, shapes, tint);
        false
    }
}

/// Copy plain text to the clipboard (e.g. a file's path from the flyout).
#[tauri::command]
fn copy_text(text: String) -> bool {
    win::set_clipboard_text(&text)
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
    config::patch(serde_json::json!({ "alwaysOnTop": value }))?;
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

/// Reset appearance/behavior to defaults, keeping the user's pinned items.
#[tauri::command]
fn reset_config(app: AppHandle) -> Result<Config, String> {
    let c = config::update(|current| {
        *current = Config {
            pinned: std::mem::take(&mut current.pinned),
            always_on_top: true,
            ..Default::default()
        };
        Ok(())
    })?;
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
        action: None,
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
    if config::update(|cfg| {
        match group.and_then(|gid| {
            cfg.pinned
                .iter_mut()
                .find(|g| g.kind == "group" && g.id == gid)
        }) {
            Some(g) => g.children.push(item),
            None => cfg.pinned.push(item),
        }
        Ok(())
    })
    .is_err()
    {
        return false;
    }
    let _ = app.emit("booki://config-changed", ());
    true
}

/// Show the "What's new" changelog. To avoid a fragile extra window (which on
/// some setups came up blank and could crash the app), it's shown INSIDE the
/// stable settings window: if settings is open we just signal it; otherwise we
/// set a flag the settings page picks up on mount and open settings normally.
#[tauri::command]
async fn open_changelog(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
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
        let _ = w.show();
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
    snapshot::write(std::path::Path::new(&path), &text)
}

fn read_import(path: &str) -> Result<Config, String> {
    config_document::read(std::path::Path::new(path))
}

#[tauri::command]
fn preview_config_import(path: String) -> Result<Config, String> {
    read_import(&path)
}

/// Apply only the snapshot the user reviewed; files may change while a dialog is open.
#[tauri::command]
fn import_config(app: AppHandle, path: String, expected: Option<Config>) -> Result<Config, String> {
    let mut cfg = read_reviewed_import(&path, expected.as_ref())?;
    cfg.monitor = -1;
    cfg.monitor_name.clear();
    apply_config_snapshot(&app, cfg)
}

fn read_reviewed_import(path: &str, expected: Option<&Config>) -> Result<Config, String> {
    let cfg = read_import(path)?;
    if expected.is_some_and(|snapshot| {
        serde_json::to_value(snapshot).ok() != serde_json::to_value(&cfg).ok()
    }) {
        return Err("BOOKI_IMPORT_CHANGED".into());
    }
    Ok(cfg)
}

fn apply_config_snapshot(app: &AppHandle, cfg: Config) -> Result<Config, String> {
    // Profiles and backups from older builds use the current schema too.
    let mut cfg = cfg;
    config::migrate(&mut cfg);
    // Apply general preferences as well as the visual layout. A failed OS
    // operation leaves the previous persisted profile active.
    config::backup_for_update()?;
    let previous = config::load();
    let previous_autostart = get_autostart();
    if let Err(error) = hotkeys_apply(
        app,
        &cfg.hotkey,
        cfg.position_hotkeys,
        &cfg.hotkey_modifier,
        &cfg.launcher_hotkey,
    ) {
        let _ = hotkeys_apply(
            app,
            &previous.hotkey,
            previous.position_hotkeys,
            &previous.hotkey_modifier,
            &previous.launcher_hotkey,
        );
        return Err(error);
    }
    if let Err(error) = set_autostart(cfg.autostart) {
        let _ = hotkeys_apply(
            app,
            &previous.hotkey,
            previous.position_hotkeys,
            &previous.hotkey_modifier,
            &previous.launcher_hotkey,
        );
        return Err(error);
    }
    if let Err(error) = config::save_replacement(&cfg) {
        let _ = set_autostart(previous_autostart);
        let _ = hotkeys_apply(
            app,
            &previous.hotkey,
            previous.position_hotkeys,
            &previous.hotkey_modifier,
            &previous.launcher_hotkey,
        );
        return Err(error);
    }
    clip_apply_config(&cfg);
    apply_always_on_top(app);
    apply_capture_policy(app, cfg.capture_visible);
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
    }
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = position_notch(&notch, &cfg.edge);
    }
    let _ = app.emit("booki://config-changed", ());
    // Same as import: always hand Settings a load()-migrated snapshot, so the
    // cache save() just populated has to be dropped first (see import_config).
    config::invalidate_cache();
    Ok(config::load())
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

/// Open Booki's data folder (config, backups, logs, crash.log) in the file
/// manager — a one-click way to grab diagnostics when something goes wrong.
#[tauri::command]
fn open_data_dir() -> Result<(), String> {
    let dir = config::config_dir();
    let _ = std::fs::create_dir_all(&dir);
    apps::launch(&dir.to_string_lossy(), &[])
}

#[tauri::command]
async fn weather_search(city: String) -> Result<Vec<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || weather::search(&city))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn weather_current(latitude: f64, longitude: f64) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || weather::current(latitude, longitude))
        .await
        .map_err(|e| e.to_string())?
}

/// Export an allowlist, never the user's config, paths, logs or widget contents.
#[tauri::command]
fn export_diagnostics(window: WebviewWindow, path: String) -> Result<(), String> {
    let cfg = config::load();
    let displays: Vec<_> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            serde_json::json!({
                "width": monitor.size().width, "height": monitor.size().height,
                "x": monitor.position().x, "y": monitor.position().y,
                "scale": monitor.scale_factor()
            })
        })
        .collect();
    let payload = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"), "os": std::env::consts::OS,
        "architecture": std::env::consts::ARCH, "displays": displays,
        "configRevision": cfg.revision, "clipboardStorageFailed": CLIP_STORAGE_FAILED.load(Ordering::Relaxed),
        "dock": { "edge": cfg.edge, "autoHideMode": cfg.auto_hide_mode,
            "hideInFullscreen": cfg.hide_in_fullscreen, "notchTrigger": cfg.notch_trigger,
            "iconSize": cfg.icon_size, "overflowMode": cfg.overflow_mode,
            "surfaceStyle": cfg.surface_style, "reduceTransparency": cfg.reduce_transparency,
            "pinCount": cfg.pinned.len() }
    });
    let bytes = serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// Accent color derived from the desktop wallpaper (async: decodes an image).
#[tauri::command]
async fn wallpaper_accent() -> Option<String> {
    win::wallpaper_accent()
}

#[tauri::command]
fn system_events_support() -> serde_json::Value {
    #[cfg(windows)]
    {
        use win::system_events;
        serde_json::json!({ "media": system_events::MEDIA.load(Ordering::Relaxed), "volume": system_events::VOLUME.load(Ordering::Relaxed), "windows": system_events::WINDOWS.load(Ordering::Relaxed), "catalog": system_events::CATALOG.load(Ordering::Relaxed), "clipboard": system_events::CLIPBOARD.load(Ordering::Relaxed) })
    }
    #[cfg(not(windows))]
    {
        serde_json::json!({ "media": false, "volume": false, "windows": false, "catalog": false })
    }
}

/// (Re)register the global hotkey that toggles the dock. Empty = none.
#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let cfg = config::load();
    hotkeys_apply(
        &app,
        &accelerator,
        cfg.position_hotkeys,
        &cfg.hotkey_modifier,
        &cfg.launcher_hotkey,
    )
}

/// Re-register ALL global shortcuts: the toggle hotkey plus (when enabled) the
/// position hotkeys modifier+1…9 that launch the Nth dock item.
fn hotkeys_apply(
    app: &AppHandle,
    toggle: &str,
    positions: bool,
    modifier: &str,
    launcher: &str,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if !toggle.trim().is_empty() {
        gs.register(toggle.trim()).map_err(|e| e.to_string())?;
    }
    // Best-effort, like the position keys: another app may own the combo.
    let parsed = launcher.trim().parse::<Shortcut>().ok();
    if let Some(shortcut) = parsed {
        let _ = gs.register(shortcut);
    }
    if let Ok(mut slot) = LAUNCHER_SHORTCUT.lock() {
        *slot = parsed;
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
    launcher: Option<String>,
) -> Result<(), String> {
    let launcher = launcher.unwrap_or_else(|| config::load().launcher_hotkey);
    hotkeys_apply(&app, &toggle, positions, &modifier, &launcher)
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

fn open_settings_window(app: &AppHandle) {
    open_settings_url(app, "settings.html");
}

fn open_settings_url(app: &AppHandle, url: &str) {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("Booki — Ajustes")
        .inner_size(960.0, 760.0)
        .min_inner_size(520.0, 480.0)
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

// ──────────────────────────────── Entry ─────────────────────────────────

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
        let too_big = std::fs::metadata(&crash_path)
            .map(|m| m.len() > 128 * 1024)
            .unwrap_or(false);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
                    let is_launcher = LAUNCHER_SHORTCUT
                        .lock()
                        .is_ok_and(|slot| slot.as_ref() == Some(shortcut));
                    if is_launcher {
                        show_launcher(app);
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
        .plugin({
            let updater = tauri_plugin_updater::Builder::new();
            #[cfg(windows)]
            let updater = match std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf))
            {
                Some(directory) => {
                    // NSIS requires /D to be the final argument, without quotes.
                    // Pin the update to this executable's directory, including custom paths.
                    let mut argument = std::ffi::OsString::from("/D=");
                    argument.push(directory.as_os_str());
                    updater.installer_arg(argument)
                }
                None => updater,
            };
            updater.build()
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            quiet_update_supported,
            acquire_update_lock,
            release_update_lock,
            prepare_update,
            read_note_draft,
            write_note_draft,
            clear_note_draft,
            get_config,
            save_config,
            launch_app,
            relocate_shortcut,
            app_icon,
            app_identities,
            list_windows,
            focus_window,
            toggle_window,
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
            notch_screen_busy,
            notch_toast,
            notch_toast_dismiss,
            notch_preview,
            hide_all,
            clear_fullscreen_blackout,
            profile_list,
            profile_save,
            profile_apply,
            profile_delete,
            profile_preview,
            profile_duplicate,
            profile_rename,
            profile_deleted,
            profile_restore,
            volume_info,
            volume_set,
            volume_mute,
            set_dock_edge,
            open_changelog,
            take_pending_changelog,
            open_settings_tab,
            take_pending_tab,
            export_config,
            export_diagnostics,
            weather_search,
            weather_current,
            import_config,
            preview_config_import,
            paths_exist,
            image_data_uri,
            set_always_on_top,
            app_version,
            reset_config,
            open_settings,
            open_location,
            close_window,
            frequent_apps,
            clear_app_usage,
            set_hotkey,
            apply_hotkeys,
            move_paths,
            list_monitors,
            set_material,
            config_recovery_status,
            platform_capabilities,
            settings_backdrop,
            acknowledge_config_recovery,
            start_fresh_config,
            system_accent,
            system_stats,
            app_usage,
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
            clipboard_storage_failed,
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
            system_events_support,
            quit,
            frontend_log,
        ])
        .setup(|app| {
            log::info!("Booki backend started");
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                win::system_events::start(std::sync::Arc::new(move |kind| {
                    if kind == "clipboard" && clipboard_feature_active(&config::load()) {
                        // The writing app may still hold OpenClipboard when the
                        // notification arrives. Retry briefly on this worker,
                        // never on the message pump or UI thread.
                        for delay in [0, 20, 60] {
                            if delay > 0 {
                                std::thread::sleep(std::time::Duration::from_millis(delay));
                            }
                            if let Some(text) = win::clipboard_get_text() {
                                if clipboard_feature_active(&config::load()) {
                                    clip_remember(&text);
                                }
                                break;
                            }
                        }
                    }
                    if kind == "display" || kind == "resume" {
                        let app = handle.clone();
                        let _ = handle.run_on_main_thread(move || {
                            let cfg = config::load();
                            if let Some(dock) = app.get_webview_window("dock") {
                                let _ = position_dock(&dock, &cfg.edge);
                            }
                            if let Some(notch) = app.get_webview_window("notch") {
                                let _ = position_notch(&notch, &cfg.edge);
                            }
                        });
                    }
                    if kind == "resume" {
                        for source in ["media", "volume", "windows"] {
                            let _ = handle.emit(&format!("booki://{source}-changed"), ());
                        }
                    }
                    if kind == "catalog" {
                        CATALOG_GENERATION.fetch_add(1, Ordering::Relaxed);
                    }
                    let _ = handle.emit(&format!("booki://{kind}-changed"), ());
                }));
            }
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
            let toggle =
                MenuItem::with_id(app, "toggle", "Mostrar / ocultar dock", true, None::<&str>)?;
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
                let _ = notch.hide();
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
                    &cfg.launcher_hotkey,
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
                        let mut desktop = (false, false, 0u8);
                        // Smart notch: "an app owns the screen" (debounced like
                        // the rest) and "the pointer is near the notch" (raw, so
                        // the notch answers an approach within one tick).
                        let mut busy = (false, false, 0u8);
                        let mut near_last = false;
                        fn n_scale(w: Option<&tauri::WebviewWindow>) -> f64 {
                            w.and_then(|w| w.scale_factor().ok()).unwrap_or(1.0)
                        }
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
                                // Only while it is actually on screen. This used
                                // to run unconditionally, so a hidden notch —
                                // which is most of the time — still cost four
                                // SetWindowPos calls every three seconds, waking
                                // DWM for a window nobody could see.
                                if let Some(notch) = handle.get_webview_window("notch") {
                                    if notch.is_visible().unwrap_or(false) {
                                        let _ = notch.set_always_on_top(false);
                                        let _ = notch.set_always_on_top(true);
                                    }
                                }
                            }
                            if let Some(v) = debounce(&mut desktop, win::desktop_foreground()) {
                                let _ = handle.emit("booki://desktop", v);
                            }
                            // foreground_occludes = "the user is in an app". Smart
                            // auto-hide and the smart notch both consume this.
                            if cfg_cache.auto_hide_mode == "smart" {
                                let (dl, dt, dr, db) = *DOCK_HOME_RECT.lock().unwrap();
                                if let Some(v) = debounce(
                                    &mut occ,
                                    win::foreground_occludes(dl, dt, dr, db, self_hwnd),
                                ) {
                                    let _ = handle.emit("booki://occlusion", v);
                                }
                            }
                            // fullscreen game / movie / presentation → get out of the way.
                            // Smart notch also softens the dot while fullscreen.
                            if let Some(v) = debounce(&mut fs, win::is_fullscreen()) {
                                let _ = handle.emit("booki://fullscreen", v);
                            }
                            // The notch steps aside while an app owns the screen
                            // and comes back when the pointer nears it. Only
                            // measured while the notch window is on duty.
                            if cfg_cache.notch_visibility != "always" {
                                let notch = handle.get_webview_window("notch");
                                let on_duty = notch
                                    .as_ref()
                                    .map(|n| n.is_visible().unwrap_or(false))
                                    .unwrap_or(false);
                                if !on_duty {
                                    // The notch forgets the pointer when it hides.
                                    near_last = false;
                                } else {
                                    if let Some(v) =
                                        debounce(&mut busy, win::foreground_maximized())
                                    {
                                        let _ = handle.emit("booki://screen-busy", v);
                                    }
                                    let near = notch
                                        .as_ref()
                                        .and_then(|n| n.hwnd().ok())
                                        .map(|h| {
                                            let pad =
                                                (40.0 * n_scale(notch.as_ref())).round() as i32;
                                            win::cursor_near_window(h.0 as isize, pad)
                                                || win::cursor_at_edge(&cfg_cache.edge)
                                        })
                                        .unwrap_or(false);
                                    if near != near_last {
                                        near_last = near;
                                        let _ = handle.emit("booki://notch-near", near);
                                    }
                                }
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

                // Recovery sampling complements WM_CLIPBOARDUPDATE. Use a slow
                // cadence when Windows registered the listener, and a one-second
                // fallback if registration failed. No polling on other platforms.
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
                            std::thread::sleep(std::time::Duration::from_millis(if active {
                                if win::system_events::CLIPBOARD.load(Ordering::Relaxed) {
                                    30000
                                } else {
                                    1000
                                }
                            } else {
                                2500
                            }));
                            since_cfg = since_cfg.saturating_add(1);
                            let event_driven =
                                win::system_events::CLIPBOARD.load(Ordering::Relaxed);
                            let cfg_every = if active && !event_driven {
                                3
                            } else if active {
                                1
                            } else {
                                2
                            };
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

                // Cursor watcher for the stage windows: it flips the dock and
                // the notch between interactive and click-through against the hit
                // rects the frontend reports, and tells the frontend when the
                // cursor enters/leaves the dock's live regions (DOM enter/leave
                // events cannot see that once a window ignores the mouse).
                //
                // The dock and the notch used to run this as two byte-identical
                // threads, differing only in which window and which rect list
                // they read. That doubled the timer wakeups — and the two are
                // complementary anyway, since the notch is visible exactly when
                // the dock is not. One thread now serves both: the loop sleeps
                // for whichever window wants the shortest interval, so the total
                // wakeup rate is halved without either window feeling slower.
                #[cfg(windows)]
                {
                    struct CursorTarget {
                        window: tauri::WebviewWindow,
                        hwnd: isize,
                        rects: &'static HitRegions,
                        /// Only the dock reports enter/leave to the frontend.
                        emits_inside: bool,
                        last: Option<bool>,
                    }

                    let handle = app.handle().clone();
                    let mut targets: Vec<CursorTarget> = Vec::new();
                    let mut add = |window: tauri::WebviewWindow,
                                   rects: &'static HitRegions,
                                   emits_inside: bool,
                                   start_click_through: bool| {
                        let hwnd = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                        if hwnd == 0 {
                            return;
                        }
                        if start_click_through {
                            // The notch stays click-through until the frontend
                            // reports a pill rect, so its transparent padding
                            // never steals a click from the app underneath.
                            let _ = window.set_ignore_cursor_events(true);
                        }
                        targets.push(CursorTarget {
                            window,
                            hwnd,
                            rects,
                            emits_inside,
                            last: None,
                        });
                    };
                    add(dock.clone(), &HIT_RECTS, true, false);
                    if let Some(notch_watch) = app.get_webview_window("notch") {
                        add(notch_watch, &NOTCH_HIT_RECTS, false, true);
                    }

                    if !targets.is_empty() {
                        std::thread::spawn(move || {
                            loop {
                                // A hidden dock or notch must never leave its
                                // material behind, whichever path hid it.
                                win::material::sync();
                                // Shortest interval any target asks for this tick.
                                let mut next_ms = 180u64;
                                for t in targets.iter_mut() {
                                    let (rects, all) = match t.rects.lock() {
                                        Ok(g) => g.clone(),
                                        Err(_) => continue,
                                    };
                                    match win::cursor_in_rects(t.hwnd, &rects, all) {
                                        None => {
                                            // Window hidden -> leave it interactive so
                                            // the next reveal is usable straight away,
                                            // and let this one idle slowly.
                                            if t.last != Some(true) {
                                                let _ = t.window.set_ignore_cursor_events(false);
                                                t.last = Some(true);
                                            }
                                        }
                                        Some(inside) => {
                                            if t.last != Some(inside) {
                                                // Tauri's own path applies the style with
                                                // the proper frame refresh on the window's
                                                // thread; a raw SetWindowLongPtr left the
                                                // window half-applied and it could stop
                                                // painting.
                                                let _ = t.window.set_ignore_cursor_events(!inside);
                                                t.last = Some(inside);
                                                if t.emits_inside {
                                                    let _ = handle
                                                        .emit("booki://cursor-inside", inside);
                                                }
                                            }
                                            // Snappy while the cursor is over Booki,
                                            // lighter while the window is click-through.
                                            next_ms = next_ms.min(if inside { 30 } else { 80 });
                                        }
                                    }
                                }
                                std::thread::sleep(std::time::Duration::from_millis(next_ms));
                            }
                        });
                    }
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
                            // The 80ms cadence exists to catch an auto-hiding
                            // taskbar sliding in and out without rcWork ever
                            // changing. That only matters when the user actually
                            // asked the dock to follow it: with taskbar_follow
                            // off there is nothing to react to quickly, yet this
                            // still woke up 12.5 times a second forever. Checking
                            // the setting first drops those users to the 1200ms
                            // idle cadence — and while blacked out for a
                            // fullscreen app, nothing needs repositioning at all.
                            let blackout = FULLSCREEN_BLACKOUT.load(Ordering::Relaxed);
                            let watching_taskbar =
                                !blackout && cfg.taskbar_follow && win::taskbar_autohide();
                            std::thread::sleep(std::time::Duration::from_millis(
                                if watching_taskbar || pending_drop.is_some() {
                                    80
                                } else {
                                    1200
                                },
                            ));
                            let Some(dock) = handle.get_webview_window("dock") else {
                                continue;
                            };
                            cfg_tick = cfg_tick.wrapping_add(1);
                            let cfg_every = if watching_taskbar || pending_drop.is_some() {
                                8
                            } else {
                                5
                            };
                            if cfg_tick % cfg_every == 0 {
                                cfg = config::load();
                            }
                            if blackout {
                                // A fullscreen game/video owns the screen; both
                                // windows are hidden, so skip the monitor and
                                // work-area queries entirely this tick.
                                continue;
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

#[cfg(test)]
mod import_tests {
    use super::*;
    #[test]
    fn reviewed_import_rejects_changed_invalid_and_oversized_files() {
        let root = std::env::temp_dir().join(format!("booki-import-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("config.json");
        let name = path.to_string_lossy().to_string();
        let mut source = Config::default();
        fs::write(&path, serde_json::to_vec(&source).unwrap()).unwrap();
        let reviewed = read_import(&name).unwrap();
        assert!(read_reviewed_import(&name, Some(&reviewed)).is_ok());
        source.theme = "light".into();
        if source.theme == reviewed.theme {
            source.theme = "dark".into();
        }
        fs::write(&path, serde_json::to_vec(&source).unwrap()).unwrap();
        assert!(
            matches!(read_reviewed_import(&name, Some(&reviewed)), Err(error) if error == "BOOKI_IMPORT_CHANGED")
        );
        fs::write(&path, "{}").unwrap();
        assert!(matches!(read_import(&name), Err(error) if error == "BOOKI_IMPORT_INVALID"));
        fs::File::create(&path)
            .unwrap()
            .set_len(16 * 1024 * 1024 + 1)
            .unwrap();
        assert!(matches!(read_import(&name), Err(error) if error == "BOOKI_IMPORT_TOO_LARGE"));
        fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod directory_tests {
    use super::*;
    #[test]
    fn paging_sorts_before_slicing_and_reaches_entries_after_eighty() {
        let root = std::env::temp_dir().join(format!("booki-directory-{}", std::process::id()));
        fs::create_dir_all(root.join("Z folder")).unwrap();
        for i in (0..100).rev() {
            fs::write(root.join(format!("File {i:03}.txt")), b"").unwrap();
        }
        fs::write(root.join(".hidden"), b"").unwrap();
        let path = root.to_string_lossy().to_string();
        let first =
            tauri::async_runtime::block_on(list_dir(path.clone(), Some(0), Some(25), None, None))
                .unwrap();
        assert_eq!(first.len(), 25);
        assert_eq!(first[0].name, "Z folder");
        assert_eq!(first[1].name, "File 000.txt");
        let last =
            tauri::async_runtime::block_on(list_dir(path, Some(96), Some(25), None, None)).unwrap();
        assert_eq!(last.len(), 5);
        assert_eq!(last[0].name, "File 095.txt");
        assert_eq!(last[4].name, "File 099.txt");
        fs::remove_dir_all(root).unwrap();
    }
}
