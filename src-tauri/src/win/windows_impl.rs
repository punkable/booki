//! Native Windows integration: extracting app icons and enumerating /
//! activating top-level windows. Implemented with the official `windows` crate
//! (Win32 bindings). Validated to compile against `x86_64-pc-windows-msvc`.

use std::ffi::c_void;

use base64::Engine;
use windows::core::{Interface, PCWSTR};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_ALL, CLSCTX_INPROC_SERVER,
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
    IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow, GWL_EXSTYLE,
    GW_OWNER, HICON, ICONINFO, SW_RESTORE, WS_EX_TOOLWINDOW,
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
    let wpath = wide(path);
    pf.Load(PCWSTR(wpath.as_ptr()), STGM_READ).ok()?;
    let mut buf = [0u16; 260];
    let mut fd = WIN32_FIND_DATAW::default();
    link.GetPath(&mut buf, &mut fd, 0u32).ok()?;
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    if end == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..end]))
}

/// Read the shell icon of a single file/exe/folder as PNG. No USEFILEATTRIBUTES,
/// so custom executable icons come through.
unsafe fn icon_png_from(path: &str) -> Option<Vec<u8>> {
    let w = wide(path);
    let mut info = SHFILEINFOW::default();
    let res = SHGetFileInfoW(
        PCWSTR(w.as_ptr()),
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

unsafe fn extract_icon_png(path: &str) -> Option<Vec<u8>> {
    // For .lnk shortcuts, prefer the TARGET's icon so the shell's shortcut-arrow
    // overlay badge doesn't appear on the dock tile. But some installers (Discord
    // and other Squirrel apps) point the shortcut at an icon-less Update.exe stub,
    // so if the target has no usable icon, fall back to the shortcut itself —
    // which carries the app's real IconLocation — and finally the original path.
    // A correct icon with an overlay beats a blank tile.
    let is_lnk = path.to_ascii_lowercase().ends_with(".lnk");
    if is_lnk {
        if let Some(t) = resolve_shortcut_target(path) {
            if !t.is_empty() {
                if let Some(png) = icon_png_from(&t) {
                    return Some(png);
                }
            }
        }
    }
    icon_png_from(path)
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

/// Explorer-grade thumbnail for a file (photos, videos — anything the Shell
/// can preview) via IShellItemImageFactory. Warm requests hit the system
/// thumbnail cache, so they're near-instant. Returns a PNG data URI.
pub fn file_thumbnail(path: &str, size: i32) -> Option<String> {
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
        SIIGBF_RESIZETOFIT,
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let w = wide(path);
        let item: IShellItemImageFactory =
            SHCreateItemFromParsingName(PCWSTR(w.as_ptr()), None).ok()?;
        let hbmp = item
            .GetImage(
                SIZE { cx: size, cy: size },
                windows::Win32::UI::Shell::SIIGBF(SIIGBF_RESIZETOFIT.0 | SIIGBF_BIGGERSIZEOK.0),
            )
            .ok()?;
        let png = hbitmap_png(hbmp);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        let png = png?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(png);
        Some(format!("data:image/png;base64,{b64}"))
    }
}

unsafe fn hbitmap_png(hbmp: HBITMAP) -> Option<Vec<u8>> {
    let mut bm = BITMAP::default();
    let got = GetObjectW(
        HGDIOBJ(hbmp.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut c_void),
    );
    if got == 0 {
        return None;
    }
    let (width, height) = (bm.bmWidth, bm.bmHeight);
    if width <= 0 || height <= 0 {
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
    let mut buf = vec![0u8; (width * height) as usize * 4];
    let hdc: HDC = CreateCompatibleDC(None);
    let scan = GetDIBits(
        hdc,
        hbmp,
        0,
        height as u32,
        Some(buf.as_mut_ptr() as *mut c_void),
        &mut bmi,
        DIB_RGB_COLORS,
    );
    let _ = DeleteDC(hdc);
    if scan == 0 {
        return None;
    }
    // BGRA → RGBA; JPEG-sourced thumbnails often carry a zeroed alpha channel —
    // treat those as fully opaque.
    let mut has_alpha = false;
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
        if px[3] != 0 {
            has_alpha = true;
        }
    }
    if !has_alpha {
        for px in buf.chunks_exact_mut(4) {
            px[3] = 255;
        }
    } else {
        // Shell bitmaps are premultiplied ARGB; PNG wants straight alpha —
        // un-premultiply or semi-transparent edges render darkened.
        for px in buf.chunks_exact_mut(4) {
            let a = px[3] as u32;
            if a > 0 && a < 255 {
                for c in 0..3 {
                    px[c] = ((px[c] as u32 * 255 + a / 2) / a).min(255) as u8;
                }
            }
        }
    }
    encode_png(width as u32, height as u32, &buf)
}

/// Read the clipboard's plain text (CF_UNICODETEXT), if any.
pub fn clipboard_get_text() -> Option<String> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    const CF_UNICODETEXT: u32 = 13;
    unsafe {
        if OpenClipboard(None).is_err() {
            return None;
        }
        let result = (|| {
            let h = GetClipboardData(CF_UNICODETEXT).ok()?;
            if h.0.is_null() {
                return None;
            }
            let hglobal = HGLOBAL(h.0);
            let size = GlobalSize(hglobal);
            let p = GlobalLock(hglobal) as *const u16;
            if p.is_null() || size == 0 {
                return None;
            }
            // GlobalSize is in bytes; CF_UNICODETEXT is UTF-16 + a NUL terminator.
            let len_u16 = size / 2;
            let slice = std::slice::from_raw_parts(p, len_u16);
            let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
            let text = String::from_utf16_lossy(&slice[..end]);
            let _ = GlobalUnlock(hglobal);
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })();
        let _ = CloseClipboard();
        result
    }
}

/// Resolve a .lnk shortcut to its target path (public wrapper — used to map
/// Recent-folder entries and pinned shortcuts to their real files).
pub fn shortcut_target(path: &str) -> Option<String> {
    unsafe { resolve_shortcut_target(path) }
}

/// The executable registered as the default "open" handler for a file
/// extension (".pdf" → full path of the app), via the shell association API.
pub fn assoc_executable(ext: &str) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::UI::Shell::{AssocQueryStringW, ASSOCF_NONE, ASSOCSTR_EXECUTABLE};
    unsafe {
        let w = wide(ext);
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let hr = AssocQueryStringW(
            ASSOCF_NONE,
            ASSOCSTR_EXECUTABLE,
            PCWSTR(w.as_ptr()),
            PCWSTR::null(),
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        if hr.is_err() || len == 0 {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        if end == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}

/// Put plain text on the Windows clipboard (CF_UNICODETEXT).
pub fn set_clipboard_text(text: &str) -> bool {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    const CF_UNICODETEXT: u32 = 13;
    unsafe {
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        if OpenClipboard(None).is_err() {
            return false;
        }
        let _ = EmptyClipboard();
        let mut ok = false;
        if let Ok(h) = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2) {
            let p = GlobalLock(h) as *mut u16;
            if !p.is_null() {
                std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
                let _ = GlobalUnlock(h);
                // The clipboard owns the memory after a successful set.
                ok = SetClipboardData(CF_UNICODETEXT, HANDLE(h.0)).is_ok();
                if !ok {
                    let _ = windows::Win32::Foundation::GlobalFree(h);
                }
            } else {
                let _ = windows::Win32::Foundation::GlobalFree(h);
            }
        }
        let _ = CloseClipboard();
        ok
    }
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
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    out.push(WindowInfo {
        hwnd: hwnd.0 as isize,
        title,
        exe: process_image_path(pid).unwrap_or_default(),
    });
    TRUE
}

/// Full image path of a process id, lowercased. Uses the limited-information
/// query right so it works without elevation for most user processes.
unsafe fn process_image_path(pid: u32) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    if pid == 0 {
        return None;
    }
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 260];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        windows::core::PWSTR(buf.as_mut_ptr()),
        &mut len,
    )
    .is_ok();
    let _ = CloseHandle(handle);
    if ok && len > 0 {
        Some(String::from_utf16_lossy(&buf[..len as usize]).to_lowercase())
    } else {
        None
    }
}

