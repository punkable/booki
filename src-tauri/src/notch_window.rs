//! The notch window: placement on the screen edge, toasts and previews.

use super::*;

/// Generation counter for the notch preview: each preview bumps it, and only the
/// timer holding the LATEST generation hides the notch again (rapid style
/// changes in settings keep the preview alive instead of blinking it away).
pub(crate) static NOTCH_PREVIEW_GEN: AtomicU64 = AtomicU64::new(0);

/// Offset a window of size `win` along an edge that spans `[start, start+span)`,
/// honoring the chosen along-edge slot ("start" | "center" | "end"). The result
/// is clamped on-screen without panicking when the span is tiny. Shared by the
/// notch and the dock so they land aligned (the dock stays "parallel" to the notch).
pub(crate) fn along_offset(start: i32, span: i32, win: i32, position: &str) -> i32 {
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

/// Padding around the floating pill inside its window (`body.notch-body.floating`).
const FLOATING_PAD: u32 = 6;

/// Place the small notch window centered on the dock's anchored edge.
pub(crate) fn position_notch(notch: &WebviewWindow, edge: &str) -> Result<(), String> {
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

    // The notch always lives on the dock's edge.
    let vertical = edge == "left" || edge == "right";
    let attached = !notch_floating(&cfg);

    // Window sized just large enough for the painted pill + a small hover/glow
    // pad. Transparent padding must stay click-through via NOTCH_HIT_RECTS —
    // never rely on CSS pointer-events alone (WebView2 still eats OS hits).
    let (lw, lh): (f64, f64) = if vertical {
        if attached {
            (28.0, 140.0)
        } else {
            (40.0, 156.0)
        }
    } else {
        // Horizontal tabs open into a live card on hover (notch.js), so the
        // window holds the card's size. Only the painted pill takes clicks.
        if attached {
            (320.0, 60.0)
        } else {
            (320.0, 68.0)
        }
    };
    let ww = (lw * dpr).round() as i32;
    let wh = (lh * dpr).round() as i32;
    let _ = notch.set_size(PhysicalSize::new(ww as u32, wh as u32));

    // Attached: flush to the work-area edge (iPhone tab).
    // Floating / smart: sit at the user's edge gap (0 = glued). When the dock
    // is also visible (always-visible notch), the dock stacks inward via
    // notch_stack_depth_css — the notch keeps the outer slot so they don't collide.
    // The floating pill sits 6 px inside its window (notch CSS padding), and
    // the dock bar sits exactly edge_gap from the edge: take that padding off
    // so the pill's outer edge lines up with the dock's instead of floating
    // above it.
    let margin: i32 = if attached {
        0
    } else {
        ((cfg.edge_gap.min(96).saturating_sub(FLOATING_PAD) as f64) * dpr).round() as i32
    };

    let along = |start: i32, span: i32, win: i32| {
        along_offset(start, span, win, cfg.notch_position.as_str())
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

/// Briefly show a calm status chip on the notch (fullscreen hide notice).
/// `detail` is optional secondary line; empty keeps a single-line toast.
#[tauri::command]
pub(crate) fn notch_toast(app: AppHandle, title: String, detail: Option<String>) {
    // Treat toast as the start of a fullscreen blackout so tray/hover cannot
    // resurrect the dock over the game while the chip is still showing.
    FULLSCREEN_BLACKOUT.store(true, Ordering::Relaxed);
    // The toast replaces the bar — hide the dock window while it shows.
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
    show_toast_frame(&app, title, detail, None, Vec::new());
}

/// A short notice (download finished, battery low) on the notch while the
/// dock is tucked away. Unlike `notch_toast` it never hides the dock or
/// starts a fullscreen blackout, and the notch returns to its own shape
/// after a few seconds. Returns false when the dock is out: the dock then
/// shows the notice itself.
#[tauri::command]
pub(crate) fn notch_notice(
    app: AppHandle,
    title: String,
    detail: Option<String>,
    action_id: Option<String>,
    action_labels: Option<Vec<String>>,
) -> bool {
    let dock_out = app
        .get_webview_window("dock")
        .map(|d| d.is_visible().unwrap_or(false))
        .unwrap_or(false);
    if dock_out {
        return false;
    }
    // Nothing over a fullscreen game; the notice is simply skipped.
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return true;
    }
    static NOTICE_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let generation = NOTICE_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    let was_visible = app
        .get_webview_window("notch")
        .map(|n| n.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let labels: Vec<String> = action_labels
        .unwrap_or_default()
        .into_iter()
        .take(3)
        .map(|label| label.chars().take(80).collect())
        .collect();
    let actionable = action_id
        .as_ref()
        .is_some_and(|id| !id.is_empty() && id.len() <= 128)
        && !labels.is_empty();
    show_toast_frame(
        &app,
        title,
        detail,
        if actionable { action_id } else { None },
        if actionable { labels } else { Vec::new() },
    );
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(if actionable {
            10000
        } else {
            3600
        }));
        // A newer notice or a fullscreen toast owns the notch now.
        if NOTICE_GEN.load(Ordering::Relaxed) != generation
            || FULLSCREEN_BLACKOUT.load(Ordering::Relaxed)
        {
            return;
        }
        if let Some(notch) = app.get_webview_window("notch") {
            let _ = position_notch(&notch, &config::load().edge);
            if !was_visible {
                let _ = notch.hide();
            }
        }
    });
    true
}

