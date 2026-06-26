//! User configuration: pinned apps, appearance and dock behavior.
//! Persisted as JSON under the OS config dir (e.g. %APPDATA%\Booki\config.json).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn default_kind() -> String {
    "app".into()
}

/// A single item pinned to the dock.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinnedApp {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Absolute path to the executable (or file/shortcut/folder) to launch.
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// "app" | "separator".
    #[serde(default = "default_kind")]
    pub kind: String,
    /// Optional custom icon: a path to an image or a data URI overriding the
    /// native icon.
    #[serde(default)]
    pub icon: Option<String>,
}

fn default_edge() -> String {
    "bottom".into()
}
fn default_accent() -> String {
    // Booki brand tan.
    "#dfaa75".into()
}
fn default_theme() -> String {
    "system".into()
}
fn default_icon_size() -> u32 {
    48
}
fn default_zoom() -> f32 {
    1.8
}
fn default_spacing() -> u32 {
    6
}
fn default_opacity() -> f32 {
    0.62
}
fn default_true() -> bool {
    true
}

/// Full dock configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub pinned: Vec<PinnedApp>,
    /// Screen edge the dock is anchored to: "bottom" | "left" | "right" | "top".
    #[serde(default = "default_edge")]
    pub edge: String,
    /// Accent color (hex).
    #[serde(default = "default_accent")]
    pub accent: String,
    /// "system" | "light" | "dark".
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_icon_size")]
    pub icon_size: u32,
    #[serde(default = "default_true")]
    pub magnification: bool,
    /// Peak magnification scale (e.g. 1.8 = tiles grow up to 180%).
    #[serde(default = "default_zoom")]
    pub zoom: f32,
    /// Gap between tiles, in px.
    #[serde(default = "default_spacing")]
    pub spacing: u32,
    /// Dock background translucency (0.2–1.0).
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// Show name tooltips on hover.
    #[serde(default = "default_true")]
    pub show_labels: bool,
    /// Show running-app indicator dots.
    #[serde(default = "default_true")]
    pub show_indicators: bool,
    #[serde(default)]
    pub auto_hide: bool,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            pinned: Vec::new(),
            edge: default_edge(),
            accent: default_accent(),
            theme: default_theme(),
            icon_size: default_icon_size(),
            magnification: true,
            zoom: default_zoom(),
            spacing: default_spacing(),
            opacity: default_opacity(),
            show_labels: true,
            show_indicators: true,
            auto_hide: false,
            always_on_top: true,
        }
    }
}

/// Directory where Booki stores its data.
pub fn config_dir() -> PathBuf {
    let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("Booki");
    dir
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Load config from disk, falling back to defaults on any error.
pub fn load() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

/// Persist config to disk, creating the directory if needed.
///
/// Writes to a temp file then renames, so a crash mid-write can never leave a
/// truncated/corrupt config that would wipe the user's pinned apps.
pub fn save(config: &Config) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    let final_path = config_path();
    let tmp_path = dir.join("config.json.tmp");
    fs::write(&tmp_path, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    Ok(())
}
