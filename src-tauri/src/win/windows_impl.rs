//! Native Windows integration: extracting app icons and enumerating /
//! activating top-level windows. Implemented with the official `windows` crate
//! (Win32 bindings). Validated to compile against `x86_64-pc-windows-msvc`.

use std::ffi::c_void;

use base64::Engine;
use windows::core::{Interface, PCWSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetMonitorInfoW, GetObjectW,
    MonitorFromPoint, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC,
    HGDIOBJ, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, EnumWindows, GetClassNameW, GetForegroundWindow, GetIconInfo, GetWindow,
    GetWindowLongW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, HICON,
    ICONINFO, SW_RESTORE, WS_EX_TOOLWINDOW,
};

use super::WindowInfo;

// ──────────────────────────── App icons ────────────────────────────

/// Extract the large icon for a file/exe and return it as a base64 PNG data URI.
pub fn app_icon_data_uri(path: &str) -> Option<String> {
    let png = unsafe { extract_icon_png(path) }?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(png);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Resolve a .lnk shortcut to its target path (so we can read the target's icon
/// instead of the shell's shortcut icon, which carries the overlay arrow badge).
unsafe fn resolve_shortcut_target(path: &str) -> Option<String> {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
    let pf: IPersistFile = link.cast().ok()?;
    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    pf.Load(PCWSTR(wide.as_ptr()), STGM_READ).ok()?;
    let mut buf = [0u16; 260];
    let mut fd = WIN32_FIND_DATAW::default();
    link.GetPath(&mut buf, &mut fd, 0u32).ok()?;
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    if end == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..end]))
}

unsafe fn extract_icon_png(path: &str) -> Option<Vec<u8>> {
    // For .lnk shortcuts, read the TARGET's icon so the shell's shortcut-arrow
    // overlay badge doesn't appear on the dock tile.
    let mut target = path.to_string();
    if path.to_ascii_lowercase().ends_with(".lnk") {
        if let Some(t) = resolve_shortcut_target(path) {
            if !t.is_empty() {
                target = t;
            }
        }
    }
    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHFILEINFOW::default();
    // Read the real icon of the file/exe/shortcut/folder on disk (no
    // USEFILEATTRIBUTES) so custom executable icons come through.
    let res = SHGetFileInfoW(
        PCWSTR(wide.as_ptr()),
        FILE_FLAGS_AND_ATTRIBUTES(0),
        Some(&mut info),
        std::mem::size_of::<SHFILEINFOW>() as u32,
        SHGFI_ICON | SHGFI_LARGEICON,
    );
    if res == 0 || info.hIcon.is_invalid() {
        return None;
    }
    let out = hicon_to_png(info.hIcon);
    let _ = DestroyIcon(info.hIcon);
    out
}

unsafe fn hicon_to_png(hicon: HICON) -> Option<Vec<u8>> {
    let mut ii = ICONINFO::default();
    GetIconInfo(hicon, &mut ii).ok()?;
    let color: HBITMAP = ii.hbmColor;
    let mask: HBITMAP = ii.hbmMask;

    let cleanup = || unsafe {
        let _ = DeleteObject(HGDIOBJ(color.0));
        let _ = DeleteObject(HGDIOBJ(mask.0));
    };

    let mut bm = BITMAP::default();
    let got = GetObjectW(
        HGDIOBJ(color.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut c_void),
    );
    if got == 0 {
        cleanup();
        return None;
    }
    let width = bm.bmWidth;
    let height = bm.bmHeight;
    if width <= 0 || height <= 0 {
        cleanup();
        return None;
    }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // negative => top-down rows
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            ..Default::default()
        },
        ..Default::default()
    };

    let pixel_count = (width * height) as usize;
    let mut buf = vec![0u8; pixel_count * 4];

    let hdc: HDC = CreateCompatibleDC(None);
    let scan = GetDIBits(
        hdc,
        color,
        0,
        height as u32,
        Some(buf.as_mut_ptr() as *mut c_void),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    let _ = DeleteDC(hdc);
    cleanup();

    if scan == 0 {
        return None;
    }

    // Win32 gives us BGRA; PNG wants RGBA.
    let mut has_alpha = false;
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
        if px[3] != 0 {
            has_alpha = true;
        }
    }
    // Some legacy icons carry no alpha channel — treat them as fully opaque.
    if !has_alpha {
        for px in buf.chunks_exact_mut(4) {
            px[3] = 255;
        }
    }

    encode_png(width as u32, height as u32, &buf)
}

fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}

// ─────────────────────── Window enumeration ────────────────────────

/// List visible, top-level application windows (skips tool/owned windows).
pub fn list_windows() -> Vec<WindowInfo> {
    let mut out: Vec<WindowInfo> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut out as *mut _ as isize));
    }
    out
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<WindowInfo>);

    if !IsWindowVisible(hwnd).as_bool() {
        return TRUE;
    }
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
        return TRUE;
    }
    if !GetWindow(hwnd, GW_OWNER).unwrap_or_default().is_invalid() {
        return TRUE;
    }

    let len = GetWindowTextLengthW(hwnd);
    if len <= 0 {
        return TRUE;
    }
    let mut buf = vec![0u16; (len + 1) as usize];
    let copied = GetWindowTextW(hwnd, &mut buf);
    if copied <= 0 {
        return TRUE;
    }
    let title = String::from_utf16_lossy(&buf[..copied as usize]);
    out.push(WindowInfo {
        hwnd: hwnd.0 as isize,
        title,
    });
    TRUE
}

/// Work area (screen minus the taskbar) of the monitor containing a point,
/// as (left, top, width, height). Used to keep the dock off the taskbar.
pub fn work_area(x: i32, y: i32) -> Option<(i32, i32, i32, i32)> {
    unsafe {
        let hmon = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let r = mi.rcWork;
            Some((r.left, r.top, r.right - r.left, r.bottom - r.top))
        } else {
            None
        }
    }
}

/// True if the foreground window (not the desktop, not our own dock) overlaps
/// the given dock rectangle (left, top, right, bottom) — used for smart hide.
pub fn foreground_occludes(dl: i32, dt: i32, dr: i32, db: i32, self_hwnd: isize) -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() || hwnd.0 as isize == self_hwnd {
            return false;
        }
        // Any window belonging to Booki itself (dock, notch, settings) doesn't
        // count as "another app" — so editing Settings keeps the dock visible for
        // live preview instead of tucking it away.
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(hwnd, &mut buf);
        let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        if class == "Progman" || class == "WorkerW" {
            return false; // desktop is in front → show the dock
        }
        // The shell / taskbar don't count as "an app".
        if class == "Shell_TrayWnd" || class == "Shell_SecondaryTrayWnd" {
            return false;
        }
        if IsIconic(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        // The user is working in a real app window → tuck the dock away. We don't
        // require the window to overlap the dock: it should stay out of the way
        // whenever you're in another window, not only when physically covered. It
        // returns on the desktop, or when the notch is clicked.
        let _ = (dl, dt, dr, db);
        true
    }
}

/// Bring a window to the foreground, restoring it if minimized.
pub fn focus_window(hwnd: isize) -> bool {
    let handle = HWND(hwnd as *mut c_void);
    unsafe {
        if IsIconic(handle).as_bool() {
            let _ = ShowWindow(handle, SW_RESTORE);
        }
        SetForegroundWindow(handle).as_bool()
    }
}
