//! Booki Dock — Tauri backend.
//!
//! Owns the frameless always-on-top dock window, the system-tray icon, config
//! persistence, app launching and (on Windows) native window management.

mod apps;
mod config;
mod util;
mod win;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
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
fn open_settings(app: AppHandle) {
    open_settings_window(&app);
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
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

    let margin: i32 = 12;
    let mw = msize.width as i32;
    let mh = msize.height as i32;
    let ww = wsize.width as i32;
    let wh = wsize.height as i32;

    let (x, y) = match edge {
        "top" => (mpos.x + (mw - ww) / 2, mpos.y + margin),
        "left" => (mpos.x + margin, mpos.y + (mh - wh) / 2),
        "right" => (mpos.x + mw - ww - margin, mpos.y + (mh - wh) / 2),
        // default: bottom
        _ => (mpos.x + (mw - ww) / 2, mpos.y + mh - wh - margin),
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
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Booki — Ajustes")
        .inner_size(560.0, 660.0)
        .min_inner_size(460.0, 480.0)
        .resizable(true)
        .build();
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
            open_settings,
            quit,
        ])
        .setup(|app| {
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
                .build(app)?;

            // Position and reveal the dock.
            if let Some(dock) = app.get_webview_window("dock") {
                let cfg = config::load();
                let _ = position_dock(&dock, &cfg.edge);
                let _ = dock.set_always_on_top(cfg.always_on_top);
                let _ = dock.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Booki dock");
}
