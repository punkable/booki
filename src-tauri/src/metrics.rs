//! Live system metrics for the System and Battery widgets.

use super::*;

/// Live system metrics for the dock widgets (CPU %, memory, network throughput).
pub(crate) static SYS: Mutex<Option<sysinfo::System>> = Mutex::new(None);

pub(crate) static NETS: Mutex<Option<(sysinfo::Networks, std::time::Instant)>> = Mutex::new(None);

pub(crate) static DISKS: Mutex<Option<sysinfo::Disks>> = Mutex::new(None);

#[derive(serde::Serialize)]
pub(crate) struct SystemStats {
    pub(crate) cpu: f32,
    pub(crate) mem: f32,
    pub(crate) mem_used_mb: u64,
    pub(crate) mem_total_mb: u64,
    pub(crate) net_down_kbps: u64,
    pub(crate) net_up_kbps: u64,
    pub(crate) disk: f32,
    pub(crate) disk_used_gb: u64,
    pub(crate) disk_total_gb: u64,
    pub(crate) uptime_secs: u64,
    pub(crate) battery: i32,
    pub(crate) charging: bool,
}

/// Sample CPU/memory/network. Keeps persistent handles so CPU usage and network
/// deltas are measured between calls (the dock polls this every couple seconds,
/// and only while it's visible — so idle cost stays near zero).
#[tauri::command]
pub(crate) async fn system_stats() -> Result<SystemStats, String> {
    tauri::async_runtime::spawn_blocking(collect_system_stats)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) fn collect_system_stats() -> SystemStats {
    let mut guard = SYS.lock().unwrap();
    let sys = guard.get_or_insert_with(sysinfo::System::new);
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu = sys.global_cpu_usage();
    let total = sys.total_memory().max(1);
    let used = sys.used_memory();
    let mem = (used as f64 / total as f64 * 100.0) as f32;

    let mut nguard = NETS.lock().unwrap();
    let entry = nguard.get_or_insert_with(|| {
        (
            sysinfo::Networks::new_with_refreshed_list(),
            std::time::Instant::now(),
        )
    });
    entry.0.refresh(true);
    let secs = entry.1.elapsed().as_secs_f64().max(0.001);
    entry.1 = std::time::Instant::now();
    let (mut down, mut up) = (0u64, 0u64);
    for data in entry.0.values() {
        down += data.received();
        up += data.transmitted();
    }
    // Disk usage (aggregate across mounted disks) + system uptime. Keep the disk
    // list cached and just refresh its figures each poll — re-enumerating every
    // volume (opening handles) on every tick was needless work.
    let mut dguard = DISKS.lock().unwrap();
    let disks = dguard.get_or_insert_with(sysinfo::Disks::new_with_refreshed_list);
    for disk in disks.list_mut() {
        disk.refresh_specifics(sysinfo::DiskRefreshKind::nothing().with_storage());
    }
    let (mut dtotal, mut davail) = (0u64, 0u64);
    for d in disks.iter() {
        dtotal += d.total_space();
        davail += d.available_space();
    }
    let dused = dtotal.saturating_sub(davail);
    let disk = if dtotal > 0 {
        (dused as f64 / dtotal as f64 * 100.0) as f32
    } else {
        0.0
    };
    let gb = 1024 * 1024 * 1024;

    // Battery (Windows only). -1 = no battery (e.g. a desktop).
    #[cfg(windows)]
    let (battery, charging) = unsafe {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut s = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut s).is_ok()
            && s.BatteryFlag & 128 == 0
            && s.BatteryLifePercent != 255
        {
            (s.BatteryLifePercent as i32, s.ACLineStatus == 1)
        } else {
            (-1, false)
        }
    };
    #[cfg(not(windows))]
    let (battery, charging) = (-1i32, false);

    SystemStats {
        cpu,
        mem,
        mem_used_mb: used / 1024 / 1024,
        mem_total_mb: total / 1024 / 1024,
        net_down_kbps: (down as f64 / secs / 1024.0) as u64,
        net_up_kbps: (up as f64 / secs / 1024.0) as u64,
        disk,
        disk_used_gb: dused / gb,
        disk_total_gb: dtotal / gb,
        uptime_secs: sysinfo::System::uptime(),
        battery,
        charging,
    }
}
