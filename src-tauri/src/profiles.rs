//! Dock profiles: full config snapshots the user can switch between with one
//! click (e.g. "Trabajo" / "Gaming"). Stored as %APPDATA%\Booki\profiles\{name}.json.

use super::*;

pub(crate) fn profiles_dir() -> std::path::PathBuf {
    config::config_dir().join("profiles")
}

/// Sanitized file path for a profile name (no separators/dots → no traversal).
pub(crate) fn profile_file(name: &str) -> Result<std::path::PathBuf, String> {
    profile_store::path(&profiles_dir(), name)
}

#[tauri::command]
pub(crate) fn profile_list() -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(entries) = std::fs::read_dir(profiles_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().is_some_and(|e| e == "json") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(stem.to_string());
                }
            }
        }
    }
    names.sort_by_key(|n| n.to_lowercase());
    names
}

/// Snapshot the CURRENT config under the given name (overwrites), and mark it
/// as the active profile.
#[tauri::command]
pub(crate) fn profile_save(
    app: AppHandle,
    name: String,
    overwrite: Option<bool>,
) -> Result<(), String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    let path = profile_file(&name)?;
    if (path.exists() || path.with_extension("bak").exists()) && overwrite != Some(true) {
        return Err("BOOKI_PROFILE_EXISTS".into());
    }
    std::fs::create_dir_all(profiles_dir()).map_err(|e| e.to_string())?;
    let mut cfg = config::load();
    cfg.last_profile = name.trim().to_string();
    let text = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    let backup = path.with_extension("bak");
    let previous = config_document::read(&path)
        .ok()
        .and_then(|value| serde_json::to_string_pretty(&value).ok());
    // A corrupt snapshot must never replace a valid recovery copy.
    if let Some(previous) = previous {
        snapshot::write(&backup, &previous)?;
    } else if !backup.exists() {
        snapshot::write(&backup, &text)?;
    }
    snapshot::write(&path, &text)?;
    config::patch(serde_json::json!({ "lastProfile": cfg.last_profile }))?;
    let _ = app.emit("booki://config-changed", ());
    Ok(())
}

/// Make the named profile the active config; repositions windows and tells
/// every surface to re-read. Returns the applied config.
#[tauri::command]
pub(crate) fn profile_apply(
    app: AppHandle,
    name: String,
    expected: Option<Config>,
) -> Result<Config, String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    let mut cfg = profile_store::preview(&profiles_dir(), &name)?.config;
    if expected.is_some_and(|reviewed| {
        serde_json::to_value(reviewed).ok() != serde_json::to_value(&cfg).ok()
    }) {
        return Err("BOOKI_PROFILE_CHANGED".into());
    }
    cfg.last_profile = name.trim().to_string();
    // The switching rules are global: a profile saved before they changed
    // must not bring back its old copy of them.
    cfg.profile_rules = config::load().profile_rules;
    apply_config_snapshot(&app, cfg)
}

#[tauri::command]
pub(crate) fn profile_preview(name: String) -> Result<profile_store::Preview, String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    profile_store::preview(&profiles_dir(), &name)
}

#[tauri::command]
pub(crate) fn profile_duplicate(name: String, new_name: String) -> Result<(), String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    profile_store::copy(&profiles_dir(), &name, &new_name)
}

#[tauri::command]
pub(crate) fn profile_rename(app: AppHandle, name: String, new_name: String) -> Result<(), String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    let root = profiles_dir();
    profile_store::copy(&root, &name, &new_name)?;
    let active = config::load().last_profile == name.trim();
    if active {
        if let Err(error) = config::patch(serde_json::json!({ "lastProfile": new_name.trim() })) {
            let _ = profile_store::delete(&root, &new_name);
            return Err(error);
        }
    }
    if let Err(error) = profile_store::delete(&root, &name) {
        if active {
            let _ = config::patch(serde_json::json!({ "lastProfile": name.trim() }));
        }
        // Keep both complete documents if rollback fails; never remove a
        // document that the live configuration may still reference.
        let _ = app.emit("booki://config-changed", ());
        return Err(error);
    }
    let _ = app.emit("booki://config-changed", ());
    Ok(())
}

#[tauri::command]
pub(crate) fn profile_deleted() -> Vec<profile_store::Deleted> {
    profile_store::deleted(&profiles_dir())
}

#[tauri::command]
pub(crate) fn profile_restore(token: String) -> Result<String, String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    profile_store::restore(&profiles_dir(), &token)
}

#[tauri::command]
pub(crate) fn profile_delete(name: String) -> Result<String, String> {
    let _guard = profile_store::LOCK.lock().map_err(|e| e.to_string())?;
    profile_store::delete(&profiles_dir(), &name)
}