/// Number of items currently in the Recycle Bin (all drives). None on failure.
pub fn trash_count() -> Option<u64> {
    use windows::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    match unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) } {
        Ok(_) => Some(info.i64NumItems as u64),
        Err(_) => None,
    }
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
        if dr <= dl || db <= dt {
            return true;
        }
        let mut wr = RECT::default();
        if GetWindowRect(hwnd, &mut wr).is_err() {
            return false;
        }
        wr.left < dr && wr.right > dl && wr.top < db && wr.bottom > dt
    }
}

/// True if a fullscreen game / movie / presentation is running — so Booki can get
/// completely out of the way (e.g. not cover subtitles or a game).
pub fn is_fullscreen() -> bool {
    unsafe {
        // 1) The shell's own "user is busy" state: fullscreen DirectX game,
        // presentation mode, or a busy/fullscreen app (movies). This is exactly
        // what Windows uses to suppress its own notifications.
        use windows::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        if let Ok(state) = SHQueryUserNotificationState() {
            if state == QUNS_RUNNING_D3D_FULL_SCREEN
                || state == QUNS_PRESENTATION_MODE
                || state == QUNS_BUSY
            {
                return true;
            }
        }
        // 2) Fallback: the foreground window covers the WHOLE monitor (borderless
        // fullscreen video like YouTube/VLC). Ignore the desktop and the shell.
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(hwnd, &mut buf);
        let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        if class == "Progman"
            || class == "WorkerW"
            || class == "Shell_TrayWnd"
            || class == "Shell_SecondaryTrayWnd"
            // Alt-Tab / Task View / Snap-layout overlays: borderless, cover the
            // whole monitor, and briefly become the foreground window while the
            // user is just switching between apps — not an actual fullscreen
            // game or movie. Without this, moving between windows could flash
            // the "Booki hid itself" blackout+toast on every switch.
            || class == "MultitaskingViewFrame"
            || class == "XamlExplorerHostIslandWindow"
        {
            return false;
        }
        // A normal MAXIMIZED window also covers the monitor when the taskbar is
        // set to auto-hide — so require the window to be borderless (no caption),
        // which true fullscreen apps are but maximized ones aren't.
        use windows::Win32::UI::WindowsAndMessaging::{GWL_STYLE, WS_CAPTION};
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        if (style & WS_CAPTION.0 as i32) != 0 {
            return false;
        }
        let mut wr = RECT::default();
        if GetWindowRect(hwnd, &mut wr).is_err() {
            return false;
        }
        let cx = (wr.left + wr.right) / 2;
        let cy = (wr.top + wr.bottom) / 2;
        let hmon = MonitorFromPoint(POINT { x: cx, y: cy }, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        wr.left <= m.left && wr.top <= m.top && wr.right >= m.right && wr.bottom >= m.bottom
    }
}

/// Hide a window from screen capture / recording (Discord, OBS, Teams, the Snip
/// tool…). WDA_EXCLUDEFROMCAPTURE (Win10 2004+) makes the window render normally
/// on screen but appear blank/absent to any capture — so Booki never shows up as
/// a shareable window and never covers what you're actually sharing.
pub fn set_capture_visible(hwnd: isize, visible: bool) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };
    let handle = HWND(hwnd as *mut c_void);
    let affinity = if visible { WDA_NONE } else { WDA_EXCLUDEFROMCAPTURE };
    unsafe {
        let _ = SetWindowDisplayAffinity(handle, affinity);
    }
}

