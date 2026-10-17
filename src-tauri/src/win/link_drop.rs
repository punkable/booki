//! WebView2's file-drop interceptor discards browser links. Accept both OLE
//! formats in the dock, retaining Explorer targeting and physical coordinates.
use std::cell::Cell;
use tauri::Emitter;
use windows::core::{implement, w, Ref, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, POINTL};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::System::Ole::{
    IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, CF_HDROP,
    CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

#[derive(Clone, serde::Serialize)]
struct Position {
    x: i32,
    y: i32,
}
#[derive(Clone, serde::Serialize)]
struct Payload {
    position: Position,
    paths: Vec<String>,
}

/// Call on the WebView's apartment thread after its child windows exist.
pub fn install(hwnd: isize, window: tauri::WebviewWindow) {
    struct Install {
        window: tauri::WebviewWindow,
        root: isize,
    }
    unsafe extern "system" fn visit(child: HWND, data: LPARAM) -> BOOL {
        let install = &*(data.0 as *const Install);
        let target: IDropTarget = Target {
            window: install.window.clone(),
            root: install.root,
            valid: Cell::new(false),
        }
        .into();
        // Match wry's interception: the original target must be revoked first.
        if RevokeDragDrop(child).is_ok() {
            if let Err(error) = RegisterDragDrop(child, &target) {
                log::warn!("link drop registration: {error}");
            }
        }
        true.into()
    }
    let state = Install { window, root: hwnd };
    unsafe {
        let _ = EnumChildWindows(
            Some(HWND(hwnd as _)),
            Some(visit),
            LPARAM(&state as *const _ as isize),
        );
    }
}

#[implement(IDropTarget)]
struct Target {
    window: tauri::WebviewWindow,
    root: isize,
    valid: Cell<bool>,
}
impl Target {
    fn position(&self, point: &POINTL) -> Position {
        let mut point = POINT {
            x: point.x,
            y: point.y,
        };
        unsafe {
            let _ = ScreenToClient(HWND(self.root as _), &mut point);
        }
        Position {
            x: point.x,
            y: point.y,
        }
    }
    fn files(data: &IDataObject) -> Vec<String> {
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        unsafe {
            let Ok(mut medium) = data.GetData(&format) else {
                return Vec::new();
            };
            let drop = HDROP(medium.u.hGlobal.0);
            let count = DragQueryFileW(drop, u32::MAX, None).min(256);
            let mut paths = Vec::new();
            for i in 0..count {
                let len = DragQueryFileW(drop, i, None) as usize;
                if len > 32767 {
                    continue;
                }
                let mut buffer = vec![0; len + 1];
                DragQueryFileW(drop, i, Some(&mut buffer));
                paths.push(String::from_utf16_lossy(&buffer[..len]));
            }
            ReleaseStgMedium(&mut medium);
            paths
        }
    }
    fn link(data: &IDataObject) -> Option<String> {
        unsafe {
            for format_id in [
                RegisterClipboardFormatW(w!("UniformResourceLocatorW")) as u16,
                CF_UNICODETEXT.0,
            ] {
                let format = FORMATETC {
                    cfFormat: format_id,
                    ptd: std::ptr::null_mut(),
                    dwAspect: DVASPECT_CONTENT.0,
                    lindex: -1,
                    tymed: TYMED_HGLOBAL.0 as u32,
                };
                let Ok(mut medium) = data.GetData(&format) else {
                    continue;
                };
                let size = GlobalSize(medium.u.hGlobal);
                let pointer = if size <= 32768 {
                    GlobalLock(medium.u.hGlobal)
                } else {
                    std::ptr::null_mut()
                };
                let value = if !pointer.is_null() {
                    let units = std::slice::from_raw_parts(pointer.cast::<u16>(), size / 2);
                    let end = units.iter().position(|v| *v == 0).unwrap_or(units.len());
                    let value = String::from_utf16_lossy(&units[..end]);
                    let _ = GlobalUnlock(medium.u.hGlobal);
                    Some(value)
                } else {
                    None
                };
                ReleaseStgMedium(&mut medium);
                if let Some(value) = value {
                    let value = value.trim();
                    if value.len() <= 8192
                        && (value.starts_with("https://") || value.starts_with("http://"))
                    {
                        return Some(value.to_string());
                    }
                }
            }
        }
        None
    }
}
#[allow(non_snake_case)]
impl IDropTarget_Impl for Target_Impl {
    fn DragEnter(
        &self,
        data: Ref<'_, IDataObject>,
        _: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let valid = data
            .as_ref()
            .is_some_and(|data| !Target::files(data).is_empty() || Target::link(data).is_some());
        self.valid.set(valid);
        unsafe {
            *effect = if valid {
                DROPEFFECT_COPY
            } else {
                DROPEFFECT_NONE
            };
        }
        if valid {
            let _ = self.window.emit(
                "tauri://drag-enter",
                Payload {
                    position: self.position(point),
                    paths: Vec::new(),
                },
            );
        }
        Ok(())
    }
    fn DragOver(
        &self,
        _: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        unsafe {
            *effect = if self.valid.get() {
                DROPEFFECT_COPY
            } else {
                DROPEFFECT_NONE
            };
        }
        if self.valid.get() {
            let _ = self.window.emit(
                "tauri://drag-over",
                Payload {
                    position: self.position(point),
                    paths: Vec::new(),
                },
            );
        }
        Ok(())
    }
    fn DragLeave(&self) -> windows::core::Result<()> {
        self.valid.set(false);
        let _ = self.window.emit("tauri://drag-leave", ());
        Ok(())
    }
    fn Drop(
        &self,
        data: Ref<'_, IDataObject>,
        _: MODIFIERKEYS_FLAGS,
        point: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        self.valid.set(false);
        unsafe {
            *effect = DROPEFFECT_NONE;
        }
        if let Some(data) = data.as_ref() {
            let paths = Target::files(data);
            if !paths.is_empty() {
                let _ = self.window.emit(
                    "tauri://drag-drop",
                    Payload {
                        position: self.position(point),
                        paths,
                    },
                );
                unsafe {
                    *effect = DROPEFFECT_COPY;
                }
            } else if let Some(url) = Target::link(data) {
                let _ = self.window.emit("tauri://drag-leave", ());
                let _ = self.window.emit("booki://link-drop", url);
                unsafe {
                    *effect = DROPEFFECT_COPY;
                }
            }
        }
        Ok(())
    }
}
