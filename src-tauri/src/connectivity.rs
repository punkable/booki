//! Wi-Fi and Bluetooth state for the dock's Wi-Fi and Bluetooth widgets.
//!
//! Wi-Fi comes from `netsh wlan`, which ships with Windows and needs no
//! location or network permission beyond what Windows already grants a
//! signed-in user. Bluetooth is the radio from Windows.Devices.Radios. Booki
//! only reads names and signal levels and toggles the radio when asked; it
//! never connects to a network or pairs a device itself.

use serde::Serialize;

#[derive(Serialize, Default, Clone, Debug, PartialEq)]
pub(crate) struct WifiNetwork {
    pub ssid: String,
    /// 0–100, as Windows reports it.
    pub signal: u8,
}

#[derive(Serialize, Default, Debug, PartialEq)]
pub(crate) struct WifiStatus {
    /// False when the PC has no Wi-Fi adapter.
    pub adapter: bool,
    pub connected: bool,
    pub ssid: String,
    pub signal: u8,
}

/// The value after the first `:` of a `netsh` line ("    SSID   : Home").
fn value(line: &str) -> Option<&str> {
    line.split_once(':').map(|(_, v)| v.trim())
}

fn percent(text: &str) -> Option<u8> {
    text.trim().strip_suffix('%')?.trim().parse().ok()
}

/// Parse `netsh wlan show interfaces`. Labels are localized except "SSID",
/// "BSSID" and the "%" of the signal, so only those are relied on.
pub(crate) fn parse_interfaces(text: &str) -> WifiStatus {
    let mut status = WifiStatus::default();
    for line in text.lines() {
        let key = line.split(':').next().unwrap_or("").trim();
        if key.eq_ignore_ascii_case("SSID") {
            status.adapter = true;
            status.ssid = value(line).unwrap_or("").to_string();
        } else if let Some(p) = value(line).and_then(percent) {
            status.signal = p;
        } else if key.eq_ignore_ascii_case("BSSID") || key.contains("GUID") {
            status.adapter = true;
        }
    }
    status.connected = !status.ssid.is_empty();
    status
}

/// Parse `netsh wlan show networks mode=bssid`: "SSID 1 : name" starts a
/// network, the first "NN%" after it is its signal. Strongest first, one per name.
pub(crate) fn parse_networks(text: &str) -> Vec<WifiNetwork> {
    let mut out: Vec<WifiNetwork> = Vec::new();
    let mut current: Option<WifiNetwork> = None;
    for line in text.lines() {
        let key = line.split(':').next().unwrap_or("").trim();
        if key.starts_with("SSID ") {
            if let Some(n) = current.take() {
                out.push(n);
            }
            current = Some(WifiNetwork {
                ssid: value(line).unwrap_or("").to_string(),
                signal: 0,
            });
        } else if let (Some(n), Some(p)) = (current.as_mut(), value(line).and_then(percent)) {
            n.signal = n.signal.max(p);
        }
    }
    out.extend(current);
    out.retain(|n| !n.ssid.is_empty());
    out.sort_by_key(|n| std::cmp::Reverse(n.signal));
    let mut seen = std::collections::HashSet::new();
    out.retain(|n| seen.insert(n.ssid.clone()));
    out.truncate(12);
    out
}

#[cfg(windows)]
fn netsh(args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("netsh")
        .args(args)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    // netsh writes in the console code page; a lossy read keeps ASCII labels.
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[tauri::command]
pub(crate) async fn wifi_status() -> WifiStatus {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            netsh(&["wlan", "show", "interfaces"])
                .map(|t| parse_interfaces(&t))
                .unwrap_or_default()
        })
        .await
        .unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        WifiStatus::default()
    }
}

#[tauri::command]
pub(crate) async fn wifi_networks() -> Vec<WifiNetwork> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| {
            netsh(&["wlan", "show", "networks", "mode=bssid"])
                .map(|t| parse_networks(&t))
                .unwrap_or_default()
        })
        .await
        .unwrap_or_default()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Bluetooth radio: Some(on) when the PC has one, None otherwise.
#[tauri::command]
pub(crate) async fn bluetooth_state() -> Option<bool> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| crate::win::bluetooth_radio(None))
            .await
            .ok()
            .flatten()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Turn the Bluetooth radio on or off; returns the state Windows reports after.
#[tauri::command]
pub(crate) async fn bluetooth_set(on: bool) -> Option<bool> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || crate::win::bluetooth_radio(Some(on)))
            .await
            .ok()
            .flatten()
    }
    #[cfg(not(windows))]
    {
        let _ = on;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_connected_interface_in_any_language() {
        let text = "\n    Nombre                 : Wi-Fi\n    GUID                   : 1234\n    Estado                 : conectado\n    SSID                   : Casa Mariano\n    BSSID                  : aa:bb:cc:dd:ee:ff\n    Señal                  : 86%\n";
        let s = parse_interfaces(text);
        assert!(s.adapter && s.connected);
        assert_eq!(s.ssid, "Casa Mariano");
        assert_eq!(s.signal, 86);
    }

    #[test]
    fn a_disconnected_adapter_has_no_ssid() {
        let s = parse_interfaces("    Name : Wi-Fi\n    GUID : 1\n    State : disconnected\n");
        assert!(s.adapter && !s.connected);
        assert_eq!(
            parse_interfaces("There is no wireless interface on the system."),
            WifiStatus::default()
        );
    }

    #[test]
    fn lists_networks_strongest_first_once_each() {
        let text = "SSID 1 : Home\n    Network type : Infrastructure\n    BSSID 1 : aa\n         Signal : 40%\n    BSSID 2 : bb\n         Signal : 90%\nSSID 2 : Cafe\n         Signal : 70%\nSSID 3 : Home\n         Signal : 20%\nSSID 4 : \n         Signal : 99%\n";
        let n = parse_networks(text);
        assert_eq!(
            n.iter()
                .map(|x| (x.ssid.as_str(), x.signal))
                .collect::<Vec<_>>(),
            [("Home", 90), ("Cafe", 70)]
        );
    }
}