fn show_toast_frame(
    app: &AppHandle,
    title: String,
    detail: Option<String>,
    action_id: Option<String>,
    actions: Vec<String>,
) {
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
            let desired_w = if actions.is_empty() {
                ((chars as f64 * 7.2) + 48.0).clamp(128.0, 320.0)
            } else {
                440.0
            };
            let max_w = ((aw - m * 2).max(240) as f64 / dpr).max(240.0);
            let ww = (desired_w.min(max_w) * dpr).round() as i32;
            let two_line = detail.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
            let wh = ((if !actions.is_empty() {
                100.0
            } else if two_line {
                56.0
            } else {
                44.0
            }) * dpr)
                .round() as i32;
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
                "actionId": action_id,
                "actions": actions,
            }),
        );
    }
}

/// Ask the notch toast to fade out before the dock blackout hides the window.
#[tauri::command]
pub(crate) fn notch_toast_dismiss(app: AppHandle) {
    let _ = app.emit("booki://notch-toast-out", ());
}

/// Briefly show the notch while the user is tweaking its style/position in
/// settings — normally it only appears when the dock is tucked away, so there'd
/// be nothing to look at. Repeated calls extend the preview; it hides again a
/// few seconds after the LAST change (unless the dock is actually hidden, in
/// which case the notch is legitimately on duty and stays).
#[tauri::command]
pub(crate) fn notch_preview(app: AppHandle) {
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

/// Only the attached tab sits flush with the edge; the floating pill and the
/// smart dot share the inset placement and window size.
pub(crate) fn notch_floating(cfg: &Config) -> bool {
    cfg.notch_mode != "attached"
}

/// Fired by the notch window when the user clicks it: just signal the dock to
/// reveal+pin itself (the dock owns the hide/show state and calls reveal_dock).
#[tauri::command]
pub(crate) fn notch_reveal(app: AppHandle) {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return;
    }
    let cfg = config::load();
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = position_dock(&dock, &cfg.edge);
        let _ = dock.set_ignore_cursor_events(false);
        lift_dock_window(&dock);
    }
    crate::dock_window::schedule_notch_handoff(&app);
    let _ = app.emit("booki://reveal", ());
}

/// Right-click on the notch: bring the dock back so it can open its own menu
/// there. False while a fullscreen app owns the screen and the dock must
/// stay away; the notch then shows its small native menu instead.
#[tauri::command]
pub(crate) fn notch_reveal_for_menu(app: AppHandle) -> bool {
    if FULLSCREEN_BLACKOUT.load(Ordering::Relaxed) {
        return false;
    }
    notch_reveal(app);
    true
}

/// Is an app owning the screen right now (maximized or fullscreen)? Asked by
/// the notch each time it is shown, so it can start out of the way instead of
/// waiting for the next change event from the watcher.
#[tauri::command]
pub(crate) fn notch_screen_busy(app: AppHandle) -> bool {
    #[cfg(windows)]
    let notch = app
        .get_webview_window("notch")
        .and_then(|n| n.hwnd().ok())
        .map(|h| h.0 as isize)
        .unwrap_or(0);
    #[cfg(not(windows))]
    let notch = {
        let _ = &app;
        0
    };
    win::foreground_maximized_on(notch) || win::is_fullscreen_on(notch)
}

/// Interactive regions of the notch window (window-relative CSS px). Same
/// click-through contract as `set_hit_rects`, scoped to the notch.
#[tauri::command]
pub(crate) fn set_notch_hit_rects(rects: Vec<(f64, f64, f64, f64)>, all: bool) {
    *NOTCH_HIT_RECTS.lock().unwrap() = (rects, all);
}
