//! Windows 11 "Do not disturb", read and set for the Focus widget.
//!
//! Windows has no public API for Do not disturb. `Windows.UI.Shell.
//! FocusSessionManager` (24H2+) only reports Focus sessions, and starting one
//! is a Limited Access Feature an unpackaged app cannot unlock. The
//! `NOC_GLOBAL_SETTING_TOASTS_ENABLED` registry value is the master
//! "Notifications" switch, not Do not disturb, and Explorer ignores live
//! writes to it. What the Settings toggle and the Action Center actually do is
//! publish the active quiet-hours profile on the Windows Notification Facility
//! state `WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED`; the shell reacts to it
//! immediately. That is what this module uses, through `NtQueryWnfStateData`
//! and `NtUpdateWnfStateData` resolved at run time from ntdll, so a Windows
//! build that drops either export simply reports "unknown" instead of failing
//! to load.
//!
//! Booki must never leave Do not disturb stuck on. When it turns it on, it
//! writes a marker next to the config; it turns DND off only while that
//! marker exists (so a DND the user chose is never switched off), and the
//! marker is honoured at exit and at the next start.

use std::path::PathBuf;

/// Quiet-hours profiles published on the WNF state.
pub(crate) const PROFILE_OFF: u32 = 0;
/// "Priority only": what Windows 11's Do not disturb toggle selects.
pub(crate) const PROFILE_PRIORITY_ONLY: u32 = 1;

/// Any profile other than "off" means notifications are being held.
pub(crate) fn profile_is_dnd(profile: u32) -> bool {
    profile != PROFILE_OFF
}

/// What `set(on)` should do, given the current state and whether Booki owns
/// the current Do not disturb.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Plan {
    /// Leave Windows alone.
    Keep,
    /// Turn DND on and remember that Booki did it.
    TurnOn,
    /// Turn DND off (Booki turned it on).
    TurnOff,
    /// Already off (the user turned it off by hand): just forget the marker.
    Forget,
}

pub(crate) fn plan(want_on: bool, current: Option<bool>, owned: bool) -> Plan {
    match (want_on, current, owned) {
        // Only switch it on when it is known to be off; a DND the user already
        // has stays theirs.
        (true, Some(false), _) => Plan::TurnOn,
        (true, _, _) => Plan::Keep,
        (false, Some(false), true) => Plan::Forget,
        // On, or unreadable: switch it off rather than risk leaving it stuck.
        (false, _, true) => Plan::TurnOff,
        (false, _, false) => Plan::Keep,
    }
}

fn marker_path() -> PathBuf {
    crate::config::config_dir().join("dnd-owned")
}

pub(crate) fn owned() -> bool {
    marker_path().exists()
}

fn set_owned(value: bool) {
    let path = marker_path();
    if value {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, b"1");
    } else {
        let _ = std::fs::remove_file(path);
    }
}

/// Current Do not disturb state, or `None` when it cannot be read.
pub(crate) fn state() -> Option<bool> {
    imp::read_profile().map(profile_is_dnd)
}

/// Turn Do not disturb on or off on Booki's behalf. `Ok(true)` when Windows
/// was changed, `Ok(false)` when nothing needed to change.
pub(crate) fn set(on: bool) -> Result<bool, String> {
    match plan(on, state(), owned()) {
        Plan::Keep => Ok(false),
        Plan::Forget => {
            set_owned(false);
            Ok(false)
        }
        Plan::TurnOn => {
            // Write the marker first: a crash right after the switch must
            // still be able to restore it.
            set_owned(true);
            if let Err(error) = write_and_verify(true) {
                set_owned(false);
                return Err(error);
            }
            Ok(true)
        }
        Plan::TurnOff => {
            write_and_verify(false)?;
            set_owned(false);
            Ok(true)
        }
    }
}

