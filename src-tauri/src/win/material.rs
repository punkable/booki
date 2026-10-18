//! Native material behind the dock and the notch.
//!
//! A WebView2 window can be transparent, but CSS `backdrop-filter` inside it
//! only blurs the page's own content, never the desktop behind the window. So
//! Booki's "glass" used to be a flat translucent colour. This module gives each
//! surface a real one: small Win32 windows with Windows' blur,
//! placed exactly under the shapes the page reports (the bar, an open flyout,
//! a menu, the notch pill) and kept directly below their webview window.
//!
//! One material window per shape, each sized to that shape. An earlier
//! version used a single window the size of the whole stage and clipped it
//! with a region; the blur ignores window regions, so it painted a tinted box
//! across the entire screen edge.
//!
//! On Windows 11 each window is the system's acrylic backdrop drawn through
//! Windows.UI.Composition: a host backdrop brush (the desktop behind the
//! window, already blurred by DWM) clipped to the shape's rounded corners. It
//! fills the shape exactly, edge to edge, so there is no flat rim around a
//! blurred rectangle. Older systems keep the blur-behind window, which
//! ignores the window region too, so it is inset from the rounded corners
//! (`surface_geometry::blur_insets`) and the CSS fill covers the edge.
//! System corner rounding and borders are disabled to avoid a second outline.
//!
//! The material windows never take input (`WM_NCHITTEST` → `HTTRANSPARENT`)
//! and never activate. The blur-behind fallback uses
//! `SetWindowCompositionAttribute`, the call the Windows 10 shell uses for its
//! own flyouts; it is undocumented, so it is looked up at runtime and
//! everything degrades to "no material".

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};

use windows::core::Interface;
use windows::System::{DispatcherQueue, DispatcherQueueController};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DispatcherQueueOptions, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
};
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{CompositionRoundedRectangleGeometry, Compositor, SpriteVisual};
use windows_numerics::Vector2;

use windows::core::BOOL;
use windows::core::{s, w};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_USE_HOSTBACKDROPBRUSH,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Gdi::{
    CreatePolygonRgn, DeleteObject, SetWindowRgn, ALTERNATE, HGDIOBJ,
};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindow, GetWindowRect, IsWindow,
    IsWindowVisible, RegisterClassW, SetWindowPos, ShowWindow, GW_HWNDPREV, HTTRANSPARENT,
    MA_NOACTIVATE, SWP_ASYNCWINDOWPOS, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SW_HIDE, WM_MOUSEACTIVATE, WM_NCHITTEST, WNDCLASSW, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

/// Most shapes one surface can show at once (bar + flyout + menu + popovers).
const MAX_PIECES: usize = 6;

