//! Durable JSON snapshots. A failed write leaves the previous snapshot usable.
use std::{fs, io::Write, path::Path, sync::Mutex};
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn write(path: &Path, text: &str) -> Result<(), String> {
    write_bytes(path, text.as_bytes())
}

pub fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let parent = path.parent().ok_or("snapshot has no parent")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .ok_or("snapshot has no name")?
        .to_string_lossy();
    let temp = parent.join(format!("{name}.{}.tmp", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temp, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacement_is_complete_and_failed_destination_keeps_previous_snapshot() {
        let dir = std::env::temp_dir().join(format!("booki-snapshot-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let file = dir.join("Work.json");
        write(&file, "first").unwrap();
        write(&file, "second").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "second");
        assert!(write(&file.join("blocked.json"), "invalid").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "second");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
}