fn write_and_verify(on: bool) -> Result<(), String> {
    imp::write_profile(if on {
        PROFILE_PRIORITY_ONLY
    } else {
        PROFILE_OFF
    })?;
    match state() {
        Some(now) if now == on => Ok(()),
        Some(_) => Err("Windows did not apply the Do not disturb change".into()),
        None => Ok(()),
    }
}

/// Undo a Do not disturb that Booki left on (exit, or a start with no focus
/// session running). Never touches a DND Booki did not turn on.
pub(crate) fn restore() -> bool {
    owned() && set(false).unwrap_or(false)
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use windows::core::{s, w};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};

    /// WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED.
    const QUIET_HOURS_PROFILE: u64 = 0x0D83_063E_A3BF_1C75;

    type QueryFn = unsafe extern "system" fn(
        *const u64,
        *const c_void,
        *const c_void,
        *mut u32,
        *mut c_void,
        *mut u32,
    ) -> i32;
    type UpdateFn = unsafe extern "system" fn(
        *const u64,
        *const c_void,
        u32,
        *const c_void,
        *const c_void,
        u32,
        u32,
    ) -> i32;

    fn ntdll_proc(name: windows::core::PCSTR) -> Option<unsafe extern "system" fn() -> isize> {
        unsafe {
            let ntdll = GetModuleHandleW(w!("ntdll.dll")).ok()?;
            GetProcAddress(ntdll, name)
        }
    }

    pub(super) fn read_profile() -> Option<u32> {
        let proc = ntdll_proc(s!("NtQueryWnfStateData"))?;
        unsafe {
            let query: QueryFn = std::mem::transmute(proc);
            let name = QUIET_HOURS_PROFILE;
            let mut stamp = 0u32;
            let mut value = 0u32;
            let mut size = std::mem::size_of::<u32>() as u32;
            let status = query(
                &name,
                std::ptr::null(),
                std::ptr::null(),
                &mut stamp,
                &mut value as *mut u32 as *mut c_void,
                &mut size,
            );
            // Never published since boot: nothing is held.
            if status >= 0 && size == 0 {
                return Some(super::PROFILE_OFF);
            }
            (status >= 0 && size as usize >= std::mem::size_of::<u32>()).then_some(value)
        }
    }

    pub(super) fn write_profile(profile: u32) -> Result<(), String> {
        let proc = ntdll_proc(s!("NtUpdateWnfStateData"))
            .ok_or_else(|| "NtUpdateWnfStateData is unavailable".to_string())?;
        let status = unsafe {
            let update: UpdateFn = std::mem::transmute(proc);
            let name = QUIET_HOURS_PROFILE;
            update(
                &name,
                &profile as *const u32 as *const c_void,
                std::mem::size_of::<u32>() as u32,
                std::ptr::null(),
                std::ptr::null(),
                0,
                0,
            )
        };
        if status >= 0 {
            Ok(())
        } else {
            Err(format!(
                "NtUpdateWnfStateData failed: 0x{:08X}",
                status as u32
            ))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub(super) fn read_profile() -> Option<u32> {
        None
    }
    pub(super) fn write_profile(_profile: u32) -> Result<(), String> {
        Err("Do not disturb is only available on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn any_quiet_profile_counts_as_dnd() {
        assert!(!profile_is_dnd(PROFILE_OFF));
        assert!(profile_is_dnd(PROFILE_PRIORITY_ONLY));
        assert!(profile_is_dnd(2));
    }

    #[test]
    fn turns_on_only_when_known_off() {
        assert_eq!(plan(true, Some(false), false), Plan::TurnOn);
        assert_eq!(plan(true, Some(true), false), Plan::Keep);
        assert_eq!(plan(true, None, false), Plan::Keep);
    }

    #[test]
    fn never_turns_off_a_dnd_the_user_chose() {
        assert_eq!(plan(false, Some(true), false), Plan::Keep);
        assert_eq!(plan(false, Some(true), true), Plan::TurnOff);
        assert_eq!(plan(false, Some(false), true), Plan::Forget);
        assert_eq!(plan(false, None, true), Plan::TurnOff);
    }
}
