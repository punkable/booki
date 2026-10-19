//! Optional plugins: small open-source tools Booki can download into its own
//! folder when the person asks, from Settings. Nothing is bundled and
//! nothing runs until it is installed.
//!
//! Each downloadable plugin is pinned to an official release.
//! The download is checked against its published or catalog-pinned SHA-256 for
//! that file before anything is unpacked, and it lives under
//! %LOCALAPPDATA%\Booki\plugins\<id>, so removing it is deleting a folder.
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
    /// Tools installed and removed together with this one (yt-dlp brings
    /// ffmpeg and gallery-dl).
    #[serde(default)]
    pub companions: Vec<String>,
    /// Installed only as another plugin's companion; not listed on its own.
    #[serde(default)]
    pub companion: bool,
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

/// The installed executable, if the plugin is installed: Booki's own copy
/// first, else one the person already installed themselves.
pub fn executable(plugin: &Plugin) -> Option<PathBuf> {
    own_executable(plugin).or_else(|| system_executable(plugin))
}

/// The copy Booki downloaded and verified into its own folder.
fn own_executable(plugin: &Plugin) -> Option<PathBuf> {
    let path = if plugin.external {
        dirs::data_local_dir()?.join("Microsoft/WindowsApps/winget.exe")
    } else {
        dir(plugin)?.join(&plugin.exe)
    };
    path.is_file().then_some(path)
}

/// The same tool installed outside Booki: on PATH, or where winget, Scoop,
/// Chocolatey or its own installer put it. Booki only runs it; it never
/// updates or removes it.
fn system_executable(plugin: &Plugin) -> Option<PathBuf> {
    if plugin.external {
        return None;
    }
    let file = std::path::Path::new(&plugin.exe)
        .file_name()?
        .to_os_string();
    let mut places: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(local) = dirs::data_local_dir() {
        places.push(local.join("Microsoft/WinGet/Links"));
        places.push(local.join("Programs").join(&plugin.name));
    }
    if let Some(home) = dirs::home_dir() {
        places.push(home.join("scoop/shims"));
    }
    if let Some(data) = std::env::var_os("ProgramData") {
        places.push(PathBuf::from(data).join("chocolatey/bin"));
    }
    for root in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(base) = std::env::var_os(root) {
            places.push(PathBuf::from(base).join(&plugin.name));
        }
    }
    if let Some(sub) = std::path::Path::new(&plugin.exe).parent() {
        // FFmpeg's own layout keeps the exe in bin\ under its folder.
        for root in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(base) = std::env::var_os(root) {
                places.push(PathBuf::from(base).join(&plugin.name).join(sub));
            }
        }
    }
    // Only absolute folders: an empty or relative PATH entry would resolve
    // against Booki's working directory and run whatever sits there.
    places
        .into_iter()
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(&file))
        .find(|path| path.is_file())
        .and_then(|path| path.canonicalize().ok())
}

#[derive(serde::Serialize)]
pub struct Status {
    pub installed: bool,
    pub version: Option<String>,
    /// "booki" for Booki's own copy, "system" for one already on the PC.
    pub source: Option<&'static str>,
}

pub fn status(plugin: &Plugin) -> Status {
    // A plugin counts as installed only with every companion in place, so an
    // install from before the companions existed offers to complete itself.
    let installed = executable(plugin).is_some()
        && plugin
            .companions
            .iter()
            .all(|id| find(id).is_some_and(|c| executable(c).is_some()));
    // Booki's copy of the plugin or of any companion: it stays removable.
    let own = own_executable(plugin).is_some()
        || plugin
            .companions
            .iter()
            .any(|id| find(id).is_some_and(|c| own_executable(c).is_some()));
    let version = (installed && own)
        .then(|| dir(plugin))
        .flatten()
        .and_then(|d| std::fs::read_to_string(d.join("VERSION")).ok())
        .map(|v| v.trim().to_string());
    let source = installed.then_some(if own { "booki" } else { "system" });
    Status {
        installed,
        version,
        source,
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        // Plugins are up to ~115 MB (FFmpeg): a whole-download cap of a minute
        // failed every slow connection. Connecting and the first response
        // stay short; the body may take as long as a slow link needs.
        .timeout_connect(Some(std::time::Duration::from_secs(20)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(30)))
        .timeout_global(Some(std::time::Duration::from_secs(30 * 60)))
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

/// The pinned download and the SHA-256 Booki ships with. Both live in the
/// catalog, so a replaced or re-tagged release upstream fails the check
/// instead of being trusted.
fn release_asset(plugin: &Plugin) -> Result<(String, String), String> {
    let pinned = plugin.url.starts_with("https://")
        && plugin.sha256.len() == 64
        && plugin.sha256.bytes().all(|b| b.is_ascii_hexdigit());
    if !pinned {
        return Err("this plugin has no pinned, verified download".into());
    }
    Ok((plugin.url.to_string(), plugin.sha256.to_ascii_lowercase()))
}

struct StagingCleanup(PathBuf);
impl Drop for StagingCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Bumped when TERMS.md changes in a way that needs a new acceptance.
pub const TERMS_VERSION: u32 = 1;

static INSTALL_TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn install(plugin: &Plugin) -> Result<String, String> {
    if plugin.external {
        return Err("winget is managed by Microsoft App Installer".into());
    }
    let _turn = INSTALL_TURN
        .try_lock()
        .map_err(|_| "another plugin operation is in progress")?;
    let version = install_one(plugin)?;
    for id in &plugin.companions {
        let companion = find(id).ok_or("unknown companion")?;
        if executable(companion).is_none() {
            install_one(companion)?;
        }
    }
    Ok(version)
}

fn install_one(plugin: &Plugin) -> Result<String, String> {
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
    for id in &plugin.companions {
        if let Some(companion) = find(id) {
            remove_one(companion)?;
        }
    }
    remove_one(plugin)
}

fn remove_one(plugin: &Plugin) -> Result<(), String> {
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
    let mut written = 0u64;
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
        // Count what is really written, not what the archive claims.
        let room = (512 * 1024 * 1024u64).saturating_sub(written) + 1;
        let copied =
            std::io::copy(&mut file.by_ref().take(room), &mut output).map_err(|e| e.to_string())?;
        written += copied;
        if written > 512 * 1024 * 1024 {
            return Err("archive too large".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_download_is_pinned_in_the_catalog() {
        for plugin in catalog().iter().filter(|p| !p.external) {
            let (url, sha) = release_asset(plugin).unwrap_or_else(|e| panic!("{}: {e}", plugin.id));
            assert!(
                url.ends_with(&plugin.asset),
                "{}: url names the asset",
                plugin.id
            );
            assert_eq!(sha.len(), 64);
            for id in &plugin.companions {
                assert!(
                    find(id).is_some_and(|c| c.companion),
                    "{}: companion {id}",
                    plugin.id
                );
            }
        }
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
