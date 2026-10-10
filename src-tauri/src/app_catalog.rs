//! The installed-apps catalog behind the Apps library in Settings.

use super::*;

/// Scan the Windows Start Menu for installed apps (.lnk shortcuts) so the
/// settings UI can suggest things to pin without browsing the filesystem.
/// Returns deduped, alphabetically-sorted shortcuts. Empty off-Windows.
#[derive(Clone, serde::Serialize)]
pub(crate) struct AppGroup {
    pub(crate) name: String,
    pub(crate) items: Vec<DirItem>,
}

pub(crate) static CATALOG_GENERATION: AtomicU64 = AtomicU64::new(0);

pub(crate) type CatalogSnapshot = (u64, std::time::Instant, Vec<AppGroup>);

pub(crate) static CATALOG_CACHE: Mutex<Option<CatalogSnapshot>> = Mutex::new(None);

#[tauri::command]
pub(crate) async fn list_installed_apps(refresh: Option<bool>) -> Vec<AppGroup> {
    if refresh.unwrap_or(false) {
        CATALOG_GENERATION.fetch_add(1, Ordering::Relaxed);
    }
    tauri::async_runtime::spawn_blocking(|| {
        let Ok(mut cache) = CATALOG_CACHE.lock() else {
            return scan_installed_apps();
        };
        let generation = CATALOG_GENERATION.load(Ordering::Relaxed);
        if let Some((cached_generation, created, groups)) = cache.as_ref() {
            if *cached_generation == generation
                && created.elapsed() < std::time::Duration::from_secs(60)
            {
                return groups.clone();
            }
        }
        let groups = scan_installed_apps();
        *cache = Some((generation, std::time::Instant::now(), groups.clone()));
        groups
    })
    .await
    .unwrap_or_default()
}

pub(crate) fn scan_installed_apps() -> Vec<AppGroup> {
    #[cfg(windows)]
    {
        use std::collections::{BTreeMap, HashSet};
        let mut roots: Vec<std::path::PathBuf> = Vec::new();
        if let Ok(appdata) = std::env::var("APPDATA") {
            roots.push(
                std::path::PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        if let Ok(pd) = std::env::var("ProgramData") {
            roots.push(
                std::path::PathBuf::from(pd).join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        let mut seen: HashSet<String> = HashSet::new();
        // group name → items. "" is the general bucket (top-level apps).
        let mut map: BTreeMap<String, Vec<DirItem>> = BTreeMap::new();
        for root in &roots {
            scan_lnks(root, root, &mut map, &mut seen, 0);
        }
        // Collapse single-item folders into the general bucket so we don't end up
        // with dozens of one-app "groups" — only real groupings get a header.
        let mut general: Vec<DirItem> = map.remove("").unwrap_or_default();
        let mut groups: Vec<AppGroup> = Vec::new();
        for (name, mut items) in map {
            if items.len() <= 1 {
                general.append(&mut items);
            } else {
                items.sort_by_key(|a| a.name.to_lowercase());
                groups.push(AppGroup { name, items });
            }
        }
        groups.sort_by_key(|a| a.name.to_lowercase());
        for (name, path) in win::packaged_apps() {
            if seen.insert(path.to_lowercase()) {
                general.push(DirItem {
                    name,
                    path,
                    is_dir: false,
                });
            }
        }
        general.sort_by_key(|a| a.name.to_lowercase());
        if !general.is_empty() {
            groups.push(AppGroup {
                name: String::new(),
                items: general,
            });
        }
        groups
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// The top-level Start-menu folder a shortcut lives in (its "group"), or "" if it
/// sits directly under Programs.
#[cfg(windows)]
pub(crate) fn group_of(root: &std::path::Path, p: &std::path::Path) -> String {
    if let Ok(rel) = p.strip_prefix(root) {
        let mut comps = rel.components();
        let first = comps.next();
        let has_subpath = comps.next().is_some();
        if has_subpath {
            if let Some(c) = first {
                return c.as_os_str().to_string_lossy().to_string();
            }
        }
    }
    String::new()
}

#[cfg(windows)]
pub(crate) fn scan_lnks(
    root: &std::path::Path,
    dir: &std::path::Path,
    map: &mut std::collections::BTreeMap<String, Vec<DirItem>>,
    seen: &mut std::collections::HashSet<String>,
    depth: u8,
) {
    if depth > 4 {
        return;
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            scan_lnks(root, &p, map, seen, depth + 1);
            continue;
        }
        let is_lnk = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false);
        if !is_lnk {
            continue;
        }
        let name = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_lowercase();
        // Skip the noise that clutters the Start Menu: uninstallers, docs, help,
        // website links, changelogs, license/EULA, "report a bug", etc. — so the
        // suggestions are real, useful apps, not junk.
        const JUNK: &[&str] = &[
            "uninstall",
            "readme",
            "read me",
            "help",
            "manual",
            "documentation",
            "docs",
            "license",
            "licence",
            "eula",
            "changelog",
            "release notes",
            "what's new",
            "whats new",
            "website",
            "web site",
            "home page",
            "homepage",
            "visit ",
            "report",
            "feedback",
            "support",
            "faq",
            "register",
            "activate",
            "modify",
            "repair",
            "update",
            "updater",
            "command prompt",
            "powershell",
            "terminal here",
        ];
        if JUNK.iter().any(|j| lower.contains(j)) {
            continue;
        }
        if seen.insert(p.to_string_lossy().to_lowercase()) {
            let group = group_of(root, &p);
            map.entry(group).or_default().push(DirItem {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: false,
            });
        }
    }
}
