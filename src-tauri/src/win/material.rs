//! Native material behind the dock and the notch.
//!
//! A WebView2 window can be transparent, but CSS `backdrop-filter` inside it
//! only blurs the page's own content, never the desktop behind the window. So
//! Booki's "glass" used to be a flat translucent colour. This module gives each
//! surface a real one: small Win32 windows with Windows' acrylic blur, tinted,
//! placed exactly under the shapes the page reports (the bar, an open flyout,
//! a menu, the notch pill) and kept directly below their webview window.
//!
//! One material window per shape, each sized to that shape. An earlier
//! version used a single window the size of the whole stage and clipped it
//! with a region; acrylic ignores window regions, so it painted a tinted box
//! across the entire screen edge. Sizing each window to its shape means the
//! worst case is a square-cornered bar, never a giant box. Corners follow a region built from the four CSS corner radii.
//! System corner rounding and borders are disabled to avoid a second outline.
//!
//! The material windows never take input (`WM_NCHITTEST` → `HTTRANSPARENT`)
//! and never activate. Acrylic uses `SetWindowCompositionAttribute`, the call
//! the Windows 10 and 11 shells use for their own flyouts; it is undocumented,
//! so it is looked up at runtime and everything degrades to "no material".

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

use windows::core::{s, w};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Gdi::{
    CreatePolygonRgn, DeleteObject, SetWindowRgn, ALTERNATE, HGDIOBJ,
};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, GetWindowRect, IsWindow, IsWindowVisible, RegisterClassW,
    SetWindowPos, ShowWindow, HTTRANSPARENT, MA_NOACTIVATE, SWP_ASYNCWINDOWPOS, SWP_HIDEWINDOW,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, WM_MOUSEACTIVATE,
    WM_NCHITTEST, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

/// Most shapes one surface can show at once (bar + flyout + menu + popovers).
const MAX_PIECES: usize = 6;

/// One material window, placed under one shape.
struct Piece {
    hwnd: isize,
    /// Screen rect and four radii in physical px, to skip moves that change nothing.
    placed: Option<(i32, i32, i32, i32, [i32; 4])>,
    tint: u32,
}

/// Everything under one webview window (keyed by its label).
struct Surface {
    owner: isize,
    pieces: Vec<Piece>,
}

fn surfaces() -> &'static Mutex<HashMap<String, Surface>> {
    static S: OnceLock<Mutex<HashMap<String, Surface>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

fn create_window() -> Option<HWND> {
    static CLASS: OnceLock<bool> = OnceLock::new();
    unsafe {
        let instance = GetModuleHandleW(None).ok()?;
        let registered = *CLASS.get_or_init(|| {
            let class = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: instance.into(),
                lpszClassName: w!("BookiMaterial"),
                ..Default::default()
            };
            RegisterClassW(&class) != 0
        });
        if !registered {
            return None;
        }
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
            w!("BookiMaterial"),
            w!(""),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            instance,
            None,
        )
        .ok()?;
        // The CSS outline owns rounding; do not add the system
        // corner radius or a second DWM border.
        let pref = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const _ as *const c_void,
            std::mem::size_of_val(&pref) as u32,
        );
        let no_border = 0xfffffffe_u32;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &no_border as *const _ as *const c_void,
            4,
        );
        Some(hwnd)
    }
}

#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient: u32,
    animation: u32,
}

#[repr(C)]
struct CompositionData {
    attribute: u32,
    data: *mut c_void,
    size: usize,
}

type SetCompositionFn = unsafe extern "system" fn(HWND, *mut CompositionData) -> BOOL;

const WCA_ACCENT_POLICY: u32 = 19;
const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;

/// Tint is 0xAARRGGBB; the accent API wants 0xAABBGGRR.
fn apply_acrylic(hwnd: HWND, tint: u32) -> bool {
    unsafe {
        let Ok(user32) = GetModuleHandleW(w!("user32.dll")) else {
            return false;
        };
        let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) else {
            return false;
        };
        let set: SetCompositionFn = std::mem::transmute(proc);
        let (a, r, g, b) = (
            tint >> 24,
            (tint >> 16) & 0xff,
            (tint >> 8) & 0xff,
            tint & 0xff,
        );
        // Acrylic misbehaves with a fully transparent tint on Windows 10.
        let a = a.max(1);
        let mut policy = AccentPolicy {
            state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
            flags: 0,
            gradient: (a << 24) | (b << 16) | (g << 8) | r,
            animation: 0,
        };
        let mut data = CompositionData {
            attribute: WCA_ACCENT_POLICY,
            data: &mut policy as *mut _ as *mut c_void,
            size: std::mem::size_of::<AccentPolicy>(),
        };
        set(hwnd, &mut data).as_bool()
    }
}

fn hide(piece: &mut Piece) {
    piece.placed = None;
    unsafe {
        let _ = ShowWindow(HWND(piece.hwnd as *mut c_void), SW_HIDE);
    }
}

