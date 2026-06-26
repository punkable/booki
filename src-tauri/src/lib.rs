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
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use config::Config;

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
#[tauri::command]
fn set_dock_frame(
    window: WebviewWindow,
    edge: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    // Floor at a few px so the thin auto-hide reveal strip is preserved.
    let w = width.max(8);
    let h = height.max(8);
    window
        .set_size(PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    position_dock(&window, &edge)
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

/// Anchor a window to a screen edge of its current monitor.
fn position_dock(window: &WebviewWindow, edge: &str) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor found".to_string())?;
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
        .inner_size(580.0, 700.0)
        .min_inner_size(480.0, 520.0)
        .resizable(true)
        .transparent(true)
        .decorations(true)
        .build();
    #[cfg(windows)]
    if let Ok(w) = built {
        // Windows 11 system material for the settings window.
        let _ = window_vibrancy::apply_mica(&w, None)
            .or_else(|_| window_vibrancy::apply_acrylic(&w, Some((22, 22, 24, 180))));
    }
    #[cfg(not(windows))]
    let _ = built;
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
                // Windows 11 Acrylic material (frosted, translucent).
                #[cfg(windows)]
                {
                    let _ = window_vibrancy::apply_acrylic(&dock, Some((22, 22, 24, 160)));
                }
                let cfg = config::load();
                let _ = position_dock(&dock, &cfg.edge);
                let _ = dock.set_always_on_top(cfg.always_on_top);
                let _ = dock.show();

                // Register the global hotkey, if configured.
                if !cfg.hotkey.trim().is_empty() {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    let _ = app.global_shortcut().register(cfg.hotkey.as_str());
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Booki dock");
}