pub fn exclude_from_capture(hwnd: isize) {
    set_capture_visible(hwnd, false);
}

pub fn protect_data(data: &[u8]) -> Option<Vec<u8>> {
    windows_dpapi::encrypt_data(data, windows_dpapi::Scope::User, None).ok()
}

pub fn unprotect_data(data: &[u8]) -> Option<Vec<u8>> {
    windows_dpapi::decrypt_data(data, windows_dpapi::Scope::User, None).ok()
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

// ──────────────────────────── Autostart ────────────────────────────
// Written straight to HKCU\...\Run (the classic per-user startup list) so the
// state is deterministic and verifiable — no plugin between us and the registry.

const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE: &str = "Booki";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Add or remove the "start with Windows" registry entry for this exe.
pub fn set_autostart(enabled: bool, exe: &str) -> Result<(), String> {
    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    let key_path = wide(RUN_KEY);
    let value_name = wide(RUN_VALUE);
    unsafe {
        let mut key = HKEY::default();
        let opened = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        );
        if opened.is_err() {
            return Err(format!("could not open the Run registry key ({opened:?})"));
        }
        let result = if enabled {
            // Quote the path so spaces in the install dir can't break the command.
            let cmd = wide(&format!("\"{exe}\""));
            let bytes =
                std::slice::from_raw_parts(cmd.as_ptr() as *const u8, cmd.len() * 2);
            let r = RegSetValueExW(key, PCWSTR(value_name.as_ptr()), 0, REG_SZ, Some(bytes));
            if r.is_err() {
                Err(format!("could not write the Run registry value ({r:?})"))
            } else {
                Ok(())
            }
        } else {
            let r = RegDeleteValueW(key, PCWSTR(value_name.as_ptr()));
            if r.is_err() && r != ERROR_FILE_NOT_FOUND {
                Err(format!("could not delete the Run registry value ({r:?})"))
            } else {
                Ok(())
            }
        };
        let _ = RegCloseKey(key);
        result
    }
}

