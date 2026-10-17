//! Battery levels of connected devices: Bluetooth headsets, earbuds, mice,
//! keyboards and controllers that report one to Windows. This is the same
//! value Settings > Bluetooth & devices shows next to each device.

use windows::core::{Interface, HSTRING};
use windows::Devices::Enumeration::Pnp::{PnpObject, PnpObjectType};
use windows::Foundation::IReference;

/// DEVPKEY_Bluetooth_Battery: the battery percentage (a byte).
const BATTERY: &str = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
/// DEVPKEY_Device_IsConnected: whether the device is connected right now.
const CONNECTED: &str = "{83DA6326-97A6-4088-9453-A1923F573B29} 15";
const NAME: &str = "System.ItemNameDisplay";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct DeviceBattery {
    pub name: String,
    pub level: u8,
}

/// Connected devices that report a battery level, lowest first, one entry
/// per name (a device can appear once per profile, such as LE and Classic).
pub fn device_batteries() -> Vec<DeviceBattery> {
    query().unwrap_or_default()
}

fn query() -> windows::core::Result<Vec<DeviceBattery>> {
    let wanted: windows_collections::IIterable<HSTRING> = vec![
        HSTRING::from(BATTERY),
        HSTRING::from(CONNECTED),
        HSTRING::from(NAME),
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
        out.push(DeviceBattery { name, level });
    }
    Ok(merge(out))
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
    fn merge_keeps_one_lowest_reading_per_device() {
        let d = |name: &str, level| DeviceBattery {
            name: name.into(),
            level,
        };
        let merged = merge(vec![d("Buds", 80), d("Mouse", 40), d("Buds", 75)]);
        assert_eq!(merged, vec![d("Mouse", 40), d("Buds", 75)]);
    }
}
