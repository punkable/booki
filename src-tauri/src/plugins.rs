//! Optional plugins: small open-source tools Booki can download into its own
//! folder when the person asks, from Settings. Nothing is bundled and
//! nothing runs until it is installed.
//!
//! Each downloadable plugin is pinned to an official release.
//! The download is checked against its published or catalog-pinned SHA-256 for
//! that file before anything is unpacked, and it lives under
//! %LOCALAPPDATA%\Booki\plugins\<id>, so removing it is deleting a folder.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Plugin {
    pub external: bool,
    pub name: String,
    pub license: String,
    pub source: String,
    pub feeds: String,
    pub asset: String,
    pub archive_root: String,
    pub url: String,
    pub sha256: String,
    pub id: String,
    /// Owner/repository on GitHub.
    pub repo: String,
    /// The pinned release tag.
    pub tag: String,
    /// The executable the plugin provides, found anywhere in the archive.
    pub exe: String,
}

/// HeadsetControl (GPL-3.0): battery of wireless headsets on a USB dongle
/// (SteelSeries Arctis, Logitech G, Corsair, HyperX…). Booki runs it as a
/// separate program and links none of its code.
pub fn catalog() -> &'static [Plugin] {
    static CATALOG: std::sync::OnceLock<Vec<Plugin>> = std::sync::OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/plugin-catalog.json"))
            .expect("bundled plugin catalog must be valid")
    })
}

pub fn find(id: &str) -> Option<&'static Plugin> {
    catalog().iter().find(|p| p.id == id)
}

fn dir(plugin: &Plugin) -> Option<PathBuf> {
    Some(
        dirs::data_local_dir()?
            .join("Booki")
            .join("plugins")
            .join(&plugin.id),
    )
}

/// The installed executable, if the plugin is installed.
pub fn executable(plugin: &Plugin) -> Option<PathBuf> {
    let path = if plugin.external {
        dirs::data_local_dir()?.join("Microsoft/WindowsApps/winget.exe")
    } else {
        dir(plugin)?.join(&plugin.exe)
    };
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
    if !plugin.url.is_empty() {
        return Ok((plugin.url.to_string(), plugin.sha256.to_string()));
    }
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
    pick_asset(&json, &plugin.asset)
        .ok_or_else(|| "this release has no verified Windows download".into())
}

/// Select the portable x64 executable, never the installer or another platform.
fn pick_asset(release: &Value, expected_name: &str) -> Option<(String, String)> {
    release.get("assets")?.as_array()?.iter().find_map(|asset| {
        let name = asset.get("name")?.as_str()?.to_ascii_lowercase();
        if name != expected_name.to_ascii_lowercase() {
            return None;
        }
        let digest = asset.get("digest")?.as_str()?.strip_prefix("sha256:")?;
        if digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let url = asset.get("browser_download_url")?.as_str()?;
        Some((url.to_string(), digest.to_ascii_lowercase()))
    })
}

struct StagingCleanup(PathBuf);
impl Drop for StagingCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

static INSTALL_TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn install(plugin: &Plugin) -> Result<String, String> {
    if plugin.external {
        return Err("winget is managed by Microsoft App Installer".into());
    }
    let _turn = INSTALL_TURN
        .try_lock()
        .map_err(|_| "another plugin operation is in progress")?;
    let (url, expected) = release_asset(plugin)?;
    if url != plugin.url
        && !url.starts_with(&format!(
            "https://github.com/{}/releases/download/",
            plugin.repo
        ))
    {
        return Err("unexpected download address".into());
    }
    let mut response = agent()
        .get(&url)
        .header("User-Agent", "Booki")
        .call()
        .map_err(|_| "download failed".to_string())?;
    let archive = read_limited(&mut response, 128 * 1024 * 1024)?;
    let actual = format!("{:x}", Sha256::digest(&archive));
    if actual != expected {
        return Err("the download did not match its published checksum".into());
    }
    let target = dir(plugin).ok_or("no local app data folder")?;
    let staging = target.with_extension("partial");
    let _cleanup = StagingCleanup(staging.clone());
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    if plugin.asset.ends_with(".zip") {
        unpack(&archive, &staging, &plugin.archive_root)?;
    } else {
        std::fs::write(staging.join(&plugin.exe), &archive).map_err(|e| e.to_string())?;
    }
    if !staging.join(&plugin.exe).is_file() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("the download did not contain the expected program".into());
    }
    std::fs::write(staging.join("VERSION"), &plugin.tag).map_err(|e| e.to_string())?;
    commit_install(&target, &staging)?;
    Ok(plugin.tag.to_string())
}

