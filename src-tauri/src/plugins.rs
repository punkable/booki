//! Optional plugins: small open-source tools Booki can download into its own
//! folder when the person asks, from Settings. Nothing is bundled and
//! nothing runs until it is installed.
//!
//! Each plugin is pinned to one release of its official GitHub repository.
//! The download is checked against the SHA-256 digest GitHub publishes for
//! that file before anything is unpacked, and it lives under
//! %LOCALAPPDATA%\Booki\plugins\<id>, so removing it is deleting a folder.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;

pub struct Plugin {
    pub id: &'static str,
    /// Owner/repository on GitHub.
    pub repo: &'static str,
    /// The pinned release tag.
    pub tag: &'static str,
    /// The executable the plugin provides, found anywhere in the archive.
    pub exe: &'static str,
}

/// HeadsetControl (GPL-3.0): battery of wireless headsets on a USB dongle
/// (SteelSeries Arctis, Logitech G, Corsair, HyperX…). Booki runs it as a
/// separate program and links none of its code.
pub const HEADSETCONTROL: Plugin = Plugin {
    id: "headsetcontrol",
    repo: "Sapd/HeadsetControl",
    tag: "4.1.0",
    exe: "headsetcontrol.exe",
};

pub fn find(id: &str) -> Option<&'static Plugin> {
    [&HEADSETCONTROL].into_iter().find(|p| p.id == id)
}

fn dir(plugin: &Plugin) -> Option<PathBuf> {
    Some(
        dirs::data_local_dir()?
            .join("Booki")
            .join("plugins")
            .join(plugin.id),
    )
}

/// The installed executable, if the plugin is installed.
pub fn executable(plugin: &Plugin) -> Option<PathBuf> {
    let path = dir(plugin)?.join(plugin.exe);
    path.is_file().then_some(path)
}

#[derive(serde::Serialize)]
pub struct Status {
    pub installed: bool,
    pub version: Option<String>,
}

pub fn status(plugin: &Plugin) -> Status {
    let installed = executable(plugin).is_some();
    let version = installed
        .then(|| dir(plugin))
        .flatten()
        .and_then(|d| std::fs::read_to_string(d.join("VERSION")).ok())
        .map(|v| v.trim().to_string());
    Status { installed, version }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(60)))
        .build()
        .into()
}

fn read_limited(
    response: &mut ureq::http::Response<ureq::Body>,
    limit: u64,
) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "download interrupted".to_string())?;
    if bytes.len() as u64 > limit {
        return Err("download too large".into());
    }
    Ok(bytes)
}

/// The portable Windows executable of the pinned release and its published SHA-256.
fn release_asset(plugin: &Plugin) -> Result<(String, String), String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/tags/{}",
        plugin.repo, plugin.tag
    );
    let mut response = agent()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Booki")
        .call()
        .map_err(|_| "could not reach GitHub".to_string())?;
    let json: Value = serde_json::from_slice(&read_limited(&mut response, 1024 * 1024)?)
        .map_err(|_| "unexpected answer from GitHub".to_string())?;
    pick_asset(&json).ok_or_else(|| "this release has no verified Windows download".into())
}

/// Select the portable x64 executable, never the installer or another platform.
fn pick_asset(release: &Value) -> Option<(String, String)> {
    release.get("assets")?.as_array()?.iter().find_map(|asset| {
        let name = asset.get("name")?.as_str()?.to_ascii_lowercase();
        if name != "headsetcontrol-windows-x86_64.exe" {
            return None;
        }
        let digest = asset.get("digest")?.as_str()?.strip_prefix("sha256:")?;
        let url = asset.get("browser_download_url")?.as_str()?;
        Some((url.to_string(), digest.to_ascii_lowercase()))
    })
}

pub fn install(plugin: &Plugin) -> Result<String, String> {
    let (url, expected) = release_asset(plugin)?;
    if !url.starts_with(&format!(
        "https://github.com/{}/releases/download/",
        plugin.repo
    )) {
        return Err("unexpected download address".into());
    }
    let mut response = agent()
        .get(&url)
        .header("User-Agent", "Booki")
        .call()
        .map_err(|_| "download failed".to_string())?;
    let archive = read_limited(&mut response, 32 * 1024 * 1024)?;
    let actual = format!("{:x}", Sha256::digest(&archive));
    if actual != expected {
        return Err("the download did not match its published checksum".into());
    }
    let target = dir(plugin).ok_or("no local app data folder")?;
    let staging = target.with_extension("partial");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    std::fs::write(staging.join(plugin.exe), &archive).map_err(|e| e.to_string())?;
    if !staging.join(plugin.exe).is_file() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("the download did not contain the expected program".into());
    }
    std::fs::write(staging.join("VERSION"), plugin.tag).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&target);
    std::fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    Ok(plugin.tag.to_string())
}

pub fn uninstall(plugin: &Plugin) -> Result<(), String> {
    let Some(target) = dir(plugin) else {
        return Ok(());
    };
    match std::fs::remove_dir_all(&target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_portable_windows_executable_with_a_digest() {
        let release = serde_json::json!({ "assets": [
            { "name": "headsetcontrol-linux.zip", "digest": "sha256:aa", "browser_download_url": "https://x/linux.zip" },
            { "name": "headsetcontrol-windows.zip", "browser_download_url": "https://x/nodigest.zip" },
            { "name": "headsetcontrol-windows-x86_64-setup.exe", "digest": "sha256:aaaa", "browser_download_url": "https://x/setup.exe" },
            { "name": "headsetcontrol-windows-x86_64.exe.asc", "digest": "sha256:bbbb", "browser_download_url": "https://x/signature" },
            { "name": "headsetcontrol-windows-x86_64.exe", "digest": "sha256:ABCD", "browser_download_url": "https://x/win.exe" }
        ]});
        assert_eq!(
            pick_asset(&release),
            Some(("https://x/win.exe".to_string(), "abcd".to_string()))
        );
        assert_eq!(pick_asset(&serde_json::json!({})), None);
    }

}
