//! Native change notifications. Callbacks only enqueue; queries run elsewhere.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{sync_channel, SyncSender},
    Arc, OnceLock,
};
use std::time::{Duration, Instant};
use windows::core::{implement, PCWSTR};
use windows::Foundation::{EventRegistrationToken, TypedEventHandler};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Sessions,
};
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{
    eConsole, eRender, EDataFlow, ERole, IMMDeviceEnumerator, IMMNotificationClient,
    IMMNotificationClient_Impl, MMDeviceEnumerator, AUDIO_VOLUME_NOTIFICATION_DATA, DEVICE_STATE,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
use windows::Win32::UI::WindowsAndMessaging::*;

static QUEUE: OnceLock<SyncSender<&'static str>> = OnceLock::new();
pub static MEDIA: AtomicBool = AtomicBool::new(false);
pub static VOLUME: AtomicBool = AtomicBool::new(false);
pub static WINDOWS: AtomicBool = AtomicBool::new(false);
pub static CLIPBOARD: AtomicBool = AtomicBool::new(false);
pub static CATALOG: AtomicBool = AtomicBool::new(false);
fn signal(kind: &'static str) {
    if let Some(queue) = QUEUE.get() {
        let _ = queue.try_send(kind);
    }
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
    properties: EventRegistrationToken,
    playback: EventRegistrationToken,
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
    _: HWND,
    object: i32,
    child: i32,
    _: u32,
    _: u32,
) {
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
    match message {
        WM_CLIPBOARDUPDATE => signal("clipboard"),
        WM_SETTINGCHANGE | WM_THEMECHANGED => signal("preferences"),
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
            instance.unwrap_or_default(),
            None,
        )
        .ok();
        let registered = observer.is_some_and(|hwnd| AddClipboardFormatListener(hwnd).is_ok());
        CLIPBOARD.store(registered, Ordering::Relaxed);
        let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
        let foreground = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            HMODULE::default(),
            Some(window_event),
            0,
            0,
            flags,
        );
        let objects = SetWinEventHook(
            EVENT_OBJECT_CREATE,
            EVENT_OBJECT_HIDE,
            HMODULE::default(),
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
        while GetMessageW(&mut message, HWND::default(), 0, 0).0 > 0 {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        if let Some(hwnd) = observer {
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
/// One bounded event queue for the process, with a 100ms coalescing window.
pub fn start(deliver: Arc<dyn Fn(&str) + Send + Sync>) {
    let (tx, rx) = sync_channel(32);
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
            .and_then(|task| task.get().ok());
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
                    |_, args: &Option<windows::ApplicationModel::PackageInstallingEventArgs>| {
                        if args
                            .as_ref()
                            .is_some_and(|args| args.IsComplete().unwrap_or(false))
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
                    |_, args: &Option<windows::ApplicationModel::PackageUninstallingEventArgs>| {
                        if args
                            .as_ref()
                            .is_some_and(|args| args.IsComplete().unwrap_or(false))
                        {
                            signal("catalog");
                        }
                        Ok(())
                    },
                ))
                .ok()
        });
        deliver("ready");
        while let Ok(first) = rx.recv() {
            let started = Instant::now();
            let mut batch = std::collections::HashSet::from([first]);
            while let Some(remaining) = Duration::from_millis(100).checked_sub(started.elapsed()) {
                match rx.recv_timeout(remaining) {
                    Ok(kind) => {
                        batch.insert(kind);
                    }
                    Err(_) => break,
                }
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
