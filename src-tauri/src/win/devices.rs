//! Battery levels of connected devices: Bluetooth headsets, earbuds, mice,
//! keyboards and controllers that report one to Windows. This is the same
//! value Settings > Bluetooth & devices shows next to each device. Logitech
//! receivers (win/logitech.rs) and wireless headsets through HeadsetControl
//! join the same list.

use windows::core::{Interface, HSTRING};
use windows::Devices::Enumeration::Pnp::{PnpObject, PnpObjectType};
use windows::Foundation::IReference;

/// DEVPKEY_Bluetooth_Battery: the battery percentage (a byte).
const BATTERY: &str = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
/// DEVPKEY_Device_IsConnected: whether the device is connected right now.
const CONNECTED: &str = "{83DA6326-97A6-4088-9453-A1923F573B29} 15";
const NAME: &str = "System.ItemNameDisplay";
/// DEVPKEY_Bluetooth_ClassOfDevice: the Bluetooth class of device (a u32).
const CLASS_OF_DEVICE: &str = "{2BD67D8B-8BEB-48D5-87E0-6CDA3428040A} 10";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct DeviceBattery {
    pub name: String,
    pub level: u8,
    /// Where the reading came from: "bluetooth", "logitech" or a plugin id
    /// such as "headsetcontrol", so the widget can say so.
    pub source: &'static str,
    /// What the device is, for its icon: "headset", "mouse", "keyboard",
    /// "gamepad" or "other".
    pub kind: &'static str,
}

/// The kind from a Bluetooth class of device: major class 4 is audio,
/// 5 is a peripheral whose minor bits say keyboard (01) or pointer (10).
pub fn kind_from_class(cod: u32) -> Option<&'static str> {
    match (cod >> 8) & 0x1F {
        4 => Some("headset"),
        5 => match (cod >> 6) & 0x3 {
            1 => Some("keyboard"),
            2 => Some("mouse"),
            _ => match (cod >> 2) & 0xF {
                1 | 2 => Some("gamepad"),
                _ => None,
            },
        },
        _ => None,
    }
}

/// The kind guessed from a device name, when the device does not say.
pub fn kind_from_name(name: &str) -> &'static str {
    let n = name.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| n.contains(w));
    if has(&[
        "headset",
        "headphone",
        "buds",
        "airpods",
        "earbud",
        "arctis",
        "audífono",
        "auricular",
        "wh-",
        "wf-",
        "jabra",
        "bose",
        "soundcore",
    ]) {
        "headset"
    } else if has(&[
        "keyboard",
        "teclado",
        "keys",
        "mx mechanical",
        "k380",
        "k780",
    ]) {
        "keyboard"
    } else if has(&[
        "mouse",
        "ratón",
        "mx master",
        "mx anywhere",
        "trackball",
        "trackpad",
        "g pro wireless",
        "g502",
        "g305",
    ]) {
        "mouse"
    } else if has(&[
        "controller",
        "gamepad",
        "xbox",
        "dualsense",
        "dualshock",
        "joy-con",
        "mando",
    ]) {
        "gamepad"
    } else {
        "other"
    }
}

/// Connected devices that report a battery level, lowest first, one entry
/// per name (a device can appear once per profile, such as LE and Classic).
pub fn device_batteries() -> Vec<DeviceBattery> {
    let mut list = query().unwrap_or_default();
    list.extend(headsetcontrol());
    list.extend(super::logitech::batteries());
    merge(list)
}

