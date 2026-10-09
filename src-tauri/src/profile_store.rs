//! Profile documents, protected copies and reversible deletion, independent of windows.
use crate::{config::Config, config_document, snapshot};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub static LOCK: Mutex<()> = Mutex::new(());

pub fn path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let name = name.trim();
    let upper = name.to_ascii_uppercase();
    let device_number = upper
        .strip_prefix("COM")
        .or_else(|| upper.strip_prefix("LPT"));
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || device_number.is_some_and(|number| {
            matches!(
                number,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        });
    if name.is_empty()
        || name.chars().count() > 40
        || reserved
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
    {
        return Err("BOOKI_PROFILE_NAME_INVALID".into());
    }
    Ok(root.join(format!("{name}.json")))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub config: Config,
    pub recovered: bool,
}

pub fn preview(root: &Path, name: &str) -> Result<Preview, String> {
    let source = path(root, name)?;
    match config_document::read(&source) {
        Ok(config) => Ok(Preview {
            config,
            recovered: false,
        }),
        Err(primary) => config_document::read(&source.with_extension("bak"))
            .map(|config| Preview {
                config,
                recovered: true,
            })
            .map_err(|_| primary),
    }
}

/// Every new document has a complete recovery copy before it becomes visible.
pub fn copy(root: &Path, source: &str, destination: &str) -> Result<(), String> {
    let target = path(root, destination)?;
    if target.exists() || target.with_extension("bak").exists() {
        return Err("BOOKI_PROFILE_EXISTS".into());
    }
    let mut document = preview(root, source)?.config;
    document.last_profile = destination.trim().into();
    let text = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    snapshot::write(&target.with_extension("bak"), &text)?;
    if let Err(error) = snapshot::write(&target, &text) {
        let _ = fs::remove_file(target.with_extension("bak"));
        return Err(error);
    }
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deleted {
    pub token: String,
    pub name: String,
}

fn deleted_path(root: &Path, token: &str) -> Result<PathBuf, String> {
    if token.is_empty()
        || token.len() > 100
        || !token.bytes().all(|c| c.is_ascii_digit() || c == b'-')
    {
        return Err("BOOKI_PROFILE_INVALID_RECOVERY".into());
    }
    Ok(root.join("deleted").join(token))
}

pub fn delete(root: &Path, name: &str) -> Result<String, String> {
    let source = path(root, name)?;
    let token = format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        std::process::id()
    );
    let destination = deleted_path(root, &token)?;
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
    // Copy durably first. Failed archival never removes the original profile.
    let result = (|| {
        let bytes = config_document::read_bytes(&source).map_err(|e| e.to_string())?;
        snapshot::write_bytes(&destination.join("profile.json"), &bytes)?;
        let backup = source.with_extension("bak");
        if backup.exists() {
            snapshot::write_bytes(
                &destination.join("profile.bak"),
                &config_document::read_bytes(&backup).map_err(|e| e.to_string())?,
            )?;
        }
        let metadata = Deleted {
            token: token.clone(),
            name: name.trim().into(),
        };
        snapshot::write(
            &destination.join("metadata.json"),
            &serde_json::to_string(&metadata).map_err(|e| e.to_string())?,
        )?;
        fs::remove_file(&source).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(backup);
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    Ok(token)
}

pub fn deleted(root: &Path) -> Vec<Deleted> {
    let mut records = fs::read_dir(root.join("deleted"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| config_document::read_bytes(&entry.path().join("metadata.json")).ok())
        .filter_map(|bytes| serde_json::from_slice::<Deleted>(&bytes).ok())
        .collect::<Vec<_>>();
    records.sort_by(|a, b| b.token.cmp(&a.token));
    records
}

pub fn restore(root: &Path, token: &str) -> Result<String, String> {
    let directory = deleted_path(root, token)?;
    let metadata: Deleted = serde_json::from_slice(
        &config_document::read_bytes(&directory.join("metadata.json"))
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if metadata.token != token {
        return Err("BOOKI_PROFILE_INVALID_RECOVERY".into());
    }
    let destination = path(root, &metadata.name)?;
    if destination.exists() || destination.with_extension("bak").exists() {
        return Err("BOOKI_PROFILE_EXISTS".into());
    }
    let primary = directory.join("profile.json");
    let backup = directory.join("profile.bak");
    // Validate before restoring; unreadable archives stay available for recovery.
    let config = config_document::read(&primary).or_else(|_| config_document::read(&backup))?;
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    snapshot::write(&destination.with_extension("bak"), &text)?;
    if let Err(error) = snapshot::write(&destination, &text) {
        let _ = fs::remove_file(destination.with_extension("bak"));
        return Err(error);
    }
    let _ = fs::remove_dir_all(directory);
    Ok(metadata.name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_and_deleted_profiles_preserve_preferences_and_do_not_overwrite_names() {
        let root = std::env::temp_dir().join(format!("booki-profiles-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let cfg = Config {
            theme: "light".into(),
            autostart: true,
            ..Config::default()
        };
        snapshot::write(
            &path(&root, "Work").unwrap(),
            &serde_json::to_string(&cfg).unwrap(),
        )
        .unwrap();
        copy(&root, "Work", "Study").unwrap();
        assert!(preview(&root, "Study").unwrap().config.autostart);
        assert!(copy(&root, "Work", "Study").is_err());
        let token = delete(&root, "Work").unwrap();
        assert!(!path(&root, "Work").unwrap().exists());
        assert_eq!(deleted(&root).len(), 1);
        assert_eq!(restore(&root, &token).unwrap(), "Work");
        assert_eq!(preview(&root, "Work").unwrap().config.theme, "light");
        assert!(path(&root, "../Work").is_err());
        assert!(path(&root, "CON").is_err());
        assert!(path(&root, "COM¹").is_err());
        assert!(path(&root, "LPT²").is_err());
        assert!(path(&root, "É".repeat(40).as_str()).is_ok());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn damaged_primary_recovers_and_restoration_collision_keeps_the_archive() {
        let root =
            std::env::temp_dir().join(format!("booki-profiles-recovery-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let source = path(&root, "Work").unwrap();
        let text = serde_json::to_string(&Config {
            autostart: true,
            ..Config::default()
        })
        .unwrap();
        snapshot::write(&source, "broken").unwrap();
        snapshot::write(&source.with_extension("bak"), &text).unwrap();
        assert!(preview(&root, "Work").unwrap().recovered);
        let token = delete(&root, "Work").unwrap();
        snapshot::write(&source, &text).unwrap();
        assert!(matches!(restore(&root, &token), Err(error) if error == "BOOKI_PROFILE_EXISTS"));
        assert_eq!(deleted(&root).len(), 1);
        fs::remove_file(&source).unwrap();
        restore(&root, &token).unwrap();
        assert!(!preview(&root, "Work").unwrap().recovered);
        assert!(preview(&root, "Work").unwrap().config.autostart);
        assert!(restore(&root, "../Work").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn oversized_archive_attempt_preserves_the_original() {
        let root = std::env::temp_dir().join(format!("booki-profiles-size-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let source = path(&root, "Large").unwrap();
        fs::File::create(&source)
            .unwrap()
            .set_len(16 * 1024 * 1024 + 1)
            .unwrap();
        assert!(delete(&root, "Large").is_err());
        assert!(source.exists());
        assert!(deleted(&root).is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
