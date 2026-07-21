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
    // covers the dock area, and returns by explicit notch click unless the user
    // opts into hover/edge reveal. Measured against a stable home rect.
    "smart".into()
}
fn default_monitor() -> i32 {
    -1
}
fn default_material() -> u32 {
    // Higher default so tinted/acrylic glass reads solid (taskbar-like), not clear.
    80
}
fn default_surface_tint() -> String {
    // Empty = auto (black for tinted). User can pick any hex in Appearance.
    String::new()
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
    "acrylic".into()
}
fn default_surface_style() -> String {
    // Unified dock + notch finish. Default tinted = taskbar / Windhawk glass.
    "tinted".into()
}
fn default_anim() -> String {
    "spring".into()
}
fn default_edge_gap() -> u32 {
    48
}
fn default_clipboard_retention_days() -> u32 {
    7
}
fn default_clipboard_history_limit() -> u32 {
    60
}
fn default_clipboard_sensitive_guard() -> bool {
    true
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
    /// Legacy notch-only finish. Kept for older configs; prefer `surface_style`.
    #[serde(default = "default_notch_style")]
    pub notch_style: String,
    /// Unified dock + notch surface: "mica" | "acrylic" | "tinted" | "solid".
    #[serde(default = "default_surface_style")]
    pub surface_style: String,
    /// Notch size scale (0.7–1.5). 1.0 = default pill size.
    #[serde(default = "default_notch_scale")]
    pub notch_scale: f32,
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
    /// Glass solidity 0–100 (higher = more opaque fill; blur stays).
    #[serde(default = "default_material")]
    pub material_strength: u32,
    /// Optional glass fill color (hex). Empty → auto per surface (black for tinted).
    #[serde(default = "default_surface_tint")]
    pub surface_tint: String,
    /// Start with Windows.
    #[serde(default)]
    pub autostart: bool,
    /// Explorer right-click "Add to Booki" menu (files + folders).
    #[serde(default = "default_true")]
    pub context_menu: bool,
    /// Visual gap (CSS px) between the bar and its screen edge.
    #[serde(default = "default_edge_gap")]
    pub edge_gap: u32,
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
    /// Whether the Settings "start here" intro banner was dismissed.
    #[serde(default)]
    pub settings_intro_seen: bool,
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
    /// Store clipboard history on disk between app restarts. Off by default for
    /// privacy; the in-session clipboard history still works either way.
    #[serde(default)]
    pub clipboard_persist: bool,
    /// Delete clipboard-history entries older than this many days.
    #[serde(default = "default_clipboard_retention_days")]
    pub clipboard_retention_days: u32,
    /// Maximum number of clipboard-history entries to keep.
    #[serde(default = "default_clipboard_history_limit")]
    pub clipboard_history_limit: u32,
    /// Local-only privacy guard: skip obvious secrets/tokens from clipboard history.
    #[serde(default = "default_clipboard_sensitive_guard")]
    pub clipboard_sensitive_guard: bool,
    /// Denser clipboard flyout rows for long histories.
    #[serde(default)]
    pub clipboard_compact: bool,
    /// Whether Booki should be visible in screen captures / recordings.
    #[serde(default)]
    pub capture_visible: bool,
    /// Keep the notch pill always visible (even when the dock is shown), so
    /// there's always a visible anchor on the screen edge.
    #[serde(default)]
    pub notch_always_visible: bool,
    /// Multi-notch: shrink the notch to a dot when the active window belongs to
    /// a productivity app (browser, editor, design tool, etc.).
    #[serde(default)]
    pub multi_notch_enabled: bool,
    /// Executable names (without .exe, lowercased) that trigger dot mode.
    #[serde(default)]
    pub multi_notch_apps: Vec<String>,
    /// Suggest productivity apps for multi-notch automatically.
    #[serde(default = "default_true")]
    pub multi_notch_auto_suggest: bool,
}

fn default_hotkey_modifier() -> String {
    "Alt".into()
}

fn default_notch_trigger() -> String {
    "click".into()
}

