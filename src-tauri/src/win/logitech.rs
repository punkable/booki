//! Battery of Logitech mice and keyboards on a Bolt or Unifying receiver
//! (or connected directly), through Logitech's documented HID++ 2.0
//! protocol. Logi Options+ can keep running: requests carry Booki's own
//! software id and only answers with that id are read.
use super::devices::DeviceBattery;
use hidapi::{HidApi, HidDevice};

const LOGITECH: u16 = 0x046d;
/// The vendor collection that carries HID++ long reports: 0xff00/0x0002 on
/// receivers and USB, 0xff43/0x0202 on devices paired over Bluetooth LE
/// (MX Keys, MX Master…), where Windows itself only reports a percent and
/// never whether the device is charging.
const HIDPP_USAGE_PAGE: u16 = 0xff00;
const HIDPP_LONG_USAGE: u16 = 0x0002;
const HIDPP_BLE_USAGE_PAGE: u16 = 0xff43;
const HIDPP_BLE_USAGE: u16 = 0x0202;

/// True for a HID collection that speaks HID++ long reports.
pub fn is_hidpp_collection(usage_page: u16, usage: u16) -> bool {
    (usage_page == HIDPP_USAGE_PAGE && usage == HIDPP_LONG_USAGE)
        || (usage_page == HIDPP_BLE_USAGE_PAGE && usage == HIDPP_BLE_USAGE)
}
const LONG: u8 = 0x11;
const SHORT: u8 = 0x10;
/// Booki's software id (low nibble of the function byte).
const SW: u8 = 0x0b;
const ROOT: u8 = 0x00;
const DEVICE_NAME: u16 = 0x0005;
const BATTERY_STATUS: u16 = 0x1000;
const UNIFIED_BATTERY: u16 = 0x1004;
/// Receivers address paired devices 1–6; a device plugged in or on
/// Bluetooth answers on 0xff.
const RECEIVER_SLOTS: std::ops::RangeInclusive<u8> = 1..=6;
const DIRECT: u8 = 0xff;

pub fn batteries() -> Vec<DeviceBattery> {
    let Ok(api) = HidApi::new() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for info in api.device_list() {
        if info.vendor_id() != LOGITECH || !is_hidpp_collection(info.usage_page(), info.usage()) {
            continue;
        }
        let Ok(device) = info.open_device(&api) else {
            continue;
        };
        let receiver = info
            .product_string()
            .is_some_and(|p| p.to_ascii_lowercase().contains("receiver"));
        let slots: Vec<u8> = if receiver {
            RECEIVER_SLOTS.collect()
        } else {
            vec![DIRECT]
        };
        for slot in slots {
            if let Some(battery) = read_device(&device, slot) {
                out.push(battery);
            }
        }
    }
    out
}

fn read_device(device: &HidDevice, slot: u8) -> Option<DeviceBattery> {
    let unified = unified_battery(device, slot);
    let (level, mut charging) = match unified {
        Some(pair) => pair,
        None => battery_status(device, slot)?,
    };
    // MX Keys Mini often reports a percent on 0x1004 with charging status 0
    // while it is on the charger. The legacy feature still says so.
    if unified.is_some() && !charging {
        if let Some((_, legacy)) = battery_status(device, slot) {
            charging = legacy;
        }
    }
    let name = device_name(device, slot).unwrap_or_else(|| "Logitech".to_string());
    let kind = device_type(device, slot).unwrap_or_else(|| super::devices::kind_from_name(&name));
    Some(DeviceBattery {
        name,
        level,
        source: "logitech",
        kind,
        charging,
    })
}

/// Feature 0x1004, get_status. Parameters, from the first one: percent,
/// level flags (1 critical, 2 low, 4 good, 8 full), charging status
/// (0 discharging, 1 charging, 2 slow, 3 complete, 4 error), external power
/// (1 when the cable is in).
pub fn unified_charging(params: &[u8]) -> bool {
    let status = params.get(2).copied().unwrap_or(0);
    let external = params.get(3).copied().unwrap_or(0);
    // Firmware differs on what it puts in "external power": some send 1 for
    // the cable, others a bit set or 2. Any non-zero value means plugged in.
    matches!(status, 1..=3) || external != 0
}

