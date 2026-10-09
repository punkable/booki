//! User configuration: pinned apps, appearance and dock behavior.
//! Persisted as JSON under the OS config dir (e.g. %APPDATA%\Booki\config.json).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// In-memory copy of what is on disk.
///
/// `load()` used to read and parse `config.json` on every single call, and it is
/// called from 39 places — including watcher loops that tick every 80ms and
/// 300ms, and four times per `set_dock_frame` (which the dock issues on every
/// reframe). With an auto-hide taskbar that worked out to roughly twelve full
/// read+parse cycles per second, forever.
///
/// This is safe to cache because `save()` below is the only writer of
/// `config.json`: import and profile-apply write elsewhere and then call it, so
/// there is exactly one place to keep in sync. The trade-off is that editing
/// `config.json` by hand while Booki is running no longer takes effect until
/// restart — it never really did, since the app rewrites the file constantly.
static CACHE: RwLock<Option<Config>> = RwLock::new(None);

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
    /// Built-in Booki command, never an executable path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
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
    // Glass intensity: frosted enough to read over any wallpaper.
    60
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
fn default_notch_mode() -> String {
    // Attached = iPhone-style tab flush to the edge (former notchPeek default).
    "attached".into()
}
fn default_surface_style() -> String {
    // One finish for dock + notch: "glass", "mica" or "solid".
    "glass".into()
}
fn default_anim() -> String {
    "spring".into()
}
fn default_edge_gap() -> u32 {
    // Close to the taskbar, like a second dock beside it; 48 read as floating
    // in the middle of the screen.
    12
}
fn default_taskbar_settle_ms() -> u32 {
    // After an auto-hide taskbar tucks away, give the user a beat to hit the
    // notch/dock before Booki drops back to the screen edge.
    1000
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

fn default_hide_in_fullscreen() -> bool {
    true
}

/// Full dock configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Monotonic persisted revision, independent of the application version.
    #[serde(default)]
    pub revision: u64,
    #[serde(default = "default_true")]
    pub usage_recommendations_enabled: bool,
    #[serde(default)]
    pub ignored_app_suggestions: Vec<String>,
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
    /// Hide Booki entirely during true fullscreen (games / movie / presentation).
    /// Off = stay visible even then (respects "Never" auto-hide honesty).
    #[serde(default = "default_hide_in_fullscreen")]
    pub hide_in_fullscreen: bool,
    /// Notch placement along the anchored edge: "center" | "start" | "end".
    #[serde(default = "default_notch_position")]
    pub notch_position: String,
    /// Notch "peek" style — sits at the very edge like a tab, less intrusive.
    /// Kept in sync with `notch_mode` for older frontends (`attached`/`smart` → true).
    #[serde(default = "default_true")]
    pub notch_peek: bool,
    /// Notch silhouette / placement: "attached" (iPhone tab), "floating"
    /// (inset capsule), "smart" (adaptive island ↔ intelligent dot).
    #[serde(default = "default_notch_mode")]
    pub notch_mode: String,
    /// Edge the notch lives on: "auto" (same as the dock) or a specific edge.
    #[serde(default = "default_notch_edge")]
    pub notch_edge: String,
    /// Legacy notch-only finish. Kept for older configs; prefer `surface_style`.
    #[serde(default = "default_notch_style")]
    pub notch_style: String,
    /// Unified dock + notch surface: "mica" | "acrylic" | "tinted" | "solid".
    #[serde(default = "default_surface_style")]
    pub surface_style: String,
    /// Real blurred material behind the dock and notch (win/material.rs).
    /// A switch so it can be turned off if a system renders it badly.
    #[serde(default = "default_true")]
    pub native_material: bool,
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
    /// Stable display name; fall back to primary while disconnected.
    #[serde(default)]
    pub monitor_name: String,
    #[serde(default = "default_overflow")]
    pub overflow_mode: String,
    #[serde(default)]
    pub reduce_transparency: bool,
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
    /// When Windows auto-hides the taskbar, rise with the revealed bar so the
    /// dock/notch stay above it (Windhawk height mods included via tray HWND).
    #[serde(default = "default_true")]
    pub taskbar_follow: bool,
    /// After the auto-hide taskbar hides again, wait this many ms before the
    /// dock/notch drop back to the screen edge. Rising with a revealed bar is
    /// still immediate so they never sit under it.
    #[serde(default = "default_taskbar_settle_ms")]
    pub taskbar_settle_ms: u32,
    /// While the cursor is over the dock or notch, keep the raised position and
    /// reset the settle timer — so you can actually use Booki after revealing
    /// the taskbar.
    #[serde(default = "default_true")]
    pub taskbar_hold_while_hover: bool,
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
    /// Legacy multi-notch flag. Kept for config compatibility; smart mode is
    /// always circular and no longer uses an app whitelist.
    #[serde(default)]
    pub multi_notch_enabled: bool,
    /// Legacy executable names for the old multi-notch whitelist (unused).
    #[serde(default)]
    pub multi_notch_apps: Vec<String>,
    /// Legacy auto-suggest toggle for multi-notch (unused).
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

fn default_overflow() -> String {
    "adapt".into()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            revision: 0,
            usage_recommendations_enabled: true,
            ignored_app_suggestions: Vec::new(),
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
            hide_in_fullscreen: true,
            notch_position: default_notch_position(),
            notch_peek: true,
            notch_mode: default_notch_mode(),
            notch_edge: default_notch_edge(),
            notch_style: default_notch_style(),
            surface_style: default_surface_style(),
            native_material: true,
            notch_scale: default_notch_scale(),
            always_on_top: true,
            magnify_style: default_anim(),
            hotkey: String::new(),
            monitor: default_monitor(),
            monitor_name: String::new(),
            overflow_mode: default_overflow(),
            reduce_transparency: false,
            material_strength: default_material(),
            surface_tint: default_surface_tint(),
            autostart: false,
            context_menu: true,
            edge_gap: default_edge_gap(),
            taskbar_follow: true,
            taskbar_settle_ms: default_taskbar_settle_ms(),
            taskbar_hold_while_hover: true,
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
    // Windows resolves this through Known Folders, not APPDATA. Keep the
    // subprocess regression isolated on every platform; production builds
    // do not include this override.
    #[cfg(test)]
    if let Some(dir) = std::env::var_os("BOOKI_TEST_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
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
    // Fast path: hand back the cached copy. The read guard is dropped before
    // anything else runs — load_from_disk() applies migrations, which call
    // save(), which takes the write lock. Holding a guard across that would
    // deadlock.
    if let Some(cfg) = CACHE.read().ok().and_then(|g| g.clone()) {
        return cfg;
    }
    let Ok(_guard) = WRITE_LOCK.lock() else {
        return Config::default();
    };
    load_locked()
}

fn load_locked() -> Config {
    if let Some(cfg) = CACHE.read().ok().and_then(|g| g.clone()) {
        return cfg;
    }
    let cfg = load_from_disk();
    if let Ok(mut w) = CACHE.write() {
        *w = Some(cfg.clone());
    }
    cfg
}

/// Invalidate the cache so the next `load()` re-reads the file. For paths that
/// replace `config.json` behind `save()`'s back (import, restore).
pub fn invalidate_cache() {
    if let Ok(mut w) = CACHE.write() {
        *w = None;
    }
}

static RECOVERY: Mutex<Option<crate::recovery::RecoveryReport>> = Mutex::new(None);
pub fn recovery_status() -> crate::recovery::RecoveryReport {
    RECOVERY
        .lock()
        .ok()
        .and_then(|value| value.clone())
        .unwrap_or_default()
}
pub fn acknowledge_recovery() {
    if let Ok(mut value) = RECOVERY.lock() {
        *value = None;
    }
}

/// An explicitly reviewed import may replace damaged data; retain the block on failure.
pub fn save_replacement(cfg: &Config) -> Result<(), String> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| "config lock failed".to_string())?;
    let previous = recovery_status();
    acknowledge_recovery();
    let result = save_locked(cfg);
    if result.is_err() {
        if let Ok(mut status) = RECOVERY.lock() {
            *status = Some(previous);
        }
    }
    result
}

