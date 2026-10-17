//! Deliberate plugin actions. No arbitrary executable, argument list or URL
//! can cross the bridge. All CLI output is bounded and children time out.
use crate::{apps, plugins, util};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn capture(program: &Path, args: &[&str], seconds: u64) -> Result<String, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no output pipe")?;
    let stderr = child.stderr.take().ok_or("no error pipe")?;
    fn drain(mut stream: impl Read) -> String {
        let mut kept = Vec::new();
        let mut buffer = [0u8; 8192];
        while let Ok(n) = stream.read(&mut buffer) {
            if n == 0 {
                break;
            }
            let retain = n.min((256 * 1024usize).saturating_sub(kept.len()));
            kept.extend_from_slice(&buffer[..retain]);
        }
        String::from_utf8_lossy(&kept).into_owned()
    }
    let out = std::thread::spawn(move || drain(stdout));
    let err = std::thread::spawn(move || drain(stderr));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if started.elapsed() > Duration::from_secs(seconds) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("the tool took too long; try again".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let output = out.join().unwrap_or_default();
    let error = err.join().unwrap_or_default();
    if status.success() {
        Ok(output)
    } else {
        Err(if error.trim().is_empty() {
            format!("tool exited with {status}")
        } else {
            error
        })
    }
}

fn executable(id: &str) -> Result<PathBuf, String> {
    plugins::executable(plugins::find(id).ok_or("unknown plugin")?)
        .ok_or("install the plugin first".into())
}

/// The App Installer alias belongs to Windows, not Booki's plugin folder.
fn winget() -> Result<PathBuf, String> {
    let path = dirs::data_local_dir()
        .ok_or("no local app data folder")?
        .join("Microsoft/WindowsApps/winget.exe");
    if path.is_file() {
        Ok(path)
    } else {
        Err("Install Microsoft App Installer to use winget".into())
    }
}

#[tauri::command]
pub async fn plugin_read(id: String) -> Result<String, String> {
    util::blocking(move || match id.as_str() {
        "winget" => capture(&winget()?, &["upgrade", "--disable-interactivity"], 60),
        "rclone" => capture(&executable("rclone")?, &["rc", "core/stats", "--url", "http://127.0.0.1:5572", "--json"], 10),
        "librehardwaremonitor" => {
            // Reading requires the person to enable LHM's local web server.
            let mut response = ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(3))).build().new_agent().get("http://127.0.0.1:8085/data.json").call().map_err(|_| "Open LibreHardwareMonitor and enable Options > Remote Web Server on localhost:8085")?;
            response.body_mut().with_config().limit(1024 * 1024).read_to_string().map_err(|e| e.to_string())
        }
        _ => Err("this plugin has no status action".into()),
    }).await?
}

#[tauri::command]
pub async fn plugin_open(id: String, profile: Option<String>) -> Result<(), String> {
    util::blocking(move || {
        let path = executable(&id)?;
        match id.as_str() {
            "openrgb" => {
                let args = match profile {
                    Some(profile) => {
                        let file = Path::new(&profile);
                        if !file.is_absolute()
                            || !file.is_file()
                            || file
                                .extension()
                                .is_none_or(|ext| !ext.eq_ignore_ascii_case("orp"))
                        {
                            return Err("choose an OpenRGB .orp profile".into());
                        }
                        vec!["--profile".into(), profile]
                    }
                    None => vec!["--gui".into()],
                };
                apps::launch(&path.to_string_lossy(), &args)
            }
            // Elevate only this explicitly requested helper. Booki stays a
            // normal user process. Never disable Defender or install a driver.
            "librehardwaremonitor" => apps::launch_elevated(&path.to_string_lossy(), &[]),
            _ => Err("this plugin has no open action".into()),
        }
    })
    .await?
}

#[tauri::command]
pub async fn plugin_download(url: String, directory: String) -> Result<(), String> {
    let parsed = url.parse::<ureq::http::Uri>().map_err(|_| "invalid link")?;
    if !matches!(parsed.scheme_str(), Some("http" | "https"))
        || parsed.host().is_none()
        || url.len() > 8192
    {
        return Err("use an HTTP or HTTPS link".into());
    }
    let folder = PathBuf::from(directory);
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("choose an existing download folder".into());
    }
    util::blocking(move || {
        capture(
            &executable("yt-dlp")?,
            &[
                "--ignore-config",
                "--no-playlist",
                "--no-overwrites",
                "--restrict-filenames",
                "--no-progress",
                "--socket-timeout",
                "20",
                "-f",
                "best[ext=mp4]/best",
                "-P",
                &folder.to_string_lossy(),
                "--",
                &url,
            ],
            1800,
        )
        .map(|_| ())
    })
    .await?
}