/// Wireless headsets on a USB dongle (SteelSeries Arctis, Logitech G,
/// Corsair, HyperX…) never show up as Bluetooth. When the open-source
/// HeadsetControl tool is installed, Booki asks it, as a separate program,
/// for their battery. Nothing is asked when it is not on the PATH.
fn headsetcontrol() -> Vec<DeviceBattery> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // The copy installed from Settings comes first, then one on the PATH.
    let program = crate::plugins::find("headsetcontrol")
        .and_then(crate::plugins::executable)
        .map(|p| p.into_os_string())
        .unwrap_or_else(|| "headsetcontrol".into());
    let Ok(output) = std::process::Command::new(program)
        .args(["-b", "-o", "json"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else {
        return Vec::new();
    };
    parse_headsetcontrol(&String::from_utf8_lossy(&output.stdout))
}

/// HeadsetControl's JSON: `{"devices": [{"device"|"product": name,
/// "battery": {"status": "BATTERY_AVAILABLE"|"BATTERY_CHARGING"…, "level": n}}]}`.
fn parse_headsetcontrol(text: &str) -> Vec<DeviceBattery> {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let Some(devices) = json.get("devices").and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    devices
        .iter()
        .filter_map(|device| {
            let battery = device.get("battery")?;
            let status = battery.get("status")?.as_str()?;
            if !matches!(status, "BATTERY_AVAILABLE" | "BATTERY_CHARGING") {
                return None;
            }
            let level = battery.get("level")?.as_i64()?;
            let name = device
                .get("device")
                .or_else(|| device.get("product"))?
                .as_str()?
                .trim()
                .to_string();
            ((0..=100).contains(&level) && !name.is_empty()).then_some(DeviceBattery {
                name,
                level: level as u8,
                source: "headsetcontrol",
                kind: "headset",
            })
        })
        .collect()
}

fn query() -> windows::core::Result<Vec<DeviceBattery>> {
    let wanted: windows_collections::IIterable<HSTRING> = vec![
        HSTRING::from(BATTERY),
        HSTRING::from(CONNECTED),
        HSTRING::from(NAME),
        HSTRING::from(CLASS_OF_DEVICE),
    ]
    .into();
    // Ask only for devices that carry a battery level. If this Windows build
    // rejects the filter, list every device and skip the ones without it.
    let found = match PnpObject::FindAllAsyncAqsFilter(
        PnpObjectType::Device,
        &wanted,
        &HSTRING::from(format!("{BATTERY}:<>[]")),
    )
    .and_then(|op| op.join())
    {
        Ok(found) => found,
        Err(_) => PnpObject::FindAllAsync(PnpObjectType::Device, &wanted)?.join()?,
    };
    let mut out: Vec<DeviceBattery> = Vec::new();
    for i in 0..found.Size()? {
        let Ok(device) = found.GetAt(i) else { continue };
        let Ok(props) = device.Properties() else {
            continue;
        };
        let read = |key: &str| props.Lookup(&HSTRING::from(key)).ok();
        let Some(level) = read(BATTERY).and_then(|v| v.cast::<IReference<u8>>().ok()?.Value().ok())
        else {
            continue;
        };
        // Windows keeps the last level of devices that went away; only the
        // ones in use belong in the dock.
        let connected = read(CONNECTED)
            .and_then(|v| v.cast::<IReference<bool>>().ok()?.Value().ok())
            .unwrap_or(true);
        if !connected || level > 100 {
            continue;
        }
        let name = read(NAME)
            .and_then(|v| v.cast::<IReference<HSTRING>>().ok()?.Value().ok())
            .map(|s| s.to_string_lossy())
            .unwrap_or_default();
        if name.trim().is_empty() {
            continue;
        }
        let kind = read(CLASS_OF_DEVICE)
            .and_then(|v| v.cast::<IReference<u32>>().ok()?.Value().ok())
            .and_then(kind_from_class)
            .unwrap_or_else(|| kind_from_name(&name));
        out.push(DeviceBattery {
            name,
            level,
            source: "bluetooth",
            kind,
        });
    }
    Ok(out)
}

/// One entry per device name, keeping the lowest reading, lowest first.
fn merge(mut list: Vec<DeviceBattery>) -> Vec<DeviceBattery> {
    list.sort_by(|a, b| a.name.cmp(&b.name).then(a.level.cmp(&b.level)));
    list.dedup_by(|later, first| later.name == first.name);
    list.sort_by(|a, b| a.level.cmp(&b.level).then(a.name.cmp(&b.name)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headsetcontrol_json_gives_available_and_charging_levels() {
        let json = r#"{"devices":[
            {"device":"SteelSeries Arctis Nova 7","battery":{"status":"BATTERY_AVAILABLE","level":62}},
            {"product":"G Pro X","battery":{"status":"BATTERY_CHARGING","level":30}},
            {"device":"Off","battery":{"status":"BATTERY_UNAVAILABLE","level":-1}}]}"#;
        let list = parse_headsetcontrol(json);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "SteelSeries Arctis Nova 7");
        assert_eq!(list[1].level, 30);
        assert!(parse_headsetcontrol("not json").is_empty());
    }

    #[test]
    fn merge_keeps_one_lowest_reading_per_device() {
        let d = |name: &str, level| DeviceBattery {
            name: name.into(),
            level,
            source: "bluetooth",
            kind: "other",
        };
        let merged = merge(vec![d("Buds", 80), d("Mouse", 40), d("Buds", 75)]);
        assert_eq!(merged, vec![d("Mouse", 40), d("Buds", 75)]);
    }

    #[test]
    fn device_kinds_from_class_and_name() {
        assert_eq!(kind_from_class(0x240404), Some("headset"));
        assert_eq!(kind_from_class(0x002540), Some("keyboard"));
        assert_eq!(kind_from_class(0x002580), Some("mouse"));
        assert_eq!(kind_from_class(0x002508), Some("gamepad"));
        assert_eq!(kind_from_class(0x000100), None);
        assert_eq!(kind_from_name("Galaxy Buds2 Pro"), "headset");
        assert_eq!(kind_from_name("MX Master 3S"), "mouse");
        assert_eq!(kind_from_name("MX Keys S"), "keyboard");
        assert_eq!(kind_from_name("Xbox Wireless Controller"), "gamepad");
        assert_eq!(kind_from_name("Pixel Watch"), "other");
    }
}
