//! Documented backdrop capabilities and live accessibility preferences.
use serde::Serialize;
use std::ffi::c_void;
use windows::core::w;
use windows::Win32::Foundation::{BOOL, HWND};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMSBT_MAINWINDOW, DWMSBT_NONE, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_USE_IMMERSIVE_DARK_MODE,
};
use windows::Win32::System::Registry::{
    RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
};
use windows::Win32::UI::Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW};
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION, SPI_GETHIGHCONTRAST,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub build: u32,
    pub system_backdrop: bool,
    pub high_contrast: bool,
    pub animations: bool,
    pub transparency: bool,
}

pub fn capabilities() -> Capabilities {
    unsafe {
        let mut text = [0u16; 32];
        let mut size = std::mem::size_of_val(&text) as u32;
        let result = RegGetValueW(
            HKEY_LOCAL_MACHINE,
            w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
            w!("CurrentBuildNumber"),
            RRF_RT_REG_SZ,
            None,
            Some(text.as_mut_ptr().cast()),
            Some(&mut size),
        );
        let build = if result.is_ok() {
            String::from_utf16_lossy(
                &text[..text.iter().position(|c| *c == 0).unwrap_or(text.len())],
            )
            .parse()
            .unwrap_or(0)
        } else {
            0
        };
        let mut contrast = HIGHCONTRASTW {
            cbSize: std::mem::size_of::<HIGHCONTRASTW>() as u32,
            ..Default::default()
        };
        let _ = SystemParametersInfoW(
            SPI_GETHIGHCONTRAST,
            contrast.cbSize,
            Some((&mut contrast as *mut HIGHCONTRASTW).cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
        let mut animations = BOOL(1);
        let _ = SystemParametersInfoW(
            SPI_GETCLIENTAREAANIMATION,
            0,
            Some((&mut animations as *mut BOOL).cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        );
        let mut transparent = 1u32;
        let mut length = 4u32;
        let _ = RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("EnableTransparency"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut transparent as *mut u32).cast()),
            Some(&mut length),
        );
        let high_contrast = contrast.dwFlags.contains(HCF_HIGHCONTRASTON);
        Capabilities {
            build,
            system_backdrop: build >= 22621,
            high_contrast,
            animations: animations.as_bool(),
            transparency: transparent != 0 && !high_contrast,
        }
    }
}

/// Mica is applied only to the Settings HWND; floating dock geometry stays independent.
pub fn settings_backdrop(hwnd: isize, enabled: bool, dark: bool) -> bool {
    unsafe {
        let value = BOOL::from(dark);
        let _ = DwmSetWindowAttribute(
            HWND(hwnd as *mut c_void),
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            (&value as *const BOOL).cast(),
            std::mem::size_of_val(&value) as u32,
        );
    }
    let caps = capabilities();
    let allowed = enabled && caps.system_backdrop && caps.transparency;
    let value = if allowed {
        DWMSBT_MAINWINDOW
    } else {
        DWMSBT_NONE
    };
    let applied = unsafe {
        DwmSetWindowAttribute(
            HWND(hwnd as *mut c_void),
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&value as *const windows::Win32::Graphics::Dwm::DWM_SYSTEMBACKDROP_TYPE).cast(),
            std::mem::size_of_val(&value) as u32,
        )
        .is_ok()
    };
    allowed && applied
}
