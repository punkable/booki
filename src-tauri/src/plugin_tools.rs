//! Deliberate plugin actions. No arbitrary executable, argument list or URL
//! can cross the bridge. All CLI output is bounded and children time out.
use crate::{apps, plugins, util};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn capture(program: &Path, args: &[&str], seconds: u64) -> Result<String, String> {
    capture_lines(program, args, seconds, None)
}

/// Like `capture`, and hands each stdout line to `on_line` as it arrives.
type LineSink = Box<dyn FnMut(&str) + Send>;
fn capture_lines(
    program: &Path,
    args: &[&str],
    seconds: u64,
    on_line: Option<LineSink>,
) -> Result<String, String> {
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
    fn drain(mut stream: impl Read, mut on_line: Option<LineSink>) -> String {
        let mut kept = Vec::new();
        let mut line = Vec::new();
        let mut buffer = [0u8; 8192];
        while let Ok(n) = stream.read(&mut buffer) {
            if n == 0 {
                break;
            }
            if let Some(sink) = on_line.as_mut() {
                for &byte in &buffer[..n] {
                    if byte == b'\n' || byte == b'\r' {
                        if !line.is_empty() {
                            sink(&String::from_utf8_lossy(&line));
                            line.clear();
                        }
                    } else if line.len() < 4096 {
                        line.push(byte);
                    }
                }
            }
            let retain = n.min((256 * 1024usize).saturating_sub(kept.len()));
            kept.extend_from_slice(&buffer[..retain]);
        }
        String::from_utf8_lossy(&kept).into_owned()
    }
    let out = std::thread::spawn(move || drain(stdout, on_line));
    let err = std::thread::spawn(move || drain(stderr, None));
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
            "openrgb" => match profile {
                Some(profile) => {
                    let file = Path::new(&profile);
                    if !file.is_absolute()
                        || !file.is_file()
                        || file
                            .extension()
                            .map_or(true, |ext| !ext.eq_ignore_ascii_case("orp"))
                    {
                        return Err("choose an OpenRGB .orp profile".into());
                    }
                    capture(&path, &["--profile", &profile], 60).map(|_| ())
                }
                None => apps::launch(&path.to_string_lossy(), &["--gui".into()]),
            },
            // Elevate only this explicitly requested helper. Booki stays a
            // normal user process. Never disable Defender or install a driver.
            "librehardwaremonitor" => apps::launch_elevated(&path.to_string_lossy(), &[]),
            _ => Err("this plugin has no open action".into()),
        }
    })
    .await?
}

/// Progress of the one running download, sent to the dock as it happens.
#[derive(serde::Serialize, Clone)]
struct DownloadEvent {
    state: &'static str,
    percent: f64,
    title: String,
    path: String,
}

/// The percentage in a `--progress-template` line such as
/// "booki:  42.3%|Title"; None for any other output.
fn progress_line(line: &str) -> Option<(f64, String)> {
    let rest = line.strip_prefix("booki:")?;
    let (percent, title) = rest.split_once('|').unwrap_or((rest, ""));
    let value = percent
        .trim()
        .trim_end_matches('%')
        .trim()
        .parse::<f64>()
        .ok()?;
    Some((value.clamp(0.0, 100.0), title.trim().to_string()))
}

/// Download a page's video (or only its audio) with yt-dlp into the chosen
/// folder, or Downloads. Progress arrives as `plugin-download` events; the
/// result is the saved file's path.
#[tauri::command]
pub async fn plugin_download(
    app: tauri::AppHandle,
    url: String,
    directory: Option<String>,
    format: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;
    let parsed = url.parse::<ureq::http::Uri>().map_err(|_| "invalid link")?;
    if !matches!(parsed.scheme_str(), Some("http" | "https"))
        || parsed.host().is_none()
        || url.len() > 8192
    {
        return Err("use an HTTP or HTTPS link".into());
    }
    let folder = match directory.filter(|d| !d.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => dirs::download_dir().ok_or("choose an existing download folder")?,
    };
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("choose an existing download folder".into());
    }
    // Single files only: merging separate streams or converting audio would
    // need ffmpeg, which Booki does not ship.
    let selector = match format.as_deref() {
        Some("audio") => "bestaudio[ext=m4a]/bestaudio",
        _ => "best[ext=mp4]/best",
    };
    util::blocking(move || {
        static DOWNLOAD_TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _turn = DOWNLOAD_TURN
            .try_lock()
            .map_err(|_| "a download is already running")?;
        let emit = {
            let app = app.clone();
            move |state: &'static str, percent: f64, title: String, path: String| {
                let _ = app.emit(
                    "plugin-download",
                    DownloadEvent {
                        state,
                        percent,
                        title,
                        path,
                    },
                );
            }
        };
        emit("start", 0.0, String::new(), String::new());
        let progress = emit.clone();
        let mut last = -1.0f64;
        let result = capture_lines(
            &executable("yt-dlp")?,
            &[
                "--ignore-config",
                "--no-playlist",
                "--no-overwrites",
                "--restrict-filenames",
                "--newline",
                "--progress-template",
                "download:booki:%(progress._percent_str)s|%(info.title)s",
                "--print",
                "after_move:filepath",
                "--socket-timeout",
                "20",
                "-f",
                selector,
                "-P",
                &folder.to_string_lossy(),
                "--",
                &url,
            ],
            1800,
            Some(Box::new(move |line: &str| {
                if let Some((percent, title)) = progress_line(line) {
                    // One event per whole percent is plenty for a ring.
                    if percent.floor() != last.floor() || percent >= 100.0 {
                        last = percent;
                        progress("progress", percent, title, String::new());
                    }
                }
            })),
        );
        match result {
            Ok(output) => {
                let path = output
                    .lines()
                    .rev()
                    .find(|l| !l.starts_with("booki:") && !l.trim().is_empty())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                emit("done", 100.0, String::new(), path.clone());
                Ok(path)
            }
            Err(error) => {
                emit("error", 0.0, String::new(), String::new());
                Err(error)
            }
        }
    })
    .await?
}

#[cfg(test)]
mod download_tests {
    use super::progress_line;
    #[test]
    fn progress_lines_give_percent_and_title() {
        assert_eq!(
            progress_line("booki:  42.3%|A video"),
            Some((42.3, "A video".into()))
        );
        assert_eq!(progress_line("booki:100%|"), Some((100.0, String::new())));
        assert_eq!(progress_line("[youtube] abc: Downloading"), None);
    }
}
