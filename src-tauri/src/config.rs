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
    /// "app" | "separator" | "folder" | "group" | "widget".
    #[serde(default = "default_kind")]
    pub kind: String,
    /// For kind == "widget": which widget ("clock" | "cpu" | "ram" | "net").
    #[serde(default)]
    pub widget: Option<String>,
    /// Free-form visual style for a widget (variant, color, animated, …). Kept as
    /// JSON so the look can evolve without backend changes.
    #[serde(default)]
    pub style: Option<serde_json::Value>,
    /// Optional custom icon: a path to an image or a data URI overriding the
    /// native icon.
    #[serde(default)]
    pub icon: Option<String>,
    /// Child items for a "group" pin (a folder/container of other pins).
    #[serde(default)]
    pub children: Vec<PinnedApp>,
    /// Recently opened files for this app (most-recent first) — a lightweight
    /// jump list of things opened through Booki.
    #[serde(default)]
    pub recents: Vec<String>,
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
    36
}
fn default_zoom() -> f32 {
    1.25
}
fn default_auto_hide_mode() -> String {
    // Smart by default: visible on the desktop, slides to the notch when a window
    // covers the dock area, and reappears when the desktop is clear. Measured
    // against a stable home rect so it can't flap.
    "smart".into()
}
fn default_monitor() -> i32 {
    -1
}
fn default_material() -> u32 {
    70
}
fn default_language() -> String {
    "system".into()
}
fn default_spacing() -> u32 {
    6
}
fn default_radius() -> u32 {
    12
}
fn default_hide_delay() -> u32 {
    650
}
fn default_notch_position() -> String {
    "center".into()
}
fn default_notch_edge() -> String {
    "auto".into()
}
fn default_notch_style() -> String {
    "island".into()
}
fn default_anim() -> String {
    "spring".into()
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
    #[serde(default)]
    pub magnification: bool,
    /// Peak magnification scale (e.g. 1.8 = tiles grow up to 180%).
    #[serde(default = "default_zoom")]
    pub zoom: f32,
    /// Gap between tiles, in px.
    #[serde(default = "default_spacing")]
    pub spacing: u32,
    /// Corner roundness of tiles (px). 0 = square, larger = rounder.
    #[serde(default = "default_radius")]
    pub corner_radius: u32,
    /// Show name tooltips on hover.
    #[serde(default = "default_true")]
    pub show_labels: bool,
    /// Show running-app indicator dots.
    #[serde(default = "default_true")]
    pub show_indicators: bool,
    #[serde(default)]
    pub auto_hide: bool,
    /// Auto-hide behaviour: "off" | "smart" (hide when a window covers it) | "edge".
    #[serde(default = "default_auto_hide_mode")]
    pub auto_hide_mode: String,
    /// Auto-hide delay before sliding away, in ms.
    #[serde(default = "default_hide_delay")]
    pub auto_hide_delay: u32,
    /// Notch placement along the anchored edge: "center" | "start" | "end".
    #[serde(default = "default_notch_position")]
    pub notch_position: String,
    /// Notch "peek" style — sits at the very edge like a tab, less intrusive.
    #[serde(default = "default_true")]
    pub notch_peek: bool,
    /// Edge the notch lives on: "auto" (same as the dock) or a specific edge.
    #[serde(default = "default_notch_edge")]
    pub notch_edge: String,
    /// Notch visual style: "island" | "liquid" | "mica" | "acrylic" | "windows".
    #[serde(default = "default_notch_style")]
    pub notch_style: String,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    /// Magnify animation style: "spring" | "smooth" | "off".
    #[serde(default = "default_anim")]
    pub magnify_style: String,
    /// Global hotkey accelerator to toggle the dock (e.g. "Alt+Space"); empty = none.
    #[serde(default)]
    pub hotkey: String,
    /// Monitor index to place the dock on (-1 = primary).
    #[serde(default = "default_monitor")]
    pub monitor: i32,
    /// Native material (Acrylic/Mica) strength, 0–100.
    #[serde(default = "default_material")]
    pub material_strength: u32,
    /// Start with Windows.
    #[serde(default)]
    pub autostart: bool,
    /// UI language: "system" | "es" | "en".
    #[serde(default = "default_language")]
    pub language: String,
    /// Internal settings/migration revision (not user-facing).
    #[serde(default)]
    pub settings_rev: u32,
    /// The app version whose changelog the user has already seen. When the app
    /// updates, this differs from the running version → we show "What's new".
    #[serde(default)]
    pub seen_version: String,
    /// Whether the three first-run tip bubbles were already shown.
    #[serde(default)]
    pub onboarded: bool,
    /// Name of the last dock profile applied/saved (shown with a check mark).
    #[serde(default)]
    pub last_profile: String,
    /// How the tucked-away dock comes back: "click" (only clicking the notch —
    /// nothing auto-reveals) or "hover" (hovering the notch, or pushing the
    /// cursor against its screen edge, brings it out).
    #[serde(default = "default_notch_trigger")]
    pub notch_trigger: String,
    /// Compact density: tighter padding/gaps for small screens.
    #[serde(default)]
    pub compact: bool,
    /// Position hotkeys: modifier+1…9 launches the Nth dock item.
    #[serde(default = "default_true")]
    pub position_hotkeys: bool,
    /// Modifier for the position hotkeys ("Alt" | "Ctrl+Alt" | "Alt+Shift").
    #[serde(default = "default_hotkey_modifier")]
    pub hotkey_modifier: String,
    /// When on, clicking a pin whose app already has a window focuses that
    /// window instead of launching a new instance. Off by default (each click
    /// launches; single-instance apps still focus themselves).
    #[serde(default)]
    pub focus_if_running: bool,
}