/// The user's important shell folders (Desktop, Documents, Downloads, Pictures,
/// Videos, Music) resolved through the shell — correct even when redirected
/// (OneDrive, custom locations). Returned as (key, absolute path); the frontend
/// localizes the display name from the key.
pub fn known_folders() -> Vec<(String, String)> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{
        SHGetKnownFolderPath, FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads,
        FOLDERID_Music, FOLDERID_Pictures, FOLDERID_Videos, KF_FLAG_DEFAULT,
    };
    let ids = [
        ("desktop", &FOLDERID_Desktop),
        ("documents", &FOLDERID_Documents),
        ("downloads", &FOLDERID_Downloads),
        ("pictures", &FOLDERID_Pictures),
        ("videos", &FOLDERID_Videos),
        ("music", &FOLDERID_Music),
    ];
    let mut out = Vec::new();
    for (key, id) in ids {
        unsafe {
            if let Ok(pw) = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None) {
                let s = pw.to_string().unwrap_or_default();
                CoTaskMemFree(Some(pw.0 as _));
                if !s.is_empty() {
                    out.push((key.to_string(), s));
                }
            }
        }
    }
    out
}

/// Atomically resize + move a window in one SetWindowPos call (no intermediate
/// resized-but-not-yet-moved frame — that intermediate paint was the dock's
/// "blink" whenever a flyout or menu grew/shrank the window).
pub fn move_window(hwnd: isize, x: i32, y: i32, w: i32, h: i32) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
    };
    let handle = HWND(hwnd as *mut c_void);
    unsafe {
        let _ = SetWindowPos(handle, None, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

/// Is the OS cursor inside any of the given window-relative CSS-px rects?
/// `all` short-circuits to "the whole window is interactive" (used during
/// internal drags and the edge-move overlay). Returns None while the window
/// is hidden so the watcher can idle.
pub fn cursor_in_rects(hwnd: isize, rects: &[(f64, f64, f64, f64)], all: bool) -> Option<bool> {
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let handle = HWND(hwnd as *mut c_void);
    unsafe {
        if !IsWindowVisible(handle).as_bool() {
            return None;
        }
        let mut p = POINT::default();
        if GetCursorPos(&mut p).is_err() {
            return None;
        }
        let mut wr = RECT::default();
        if GetWindowRect(handle, &mut wr).is_err() {
            return None;
        }
        if p.x < wr.left || p.x >= wr.right || p.y < wr.top || p.y >= wr.bottom {
            return Some(false);
        }
        if all {
            return Some(true);
        }
        let dpi = GetDpiForWindow(handle);
        let dpr = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
        let cx = (p.x - wr.left) as f64 / dpr;
        let cy = (p.y - wr.top) as f64 / dpr;
        Some(
            rects
                .iter()
                .any(|&(x, y, w, h)| cx >= x && cx < x + w && cy >= y && cy < y + h),
        )
    }
}

/// Install/refresh (or remove) the Explorer right-click "Booki" cascading menu
/// for files (*) and folders (Directory). Per-user (HKCU\Software\Classes), so
/// no admin is needed. `groups` = (id, label) → one "add to group" entry each;
/// labels arrive already localized from the frontend. The whole key is deleted
/// and rewritten so removed groups can't leave stale entries behind.
pub fn sync_context_menu(
    enabled: bool,
    exe: &str,
    label_pin: &str,
    group_entries: &[(String, String)],
) -> Result<(), String> {
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteTreeW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    unsafe fn set_str(key: HKEY, name: Option<&str>, value: &str) -> Result<(), String> {
        let wname: Vec<u16>;
        let name_ptr = match name {
            Some(n) => {
                wname = wide(n);
                PCWSTR(wname.as_ptr())
            }
            None => PCWSTR::null(),
        };
        let wval = wide(value);
        let bytes = std::slice::from_raw_parts(wval.as_ptr() as *const u8, wval.len() * 2);
        let r = unsafe { RegSetValueExW(key, name_ptr, 0, REG_SZ, Some(bytes)) };
        if r.is_err() { Err(format!("reg set failed ({r:?})")) } else { Ok(()) }
    }
    unsafe fn create(path: &str) -> Result<HKEY, String> {
        let wpath = wide(path);
        let mut key = HKEY::default();
        let r = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(wpath.as_ptr()),
                0,
                None,
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &mut key,
                None,
            )
        };
        if r.is_err() { Err(format!("reg create {path} failed ({r:?})")) } else { Ok(key) }
    }

    unsafe {
        for base in ["*", "Directory"] {
            let root = format!("Software\\Classes\\{base}\\shell\\Booki");
            // Always start clean (also removes the menu when disabling).
            let wroot = wide(&root);
            let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(wroot.as_ptr()));
            if !enabled {
                continue;
            }
            let key = create(&root)?;
            set_str(key, Some("MUIVerb"), "Booki")?;
            set_str(key, Some("Icon"), &format!("\"{exe}\""))?;
            // An empty SubCommands + subkeys under shell\ = a cascading menu.
            set_str(key, Some("SubCommands"), "")?;
            let _ = RegCloseKey(key);

            // Entries sort alphabetically by key name → numeric prefixes fix order.
            let pin_key = create(&format!("{root}\\shell\\01_pin"))?;
            set_str(pin_key, Some("MUIVerb"), label_pin)?;
            let _ = RegCloseKey(pin_key);
            let cmd = create(&format!("{root}\\shell\\01_pin\\command"))?;
            set_str(cmd, None, &format!("\"{exe}\" --pin \"%1\""))?;
            let _ = RegCloseKey(cmd);

            for (i, (id, label)) in group_entries.iter().enumerate() {
                let sub = format!("{root}\\shell\\10_{i:02}");
                let gk = create(&sub)?;
                set_str(gk, Some("MUIVerb"), label)?;
                let _ = RegCloseKey(gk);
                let gc = create(&format!("{sub}\\command"))?;
                set_str(gc, None, &format!("\"{exe}\" --pin-group \"{id}\" \"%1\""))?;
                let _ = RegCloseKey(gc);
            }
        }
    }
    Ok(())
}

