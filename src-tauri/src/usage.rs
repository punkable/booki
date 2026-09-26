//! Which apps you use most, from Windows' own usage record.
//!
//! Explorer keeps a per-user count of how often each program and Start-menu
//! shortcut was launched, and for how long it had focus, under
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist`. Value
//! names are ROT13-encoded paths, often starting with a known-folder GUID; the
//! data is a small binary record. Booki reads it locally to put the apps you
//! actually use at the top of its add lists. Nothing is stored or sent.
//!
//! Parsing is pure and tested; only `frequent_apps()` touches the registry.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UsedApp {
    pub name: String,
    pub path: String,
    pub runs: u32,
    /// Milliseconds the app had focus, as Windows counts it.
    pub focus_ms: u32,
}

/// ROT13 on ASCII letters; everything else unchanged.
pub fn rot13(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' => (((c as u8 - b'a') + 13) % 26 + b'a') as char,
            'A'..='Z' => (((c as u8 - b'A') + 13) % 26 + b'A') as char,
            _ => c,
        })
        .collect()
}

/// Run count and focus time from a UserAssist record (Windows 7+ layout:
/// run count at byte 4, focus time in ms at byte 12). None for other shapes.
pub fn parse_record(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 16 {
        return None;
    }
    let u32_at = |i: usize| u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
    Some((u32_at(4), u32_at(12)))
}

/// Replace a leading `{KNOWNFOLDER-GUID}` with its path, using `lookup` for
/// the folders it knows. Plain paths pass through; unknown GUIDs give None.
pub fn resolve(decoded: &str, lookup: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    if let Some(rest) = decoded.strip_prefix('{') {
        let end = rest.find('}')?;
        let guid = &rest[..end].to_ascii_uppercase();
        let base = lookup(guid)?;
        let tail = rest[end + 1..].trim_start_matches('\\');
        return Some(format!("{}\\{}", base.trim_end_matches('\\'), tail));
    }
    if decoded.len() > 2 && decoded.as_bytes()[1] == b':' {
        return Some(decoded.to_string());
    }
    None
}

/// Programs that are plumbing, not apps anyone pins.
pub fn is_noise(path: &str) -> bool {
    let file = path
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    const NOISE: &[&str] = &[
        "explorer.exe",
        "rundll32.exe",
        "msiexec.exe",
        "mmc.exe",
        "consent.exe",
        "dllhost.exe",
        "openwith.exe",
        "searchapp.exe",
        "shellexperiencehost.exe",
        "booki.exe",
    ];
    if NOISE.contains(&file.as_str()) {
        return true;
    }
    ["uninstall", "unins0", "setup", "installer", "update"]
        .iter()
        .any(|w| file.contains(w))
        || !(file.ends_with(".exe") || file.ends_with(".lnk"))
}

/// Display name for a path: its file name without the extension.
pub fn display_name(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    file.strip_suffix(".lnk")
        .or_else(|| file.strip_suffix(".exe"))
        .unwrap_or(file)
        .to_string()
}

/// Rank, dedupe by name and keep the top `limit`.
pub fn rank(mut apps: Vec<UsedApp>, limit: usize) -> Vec<UsedApp> {
    // Focus time is the better signal of "use"; runs break ties and cover
    // apps that were launched but never measured.
    apps.sort_by(|a, b| {
        b.focus_ms
            .cmp(&a.focus_ms)
            .then(b.runs.cmp(&a.runs))
            .then(a.name.cmp(&b.name))
    });
    let mut seen = std::collections::HashSet::new();
    apps.retain(|a| seen.insert(a.name.to_lowercase()));
    apps.truncate(limit);
    apps
}

#[cfg(windows)]
fn known_folder(guid: &str) -> Option<String> {
    let env = |k: &str| std::env::var(k).ok();
    let windir = || env("windir").or_else(|| env("SystemRoot"));
    match guid {
        "6D809377-6AF0-444B-8957-A3773F02200E" => {
            env("ProgramW6432").or_else(|| env("ProgramFiles"))
        }
        "7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E" => env("ProgramFiles(x86)"),
        "1AC14E77-02E7-4E5D-B744-2EB1AE5198B7" => windir().map(|w| format!("{w}\\System32")),
        "D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27" => windir().map(|w| format!("{w}\\SysWOW64")),
        "F38BF404-1D43-42F2-9305-67DE0B28FC23" => windir(),
        "F1B32785-6FBA-4FCF-9D55-7B8E7F157091" => env("LOCALAPPDATA"),
        "A77F5D77-2E2B-44C3-A6A2-ABA601054A51" => {
            env("APPDATA").map(|a| format!("{a}\\Microsoft\\Windows\\Start Menu\\Programs"))
        }
        "0139D44E-6AFE-49F2-8690-3DAFCAE6FFB8" => {
            env("ProgramData").map(|p| format!("{p}\\Microsoft\\Windows\\Start Menu\\Programs"))
        }
        "9E3995AB-1F9C-4F13-B827-48B24B6C7174" => env("APPDATA")
            .map(|a| format!("{a}\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned")),
        _ => None,
    }
}

/// The most used apps that still exist on disk, most used first.
#[cfg(windows)]
pub fn frequent_apps(limit: usize) -> Vec<UsedApp> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };
    // Executables and shortcuts; other UserAssist keys hold non-app entries.
    const KEYS: &[&str] = &[
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist\\{CEBFF5CD-ACE2-4F4F-9178-9926F41749EA}\\Count",
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist\\{F4E57C4B-2036-45F0-A9AB-443BCFE33D9F}\\Count",
    ];
    let mut out = Vec::new();
    for key in KEYS {
        let wide: Vec<u16> = key.encode_utf16().chain(Some(0)).collect();
        let mut hkey = HKEY::default();
        if unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(wide.as_ptr()),
                0,
                KEY_READ,
                &mut hkey,
            )
        }
        .is_err()
        {
            continue;
        }
        let mut index = 0u32;
        loop {
            let mut name = vec![0u16; 1024];
            let mut name_len = name.len() as u32;
            let mut data = vec![0u8; 128];
            let mut data_len = data.len() as u32;
            let status = unsafe {
                RegEnumValueW(
                    hkey,
                    index,
                    windows::core::PWSTR(name.as_mut_ptr()),
                    &mut name_len,
                    None,
                    None,
                    Some(data.as_mut_ptr()),
                    Some(&mut data_len),
                )
            };
            index += 1;
            if status.is_err() {
                // ERROR_MORE_DATA on an oversized value: skip it, keep going.
                if status.0 == 234 {
                    continue;
                }
                break;
            }
            let decoded = rot13(&String::from_utf16_lossy(&name[..name_len as usize]));
            let Some((runs, focus_ms)) = parse_record(&data[..data_len as usize]) else {
                continue;
            };
            if runs == 0 && focus_ms == 0 {
                continue;
            }
            let Some(path) = resolve(&decoded, &known_folder) else {
                continue;
            };
            if is_noise(&path) || !std::path::Path::new(&path).exists() {
                continue;
            }
            out.push(UsedApp {
                name: display_name(&path),
                path,
                runs,
                focus_ms,
            });
        }
        unsafe {
            let _ = RegCloseKey(hkey);
        }
    }
    rank(out, limit)
}

#[cfg(not(windows))]
pub fn frequent_apps(_limit: usize) -> Vec<UsedApp> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rot13_round_trips_and_leaves_symbols() {
        assert_eq!(
            rot13("P:\\Cebtenz Svyrf\\Nccf.rkr"),
            "C:\\Program Files\\Apps.exe"
        );
        assert_eq!(rot13(&rot13("{ABC-123}\\x.lnk")), "{ABC-123}\\x.lnk");
    }

    #[test]
    fn record_reads_runs_and_focus() {
        let mut data = vec![0u8; 72];
        data[4..8].copy_from_slice(&7u32.to_le_bytes());
        data[12..16].copy_from_slice(&90_000u32.to_le_bytes());
        assert_eq!(parse_record(&data), Some((7, 90_000)));
        assert_eq!(parse_record(&[0u8; 8]), None);
    }

    #[test]
    fn resolve_expands_known_folders_only() {
        let lookup = |g: &str| (g == "AAA").then(|| "C:\\Base".to_string());
        assert_eq!(
            resolve("{aaa}\\Tool\\t.exe", &lookup).as_deref(),
            Some("C:\\Base\\Tool\\t.exe")
        );
        assert_eq!(resolve("{BBB}\\t.exe", &lookup), None);
        assert_eq!(
            resolve("D:\\Games\\g.exe", &lookup).as_deref(),
            Some("D:\\Games\\g.exe")
        );
        assert_eq!(resolve("Microsoft.Windows.Calc!App", &lookup), None);
    }

    #[test]
    fn noise_and_names() {
        assert!(is_noise("C:\\Windows\\explorer.exe"));
        assert!(is_noise("C:\\Apps\\unins000.exe"));
        assert!(is_noise("C:\\Apps\\readme.txt"));
        assert!(!is_noise("C:\\Apps\\Spotify.exe"));
        assert_eq!(
            display_name("C:\\Start\\Visual Studio Code.lnk"),
            "Visual Studio Code"
        );
    }

    #[test]
    fn rank_prefers_focus_time_and_dedupes() {
        let app = |name: &str, runs, focus_ms| UsedApp {
            name: name.into(),
            path: format!("C:\\{name}.exe"),
            runs,
            focus_ms,
        };
        let ranked = rank(
            vec![
                app("A", 50, 10),
                app("B", 2, 9_000),
                app("b", 99, 1),
                app("C", 5, 10),
            ],
            2,
        );
        assert_eq!(
            ranked.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(),
            ["B", "A"]
        );
    }
}