/// Show material under `owner` for each of `shapes` (`[x, y, w, h, tl, tr, br, bl]`
/// with four corner radii in CSS px relative to the owner window). An empty list hides it all. Call
/// on the thread that pumps window messages (main).
pub fn apply(
    owner: isize,
    key: &str,
    shapes: &[(f64, f64, f64, f64, f64, f64, f64, f64)],
    dpr: f64,
    tint: u32,
) -> bool {
    let mut map = surfaces().lock().unwrap();
    let surface = map.entry(key.to_string()).or_insert_with(|| Surface {
        owner,
        pieces: Vec::new(),
    });
    surface.owner = owner;
    let owner_hwnd = HWND(owner as *mut c_void);
    let visible =
        unsafe { IsWindow(owner_hwnd).as_bool() && IsWindowVisible(owner_hwnd).as_bool() };
    let mut origin = RECT::default();
    if !visible || unsafe { GetWindowRect(owner_hwnd, &mut origin) }.is_err() {
        surface.pieces.iter_mut().for_each(hide);
        return false;
    }
    let shapes = &shapes[..shapes.len().min(MAX_PIECES)];
    while surface.pieces.len() < shapes.len() {
        let Some(hwnd) = create_window() else {
            surface.pieces.iter_mut().for_each(hide);
            return false;
        };
        surface.pieces.push(Piece {
            hwnd: hwnd.0 as isize,
            placed: None,
            tint: 0,
        });
    }
    let px = |v: f64| (v * dpr).round() as i32;
    for (piece, &(x, y, w, h, tl, tr, br, bl)) in surface.pieces.iter_mut().zip(shapes) {
        let hwnd = HWND(piece.hwnd as *mut c_void);
        let (w, h) = (px(w).max(1), px(h).max(1));
        let r = [tl, tr, br, bl].map(|v| px(v).max(0));
        let rect = (origin.left + px(x), origin.top + px(y), w, h, r);
        if piece.tint != tint {
            if !apply_acrylic(hwnd, tint) {
                surface.pieces.iter_mut().for_each(hide);
                return false;
            }
            piece.tint = tint;
        }
        if piece.placed == Some(rect) {
            continue;
        }
        unsafe {
            if piece.placed.map(|p| (p.2, p.3, p.4)) != Some((w, h, r)) {
                let points = crate::surface_geometry::outline(w, h, r)
                    .into_iter()
                    .map(|(x, y)| POINT { x, y })
                    .collect::<Vec<_>>();
                let region = CreatePolygonRgn(&points, ALTERNATE);
                // The window owns the region after this call.
                if region.0.is_null() || SetWindowRgn(hwnd, region, true) == 0 {
                    let _ = DeleteObject(HGDIOBJ(region.0));
                    surface.pieces.iter_mut().for_each(hide);
                    return false;
                }
            }
            // Inserting "after" the owner puts the material directly below it.
            if SetWindowPos(
                hwnd,
                owner_hwnd,
                rect.0,
                rect.1,
                w,
                h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
            .is_err()
            {
                surface.pieces.iter_mut().for_each(hide);
                return false;
            }
        }
        piece.placed = Some(rect);
    }
    surface.pieces.iter_mut().skip(shapes.len()).for_each(hide);
    true
}

/// Hide any material whose owner is no longer visible, and keep the rest
/// directly under their owners. Called from the cursor watcher's loop, so a
/// window hidden by any path (fullscreen blackout, tray, tuck) never leaves a
/// blurred shape behind.
///
/// This runs on the watcher thread while the material windows belong to the
/// main thread. It must never wait on the main thread while holding the lock
/// (`apply()` takes that lock on the main thread — the first version did, and
/// the two deadlocked, freezing the dock). So it only reads under the lock,
/// and every window call is asynchronous.
pub fn sync() {
    let mut work: Vec<(isize, isize, bool)> = Vec::new();
    {
        let Ok(mut map) = surfaces().try_lock() else {
            return;
        };
        for surface in map.values_mut() {
            let owner = HWND(surface.owner as *mut c_void);
            let visible = unsafe { IsWindow(owner).as_bool() && IsWindowVisible(owner).as_bool() };
            for piece in surface.pieces.iter_mut().filter(|p| p.placed.is_some()) {
                if !visible {
                    piece.placed = None;
                }
                work.push((piece.hwnd, surface.owner, visible));
            }
        }
    }
    for (hwnd, owner, visible) in work {
        let flags = if visible {
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_ASYNCWINDOWPOS
        } else {
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_ASYNCWINDOWPOS | SWP_HIDEWINDOW
        };
        unsafe {
            let _ = SetWindowPos(
                HWND(hwnd as *mut c_void),
                HWND(owner as *mut c_void),
                0,
                0,
                0,
                0,
                flags,
            );
        }
    }
}