fn default_notch_scale() -> f32 {
    1.0
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
            surface_style: default_surface_style(),
            notch_scale: default_notch_scale(),
            always_on_top: true,
            magnify_style: default_anim(),
            hotkey: String::new(),
            monitor: default_monitor(),
            material_strength: default_material(),
            surface_tint: default_surface_tint(),
            autostart: false,
            context_menu: true,
            edge_gap: 48,
            language: default_language(),
            settings_rev: 0,
            seen_version: String::new(),
            onboarded: false,
            settings_intro_seen: false,
            last_profile: String::new(),
            notch_trigger: default_notch_trigger(),
            compact: false,
            position_hotkeys: true,
            hotkey_modifier: default_hotkey_modifier(),
            focus_if_running: false,
            clipboard_persist: false,
            clipboard_retention_days: default_clipboard_retention_days(),
            clipboard_history_limit: default_clipboard_history_limit(),
            clipboard_sensitive_guard: default_clipboard_sensitive_guard(),
            clipboard_compact: false,
            capture_visible: false,
            notch_always_visible: false,
            multi_notch_enabled: false,
            multi_notch_apps: Vec::new(),
            multi_notch_auto_suggest: true,
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
    // rev 6: one surface finish for dock + notch. Derive from the old notchStyle
    // when the new key is still at its default and the legacy value differs.
    if cfg.settings_rev < 6 {
        let mapped = match cfg.notch_style.as_str() {
            "mica" => "mica",
            "liquid" => "tinted",
            "windows" => "solid",
            "acrylic" | "island" => "acrylic",
            _ => "acrylic",
        };
        cfg.surface_style = mapped.into();
        cfg.notch_style = match mapped {
            "mica" => "mica",
            "tinted" => "liquid",
            "solid" => "windows",
            _ => "acrylic",
        }
        .into();
        cfg.settings_rev = 6;
        let _ = save(&cfg);
    }
    // Promote 1-child groups; keep empty groups (Settings uses them as staging
    // for "+ New group"). The dock frontend dissolves empties on its own persist.
    cfg.pinned = normalize_pinned(cfg.pinned, true);
    // Existing setups that lost the onboarded flag should skip tips only when
    // they already have pins — never key off seen_version alone (changelog
    // stamps that on first boot and would skip onboarding).
    if !cfg.onboarded && !cfg.pinned.is_empty() {
        cfg.onboarded = true;
        cfg.settings_intro_seen = true;
        let _ = save(&cfg);
    }
    cfg
}

/// Normalize groups: promote a single leftover child; optionally keep empties.
fn normalize_pinned(pinned: Vec<PinnedApp>, keep_empty: bool) -> Vec<PinnedApp> {
    let mut out = Vec::with_capacity(pinned.len());
    for p in pinned {
        if p.kind != "group" {
            out.push(p);
            continue;
        }
        let mut kids = p.children;
        if kids.len() >= 2 {
            out.push(PinnedApp {
                children: kids,
                ..p
            });
        } else if kids.len() == 1 {
            out.push(kids.remove(0));
        } else if keep_empty {
            out.push(PinnedApp {
                children: Vec::new(),
                ..p
            });
        }
    }
    out
}

/// Persist config to disk, creating the directory if needed.
///
/// Writes to a temp file then renames, so a crash mid-write can never leave a
/// truncated/corrupt config that would wipe the user's pinned apps.
pub fn save(config: &Config) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Do not dissolve groups here — Settings may temporarily save an empty
    // staging group ("+ New group"). The dock + load() heal empty/1-child groups.
    //
    // Preserve one-way progress flags: Settings often holds a stale snapshot and
    // used to rewrite onboarded/seenVersion back to false/"" on every slider save.
    let mut to_write = config.clone();
    if let Some(existing) = read_config(&config_path()) {
        if existing.onboarded {
            to_write.onboarded = true;
        }
        if existing.settings_intro_seen {
            to_write.settings_intro_seen = true;
        }
        if to_write.seen_version.is_empty() && !existing.seen_version.is_empty() {
            to_write.seen_version = existing.seen_version;
        }
    }
    let text = serde_json::to_string_pretty(&to_write).map_err(|e| e.to_string())?;
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
