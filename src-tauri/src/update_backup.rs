//! Versioned settings snapshots; never includes clipboard history or external files.
use std::fs;
use std::path::{Path, PathBuf};

pub fn snapshot(root: &Path) -> Result<PathBuf, String> {
    let backups = root.join("update-backups");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let directory = backups.join(format!("snapshot-{stamp:020}"));
    let copy = || -> std::io::Result<()> {
        fs::create_dir_all(&directory)?;
        for name in ["config.json", "config.bak.json"] {
            let source = root.join(name);
            if source.symlink_metadata().is_ok_and(|m| m.is_file()) {
                fs::copy(source, directory.join(name))?;
            }
        }
        let profiles = root.join("profiles");
        if profiles.symlink_metadata().is_ok_and(|m| m.is_dir()) {
            fs::create_dir_all(directory.join("profiles"))?;
            for entry in fs::read_dir(profiles)? {
                let entry = entry?;
                if entry.file_type()?.is_file()
                    && entry.path().extension().is_some_and(|ext| ext == "json")
                {
                    fs::copy(
                        entry.path(),
                        directory.join("profiles").join(entry.file_name()),
                    )?;
                }
            }
        }
        Ok(())
    };
    if let Err(error) = copy() {
        let _ = fs::remove_dir_all(&directory);
        return Err(format!("Settings backup failed: {error}"));
    }
    // Only prune completed snapshots after the new snapshot is fully written.
    let mut completed = fs::read_dir(&backups)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|e| {
            e.file_name().to_string_lossy().starts_with("snapshot-")
                && e.file_type().is_ok_and(|t| t.is_dir())
        })
        .map(|e| e.path())
        .collect::<Vec<_>>();
    completed.sort();
    let excess = completed.len().saturating_sub(3);
    for old in completed.into_iter().take(excess) {
        let _ = fs::remove_dir_all(old);
    }
    Ok(directory)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshots_preserve_settings_and_profiles_and_keep_three() {
        let root = std::env::temp_dir().join(format!("booki-snapshots-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("profiles")).unwrap();
        fs::write(root.join("config.json"), "original settings").unwrap();
        fs::write(root.join("config.bak.json"), "last-good settings").unwrap();
        fs::write(root.join("profiles/work.json"), "work profile").unwrap();
        fs::write(root.join("clipboard.json"), "private history").unwrap();
        for _ in 0..5 {
            let snapshot = snapshot(&root).unwrap();
            assert_eq!(
                fs::read_to_string(snapshot.join("config.json")).unwrap(),
                "original settings"
            );
            assert_eq!(
                fs::read_to_string(snapshot.join("profiles/work.json")).unwrap(),
                "work profile"
            );
            assert_eq!(
                fs::read_to_string(snapshot.join("config.bak.json")).unwrap(),
                "last-good settings"
            );
            assert!(!snapshot.join("clipboard.json").exists());
        }
        assert_eq!(
            fs::read_dir(root.join("update-backups")).unwrap().count(),
            3
        );
        assert_eq!(
            fs::read_to_string(root.join("config.json")).unwrap(),
            "original settings"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