fn load_from_disk() -> Config {
    let path = config_path();
    // Sweep leftover temp files from an interrupted atomic save. The name
    // carries a pid (see save), so a crashed run leaves one behind.
    if let Ok(entries) = fs::read_dir(config_dir()) {
        for e in entries.flatten() {
            let name = e.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("config.json.") && name.ends_with(".tmp") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let (mut cfg, report) = crate::recovery::read::<Config>(&path, &backup_path());
    let blocked = report.blocked;
    if let Ok(mut status) = RECOVERY.lock() {
        *status = Some(report);
    }
    // Do not let migrations overwrite evidence when neither copy can be read.
    if blocked {
        return cfg;
    }
    if migrate(&mut cfg) {
        let _ = save_locked(&cfg);
    }
    // Named groups are durable containers, including empty and single-item
    // groups. Loading a profile or changing a preference never ungroups them.
    // Existing setups that lost the onboarded flag should skip tips only when
    // they already have pins — never key off seen_version alone (changelog
    // stamps that on first boot and would skip onboarding).
    if !cfg.onboarded && !cfg.pinned.is_empty() {
        cfg.onboarded = true;
        cfg.settings_intro_seen = true;
        let _ = save_locked(&cfg);
    }
    cfg.revision = read_config(&path).map_or(cfg.revision, |saved| saved.revision);
    cfg
}

/// Latest config schema revision written by this build.
pub const SETTINGS_REV: u32 = 9;

/// Bring a config from any older build up to `SETTINGS_REV`. Pure, so the
/// same steps run on load and on restored profiles and backups. Returns
/// whether anything changed.
pub fn migrate(cfg: &mut Config) -> bool {
    if cfg.settings_rev >= SETTINGS_REV {
        return false;
    }
    // rev 5: the notch follows the dock again.
    if cfg.settings_rev < 5 {
        cfg.notch_edge = "auto".into();
    }
    // rev 6: one surface finish for dock + notch, derived from notchStyle.
    if cfg.settings_rev < 6 {
        cfg.surface_style = match cfg.notch_style.as_str() {
            "mica" => "mica",
            "liquid" => "tinted",
            "windows" => "solid",
            _ => "acrylic",
        }
        .into();
    }
    // rev 7–8: explicit notch modes from the older peek / multi-notch toggles.
    if cfg.settings_rev < 8 {
        let mode = cfg.notch_mode.trim().to_ascii_lowercase();
        cfg.notch_mode = if cfg.settings_rev < 7 && cfg.multi_notch_enabled {
            "smart".into()
        } else if matches!(mode.as_str(), "attached" | "floating" | "smart")
            && cfg.settings_rev >= 7
        {
            mode
        } else if cfg.notch_peek {
            "attached".into()
        } else {
            "floating".into()
        };
        cfg.multi_notch_enabled = false;
        cfg.multi_notch_apps.clear();
    }
    // rev 9: three real finishes and the consolidated widget set.
    if cfg.settings_rev < 9 {
        migrate_surface_v9(cfg);
        cfg.pinned = migrate_widgets_v9(std::mem::take(&mut cfg.pinned));
    }
    cfg.notch_peek = cfg.notch_mode != "floating";
    cfg.settings_rev = SETTINGS_REV;
    true
}

/// acrylic → glass; tinted → glass with its colour (black when it had none);
/// mica and solid stay.
fn migrate_surface_v9(cfg: &mut Config) {
    let style = cfg.surface_style.trim().to_ascii_lowercase();
    cfg.surface_style = match style.as_str() {
        "mica" => "mica",
        "solid" => "solid",
        "tinted" => {
            if cfg.surface_tint.trim().is_empty() {
                cfg.surface_tint = "#000000".into();
            }
            "glass"
        }
        _ => "glass",
    }
    .into();
}

/// CPU, RAM, disk and network become one "system" widget showing exactly
/// the metrics that were pinned; timer and tasks become "focus" (keeping the
/// timer and task data); uptime is retired. The first widget of a merged
/// family keeps its place and style, later ones are dropped. Groups are walked
/// so a widget inside a group migrates too.
pub fn migrate_widgets_v9(items: Vec<PinnedApp>) -> Vec<PinnedApp> {
    fn family(widget: &str) -> Option<Option<&'static str>> {
        match widget {
            "cpu" | "ram" | "disk" | "net" => Some(Some("system")),
            "timer" | "tasks" => Some(Some("focus")),
            "uptime" => Some(None),
            _ => None,
        }
    }
    fn collect(
        items: &[PinnedApp],
        metrics: &mut Vec<String>,
        focus: &mut serde_json::Map<String, serde_json::Value>,
    ) {
        for item in items {
            collect(&item.children, metrics, focus);
            let widget = item.widget.as_deref().unwrap_or("");
            if item.kind != "widget" {
                continue;
            }
            if matches!(widget, "cpu" | "ram" | "disk" | "net")
                && !metrics.iter().any(|m| m == widget)
            {
                metrics.push(widget.to_string());
            }
            if matches!(widget, "timer" | "tasks") {
                if let Some(serde_json::Value::Object(style)) = &item.style {
                    for (key, value) in style {
                        focus.entry(key.clone()).or_insert_with(|| value.clone());
                    }
                }
            }
        }
    }
    fn walk(
        items: Vec<PinnedApp>,
        seen: &mut std::collections::HashSet<&'static str>,
        metrics: &[String],
        focus: &serde_json::Map<String, serde_json::Value>,
    ) -> Vec<PinnedApp> {
        let mut out = Vec::with_capacity(items.len());
        for mut item in items {
            item.children = walk(std::mem::take(&mut item.children), seen, metrics, focus);
            let mapped = if item.kind == "widget" {
                family(item.widget.as_deref().unwrap_or(""))
            } else {
                None
            };
            let Some(target) = mapped else {
                out.push(item);
                continue;
            };
            let Some(target) = target else { continue };
            if !seen.insert(target) {
                continue;
            }
            let mut style = match item.style.take() {
                Some(serde_json::Value::Object(map)) => map,
                _ => serde_json::Map::new(),
            };
            if target == "system" {
                style.insert("metrics".into(), serde_json::json!(metrics));
            } else {
                for (key, value) in focus {
                    style.entry(key.clone()).or_insert_with(|| value.clone());
                }
            }
            item.widget = Some(target.to_string());
            item.style = Some(serde_json::Value::Object(style));
            out.push(item);
        }
        out
    }
    let mut metrics = Vec::new();
    let mut focus = serde_json::Map::new();
    collect(&items, &mut metrics, &mut focus);
    let mut seen = std::collections::HashSet::new();
    walk(items, &mut seen, &metrics, &focus)
}

/// Persist config to disk, creating the directory if needed.
///
/// Writes to a temp file then renames, so a crash mid-write can never leave a
/// truncated/corrupt config that would wipe the user's pinned apps.
pub fn save(config: &Config) -> Result<(), String> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| "config lock failed".to_string())?;
    save_locked(config)
}