fn unified_battery(device: &HidDevice, slot: u8) -> Option<(u8, bool)> {
    let index = feature_index(device, slot, UNIFIED_BATTERY)?;
    let reply = request(device, slot, index, 1, &[])?;
    let level = reply[4];
    let charging = unified_charging(&reply[4..]);
    log_status_change(slot, &reply[4..8]);
    if !(1..=100).contains(&level) {
        return None;
    }
    // The percent has been seen to drop to 15 right after unplugging while
    // the level flags (and Logi Options+) still said the battery was good.
    // When the two disagree, the percent is not shown: the caller falls back
    // to the last agreeing reading or to the legacy battery feature.
    if !level_agrees(level, reply[5]) {
        log::info!(
            "logitech slot {slot} percent {level} disagrees with level flags {:#04x}",
            reply[5]
        );
        return last_agreeing(slot)
            .map(|l| (l, charging))
            .or_else(|| battery_status(device, slot).map(|(l, legacy)| (l, charging || legacy)));
    }
    remember_agreeing(slot, level);
    Some((level, charging))
}

/// Does a 0x1004 percent fit its level flags (1 critical, 2 low, 4 good,
/// 8 full)? Firmware without flags (0) is taken at its word.
pub fn level_agrees(percent: u8, flags: u8) -> bool {
    if flags & 0x0c != 0 && percent <= 20 {
        return false; // "good" or "full", yet nearly empty
    }
    if flags & 0x03 != 0 && flags & 0x0c == 0 && percent >= 60 {
        return false; // "critical" or "low", yet more than half full
    }
    true
}

static AGREEING: std::sync::Mutex<Vec<(u8, u8)>> = std::sync::Mutex::new(Vec::new());

fn remember_agreeing(slot: u8, level: u8) {
    if let Ok(mut seen) = AGREEING.lock() {
        seen.retain(|(s, _)| *s != slot);
        seen.push((slot, level));
    }
}

fn last_agreeing(slot: u8) -> Option<u8> {
    AGREEING
        .lock()
        .ok()?
        .iter()
        .find(|(s, _)| *s == slot)
        .map(|(_, l)| *l)
}

/// Write the raw 0x1004 status to Booki's log when it changes, so a device
/// whose charging is not recognised can be diagnosed from a log file.
fn log_status_change(slot: u8, params: &[u8]) {
    static LAST: std::sync::Mutex<Vec<(u8, Vec<u8>)>> = std::sync::Mutex::new(Vec::new());
    let Ok(mut last) = LAST.lock() else { return };
    if last.iter().any(|(s, p)| *s == slot && p == params) {
        return;
    }
    last.retain(|(s, _)| *s != slot);
    last.push((slot, params.to_vec()));
    log::info!("logitech slot {slot} unified battery status {params:02x?}");
}

/// Feature 0x1000, GetBatteryLevelStatus: level in percent, the next level,
/// then the status (1 recharging, 2 almost full, 3 full, 4 slow recharge;
/// 0 discharging, above 4 an error).
fn battery_status(device: &HidDevice, slot: u8) -> Option<(u8, bool)> {
    let index = feature_index(device, slot, BATTERY_STATUS)?;
    let reply = request(device, slot, index, 0, &[])?;
    let level = reply[4];
    let charging = matches!(reply.get(6), Some(1..=4));
    (1..=100).contains(&level).then_some((level, charging))
}

/// Feature 0x0005: the marketing name, 16 characters per request.
fn device_name(device: &HidDevice, slot: u8) -> Option<String> {
    let index = feature_index(device, slot, DEVICE_NAME)?;
    let length = request(device, slot, index, 0, &[])?[4] as usize;
    let mut bytes = Vec::with_capacity(length);
    while bytes.len() < length.min(64) {
        let reply = request(device, slot, index, 1, &[bytes.len() as u8])?;
        let take = (length - bytes.len()).min(16);
        bytes.extend_from_slice(&reply[4..4 + take]);
    }
    let name = String::from_utf8_lossy(&bytes)
        .trim_matches('\0')
        .trim()
        .to_string();
    (!name.is_empty()).then_some(name)
}

/// DeviceTypeAndName, getDeviceType: 0 keyboard, 2 numpad, 3 mouse,
/// 4 trackpad, 5 trackball, 8 headset.
fn device_type(device: &HidDevice, slot: u8) -> Option<&'static str> {
    let index = feature_index(device, slot, DEVICE_NAME)?;
    match request(device, slot, index, 2, &[])?[4] {
        0 | 2 => Some("keyboard"),
        3..=5 => Some("mouse"),
        8 => Some("headset"),
        _ => None,
    }
}

/// Root feature, getFeature: where a feature lives on this device (None
/// when it has none, or the slot is empty or asleep).
fn feature_index(device: &HidDevice, slot: u8, feature: u16) -> Option<u8> {
    let [hi, lo] = feature.to_be_bytes();
    let reply = request(device, slot, ROOT, 0, &[hi, lo])?;
    (reply[4] != 0).then_some(reply[4])
}

