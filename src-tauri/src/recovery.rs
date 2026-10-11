//! Recovery distinguishes first-run defaults from damaged existing data.
use serde::{de::DeserializeOwned, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    pub kind: String,
    pub blocked: bool,
    pub quarantined: bool,
}

pub fn read<T: DeserializeOwned + Default>(primary: &Path, backup: &Path) -> (T, RecoveryReport) {
    let parse = |path: &Path| {
        fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<T>(&bytes).ok())
    };
    if let Some(value) = parse(primary) {
        return (value, RecoveryReport::default());
    }
    let damaged = primary.exists() || backup.exists();
    let quarantine = |path: &Path| {
        if !path.exists() {
            return false;
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let copied = fs::copy(path, path.with_extension(format!("corrupt-{stamp}.json"))).is_ok();
        prune_corrupt_copies(path, KEEP_CORRUPT);
        copied
    };
    if let Some(value) = parse(backup) {
        return (
            value,
            RecoveryReport {
                kind: "backup".into(),
                blocked: false,
                quarantined: quarantine(primary),
            },
        );
    }
    let preserved = quarantine(primary) | quarantine(backup);
    (
        T::default(),
        RecoveryReport {
            kind: if damaged { "damaged" } else { "" }.into(),
            blocked: damaged,
            quarantined: preserved,
        },
    )
}

/// How many damaged copies of one file are kept. Each failed start adds one,
/// so without a limit a file that keeps breaking fills the folder.
const KEEP_CORRUPT: usize = 10;

/// Remove all but the `keep` newest `<stem>.corrupt-<stamp>.json` copies of
/// `path`.
fn prune_corrupt_copies(path: &Path, keep: usize) {
    let (Some(dir), Some(stem)) = (path.parent(), path.file_stem()) else {
        return;
    };
    let prefix = format!("{}.corrupt-", stem.to_string_lossy());
    let mut copies: Vec<(u128, std::path::PathBuf)> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let stamp = name.strip_prefix(&prefix)?.strip_suffix(".json")?;
            Some((stamp.parse().ok()?, entry.path()))
        })
        .collect();
    copies.sort_by_key(|copy| std::cmp::Reverse(copy.0));
    for (_, old) in copies.into_iter().skip(keep) {
        let _ = fs::remove_file(old);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_newest_corrupt_copies_are_kept() {
        let root =
            std::env::temp_dir().join(format!("booki-recovery-prune-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let main = root.join("config.json");
        let backup_copy = root.join("config.bak.corrupt-1.json");
        fs::write(&backup_copy, "other file").unwrap();
        for stamp in 1..=KEEP_CORRUPT as u128 + 4 {
            fs::write(root.join(format!("config.corrupt-{stamp}.json")), "x").unwrap();
        }
        prune_corrupt_copies(&main, KEEP_CORRUPT);
        for stamp in 1..=4 {
            assert!(!root.join(format!("config.corrupt-{stamp}.json")).exists());
        }
        for stamp in 5..=KEEP_CORRUPT as u128 + 4 {
            assert!(root.join(format!("config.corrupt-{stamp}.json")).exists());
        }
        // Copies of a different file are left alone.
        assert!(backup_copy.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn damaged_files_are_preserved_and_never_mistaken_for_a_new_install() {
        let root = std::env::temp_dir().join(format!("booki-recovery-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let main = root.join("config.json");
        let backup = root.join("config.bak.json");
        let (_, first) = read::<Vec<String>>(&main, &backup);
        assert!(!first.blocked);
        fs::write(&main, "broken").unwrap();
        fs::write(&backup, "[\"saved\"]").unwrap();
        let (value, recovered) = read::<Vec<String>>(&main, &backup);
        assert_eq!(value, vec!["saved"]);
        assert_eq!(recovered.kind, "backup");
        assert!(!recovered.blocked);
        fs::write(&backup, "also broken").unwrap();
        let (_, report) = read::<Vec<String>>(&main, &backup);
        assert!(report.blocked);
        assert!(report.quarantined);
        assert_eq!(fs::read_to_string(main).unwrap(), "broken");
        assert_eq!(fs::read_to_string(backup).unwrap(), "also broken");
        fs::remove_dir_all(root).unwrap();
    }
}
