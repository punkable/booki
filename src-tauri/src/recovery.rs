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
        fs::copy(path, path.with_extension(format!("corrupt-{stamp}.json"))).is_ok()
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

#[cfg(test)]
mod tests {
    use super::*;
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