/// One material window, placed under one shape.
struct Piece {
    hwnd: isize,
    /// Screen rect and four radii in physical px, to skip moves that change nothing.
    placed: Option<(i32, i32, i32, i32, [i32; 4])>,
    blurred: bool,
    /// Drawn by the composition backdrop (Windows 11) rather than blur-behind.
    composed: bool,
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

fn create_window(composed: bool) -> Option<HWND> {
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
        // A composition window draws only its visual tree: without the
        // redirection bitmap everything outside the clipped backdrop is clear.
        let extra = if composed {
            WS_EX_NOREDIRECTIONBITMAP
        } else {
            Default::default()
        };
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST | extra,
            w!("BookiMaterial"),
            w!(""),
            WS_POPUP,
            0,
            0,
            1,
            1,
            None,
            None,
            Some(instance.into()),
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
const ACCENT_ENABLE_BLURBEHIND: u32 = 3;

/// Blur only: CSS owns the fill and outline, so no tinted acrylic box can
/// disagree with the rounded webview surface.
fn apply_blur(hwnd: HWND) -> bool {
    unsafe {
        let Ok(user32) = GetModuleHandleW(w!("user32.dll")) else {
            return false;
        };
        let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) else {
            return false;
        };
        let set: SetCompositionFn = std::mem::transmute(proc);
        let mut policy = AccentPolicy {
            state: ACCENT_ENABLE_BLURBEHIND,
            flags: 0,
            gradient: 0,
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

/// The composition side of a piece: its window target (which must outlive
/// the visual), the backdrop visual and the rounded clip it is cut to.
struct Backdrop {
    _target: DesktopWindowTarget,
    visual: SpriteVisual,
    clip: CompositionRoundedRectangleGeometry,
}

#[derive(Default)]
struct Composition {
    compositor: Option<Compositor>,
    _queue: Option<DispatcherQueueController>,
    /// Set once anything in the composition path failed; everything then
    /// stays on blur-behind for the rest of the session.
    unavailable: bool,
    backdrops: HashMap<isize, Backdrop>,
}

// Composition objects belong to the thread that created the compositor, the
// main thread that also calls `apply()`. They never cross to the watcher.
thread_local! {
    static COMPOSITION: RefCell<Composition> = RefCell::new(Composition::default());
}

fn compositor(state: &mut Composition) -> Option<Compositor> {
    if state.unavailable {
        return None;
    }
    if state.compositor.is_none() {
        let made = (|| -> windows::core::Result<Compositor> {
            // A compositor needs a dispatcher queue on its thread; the main
            // thread's message loop pumps it.
            if DispatcherQueue::GetForCurrentThread().is_err() {
                let options = DispatcherQueueOptions {
                    dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                    threadType: DQTYPE_THREAD_CURRENT,
                    apartmentType: DQTAT_COM_NONE,
                };
                state._queue = Some(unsafe { CreateDispatcherQueueController(options)? });
            }
            Compositor::new()
        })();
        match made {
            Ok(compositor) => state.compositor = Some(compositor),
            Err(error) => {
                log::warn!("material: no compositor ({error}); using blur");
                state.unavailable = true;
                return None;
            }
        }
    }
    state.compositor.clone()
}

/// Is the rounded acrylic backdrop available? Windows 11 only: the host
/// backdrop attribute is refused on Windows 10.
fn composition_available() -> bool {
    COMPOSITION.with(|cell| compositor(&mut cell.borrow_mut()).is_some())
}

fn give_up_composition() {
    COMPOSITION.with(|cell| cell.borrow_mut().unavailable = true);
}

/// Hook a fresh composition window up to the host backdrop.
fn attach_backdrop(hwnd: HWND) -> bool {
    let on = BOOL(1);
    let allowed = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_HOSTBACKDROPBRUSH,
            &on as *const _ as *const c_void,
            std::mem::size_of::<BOOL>() as u32,
        )
    };
    if allowed.is_err() {
        return false;
    }
    COMPOSITION.with(|cell| {
        let mut state = cell.borrow_mut();
        let Some(compositor) = compositor(&mut state) else {
            return false;
        };
        let made = (|| -> windows::core::Result<Backdrop> {
            let interop: ICompositorDesktopInterop = compositor.cast()?;
            let target = unsafe { interop.CreateDesktopWindowTarget(hwnd, true)? };
            let visual = compositor.CreateSpriteVisual()?;
            visual.SetBrush(&compositor.CreateHostBackdropBrush()?)?;
            let clip = compositor.CreateRoundedRectangleGeometry()?;
            visual.SetClip(&compositor.CreateGeometricClipWithGeometry(&clip)?)?;
            target.SetRoot(&visual)?;
            Ok(Backdrop {
                _target: target,
                visual,
                clip,
            })
        })();
        match made {
            Ok(backdrop) => {
                state.backdrops.insert(hwnd.0 as isize, backdrop);
                true
            }
            Err(error) => {
                log::warn!("material: backdrop failed ({error}); using blur");
                false
            }
        }
    })
}

/// Size the backdrop to its window and cut it to the shape's corners.
fn shape_backdrop(hwnd: HWND, w: i32, h: i32, radii: [i32; 4]) -> bool {
    COMPOSITION.with(|cell| {
        let state = cell.borrow();
        let Some(backdrop) = state.backdrops.get(&(hwnd.0 as isize)) else {
            return false;
        };
        let (x, y, cw, ch, r) = crate::surface_geometry::backdrop_clip(w, h, radii);
        let v = |x: f32, y: f32| Vector2 { X: x, Y: y };
        backdrop.visual.SetSize(v(w as f32, h as f32)).is_ok()
            && backdrop.clip.SetOffset(v(x, y)).is_ok()
            && backdrop.clip.SetSize(v(cw, ch)).is_ok()
            && backdrop.clip.SetCornerRadius(v(r, r)).is_ok()
    })
}

fn hide(piece: &mut Piece) {
    piece.placed = None;
    unsafe {
        let _ = ShowWindow(HWND(piece.hwnd as *mut c_void), SW_HIDE);
    }
}

/// A material window: the rounded acrylic backdrop where Windows offers it,
/// blur-behind otherwise.
fn new_piece() -> Option<Piece> {
    if composition_available() {
        if let Some(hwnd) = create_window(true) {
            if attach_backdrop(hwnd) {
                return Some(Piece {
                    hwnd: hwnd.0 as isize,
                    placed: None,
                    blurred: false,
                    composed: true,
                });
            }
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
        }
        give_up_composition();
    }
    let hwnd = create_window(false)?;
    Some(Piece {
        hwnd: hwnd.0 as isize,
        placed: None,
        blurred: false,
        composed: false,
    })
}

/// Show material under `owner` for each of `shapes` (`[x, y, w, h, tl, tr, br, bl]`
/// with four corner radii in CSS px relative to the owner window). An empty list hides it all. Call
/// on the thread that pumps window messages (main).
pub fn apply(
    owner: isize,
    key: &str,
    shapes: &[crate::surface_geometry::MaterialShape],
    dpr: f64,
) -> bool {
    let mut map = surfaces().lock().unwrap();
    let surface = map.entry(key.to_string()).or_insert_with(|| Surface {
        owner,
        pieces: Vec::new(),
    });
    surface.owner = owner;
    let owner_hwnd = HWND(owner as *mut c_void);
    let visible =
        unsafe { IsWindow(Some(owner_hwnd)).as_bool() && IsWindowVisible(owner_hwnd).as_bool() };
    let mut origin = RECT::default();
    if !visible || unsafe { GetWindowRect(owner_hwnd, &mut origin) }.is_err() {
        surface.pieces.iter_mut().for_each(hide);
        return false;
    }
    let shapes = &shapes[..shapes.len().min(MAX_PIECES)];
    while surface.pieces.len() < shapes.len() {
        let Some(piece) = new_piece() else {
            surface.pieces.iter_mut().for_each(hide);
            return false;
        };
        surface.pieces.push(piece);
    }
    let px = |v: f64| (v * dpr).round() as i32;
    for (piece, &(x, y, w, h, tl, tr, br, bl)) in surface.pieces.iter_mut().zip(shapes) {
        let hwnd = HWND(piece.hwnd as *mut c_void);
        let (x, y, w, h) = crate::surface_geometry::physical_bounds(x, y, w, h, dpr);
        let radii = [tl, tr, br, bl].map(|v| px(v).max(0));
        // The composition backdrop is cut to the exact shape. Blur-behind
        // ignores the region below, so keep its square corners inside the
        // rounded shape; the CSS fill still covers the edge.
        let [il, it, ir, ib] = if piece.composed {
            [0; 4]
        } else {
            crate::surface_geometry::blur_insets(w, h, radii)
        };
        let (x, y, w, h) = (x + il, y + it, w - il - ir, h - it - ib);
        if w <= 0 || h <= 0 {
            // Too small to hold a blur once inset: leave this piece out.
            continue;
        }
        let r = [
            radii[0] - il.max(it),
            radii[1] - ir.max(it),
            radii[2] - ir.max(ib),
            radii[3] - il.max(ib),
        ]
        .map(|v| v.max(0));
        let rect = (origin.left + x, origin.top + y, w, h, r);
        // Color/opacity are CSS-only; do not reset the compositor effect
        // on every tint or opacity edit.
        if !piece.blurred && !piece.composed {
            if !apply_blur(hwnd) {
                surface.pieces.iter_mut().for_each(hide);
                return false;
            }
            piece.blurred = true;
        }
        if piece.placed == Some(rect) && unsafe { IsWindowVisible(hwnd).as_bool() } {
            continue;
        }
        unsafe {
            if piece.composed {
                if piece.placed.map(|p| (p.2, p.3, p.4)) != Some((w, h, r))
                    && !shape_backdrop(hwnd, w, h, r)
                {
                    surface.pieces.iter_mut().for_each(hide);
                    return false;
                }
            } else if piece.placed.map(|p| (p.2, p.3, p.4)) != Some((w, h, r)) {
                let points = crate::surface_geometry::outline(w, h, r)
                    .into_iter()
                    .map(|(x, y)| POINT { x, y })
                    .collect::<Vec<_>>();
                let region = CreatePolygonRgn(&points, ALTERNATE);
                // The window owns the region after this call.
                if region.0.is_null() || SetWindowRgn(hwnd, Some(region), true) == 0 {
                    let _ = DeleteObject(HGDIOBJ(region.0));
                    surface.pieces.iter_mut().for_each(hide);
                    return false;
                }
            }
            // Inserting "after" the owner puts the material directly below it.
            if SetWindowPos(
                hwnd,
                Some(owner_hwnd),
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
            let visible =
                unsafe { IsWindow(Some(owner)).as_bool() && IsWindowVisible(owner).as_bool() };
            // apply() inserts each piece below the owner, leaving the last
            // piece closest to it. Preserve that order instead of making all
            // pieces fight for the same Z position on every watcher tick.
            let mut predecessor = surface.owner;
            for piece in surface
                .pieces
                .iter_mut()
                .rev()
                .filter(|p| p.placed.is_some())
            {
                // Owner visibility is temporary; retain geometry so showing
                // the owner can restore the material without a new JS report.
                // Explicit hide()/empty reports still clear placed entirely.
                work.push((piece.hwnd, predecessor, visible));
                predecessor = piece.hwnd;
            }
        }
    }
    for (hwnd, predecessor, visible) in work {
        let window = HWND(hwnd as *mut c_void);
        let after = HWND(predecessor as *mut c_void);
        // Repeated asynchronous SetWindowPos calls wake the compositor even
        // at rest. Repair only a real order change (for example after another
        // topmost window appeared); an already correct stack needs no write.
        let shown = unsafe { IsWindowVisible(window).as_bool() };
        if visible && shown && unsafe { GetWindow(window, GW_HWNDPREV).ok() } == Some(after) {
            continue;
        }
        if !visible && !shown {
            continue;
        }
        let flags = if visible {
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_ASYNCWINDOWPOS | SWP_SHOWWINDOW
        } else {
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_ASYNCWINDOWPOS | SWP_HIDEWINDOW
        };
        unsafe {
            let _ = SetWindowPos(window, Some(after), 0, 0, 0, 0, flags);
        }
    }
}
