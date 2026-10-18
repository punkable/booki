//! Battery of Logitech mice and keyboards on a Bolt or Unifying receiver
//! (or connected directly), through Logitech's documented HID++ 2.0
//! protocol. Logi Options+ can keep running: requests carry Booki's own
//! software id and only answers with that id are read.
use super::devices::DeviceBattery;
use hidapi::{HidApi, HidDevice};

const LOGITECH: u16 = 0x046d;
/// The vendor collection that carries HID++ long reports.
const HIDPP_USAGE_PAGE: u16 = 0xff00;
const HIDPP_LONG_USAGE: u16 = 0x0002;
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
        if info.vendor_id() != LOGITECH
            || info.usage_page() != HIDPP_USAGE_PAGE
            || info.usage() != HIDPP_LONG_USAGE
        {
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
    let level = unified_battery(device, slot).or_else(|| battery_status(device, slot))?;
    let name = device_name(device, slot).unwrap_or_else(|| "Logitech".to_string());
    let kind = device_type(device, slot).unwrap_or_else(|| super::devices::kind_from_name(&name));
    Some(DeviceBattery {
        name,
        level,
        source: "logitech",
        kind,
        charging: false,
    })
}

/// Feature 0x1004, get_status: state of charge in percent.
fn unified_battery(device: &HidDevice, slot: u8) -> Option<u8> {
    let index = feature_index(device, slot, UNIFIED_BATTERY)?;
    let reply = request(device, slot, index, 1, &[])?;
    let level = reply[4];
    (1..=100).contains(&level).then_some(level)
}

/// Feature 0x1000, GetBatteryLevelStatus: level in percent.
fn battery_status(device: &HidDevice, slot: u8) -> Option<u8> {
    let index = feature_index(device, slot, BATTERY_STATUS)?;
    let reply = request(device, slot, index, 0, &[])?;
    let level = reply[4];
    (1..=100).contains(&level).then_some(level)
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
}
