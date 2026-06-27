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
use std::sync::Mutex;

/// The dock's anchored "home" rectangle (left, top, right, bottom) while it is
/// shown at full size. The smart-hide occlusion watcher measures against THIS
/// stable rect — never the live window rect — otherwise hiding shrinks the
/// window, which stops it being occluded, which shows it again… an infinite
/// flapping loop. Updated only when the dock is shown (not while hidden).
static DOCK_HOME: Mutex<Option<(i32, i32, i32, i32)>> = Mutex::new(None);

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

    if !hidden.unwrap_or(false) {
        if let (Ok(p), Ok(s)) = (window.outer_position(), window.outer_size()) {
            *DOCK_HOME.lock().unwrap() = Some((
                p.x,
                p.y,
                p.x + s.width as i32,
                p.y + s.height as i32,
            ));
        }
    }
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

#[tauri::command]
fn open_settings(app: AppHandle) {
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

/// Material strength is now applied entirely in CSS (the dock bar's `--material`
/// alpha), driven live from the config. We deliberately do NOT apply native
/// vibrancy to the dock window: vibrancy tints the whole window rectangle, and
/// because the dock window is sized larger than the bar (magnify headroom), that
/// showed up as a gray box behind the dock that resized with the zoom. Kept as a
/// no-op command for frontend compatibility.
#[tauri::command]
fn set_material(_window: WebviewWindow, _strength: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
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
#[tauri::command]
fn list_installed_apps() -> Vec<DirItem> {
    #[cfg(windows)]
    {
        use std::collections::HashSet;
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
        let mut out: Vec<DirItem> = Vec::new();
        for root in roots {
            scan_lnks(&root, &mut out, &mut seen, 0);
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out.truncate(400);
        out
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn scan_lnks(
    dir: &std::path::Path,
    out: &mut Vec<DirItem>,
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
            scan_lnks(&p, out, seen, depth + 1);
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
        // Skip uninstallers / docs that aren't really "apps".
        if lower.contains("uninstall") || lower.contains("readme") {
            continue;
        }
        if seen.insert(lower) {
            out.push(DirItem {
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
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if !accelerator.trim().is_empty() {
        gs.register(accelerator.as_str())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Booki — Ajustes")
        .inner_size(760.0, 800.0)
        .min_inner_size(560.0, 560.0)
        .resizable(true)
        .center()
        .transparent(true)
        .decorations(true)
        .build();
    #[cfg(windows)]
    if let Ok(w) = &built {
        // Windows 11 system material (Mica) for the settings window, so the
        // floating acrylic sidebar reads as a layer above it.
        let _ = window_vibrancy::apply_mica(w, None)
            .or_else(|_| window_vibrancy::apply_acrylic(w, Some((22, 22, 24, 180))));

        // Defeat the WebView2 transparent-window initial-size race: on first
        // paint the webview can come up smaller than the window (content looks
        // "cropped" until the user manually resizes). Nudge the size a couple of
        // times so WebView2 re-lays-out to fill the client area.
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
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        toggle_dock(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
            image_data_uri,
            set_always_on_top,
            app_version,
            reset_config,
            open_settings,
            open_location,
            set_hotkey,
            list_monitors,
            set_material,
            set_autostart,
            get_autostart,
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

            // Position and reveal the dock.
            if let Some(dock) = app.get_webview_window("dock") {
                // NOTE: we intentionally do NOT apply native Acrylic/Mica to the
                // dock window. Vibrancy tints the entire window rectangle, but the
                // dock window is sized larger than the visible bar (to give the
                // magnify-on-hover room to overflow), so the material showed up as
                // a gray box behind the dock that grew/shrank with the zoom. The
                // bar's frosted material is done entirely in CSS instead, so only
                // the rounded bar is ever visible. The window stays transparent.
                let cfg = config::load();
                let _ = position_dock(&dock, &cfg.edge);
                let _ = dock.set_always_on_top(cfg.always_on_top);
                let _ = dock.show();

                // Register the global hotkey, if configured.
                if !cfg.hotkey.trim().is_empty() {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    let _ = app.global_shortcut().register(cfg.hotkey.as_str());
                }

                // Smart auto-hide watcher: emit `booki://occlusion` when the
                // foreground window covers the dock area. The frontend decides
                // whether to act (only in "smart" mode). Windows-only.
                #[cfg(windows)]
                {
                    let watch = dock.clone();
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        let self_hwnd = watch.hwnd().map(|h| h.0 as isize).unwrap_or(0);
                        let mut last = false;
                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(350));
                            // Measure occlusion against the STABLE home rect, not
                            // the live window (which shrinks to a notch when hidden
                            // — measuring that would cause infinite hide/show
                            // flapping).
                            let home = *DOCK_HOME.lock().unwrap();
                            let occ = match home {
                                Some((l, t, r, b)) => {
                                    win::foreground_occludes(l, t, r, b, self_hwnd)
                                }
                                None => false,
                            };
                            if occ != last {
                                last = occ;
                                let _ = handle.emit("booki://occlusion", occ);
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
