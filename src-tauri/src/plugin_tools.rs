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
            // yt-dlp may have started ffmpeg: end the whole tree, not one process.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill")
                    .args(["/T", "/F", "/PID", &child.id().to_string()])
                    .creation_flags(0x08000000)
                    .status();
            }
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
    let format = format.unwrap_or_else(|| "video".into());
    util::blocking(move || {
        static DOWNLOAD_TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _turn = DOWNLOAD_TURN
            .try_lock()
            .map_err(|_| "a download is already running")?;
        let emit: Emit = {
            let app = app.clone();
            std::sync::Arc::new(move |state, percent, title, path| {
                let _ = app.emit(
                    "plugin-download",
                    DownloadEvent {
                        state,
                        percent,
                        title,
                        path,
                    },
                );
            })
        };
        emit("start", 0.0, String::new(), String::new());
        let result = match format.as_str() {
            "file" => direct_file(&url, &folder, &emit),
            "gallery" => gallery(&url, &folder, &emit),
            _ => media(&url, &folder, format == "audio", &emit),
        };
        match result {
            Ok(path) => {
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

type Emit = std::sync::Arc<dyn Fn(&'static str, f64, String, String) + Send + Sync>;

/// The last printed path in a tool's output (the file it saved).
fn last_path(output: &str) -> String {
    output
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("booki:"))
        .unwrap_or("")
        .to_string()
}

/// Video or audio with yt-dlp. With FFmpeg alongside, the best video and
/// audio streams are merged into an MP4 and audio becomes an MP3; without
/// it, the best single file is kept.
fn media(url: &str, folder: &Path, audio: bool, emit: &Emit) -> Result<String, String> {
    let ffmpeg_dir = plugins::find("ffmpeg")
        .and_then(plugins::executable)
        .and_then(|p| p.parent().map(|d| d.to_string_lossy().into_owned()));
    let mut args: Vec<String> = [
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
    ]
    .map(String::from)
    .to_vec();
    let choice: &[&str] = match (&ffmpeg_dir, audio) {
        (Some(_), true) => &["-f", "bestaudio/best", "-x", "--audio-format", "mp3"],
        (Some(_), false) => &[
            "-f",
            "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b",
            "--merge-output-format",
            "mp4",
        ],
        (None, true) => &["-f", "bestaudio[ext=m4a]/bestaudio"],
        (None, false) => &["-f", "best[ext=mp4]/best"],
    };
    if let Some(dir) = &ffmpeg_dir {
        args.extend(["--ffmpeg-location".to_string(), dir.clone()]);
    }
    args.extend(choice.iter().map(|s| s.to_string()));
    args.extend([
        "-P".into(),
        folder.to_string_lossy().into_owned(),
        "--".into(),
        url.into(),
    ]);
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let sink = emit.clone();
    let mut last = -1.0f64;
    let output = capture_lines(
        &executable("yt-dlp")?,
        &argv,
        1800,
        Some(Box::new(move |line: &str| {
            if let Some((percent, title)) = progress_line(line) {
                // One event per whole percent is plenty for a ring.
                if percent.floor() != last.floor() || percent >= 100.0 {
                    last = percent;
                    sink("progress", percent, title, String::new());
                }
            }
        })),
    )?;
    Ok(last_path(&output))
}

/// Image galleries and posts with gallery-dl, one file at a time; the count
/// of saved files stands in for a percentage it cannot know in advance.
fn gallery(url: &str, folder: &Path, emit: &Emit) -> Result<String, String> {
    let target = folder.to_string_lossy().into_owned();
    let sink = emit.clone();
    let mut saved = 0u32;
    let output = capture_lines(
        &executable("gallery-dl")?,
        &["--config-ignore", "--no-input", "-D", &target, "--", url],
        1800,
        Some(Box::new(move |line: &str| {
            let path = line.trim().trim_start_matches("# ");
            if Path::new(path).is_absolute() {
                saved += 1;
                let shown = Path::new(path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                sink(
                    "progress",
                    (saved as f64 * 7.0).min(95.0),
                    shown,
                    String::new(),
                );
            }
        })),
    )?;
    let last = last_path(&output);
    let last = last.trim_start_matches("# ").to_string();
    Ok(if last.is_empty() { target } else { last })
}

fn reserved_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit())
}

/// A direct link to a file (a PDF, an archive, an image…), fetched by Booki
/// itself with the same bounds as plugin downloads.
fn direct_file(url: &str, folder: &Path, emit: &Emit) -> Result<String, String> {
    let name = url
        .split(['?', '#'])
        .next()
        .and_then(|u| u.rsplit('/').next())
        .map(|n| {
            n.chars()
                .filter(|c| c.is_alphanumeric() || "._- ".contains(*c))
                .collect::<String>()
        })
        // Windows trims trailing dots and spaces, and device names (CON,
        // NUL, COM1…) are not files: neither may become the name.
        .map(|n| n.trim_end_matches(['.', ' ']).to_string())
        .filter(|n| !n.is_empty() && !n.starts_with('.') && !reserved_name(n))
        .unwrap_or_else(|| "download".into());
    let mut path = folder.join(&name);
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (name.clone(), String::new()),
    };
    let mut n = 1;
    while path.exists() {
        path = folder.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(20)))
        // A server that stops sending must not hold the download turn forever.
        .timeout_recv_body(Some(Duration::from_secs(60)))
        .build()
        .into();
    let mut response = agent
        .get(url)
        .header("User-Agent", "Booki")
        .call()
        .map_err(|_| "download failed".to_string())?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    const LIMIT: u64 = 4 * 1024 * 1024 * 1024;
    // A suffix, not a new extension, and never over an existing file.
    let partial = PathBuf::from(format!("{}.booki-part", path.to_string_lossy()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial)
        .map_err(|e| e.to_string())?;
    let mut reader = response.body_mut().as_reader();
    let mut buffer = vec![0u8; 256 * 1024];
    let (mut done, mut last) = (0u64, -1i64);
    let copied: Result<(), String> = (|| loop {
        let n = reader
            .read(&mut buffer)
            .map_err(|_| "download interrupted".to_string())?;
        if n == 0 {
            return Ok(());
        }
        done += n as u64;
        if done > LIMIT {
            return Err("download too large".into());
        }
        std::io::Write::write_all(&mut file, &buffer[..n]).map_err(|e| e.to_string())?;
        if let Some(percent) = (done * 100).checked_div(total) {
            let percent = percent as i64;
            if percent != last {
                last = percent;
                emit("progress", percent as f64, name.clone(), String::new());
            }
        }
    })();
    drop(file);
    if let Err(error) = copied {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    std::fs::rename(&partial, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod download_tests {
    use super::{progress_line, reserved_name};
    #[test]
    fn device_names_are_not_file_names() {
        assert!(reserved_name("CON") && reserved_name("nul.txt") && reserved_name("com3.log"));
        assert!(
            !reserved_name("report.pdf")
                && !reserved_name("COMMA.txt")
                && !reserved_name("console")
        );
    }
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
