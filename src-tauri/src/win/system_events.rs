//! Native change notifications. Callbacks only enqueue; queries run elsewhere.
use std::sync::{
    atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering},
    mpsc::{sync_channel, SyncSender},
    Arc, Mutex, OnceLock,
};
use std::time::{Duration, Instant};
use windows::core::{implement, GUID, PCWSTR};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Sessions,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{
    eConsole, eRender, EDataFlow, ERole, IMMDeviceEnumerator, IMMNotificationClient,
    IMMNotificationClient_Impl, MMDeviceEnumerator, AUDIO_VOLUME_NOTIFICATION_DATA, DEVICE_STATE,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::Power::{
    RegisterPowerSettingNotification, UnregisterPowerSettingNotification,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::*;

/// Wakes the delivery thread. The signals themselves live in PENDING, one flag
/// per kind, so a burst of window events can never push out a clipboard,
/// resume or display signal: the old queue carried the kinds themselves and
/// dropped whatever arrived while its 32 slots were full.
static QUEUE: OnceLock<SyncSender<()>> = OnceLock::new();
const KINDS: [&str; 15] = [
    "ready",
    "windows",
    "clipboard",
    "preferences",
    "display",
    "resume",
    "media",
    "session",
    "volume",
    "device",
    "catalog",
    "display-off",
    "display-on",
    "energy-saver",
    "attention",
];
static PENDING: [AtomicBool; KINDS.len()] = [const { AtomicBool::new(false) }; KINDS.len()];
pub static MEDIA: AtomicBool = AtomicBool::new(false);
pub static VOLUME: AtomicBool = AtomicBool::new(false);
pub static WINDOWS: AtomicBool = AtomicBool::new(false);
pub static CLIPBOARD: AtomicBool = AtomicBool::new(false);
pub static CATALOG: AtomicBool = AtomicBool::new(false);
/// The last window outside Booki that came to the foreground (the hook skips
/// our own process), so a dock click can tell which app was in front.
pub static LAST_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

// ─────────────── Display power and Energy Saver ───────────────

/// GUID_CONSOLE_DISPLAY_STATE: 0 off, 1 on, 2 dimmed.
const CONSOLE_DISPLAY_STATE: GUID = GUID::from_u128(0x6fe69556_704a_47a0_8f24_c28d936fda47);
/// GUID_ENERGY_SAVER_STATUS (Windows 11 24H2+): 0 off, 1 standard, 2 high savings.
const ENERGY_SAVER_STATUS: GUID = GUID::from_u128(0x550e8400_e29b_41d4_a716_446655440000);
/// GUID_POWER_SAVING_STATUS (Battery saver on older builds): 0 off, 1 on.
const POWER_SAVING_STATUS: GUID = GUID::from_u128(0xe00958c0_c213_4ace_ac77_fecced2eeea5);
/// The console display is on (or dimmed). Windows sends the current state as
/// soon as the notification is registered.
pub static DISPLAY_ON: AtomicBool = AtomicBool::new(true);
static ENERGY_SAVER_NEW: AtomicBool = AtomicBool::new(false);
static ENERGY_SAVER_OLD: AtomicBool = AtomicBool::new(false);
/// Energy Saver (or, before 24H2, Battery saver) is on. Both settings are
/// watched, because registering the newer one can succeed on a build that
/// never reports it.
pub fn energy_saver() -> bool {
    ENERGY_SAVER_NEW.load(Ordering::Relaxed) || ENERGY_SAVER_OLD.load(Ordering::Relaxed)
}

unsafe fn power_setting_changed(lp: windows::Win32::Foundation::LPARAM) {
    use windows::Win32::System::Power::POWERBROADCAST_SETTING;
    let setting = lp.0 as *const POWERBROADCAST_SETTING;
    if setting.is_null() || (*setting).DataLength < 4 {
        return;
    }
    let guid = (*setting).PowerSetting;
    let value = std::ptr::read_unaligned((*setting).Data.as_ptr() as *const u32);
    if guid == CONSOLE_DISPLAY_STATE {
        DISPLAY_ON.store(value != 0, Ordering::Relaxed);
        signal(if value == 0 {
            "display-off"
        } else {
            "display-on"
        });
    } else if guid == ENERGY_SAVER_STATUS {
        ENERGY_SAVER_NEW.store(value != 0, Ordering::Relaxed);
        signal("energy-saver");
    } else if guid == POWER_SAVING_STATUS {
        ENERGY_SAVER_OLD.store(value != 0, Ordering::Relaxed);
        signal("energy-saver");
    }
}

// ─────────────── Windows asking for attention ───────────────

/// The shell hook message id, from RegisterWindowMessageW("SHELLHOOK").
static SHELL_HOOK_MESSAGE: AtomicU32 = AtomicU32::new(0);
const HSHELL_WINDOWDESTROYED: usize = 2;
const HSHELL_WINDOWACTIVATED: usize = 4;
const HSHELL_RUDEAPPACTIVATED: usize = 0x8004;
const HSHELL_FLASH: usize = 0x8006;
/// Windows flashing on the taskbar (asking for attention), newest last.
static ATTENTION: Mutex<Vec<isize>> = Mutex::new(Vec::new());

fn attention_list() -> std::sync::MutexGuard<'static, Vec<isize>> {
    ATTENTION.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn attention_windows() -> Vec<isize> {
    attention_list().clone()
}

/// The user answered these windows (clicked their tile).
pub fn dismiss_attention(hwnds: &[isize]) {
    attention_list().retain(|hwnd| !hwnds.contains(hwnd));
}

fn flash(hwnd: isize) {
    let mut list = attention_list();
    if hwnd == 0 || list.contains(&hwnd) {
        return;
    }
    if list.len() >= 32 {
        list.remove(0);
    }
    list.push(hwnd);
    drop(list);
    signal("attention");
}

fn answered(hwnd: isize) {
    let mut list = attention_list();
    let before = list.len();
    list.retain(|known| *known != hwnd);
    let changed = list.len() != before;
    drop(list);
    if changed {
        signal("attention");
    }
}

fn shell_hook(code: usize, hwnd: isize) {
    match code {
        HSHELL_FLASH => flash(hwnd),
        HSHELL_WINDOWACTIVATED | HSHELL_RUDEAPPACTIVATED | HSHELL_WINDOWDESTROYED => answered(hwnd),
        _ => {}
    }
}
/// Mark `kind` pending and wake the delivery thread. If the flag was already
/// set, the delivery that clears it is still ahead and covers this signal too.
/// If the wake can't be queued, a wake is already waiting, and the drain it
/// triggers runs after this flag was set, so nothing is lost.
fn signal(kind: &'static str) {
    let Some(index) = KINDS.iter().position(|known| *known == kind) else {
        return;
    };
    if PENDING[index].swap(true, Ordering::AcqRel) {
        return;
    }
    if let Some(queue) = QUEUE.get() {
        let _ = queue.try_send(());
    }
}

/// Clear and return every pending kind.
fn take_pending() -> std::collections::HashSet<&'static str> {
    KINDS
        .iter()
        .zip(PENDING.iter())
        .filter(|(_, flag)| flag.swap(false, Ordering::AcqRel))
        .map(|(kind, _)| *kind)
        .collect()
}

#[implement(IAudioEndpointVolumeCallback)]
struct VolumeCallback;
impl IAudioEndpointVolumeCallback_Impl for VolumeCallback_Impl {
    fn OnNotify(&self, _: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
        signal("volume");
        Ok(())
    }
}
#[implement(IMMNotificationClient)]
struct DeviceCallback;
impl IMMNotificationClient_Impl for DeviceCallback_Impl {
    fn OnDefaultDeviceChanged(
        &self,
        flow: EDataFlow,
        role: ERole,
        _: &PCWSTR,
    ) -> windows::core::Result<()> {
        if flow == eRender && role == eConsole {
            signal("device");
        }
        Ok(())
    }
    fn OnDeviceStateChanged(&self, _: &PCWSTR, _: DEVICE_STATE) -> windows::core::Result<()> {
        signal("device");
        Ok(())
    }
    fn OnDeviceAdded(&self, _: &PCWSTR) -> windows::core::Result<()> {
        signal("device");
        Ok(())
    }
    fn OnDeviceRemoved(&self, _: &PCWSTR) -> windows::core::Result<()> {
        signal("device");
        Ok(())
    }
    fn OnPropertyValueChanged(&self, _: &PCWSTR, _: &PROPERTYKEY) -> windows::core::Result<()> {
        Ok(())
    }
}
struct VolumeLease {
    endpoint: IAudioEndpointVolume,
    callback: IAudioEndpointVolumeCallback,
}
impl Drop for VolumeLease {
    fn drop(&mut self) {
        unsafe {
            let _ = self.endpoint.UnregisterControlChangeNotify(&self.callback);
        }
    }
}
fn volume_lease(enumerator: &IMMDeviceEnumerator) -> Option<VolumeLease> {
    unsafe {
        let endpoint: IAudioEndpointVolume = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .ok()?
            .Activate(CLSCTX_ALL, None)
            .ok()?;
        let callback: IAudioEndpointVolumeCallback = VolumeCallback.into();
        endpoint.RegisterControlChangeNotify(&callback).ok()?;
        Some(VolumeLease { endpoint, callback })
    }
}
struct MediaLease {
    session: Session,
    properties: i64,
    playback: i64,
}
impl Drop for MediaLease {
    fn drop(&mut self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.properties);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback);
    }
}
fn media_lease(manager: &Sessions) -> Option<MediaLease> {
    let session = manager.GetCurrentSession().ok()?;
    let properties = session
        .MediaPropertiesChanged(&TypedEventHandler::new(|_, _| {
            signal("media");
            Ok(())
        }))
        .ok()?;
    let playback = match session.PlaybackInfoChanged(&TypedEventHandler::new(|_, _| {
        signal("media");
        Ok(())
    })) {
        Ok(token) => token,
        Err(_) => {
            let _ = session.RemoveMediaPropertiesChanged(properties);
            return None;
        }
    };
    Some(MediaLease {
        session,
        properties,
        playback,
    })
}
unsafe extern "system" fn window_event(
    _: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    object: i32,
    child: i32,
    _: u32,
    _: u32,
) {
    if event == EVENT_SYSTEM_FOREGROUND {
        LAST_FOREGROUND.store(hwnd.0 as isize, Ordering::Relaxed);
        // A window that asked for attention got it.
        answered(hwnd.0 as isize);
    }
    if event == EVENT_SYSTEM_FOREGROUND
        || (object == 0
            && child == 0
            && matches!(
                event,
                EVENT_OBJECT_CREATE | EVENT_OBJECT_DESTROY | EVENT_OBJECT_SHOW | EVENT_OBJECT_HIDE
            ))
    {
        signal("windows");
    }
}
unsafe extern "system" fn platform_message(
    hwnd: HWND,
    message: u32,
    wp: windows::Win32::Foundation::WPARAM,
    lp: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    let shell = SHELL_HOOK_MESSAGE.load(Ordering::Relaxed);
    if shell != 0 && message == shell {
        shell_hook(wp.0, lp.0);
    }
    match message {
        WM_CLIPBOARDUPDATE => signal("clipboard"),
        WM_POWERBROADCAST if wp.0 == PBT_POWERSETTINGCHANGE as usize => power_setting_changed(lp),
        // The accent colour (and with it, an automatic accent following a new
        // wallpaper) arrives as WM_DWMCOLORIZATIONCOLORCHANGED (0x0320).
        WM_SETTINGCHANGE | WM_THEMECHANGED | 0x0320 => signal("preferences"),
        WM_DISPLAYCHANGE => signal("display"),
        WM_POWERBROADCAST
            if wp.0 == PBT_APMRESUMEAUTOMATIC as usize || wp.0 == PBT_APMRESUMESUSPEND as usize =>
        {
            signal("resume");
        }
        _ => {}
    }
    DefWindowProcW(hwnd, message, wp, lp)
}

