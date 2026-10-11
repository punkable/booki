//! Toast notifications and other apps' Jump List recents.
//!
//! Toasts go through the WinRT `ToastNotificationManager`. Windows applies
//! Do not disturb / Focus and per-app notification settings itself: a toast
//! shown during quiet hours goes straight to the notification centre.
//!
//! Recent documents come from `IApplicationDocumentLists`, the same source
//! Explorer reads for an app's Jump List "Recent" section.

use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
};
use windows::Win32::UI::Shell::Common::IObjectArray;
use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, PROPERTYKEY};
use windows::Win32::UI::Shell::{
    ApplicationDocumentLists, FOLDERID_LocalAppData, FOLDERID_ProgramFilesCommonX64,
    FOLDERID_ProgramFilesCommonX86, FOLDERID_ProgramFilesX64, FOLDERID_ProgramFilesX86,
    FOLDERID_RoamingAppData, FOLDERID_System, FOLDERID_SystemX86, FOLDERID_UserProgramFiles,
    FOLDERID_Windows, IApplicationDocumentLists, IShellItem, IShellLinkW, SHGetKnownFolderPath,
    SetCurrentProcessExplicitAppUserModelID, ShellLink, ADLT_RECENT, KF_FLAG_DEFAULT,
    SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY,
};
use windows::UI::Notifications::{
    NotificationSetting, ToastNotification, ToastNotificationManager,
};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// COM for the calling thread, released on drop when this call initialised it.
struct ComApartment(bool);
impl ComApartment {
    fn new() -> Self {
        Self(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() })
    }
}
impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

/// Give this process an explicit AppUserModelID. Toasts are attributed to the
/// Start-menu shortcut carrying the same ID (the NSIS and MSI installers set
/// it to the bundle identifier). Must run before any window is created.
pub fn set_app_user_model_id(id: &str) -> bool {
    let id = wide(id);
    unsafe { SetCurrentProcessExplicitAppUserModelID(PCWSTR(id.as_ptr())).is_ok() }
}

/// Show a toast built from `xml` for `app_id`. Errors when Windows refuses
/// toasts for the app (turned off by the user, policy, or no registration).
pub fn show_toast(app_id: &str, xml: &str) -> Result<(), String> {
    let unavailable = |e: windows::core::Error| format!("toasts are unavailable: {}", e.message());
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))
        .map_err(unavailable)?;
    match notifier.Setting() {
        Ok(NotificationSetting::Enabled) => {}
        Ok(NotificationSetting::DisabledForApplication) => {
            return Err("toasts are unavailable: turned off for Booki in Windows Settings".into())
        }
        Ok(NotificationSetting::DisabledForUser) => {
            return Err("toasts are unavailable: notifications are turned off".into())
        }
        Ok(NotificationSetting::DisabledByGroupPolicy) => {
            return Err("toasts are unavailable: turned off by policy".into())
        }
        Ok(_) => return Err("toasts are unavailable for this app".into()),
        // Without a registered shortcut Setting() can fail while Show() would
        // still be dropped silently, so report it instead of pretending.
        Err(e) => return Err(unavailable(e)),
    }
    let document = XmlDocument::new().map_err(unavailable)?;
    document
        .LoadXml(&HSTRING::from(xml))
        .map_err(|e| format!("invalid toast content: {}", e.message()))?;
    let toast = ToastNotification::CreateToastNotification(&document).map_err(unavailable)?;
    notifier.Show(&toast).map_err(unavailable)
}

/// System.AppUserModel.ID (PKEY_AppUserModel_ID).
const PKEY_APP_USER_MODEL_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: windows::core::GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
    pid: 5,
};

/// The explicit AppUserModelID stored on a .lnk, if any.
pub fn shortcut_app_id(lnk: &str) -> Option<String> {
    let _com = ComApartment::new();
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(PCWSTR(wide(lnk).as_ptr()), STGM_READ).ok()?;
        let store: IPropertyStore = link.cast().ok()?;
        let value = store.GetValue(&PKEY_APP_USER_MODEL_ID).ok()?;
        let id = value.to_string();
        let id = id.trim();
        (!id.is_empty()).then(|| id.to_string())
    }
}

/// Known folders Windows substitutes into an implicit AppID, as
/// (`{GUID}`, current path) pairs. Folders that do not resolve are skipped.
pub fn app_id_known_folders() -> Vec<(String, String)> {
    let ids = [
        FOLDERID_ProgramFilesX64,
        FOLDERID_ProgramFilesX86,
        FOLDERID_ProgramFilesCommonX64,
        FOLDERID_ProgramFilesCommonX86,
        FOLDERID_System,
        FOLDERID_SystemX86,
        FOLDERID_Windows,
        FOLDERID_UserProgramFiles,
        FOLDERID_LocalAppData,
        FOLDERID_RoamingAppData,
    ];
    let mut folders = Vec::new();
    for id in ids {
        unsafe {
            let Ok(path) = SHGetKnownFolderPath(&id, KF_FLAG_DEFAULT, None) else {
                continue;
            };
            let text = path.to_string().unwrap_or_default();
            CoTaskMemFree(Some(path.0.cast()));
            if !text.is_empty() {
                folders.push((format!("{{{id:?}}}"), text));
            }
        }
    }
    folders
}

/// Up to `cap` (name, path) pairs from the Jump List "Recent" list of the app
/// with this AppUserModelID. Only file-system items are returned.
pub fn jump_list_recent(app_id: &str, cap: usize) -> Vec<(String, String)> {
    let _com = ComApartment::new();
    let mut items = Vec::new();
    unsafe {
        let Ok(lists) = CoCreateInstance::<_, IApplicationDocumentLists>(
            &ApplicationDocumentLists,
            None,
            CLSCTX_INPROC_SERVER,
        ) else {
            return items;
        };
        if lists.SetAppID(PCWSTR(wide(app_id).as_ptr())).is_err() {
            return items;
        }
        let Ok(array) = lists.GetList::<IObjectArray>(ADLT_RECENT, cap as u32) else {
            return items;
        };
        let count = array.GetCount().unwrap_or(0).min(cap as u32);
        for index in 0..count {
            if let Ok(item) = array.GetAt::<IShellItem>(index) {
                if let Some(entry) = shell_item_entry(&item) {
                    items.push(entry);
                }
            } else if let Ok(link) = array.GetAt::<IShellLinkW>(index) {
                if let Some(entry) = shell_link_entry(&link) {
                    items.push(entry);
                }
            }
        }
    }
    items
}

unsafe fn display_name(
    item: &IShellItem,
    kind: windows::Win32::UI::Shell::SIGDN,
) -> Option<String> {
    let name: PWSTR = item.GetDisplayName(kind).ok()?;
    let text = name.to_string().unwrap_or_default();
    CoTaskMemFree(Some(name.0.cast()));
    (!text.is_empty()).then_some(text)
}

unsafe fn shell_item_entry(item: &IShellItem) -> Option<(String, String)> {
    let path = display_name(item, SIGDN_FILESYSPATH)?;
    let name = display_name(item, SIGDN_NORMALDISPLAY).unwrap_or_else(|| file_name(&path));
    Some((name, path))
}

unsafe fn shell_link_entry(link: &IShellLinkW) -> Option<(String, String)> {
    let mut buf = [0u16; 32768];
    let mut data = WIN32_FIND_DATAW::default();
    link.GetPath(&mut buf, &mut data, 0).ok()?;
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let path = String::from_utf16_lossy(&buf[..end]);
    (!path.is_empty()).then(|| (file_name(&path), path))
}

fn file_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}