/// One HID++ 2.0 request; the 20-byte answer, or None on an error or when
/// nothing answers in time.
fn request(
    device: &HidDevice,
    slot: u8,
    feature: u8,
    function: u8,
    params: &[u8],
) -> Option<[u8; 20]> {
    let mut message = [0u8; 20];
    message[0] = LONG;
    message[1] = slot;
    message[2] = feature;
    message[3] = (function << 4) | SW;
    message[4..4 + params.len()].copy_from_slice(params);
    device.write(&message).ok()?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(400);
    let mut buffer = [0u8; 64];
    while std::time::Instant::now() < deadline {
        let read = device.read_timeout(&mut buffer, 100).ok()?;
        if read < 7 || buffer[1] != slot {
            continue;
        }
        match classify(&buffer[..read], feature, message[3]) {
            Reply::Answer => {
                let mut reply = [0u8; 20];
                reply.copy_from_slice(&buffer[..20]);
                return Some(reply);
            }
            Reply::Error => return None,
            Reply::Other => continue,
        }
    }
    None
}

#[derive(Debug, PartialEq)]
enum Reply {
    Answer,
    Error,
    Other,
}

/// Is this report the answer to our request, an error about it, or
/// something else (notifications, other software's traffic)?
fn classify(report: &[u8], feature: u8, function_sw: u8) -> Reply {
    match (report[0], report[2]) {
        // HID++ 2.0 error: [0x11, slot, 0xff, feature, function|sw, code].
        (LONG, 0xff) if report[3] == feature && report[4] == function_sw => Reply::Error,
        // HID++ 1.0 error (empty or sleeping slot): [0x10, slot, 0x8f, …].
        (SHORT, 0x8f) if report[3] == feature => Reply::Error,
        (LONG, f) if f == feature && report[3] == function_sw && report.len() >= 20 => {
            Reply::Answer
        }
        _ => Reply::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_percent_that_contradicts_the_level_flags_is_not_trusted() {
        assert!(!level_agrees(15, 0x04)); // good, yet 15 %
        assert!(!level_agrees(10, 0x08)); // full, yet 10 %
        assert!(!level_agrees(85, 0x02)); // low, yet 85 %
        assert!(level_agrees(15, 0x02));
        assert!(level_agrees(90, 0x04));
        assert!(level_agrees(15, 0x00)); // no flags: trust the percent
    }

    #[test]
    fn replies_are_matched_by_feature_and_software_id() {
        let mut answer = [0u8; 20];
        answer[..5].copy_from_slice(&[LONG, 1, 0x08, 0x1b, 64]);
        assert_eq!(classify(&answer, 0x08, 0x1b), Reply::Answer);
        // Logi Options+ asking the same feature with its own software id.
        assert_eq!(classify(&answer, 0x08, 0x1a), Reply::Other);
        let mut error = [0u8; 20];
        error[..6].copy_from_slice(&[LONG, 1, 0xff, 0x08, 0x1b, 0x05]);
        assert_eq!(classify(&error, 0x08, 0x1b), Reply::Error);
        assert_eq!(
            classify(&[SHORT, 3, 0x8f, 0x00, 0x0b, 0x09, 0], 0x00, 0x0b),
            Reply::Error
        );
    }

    #[test]
    fn receiver_usb_and_bluetooth_hidpp_collections_are_read() {
        assert!(is_hidpp_collection(0xff00, 0x0002));
        assert!(is_hidpp_collection(0xff43, 0x0202));
        assert!(!is_hidpp_collection(0xff00, 0x0001));
        assert!(!is_hidpp_collection(0x0001, 0x0006));
    }
    #[test]
    fn mx_keys_on_the_charger_is_charging_and_a_plain_battery_is_not() {
        // percent, level "good", status still discharging, external power on.
        assert!(unified_charging(&[78, 4, 0, 1]));
        assert!(unified_charging(&[40, 2, 1, 0]));
        assert!(unified_charging(&[100, 8, 3, 1]));
        assert!(!unified_charging(&[78, 4, 0, 0]));
        // Status 4 is an error, not "on the charger".
        assert!(!unified_charging(&[10, 1, 4, 0]));
        // A level flag is not external power.
        assert!(!unified_charging(&[50, 0x10, 0, 0]));
        // Firmware that reports the cable as 2 or a bit flag is still plugged in.
        assert!(unified_charging(&[64, 4, 0, 2]));
    }
}