/// Merge only edited top-level keys while holding the same lock as all writes.
pub fn patch(patch: serde_json::Value) -> Result<Config, String> {
    patch_checked(patch, None, None)
}
pub fn patch_checked(
    patch: serde_json::Value,
    base: Option<&serde_json::Value>,
    expected: Option<u64>,
) -> Result<Config, String> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| "config lock failed".to_string())?;
    let current = serde_json::to_value(load_locked()).map_err(|e| e.to_string())?;
    let merged = crate::config_transaction::merge(current, &patch, base, expected)?;
    let updated: Config = serde_json::from_value(merged).map_err(|e| e.to_string())?;
    save_locked(&updated)?;
    Ok(load_locked())
}

/// Apply a native mutation to the latest config in the same write transaction.
pub fn update(edit: impl FnOnce(&mut Config) -> Result<(), String>) -> Result<Config, String> {
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| "config lock failed".to_string())?;
    let mut current = load_locked();
    edit(&mut current)?;
    save_locked(&current)?;
    Ok(load_locked())
}

fn save_locked(config: &Config) -> Result<(), String> {
    if recovery_status().blocked {
        return Err("BOOKI_RECOVERY_REQUIRED".into());
    }

    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Preserve named group containers. Only an explicit frontend Ungroup or
    // Remove operation changes their identity.
    //
    // Preserve one-way progress flags: Settings often holds a stale snapshot and
    // used to rewrite onboarded/seenVersion back to false/"" on every slider save.
    let mut to_write = config.clone();
    // Keep legacy peek aligned with the canonical mode on every write.
    let mode = to_write.notch_mode.trim().to_ascii_lowercase();
    if mode == "attached" || mode == "floating" || mode == "smart" {
        to_write.notch_mode = mode.clone();
        to_write.notch_peek = mode != "floating";
    } else if to_write.multi_notch_enabled {
        to_write.notch_mode = "smart".into();
        to_write.notch_peek = true;
    } else {
        to_write.notch_mode = if to_write.notch_peek {
            "attached".into()
        } else {
            "floating".into()
        };
        to_write.notch_peek = to_write.notch_mode != "floating";
    }
    to_write.multi_notch_enabled = false;
    // The cache mirrors what is on disk, so it answers this without a read.
    let existing = CACHE
        .read()
        .ok()
        .and_then(|g| g.clone())
        .or_else(|| read_config(&config_path()));
    to_write.revision = existing
        .as_ref()
        .map_or(1, |saved| saved.revision.saturating_add(1));
    if let Some(existing) = existing {
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
    // WRITE_LOCK serializes the complete read/modify/write transaction in this
    // process. The pid also isolates its temporary file from another process.
    let tmp_path = dir.join(format!("config.json.{}.tmp", std::process::id()));
    // Write the temp file and flush it all the way to disk before renaming, so a
    // power loss right after the rename can't leave an empty/zero-length config.
    {
        use std::io::Write;
        let mut f = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    // Cache what was actually persisted, not the caller's value: the two differ
    // (notch_mode is normalized, multi_notch_enabled forced off, and the
    // one-way progress flags above are restored from disk). Caching the input
    // would let the cache drift from the file.
    if let Ok(mut w) = CACHE.write() {
        *w = Some(to_write);
    }
    // Keep a redundant last-good copy so a later corruption of config.json can be
    // healed on the next load without losing the user's setup. Best-effort.
    if let Err(error) = crate::snapshot::write(&backup_path(), &text) {
        log::warn!("Configuration saved; recovery snapshot could not be refreshed: {error}");
    }
    Ok(())
}

/// Take a consistent snapshot under the same lock used by settings writes.
pub fn backup_for_update() -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    crate::update_backup::snapshot(&config_dir()).map(|_| ())
}

#[cfg(test)]
mod tests {
    #[test]
    fn named_groups_survive_disk_reload_and_unrelated_preference_edits() {
        // Run in a fresh process so Config's cache, recovery state and dirs
        // cannot race with other tests or touch a real user's configuration.
        const MARKER: &str = "BOOKI_GROUP_ROUNDTRIP_TEST";
        if std::env::var_os(MARKER).is_some() {
            let mut cfg = super::Config {
                settings_rev: 8,
                onboarded: true,
                pinned: serde_json::from_value(serde_json::json!([
                    {"id":"empty", "name":"Projects", "kind":"group", "children":[]},
                    {"id":"single", "name":"Work", "kind":"group", "icon":"custom", "children":[
                        {"id":"app", "name":"Editor", "path":"C:/editor.exe", "args":["--safe"]}
                    ]}
                ]))
                .unwrap(),
                ..super::Config::default()
            };
            let original = serde_json::to_value(&cfg.pinned).unwrap();
            super::save(&cfg).unwrap();
            super::invalidate_cache();
            cfg = super::load();
            assert_eq!(serde_json::to_value(&cfg.pinned).unwrap(), original);
            cfg.theme = "light".into();
            super::save(&cfg).unwrap();
            super::invalidate_cache();
            assert_eq!(
                serde_json::to_value(super::load().pinned).unwrap(),
                original
            );
            return;
        }
        let root =
            std::env::temp_dir().join(format!("booki-group-roundtrip-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "config::tests::named_groups_survive_disk_reload_and_unrelated_preference_edits",
                "--nocapture",
            ])
            .env(MARKER, "1")
            .env("BOOKI_TEST_CONFIG_DIR", root.join("Booki"))
            .status()
            .unwrap();
        let saved = root.join("Booki").join("config.json").exists();
        let _ = std::fs::remove_dir_all(root);
        assert!(status.success());
        assert!(saved, "the isolated regression test must actually execute");
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;

    fn widget(id: &str, w: &str) -> PinnedApp {
        serde_json::from_value(serde_json::json!({"id": id, "kind": "widget", "widget": w}))
            .unwrap()
    }
    fn names(items: &[PinnedApp]) -> Vec<String> {
        items
            .iter()
            .map(|i| i.widget.clone().unwrap_or_else(|| i.kind.clone()))
            .collect()
    }

    #[test]
    fn widgets_merge_into_system_and_focus_in_place() {
        let mut group: PinnedApp =
            serde_json::from_value(serde_json::json!({"id": "g", "kind": "group"})).unwrap();
        group.children = vec![widget("t", "tasks"), widget("k", "clock")];
        let mut timer = widget("m", "timer");
        timer.style = Some(serde_json::json!({"minutes": 25}));
        let mut tasks = group.children.remove(0);
        tasks.style = Some(serde_json::json!({"tasks": [{"text": "a"}]}));
        group.children.insert(0, tasks);
        let items = vec![
            widget("a", "cpu"),
            widget("b", "ram"),
            widget("u", "uptime"),
            widget("n", "net"),
            timer,
            group,
        ];
        let out = migrate_widgets_v9(items);
        assert_eq!(names(&out), ["system", "focus", "group"]);
        let focus = out[1].style.as_ref().unwrap();
        assert_eq!(
            (focus["minutes"].clone(), focus["tasks"][0]["text"].clone()),
            (serde_json::json!(25), serde_json::json!("a"))
        );
        assert_eq!(out[0].id, "a");
        assert_eq!(
            out[0].style.as_ref().unwrap()["metrics"],
            serde_json::json!(["cpu", "ram", "net"])
        );
        assert_eq!(names(&out[2].children), ["clock"]);
    }

    #[test]
    fn finishes_map_to_glass_mica_solid() {
        for (old, tint, want, want_tint) in [
            ("acrylic", "", "glass", ""),
            ("tinted", "", "glass", "#000000"),
            ("tinted", "#0b1a2a", "glass", "#0b1a2a"),
            ("mica", "", "mica", ""),
            ("solid", "", "solid", ""),
        ] {
            let mut cfg = Config {
                settings_rev: 8,
                surface_style: old.into(),
                surface_tint: tint.into(),
                ..Config::default()
            };
            assert!(migrate(&mut cfg));
            assert_eq!(
                (cfg.surface_style.as_str(), cfg.surface_tint.as_str()),
                (want, want_tint),
                "{old}"
            );
            assert_eq!(cfg.settings_rev, SETTINGS_REV);
            assert!(!migrate(&mut cfg));
        }
    }

    #[test]
    fn fresh_defaults_are_already_current() {
        let mut cfg = Config::default();
        migrate(&mut cfg);
        assert_eq!(cfg.surface_style, "glass");
        assert!(cfg.surface_tint.is_empty());
    }
}