/// True when the "start with Windows" registry entry exists.
pub fn get_autostart() -> bool {
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let key_path = wide(RUN_KEY);
    let value_name = wide(RUN_VALUE);
    unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(key_path.as_ptr()),
            PCWSTR(value_name.as_ptr()),
            RRF_RT_REG_SZ,
            None,
            None,
            None,
        )
        .is_ok()
    }
}

// ──────────────────────────── Recycle bin ────────────────────────────

/// Send files/folders to the Recycle Bin (undoable — NOT a permanent delete).
/// Confirmation happens in Booki's own UI, so the shell dialog is suppressed.
pub fn trash_paths(paths: &[String]) -> Result<(), String> {
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FO_DELETE, SHFILEOPSTRUCTW,
    };
    if paths.is_empty() {
        return Ok(());
    }
    // pFrom is a double-null-terminated list of null-separated paths.
    let mut buf: Vec<u16> = Vec::new();
    for p in paths {
        buf.extend(p.encode_utf16());
        buf.push(0);
    }
    buf.push(0);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_DELETE,
        pFrom: PCWSTR(buf.as_ptr()),
        fFlags: (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_SILENT.0 | FOF_NOERRORUI.0) as u16,
        ..Default::default()
    };
    let code = unsafe { SHFileOperationW(&mut op) };
    if code != 0 {
        Err(format!("could not send to the recycle bin (code {code})"))
    } else if op.fAnyOperationsAborted.as_bool() {
        Err("the operation was aborted".into())
    } else {
        Ok(())
    }
}

