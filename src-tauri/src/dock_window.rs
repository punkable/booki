//! The dock window: monitor choice, placement on an edge, hiding and revealing.

use super::*;

#[derive(serde::Serialize)]
pub(crate) struct MonitorInfo {
    pub(crate) index: i32,
    pub(crate) name: String,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) w: u32,
    pub(crate) h: u32,
    pub(crate) primary: bool,
}

/// List the available monitors so the user can choose where the dock lives.
#[tauri::command]
pub(crate) fn list_monitors(window: WebviewWindow) -> Vec<MonitorInfo> {
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
                    name: m
                        .name()
                        .cloned()
                        .unwrap_or_else(|| format!("Monitor {}", i + 1)),
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

/// Prefer the stable display name. Keep the preference while disconnected.
pub(crate) fn pick_monitor(window: &WebviewWindow) -> Option<tauri::Monitor> {
    let cfg = config::load();
    if let Ok(mons) = window.available_monitors() {
        if !cfg.monitor_name.is_empty() {
            if let Some(m) = mons
                .iter()
                .find(|m| m.name().is_some_and(|name| name == &cfg.monitor_name))
            {
                return Some(m.clone());
            }
            return window.primary_monitor().ok().flatten();
        }
        if cfg.monitor >= 0 {
            if let Some(m) = mons.into_iter().nth(cfg.monitor as usize) {
                return Some(m);
            }
        }
    }
    window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
}

/// Anchor a window to a screen edge of the chosen monitor.
/// Where a dock window of `ww`×`wh` px should sit for `edge` — shared by
/// position_dock (reposition only) and set_dock_frame (atomic resize+move).
pub(crate) fn dock_xy(
    window: &WebviewWindow,
    edge: &str,
    ww: i32,
    wh: i32,
) -> Result<(i32, i32), String> {
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
    let gap = cfg.edge_gap.min(96);
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

pub(crate) fn position_dock(window: &WebviewWindow, edge: &str) -> Result<(), String> {
    let wsize = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y) = dock_xy(window, edge, wsize.width as i32, wsize.height as i32)?;
    *DOCK_HOME_RECT.lock().unwrap() = (x, y, x + wsize.width as i32, y + wsize.height as i32);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Re-anchor the dock window to the given screen edge.
#[tauri::command]
pub(crate) fn reposition_dock(window: WebviewWindow, edge: String) -> Result<(), String> {
    position_dock(&window, &edge)
}

/// Resize the dock window to fit its content (plus magnify headroom) and
/// re-anchor it to the given edge. Called by the frontend after layout.
///
/// `hidden` tells us whether this frame is the small "notch" (auto-hidden) or
/// the full dock. We only record the full-size geometry as the occlusion
/// watcher's home rect, so smart-hide never measures the shrunken notch.
#[tauri::command]
pub(crate) fn set_dock_frame(
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

/// Grow the dock window to cover the whole work area so it can host the
/// edge-move overlay (the 4 anchor targets + ghost preview shown while the
/// user drags the bar to another edge). Returns the CSS size of the work area
/// so the frontend can lay the overlay out in logical pixels. Restored by the
/// usual applyFrame() path when the drag ends.
#[tauri::command]
pub(crate) fn dock_cover_workarea(window: WebviewWindow) -> Result<(f64, f64), String> {
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

/// The frontend reports which regions of the stage window are actually
/// interactive (the bar with its halo, an open flyout/menu/popover). The
/// cursor watcher consumes this to toggle click-through, so the big
/// transparent window never blocks clicks meant for the apps behind it.
#[tauri::command]
pub(crate) fn set_hit_rects(rects: Vec<(f64, f64, f64, f64)>, all: bool) {
    *HIT_RECTS.lock().unwrap() = (rects, all);
}

/// Hide the dock into the notch: show the small always-on, click-reliable notch
/// window and hide the (full-size) dock window. No resizing of the dock window,
/// so there's no WebView2 repaint race or erratic shrink.
#[tauri::command]
pub(crate) fn hide_dock(app: AppHandle, edge: String) {
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
pub(crate) fn reveal_dock(app: AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    let cfg = config::load();
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.hide();
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

pub(crate) fn lift_dock_window(dock: &tauri::WebviewWindow) {
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

/// Bring the already-running Booki's dock to the front (used when a second
/// instance is launched). Shows + focuses the dock window, hides the notch
/// (unless notch_always_visible is on), and tells the frontend to un-hide and
/// pin itself open.
pub(crate) fn reveal_running_dock(app: &AppHandle) {
    let cfg = config::load();
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = notch.hide();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
        let _ = dock.set_ignore_cursor_events(false);
        lift_dock_window(&dock);
    }
    let _ = app.emit("booki://reveal", ());
}

/// Set the dock's anchored edge (used when the user drags the notch to a screen
/// edge, or clicks a notch that lives on another edge). Persists, repositions
/// both windows, and tells the dock to re-read. The notch goes back to "auto"
/// (follow the dock): after an explicit move the two belong together again —
/// otherwise a stale explicit notch edge keeps tucking the dock toward a side
/// the user just moved away from.
#[tauri::command]
pub(crate) fn set_dock_edge(app: AppHandle, edge: String) {
    if config::patch(serde_json::json!({ "edge": edge, "notchEdge": "auto" })).is_err() {
        return;
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &edge);
    }
    if let Some(notch) = app.get_webview_window("notch") {
        let _ = position_notch(&notch, &edge);
    }
    let _ = app.emit("booki://config-changed", ());
}

/// The quick launcher's shortcut, so the global handler can tell it apart
/// from the show/hide toggle and the position keys.
pub(crate) static LAUNCHER_SHORTCUT: std::sync::Mutex<
    Option<tauri_plugin_global_shortcut::Shortcut>,
> = std::sync::Mutex::new(None);

/// Open the quick launcher: the dock frontend reveals itself and shows the
/// search box; the dock window takes keyboard focus so typing goes there.
pub(crate) fn show_launcher(app: &AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.set_focus();
    }
    let _ = app.emit("booki://launcher", ());
}

pub(crate) fn toggle_dock(app: &AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    // Let the dock frontend tuck/summon so hiddenState, polls, and the notch
    // stay in sync — bare show/hide left JS thinking the opposite of reality.
    let _ = app.emit("booki://toggle-dock", ());
}
