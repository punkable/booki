//! The screen watcher: one background thread that tells the dock and the
//! notch what is in front. It emits `booki://occlusion` (working in another
//! app vs. on the desktop), `booki://fullscreen`, `booki://screen-busy`
//! (maximized or fullscreen), `booki://screen-full` (true fullscreen only),
//! `booki://notch-near` and the hover-edge reveal. The frontend decides what
//! to do with each signal. Windows only.

use super::*;

pub(crate) fn spawn(watch: tauri::WebviewWindow, handle: AppHandle) {
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
        let mut full = (false, false, 0u8);
        let mut near_last = false;
        let mut capture_last = false;
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
            let capturing = cfg_cache.capture_visible && win::foreground_is_capture();
            if capturing != capture_last {
                capture_last = capturing;
                let _ = handle.emit("booki://capture-session", capturing);
            }
            if tick % 10 == 0 {
                cfg_cache = config::load();
                // Some apps create their own topmost window after Booki
                // and can slide above the dock/notch. Re-assert topmost
                // status every few seconds so both stay reachable.
                // Never lift Booki over a fullscreen game or movie.
                let busy = FULLSCREEN_BLACKOUT.load(std::sync::atomic::Ordering::Relaxed)
                    || capturing
                    || win::is_fullscreen_on(self_hwnd);
                if cfg_cache.always_on_top && !busy && watch.is_visible().unwrap_or(false) {
                    if let Ok(h) = watch.hwnd() {
                        win::raise_topmost(h.0 as isize);
                    }
                }
                // Only while it is actually on screen. This used
                // to run unconditionally, so a hidden notch —
                // which is most of the time — still cost four
                // SetWindowPos calls every three seconds, waking
                // DWM for a window nobody could see.
                if let Some(notch) = handle.get_webview_window("notch") {
                    if !busy && notch.is_visible().unwrap_or(false) {
                        if let Ok(h) = notch.hwnd() {
                            win::raise_topmost(h.0 as isize);
                        }
                    }
                }
            }
            if let Some(v) = debounce(&mut desktop, win::desktop_foreground()) {
                let _ = handle.emit("booki://desktop", v);
            }
            // foreground_occludes = "the user is in an app". Smart
            // auto-hide and the smart notch both consume this.
            if cfg_cache.auto_hide_mode == "smart" && !capturing {
                let (dl, dt, dr, db) = *DOCK_HOME_RECT.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(v) = debounce(
                    &mut occ,
                    win::foreground_occludes(dl, dt, dr, db, self_hwnd),
                ) {
                    let _ = handle.emit("booki://occlusion", v);
                }
            }
            // fullscreen game / movie / presentation → get out of the way.
            // Smart notch also softens the dot while fullscreen.
            // Only the dock's hide-in-fullscreen acts on this
            // signal, so with it off the window scan is skipped.
            // Feeding `false` instead still sends the "fullscreen
            // ended" edge, so turning the option off mid-game
            // can't leave the dock blacked out.
            let fullscreen =
                cfg_cache.hide_in_fullscreen && !capturing && win::is_fullscreen_on(self_hwnd);
            if let Some(v) = debounce(&mut fs, fullscreen) {
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
                    let notch_hwnd = notch
                        .as_ref()
                        .and_then(|n| n.hwnd().ok())
                        .map(|h| h.0 as isize)
                        .unwrap_or(0);
                    if let Some(v) = debounce(&mut busy, win::foreground_maximized_on(notch_hwnd)) {
                        let _ = handle.emit("booki://screen-busy", v);
                    }
                    // Maximized only dims the notch; true
                    // fullscreen (game, movie) sends it away.
                    if let Some(v) = debounce(&mut full, win::is_fullscreen_on(notch_hwnd)) {
                        let _ = handle.emit("booki://screen-full", v);
                    }
                    let near = notch
                        .as_ref()
                        .and_then(|n| n.hwnd().ok())
                        .map(|h| {
                            let pad = (40.0 * n_scale(notch.as_ref())).round() as i32;
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