fn default_hotkey_modifier() -> String {
    "Alt".into()
}

fn default_notch_trigger() -> String {
    "click".into()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            pinned: Vec::new(),
            edge: default_edge(),
            accent: default_accent(),
            theme: default_theme(),
            icon_size: default_icon_size(),
            magnification: false,
            zoom: default_zoom(),
            spacing: default_spacing(),
            corner_radius: default_radius(),
            show_labels: true,
            show_indicators: true,
            auto_hide: false,
            auto_hide_mode: default_auto_hide_mode(),
            auto_hide_delay: default_hide_delay(),
            notch_position: default_notch_position(),
            notch_peek: true,
            notch_edge: default_notch_edge(),
            notch_style: default_notch_style(),
            always_on_top: true,
            magnify_style: default_anim(),
            hotkey: String::new(),
            monitor: default_monitor(),
            material_strength: default_material(),
            autostart: false,
            language: default_language(),
            settings_rev: 0,
            seen_version: String::new(),
            onboarded: false,
            last_profile: String::new(),
            notch_trigger: default_notch_trigger(),
            compact: false,
            position_hotkeys: true,
            hotkey_modifier: default_hotkey_modifier(),
            focus_if_running: false,
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

fn backup_path() -> PathBuf {
    config_dir().join("config.bak.json")
}

/// Parse a config file if it exists and is valid JSON.
fn read_config(path: &PathBuf) -> Option<Config> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Load config from disk. Self-healing: if the main file is corrupt, recover from
/// the last-good backup (kept by `save`) instead of silently wiping the user's
/// pins, and stash the bad file for inspection. Falls back to defaults only when
/// neither file is usable (e.g. a genuine first run).
pub fn load() -> Config {
    let path = config_path();
    // Clean any leftover temp file from an interrupted atomic save (no junk).
    let _ = fs::remove_file(config_dir().join("config.json.tmp"));
    let mut cfg = if let Some(c) = read_config(&path) {
        c
    } else if path.exists() {
        // The file is there but unreadable/corrupt → keep a copy to debug, then
        // fall back to the backup, then to defaults as a last resort.
        log::error!("config.json is corrupt; recovering from backup");
        let _ = fs::copy(&path, config_dir().join("config.corrupt.json"));
        read_config(&backup_path()).unwrap_or_default()
    } else {
        // No config yet → maybe a backup survived a wipe; otherwise defaults.
        read_config(&backup_path()).unwrap_or_default()
    };
    // Migration: now that smart-hide is stable (measured against a fixed home
    // rect, with a visible animated notch), make it the default for existing
    // installs too — visible on the desktop, hides when a window covers it.
    if cfg.settings_rev < 2 {
        cfg.auto_hide_mode = "smart".into();
        cfg.settings_rev = 2;
        let _ = save(&cfg);
    }
    // rev 3: Windows-native default — icons no longer magnify on hover by default
    // (a subtle highlight is used instead). Users can re-enable it in settings.
    if cfg.settings_rev < 3 {
        cfg.magnification = false;
        cfg.settings_rev = 3;
        let _ = save(&cfg);
    }
    // rev 4: the default icon size dropped 48 → 36. Only migrate installs still
    // on the old default (a hand-picked 48 was never distinguishable from it).
    if cfg.settings_rev < 4 {
        if cfg.icon_size == 48 {
            cfg.icon_size = 36;
        }
        cfg.settings_rev = 4;
        let _ = save(&cfg);
    }
    // rev 5: the notch follows the dock again. Older builds could leave an
    // explicit notch_edge behind (e.g. "bottom"), and moving the dock from
    // settings didn't clear it — so the dock kept tucking toward the stale
    // edge. One-time heal; the unified position picker re-sets it explicitly.
    if cfg.settings_rev < 5 {
        cfg.notch_edge = "auto".into();
        cfg.settings_rev = 5;
        let _ = save(&cfg);
    }
    cfg
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
    // Write the temp file and flush it all the way to disk before renaming, so a
    // power loss right after the rename can't leave an empty/zero-length config.
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    // Keep a redundant last-good copy so a later corruption of config.json can be
    // healed on the next load without losing the user's setup. Best-effort.
    let _ = fs::copy(&final_path, backup_path());
    Ok(())
}