fn commit_install(target: &std::path::Path, staging: &std::path::Path) -> Result<(), String> {
    let backup = target.with_extension("previous");
    if backup.exists() {
        std::fs::remove_dir_all(&backup).map_err(|e| e.to_string())?;
    }
    let had_previous = target.exists();
    if had_previous {
        std::fs::rename(target, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(error) = std::fs::rename(staging, target) {
        if had_previous {
            let _ = std::fs::rename(&backup, target);
        }
        return Err(error.to_string());
    }
    if had_previous {
        let _ = std::fs::remove_dir_all(backup);
    }
    Ok(())
}

pub fn uninstall(plugin: &Plugin) -> Result<(), String> {
    if plugin.external {
        return Err("winget is managed by Microsoft App Installer".into());
    }
    let _turn = INSTALL_TURN
        .try_lock()
        .map_err(|_| "another plugin operation is in progress")?;
    let Some(target) = dir(plugin) else {
        return Ok(());
    };
    // Rename first: a running tool locks its exe, and deleting file by file
    // would strip its libraries while leaving it "installed" and broken.
    let doomed = target.with_extension("removing");
    let _ = std::fs::remove_dir_all(&doomed);
    match std::fs::rename(&target, &doomed) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(format!("close {} first, then remove it", plugin.name)),
    }
    let _ = std::fs::remove_dir_all(&doomed);
    Ok(())
}

/// Keep relative directories (Qt plugins, sensor libraries), strip only the
/// known release root. Bound total output and reject traversal and symlinks.
fn unpack(archive: &[u8], into: &std::path::Path, root: &str) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(archive)).map_err(|e| e.to_string())?;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("archive contains a symbolic link".into());
        }
        let path = file.enclosed_name().ok_or("unsafe archive path")?;
        let relative = if root.is_empty() {
            path.as_path()
        } else {
            path.strip_prefix(root)
                .map_err(|_| "unexpected archive root")?
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        let target = into.join(relative);
        if file.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        total = total.checked_add(file.size()).ok_or("archive too large")?;
        if total > 512 * 1024 * 1024 {
            return Err("archive too large".into());
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut output = std::fs::File::create(target).map_err(|e| e.to_string())?;
        let copied = std::io::copy(&mut file.by_ref().take(512 * 1024 * 1024 + 1), &mut output)
            .map_err(|e| e.to_string())?;
        if copied > 512 * 1024 * 1024 {
            return Err("archive too large".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portable_executable_not_setup_or_signature() {
        let headset = find("headsetcontrol").unwrap();
        let digest = format!("sha256:{}", "ab".repeat(32));
        let release = serde_json::json!({"assets": [
            {"name":"headsetcontrol-windows-x86_64-setup.exe", "digest":digest, "browser_download_url":"setup"},
            {"name":"headsetcontrol-windows-x86_64.exe.asc", "digest":digest, "browser_download_url":"signature"},
            {"name":"headsetcontrol-windows-x86_64.exe", "digest":digest, "browser_download_url":"portable"}
        ]});
        assert_eq!(
            pick_asset(&release, &headset.asset),
            Some(("portable".into(), "ab".repeat(32)))
        );
        assert_eq!(
            pick_asset(
                &serde_json::json!({"assets":[{"name":&headset.asset,"digest":"sha256:bad","browser_download_url":"bad"}]}),
                &headset.asset
            ),
            None
        );
    }
    #[test]
    fn archives_preserve_runtime_subdirectories_and_reject_traversal() {
        let dir = std::env::temp_dir().join(format!("booki-plugin-archive-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let archive = |names: &[&str]| {
            let mut data = std::io::Cursor::new(Vec::new());
            {
                let mut zip = zip::ZipWriter::new(&mut data);
                for name in names {
                    zip.start_file(*name, zip::write::SimpleFileOptions::default())
                        .unwrap();
                    std::io::Write::write_all(&mut zip, b"test").unwrap();
                }
                zip.finish().unwrap();
            }
            data.into_inner()
        };
        unpack(
            &archive(&["root/OpenRGB.exe", "root/platforms/qwindows.dll"]),
            &dir,
            "root",
        )
        .unwrap();
        assert!(dir.join("OpenRGB.exe").is_file());
        assert!(dir.join("platforms/qwindows.dll").is_file());
        assert!(unpack(&archive(&["../outside.dll"]), &dir, "").is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_install_commit_restores_previous_copy() {
        let root =
            std::env::temp_dir().join(format!("booki-plugin-rollback-{}", std::process::id()));
        let target = root.join("plugin");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("keep.exe"), b"old").unwrap();
        assert!(commit_install(&target, &root.join("missing-staging")).is_err());
        assert_eq!(std::fs::read(target.join("keep.exe")).unwrap(), b"old");
        std::fs::remove_dir_all(root).unwrap();
    }
}