/// True when the Recycle Bin (across all drives) has no items.
pub fn trash_is_empty() -> bool {
    use windows::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    match unsafe { SHQueryRecycleBinW(PCWSTR::null(), &mut info) } {
        Ok(()) => info.i64NumItems == 0,
        Err(_) => true,
    }
}

/// Empty the Recycle Bin (Booki's UI asks for confirmation first).
pub fn empty_trash() -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::{
        SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI,
    };
    unsafe {
        SHEmptyRecycleBinW(
            HWND::default(),
            PCWSTR::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI,
        )
    }
    .map_err(|e| e.to_string())
}

// ─────────────────────── Wallpaper accent ───────────────────────

/// Derive an accent color from the current desktop wallpaper: average of the
/// most vivid (saturated × bright) pixels of a small thumbnail.
pub fn wallpaper_accent() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };
    let mut buf = [0u16; 512];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            Some(buf.as_mut_ptr() as *mut _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    let end = buf.iter().position(|&c| c == 0)?;
    let path = String::from_utf16_lossy(&buf[..end]);
    if path.is_empty() {
        return None;
    }
    let img = image::open(&path).ok()?.thumbnail(64, 64).to_rgba8();
    let mut scored: Vec<(f32, [u8; 3])> = img
        .pixels()
        .map(|p| {
            let [r, g, b, _] = p.0;
            let mx = r.max(g).max(b) as f32;
            let mn = r.min(g).min(b) as f32;
            let sat = if mx == 0.0 { 0.0 } else { (mx - mn) / mx };
            (sat * (mx / 255.0), [r, g, b])
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let take = (scored.len() / 10).max(1);
    let (mut r, mut g, mut b) = (0u32, 0u32, 0u32);
    for (_, px) in scored.iter().take(take) {
        r += px[0] as u32;
        g += px[1] as u32;
        b += px[2] as u32;
    }
    let n = take as u32;
    Some(format!("#{:02x}{:02x}{:02x}", r / n, g / n, b / n))
}

// ─────────────────────── Now playing (system media) ───────────────────────

/// Snapshot of whatever the system media session is playing (Spotify, browser…).
pub struct MediaSnapshot {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    /// Album art as a data URI, when the source exposes one.
    pub thumb: Option<String>,
}

fn media_session(
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    let mgr = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .ok()?
        .get()
        .ok()?;
    mgr.GetCurrentSession().ok()
}

pub fn media_now_playing() -> Option<MediaSnapshot> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status;
    use windows::Storage::Streams::DataReader;
    let session = media_session()?;
    let info = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = info.Title().map(|s| s.to_string()).unwrap_or_default();
    let artist = info.Artist().map(|s| s.to_string()).unwrap_or_default();
    if title.is_empty() && artist.is_empty() {
        return None;
    }
    let playing = session
        .GetPlaybackInfo()
        .and_then(|p| p.PlaybackStatus())
        .map(|s| s == Status::Playing)
        .unwrap_or(false);
    let thumb = (|| {
        let stream = info.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().unwrap_or(0);
        if size > 2_000_000 {
            return None; // unreasonably big for album art
        }
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        // Some sources (e.g. browser tabs) report Size()==0 — ask for a chunk
        // and read whatever actually arrived.
        let want: u32 = if size == 0 { 500_000 } else { size as u32 };
        reader.LoadAsync(want).ok()?.get().ok()?;
        let got = reader.UnconsumedBufferLength().ok()? as usize;
        if got == 0 {
            return None;
        }
        let mut bytes = vec![0u8; got];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = if bytes.starts_with(&[0x89, b'P']) { "png" } else { "jpeg" };
        Some(format!(
            "data:image/{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })();
    Some(MediaSnapshot { title, artist, playing, thumb })
}

/// Toggle play/pause on the current system media session.
pub fn media_toggle() -> bool {
    media_session()
        .and_then(|s| s.TryTogglePlayPauseAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

/// Skip to the next track on the current system media session.
pub fn media_next() -> bool {
    media_session()
        .and_then(|s| s.TrySkipNextAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

/// Skip to the previous track on the current system media session.
pub fn media_prev() -> bool {
    media_session()
        .and_then(|s| s.TrySkipPreviousAsync().ok())
        .and_then(|op| op.get().ok())
        .unwrap_or(false)
}

/// Move files/folders into a destination folder via the shell (undoable, shows
/// the native progress/collision dialogs when needed).
pub fn move_paths(paths: &[String], dest: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMMKDIR, FO_MOVE, SHFILEOPSTRUCTW,
    };
    if paths.is_empty() {
        return Ok(());
    }
    let mut from: Vec<u16> = Vec::new();
    for p in paths {
        from.extend(p.encode_utf16());
        from.push(0);
    }
    from.push(0);
    let mut to: Vec<u16> = dest.encode_utf16().collect();
    to.push(0);
    to.push(0);
    let mut op = SHFILEOPSTRUCTW {
        wFunc: FO_MOVE,
        pFrom: PCWSTR(from.as_ptr()),
        pTo: PCWSTR(to.as_ptr()),
        fFlags: (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMMKDIR.0) as u16,
        ..Default::default()
    };
    let code = unsafe { SHFileOperationW(&mut op) };
    if code != 0 {
        Err(format!("could not move (code {code})"))
    } else if op.fAnyOperationsAborted.as_bool() {
        Err("the move was cancelled".into())
    } else {
        Ok(())
    }
}

// ──────────────────────── System volume (Core Audio) ────────────────────────

/// Default render endpoint's volume control. COM may already be initialized on
/// this thread (the call is harmless then — the error is ignored).
fn endpoint_volume() -> Result<IAudioEndpointVolume, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;
        device
            .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())
    }
}

/// Master volume as (percent 0–100, muted).
pub fn volume_get() -> Result<(u32, bool), String> {
    unsafe {
        let vol = endpoint_volume()?;
        let level = vol.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
        let muted = vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
        Ok(((level * 100.0).round() as u32, muted))
    }
}

pub fn volume_set(pct: u32) -> Result<(), String> {
    unsafe {
        let vol = endpoint_volume()?;
        vol.SetMasterVolumeLevelScalar(pct.min(100) as f32 / 100.0, std::ptr::null())
            .map_err(|e| e.to_string())?;
        // Nudging the volume up while muted should be audible right away.
        if pct > 0 {
            let _ = vol.SetMute(false, std::ptr::null());
        }
        Ok(())
    }
}

/// Toggle mute; returns the NEW muted state.
pub fn volume_mute_toggle() -> Result<bool, String> {
    unsafe {
        let vol = endpoint_volume()?;
        let muted = vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
        vol.SetMute(!muted, std::ptr::null())
            .map_err(|e| e.to_string())?;
        Ok(!muted)
    }
}

// ─────────────────────────── Hot edge (cursor) ───────────────────────────

/// True when the cursor is pressed against the given screen edge, within the
/// middle 70% of that edge (the corners stay free — they're hot spots for
/// window buttons and the Start corner). Used to reveal a hidden dock.
pub fn cursor_at_edge(edge: &str) -> bool {
    unsafe {
        let mut p = POINT::default();
        if windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p).is_err() {
            return false;
        }
        let hmon = MonitorFromPoint(p, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return false;
        }
        let r = mi.rcMonitor;
        let (w, h) = (r.right - r.left, r.bottom - r.top);
        let in_x = p.x >= r.left + w * 15 / 100 && p.x <= r.right - w * 15 / 100;
        let in_y = p.y >= r.top + h * 15 / 100 && p.y <= r.bottom - h * 15 / 100;
        match edge {
            "top" => p.y <= r.top + 1 && in_x,
            "left" => p.x <= r.left + 1 && in_y,
            "right" => p.x >= r.right - 2 && in_y,
            _ => p.y >= r.bottom - 2 && in_x,
        }
    }
}