fn watch_windows() {
    std::thread::spawn(|| unsafe {
        use windows::core::w;
        use windows::Win32::System::DataExchange::{
            AddClipboardFormatListener, RemoveClipboardFormatListener,
        };
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        let instance = GetModuleHandleW(None).ok();
        let class = WNDCLASSW {
            lpfnWndProc: Some(platform_message),
            hInstance: instance.unwrap_or_default().into(),
            lpszClassName: w!("BookiPlatformEvents"),
            ..Default::default()
        };
        RegisterClassW(&class);
        let observer = CreateWindowExW(
            WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
            w!("BookiPlatformEvents"),
            w!(""),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.unwrap_or_default().into()),
            None,
        )
        .ok();
        let registered = observer.is_some_and(|hwnd| AddClipboardFormatListener(hwnd).is_ok());
        CLIPBOARD.store(registered, Ordering::Relaxed);
        // Display power and Energy Saver arrive as WM_POWERBROADCAST /
        // PBT_POWERSETTINGCHANGE on this hidden top-level window.
        let mut power = Vec::new();
        if let Some(hwnd) = observer {
            let recipient = windows::Win32::Foundation::HANDLE(hwnd.0);
            for guid in [
                CONSOLE_DISPLAY_STATE,
                ENERGY_SAVER_STATUS,
                POWER_SAVING_STATUS,
            ] {
                if let Ok(handle) =
                    RegisterPowerSettingNotification(recipient, &guid, DEVICE_NOTIFY_WINDOW_HANDLE)
                {
                    power.push(handle);
                }
            }
            // Taskbar-style notifications, including HSHELL_FLASH.
            let id = RegisterWindowMessageW(w!("SHELLHOOK"));
            if id != 0 && RegisterShellHookWindow(hwnd).as_bool() {
                SHELL_HOOK_MESSAGE.store(id, Ordering::Relaxed);
            }
        }
        let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
        let foreground = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(window_event),
            0,
            0,
            flags,
        );
        let objects = SetWinEventHook(
            EVENT_OBJECT_CREATE,
            EVENT_OBJECT_HIDE,
            None,
            Some(window_event),
            0,
            0,
            flags,
        );
        WINDOWS.store(
            !foreground.0.is_null() && !objects.0.is_null(),
            Ordering::Relaxed,
        );
        signal("ready");
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        for handle in power {
            let _ = UnregisterPowerSettingNotification(handle);
        }
        if let Some(hwnd) = observer {
            SHELL_HOOK_MESSAGE.store(0, Ordering::Relaxed);
            let _ = DeregisterShellHookWindow(hwnd);
            let _ = RemoveClipboardFormatListener(hwnd);
            let _ = DestroyWindow(hwnd);
        }
        CLIPBOARD.store(false, Ordering::Relaxed);
        WINDOWS.store(false, Ordering::Relaxed);
        signal("ready");
        let _ = UnhookWinEvent(foreground);
        let _ = UnhookWinEvent(objects);
    });
}
fn watch_catalog() {
    use windows::Win32::Foundation::WAIT_OBJECT_0;
    use windows::Win32::Storage::FileSystem::{
        FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
        FILE_NOTIFY_CHANGE_DIR_NAME, FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE,
    };
    use windows::Win32::System::Threading::WaitForMultipleObjects;
    std::thread::spawn(move || unsafe {
        let mut handles = Vec::new();
        for variable in ["APPDATA", "ProgramData"] {
            if let Ok(root) = std::env::var(variable) {
                let path = std::path::PathBuf::from(root).join("Microsoft\\Windows\\Start Menu");
                let wide: Vec<u16> = path
                    .to_string_lossy()
                    .encode_utf16()
                    .chain(Some(0))
                    .collect();
                if let Ok(handle) = FindFirstChangeNotificationW(
                    PCWSTR(wide.as_ptr()),
                    true,
                    FILE_NOTIFY_CHANGE_FILE_NAME
                        | FILE_NOTIFY_CHANGE_DIR_NAME
                        | FILE_NOTIFY_CHANGE_LAST_WRITE,
                ) {
                    handles.push(handle);
                }
            }
        }
        if handles.is_empty() {
            return;
        }
        CATALOG.store(true, Ordering::Relaxed);
        signal("ready");
        loop {
            let wait = WaitForMultipleObjects(&handles, false, u32::MAX);
            let index = wait.0.wrapping_sub(WAIT_OBJECT_0.0) as usize;
            if index >= handles.len() {
                break;
            }
            signal("catalog");
            if FindNextChangeNotification(handles[index]).is_err() {
                break;
            }
        }
        CATALOG.store(false, Ordering::Relaxed);
        signal("ready");
        for handle in handles {
            let _ = FindCloseChangeNotification(handle);
        }
    });
}
/// One wake-up queue for the process, with a 100ms coalescing window.
pub fn start(deliver: Arc<dyn Fn(&str) + Send + Sync>) {
    let (tx, rx) = sync_channel::<()>(1);
    if QUEUE.set(tx).is_err() {
        return;
    }
    watch_windows();
    watch_catalog();
    std::thread::spawn(move || {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let manager = Sessions::RequestAsync()
            .ok()
            .and_then(|task| task.join().ok());
        let session_token = manager.as_ref().and_then(|manager| {
            manager
                .CurrentSessionChanged(&TypedEventHandler::new(|_, _| {
                    signal("session");
                    Ok(())
                }))
                .ok()
        });
        MEDIA.store(session_token.is_some(), Ordering::Relaxed);
        let mut media = manager.as_ref().and_then(media_lease);
        let enumerator: Option<IMMDeviceEnumerator> =
            unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok() };
        let device_callback: IMMNotificationClient = DeviceCallback.into();
        let device_registered = enumerator.as_ref().is_some_and(|enumerator| unsafe {
            enumerator
                .RegisterEndpointNotificationCallback(&device_callback)
                .is_ok()
        });
        let mut volume = enumerator.as_ref().and_then(volume_lease);
        VOLUME.store(volume.is_some() && device_registered, Ordering::Relaxed);
        let package_catalog = windows::ApplicationModel::PackageCatalog::OpenForCurrentUser().ok();
        let _install_token = package_catalog.as_ref().and_then(|catalog| {
            catalog
                .PackageInstalling(&TypedEventHandler::new(
                    |_,
                     args: windows::core::Ref<
                        windows::ApplicationModel::PackageInstallingEventArgs,
                    >| {
                        if args
                            .ok()
                            .is_ok_and(|args| args.IsComplete().unwrap_or(false))
                        {
                            signal("catalog");
                        }
                        Ok(())
                    },
                ))
                .ok()
        });
        let _remove_token = package_catalog.as_ref().and_then(|catalog| {
            catalog
                .PackageUninstalling(&TypedEventHandler::new(
                    |_,
                     args: windows::core::Ref<
                        windows::ApplicationModel::PackageUninstallingEventArgs,
                    >| {
                        if args
                            .ok()
                            .is_ok_and(|args| args.IsComplete().unwrap_or(false))
                        {
                            signal("catalog");
                        }
                        Ok(())
                    },
                ))
                .ok()
        });
        deliver("ready");
        while rx.recv().is_ok() {
            // Let a burst settle, then take everything that is pending. A
            // signal set after this drain sends a fresh wake.
            let started = Instant::now();
            while let Some(remaining) = Duration::from_millis(100).checked_sub(started.elapsed()) {
                if rx.recv_timeout(remaining).is_err() {
                    break;
                }
            }
            let mut batch = take_pending();
            if batch.is_empty() {
                continue;
            }
            // Off and on inside one window: only the state it ended in counts.
            if batch.remove("display-off") | batch.remove("display-on") {
                batch.insert(if DISPLAY_ON.load(Ordering::Relaxed) {
                    "display-on"
                } else {
                    "display-off"
                });
            }
            if batch.remove("session") {
                media = manager.as_ref().and_then(media_lease);
                batch.insert("media");
            }
            if batch.remove("device") {
                volume = enumerator.as_ref().and_then(volume_lease);
                VOLUME.store(volume.is_some() && device_registered, Ordering::Relaxed);
                batch.insert("volume");
                deliver("ready");
            }
            for kind in batch {
                deliver(kind);
            }
        }
        drop(media);
        drop(volume);
    });
}
