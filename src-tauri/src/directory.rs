//! Folder discovery and filtering are independent of the flyout and its page size.
use serde::Serialize;
use std::{fs, path::Path, time::SystemTime};

#[derive(Clone, Serialize)]
pub struct DirItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn read(
    path: &Path,
    offset: usize,
    limit: usize,
    query: &str,
    order: &str,
) -> Result<Vec<DirItem>, String> {
    let terms: Vec<String> = query
        .chars()
        .take(256)
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .map(String::from)
        .collect();
    let modified = order == "modified";
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let key = name.to_lowercase();
        if !terms.iter().all(|term| key.contains(term)) {
            continue;
        }
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        let is_dir = kind.is_dir() || (kind.is_symlink() && entry.path().is_dir());
        let time = if modified {
            entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .unwrap_or(SystemTime::UNIX_EPOCH)
        } else {
            SystemTime::UNIX_EPOCH
        };
        entries.push((
            DirItem {
                name,
                path: entry.path().to_string_lossy().into_owned(),
                is_dir,
            },
            key,
            time,
        ));
    }
    entries.sort_by(|a, b| {
        b.0.is_dir.cmp(&a.0.is_dir).then_with(|| match order {
            "name-desc" => b.1.cmp(&a.1).then_with(|| b.0.name.cmp(&a.0.name)),
            "modified" => b.2.cmp(&a.2).then_with(|| a.1.cmp(&b.1)),
            _ => a.1.cmp(&b.1).then_with(|| a.0.name.cmp(&b.0.name)),
        })
    });
    Ok(entries
        .into_iter()
        .skip(offset)
        .take(limit.clamp(1, 81))
        .map(|entry| entry.0)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_and_order_apply_before_paging_and_missing_folders_are_errors() {
        let root =
            std::env::temp_dir().join(format!("booki-directory-query-{}", std::process::id()));
        fs::create_dir_all(root.join("Z folder")).unwrap();
        for i in 0..100 {
            fs::write(root.join(format!("File {i:03}.txt")), b"").unwrap();
        }
        fs::write(root.join(".hidden"), b"").unwrap();
        let first = read(&root, 0, 25, "", "name").unwrap();
        assert_eq!(first[0].name, "Z folder");
        assert_eq!(first[1].name, "File 000.txt");
        let found = read(&root, 0, 25, "TXT 099", "name").unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "File 099.txt");
        let descending = read(&root, 0, 25, "", "name-desc").unwrap();
        assert_eq!(descending[0].name, "Z folder");
        assert_eq!(descending[1].name, "File 099.txt");
        let last = read(&root, 96, 25, "", "name").unwrap();
        assert_eq!(last.len(), 5);
        assert_eq!(last[4].name, "File 099.txt");
        assert!(read(&root.join("missing"), 0, 25, "", "name").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn recent_order_uses_file_modification_times() {
        let root =
            std::env::temp_dir().join(format!("booki-directory-time-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for (name, seconds) in [("Recent A.txt", 100), ("Recent B.txt", 200)] {
            let file = fs::File::create(root.join(name)).unwrap();
            file.set_times(
                fs::FileTimes::new()
                    .set_modified(SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(seconds)),
            )
            .unwrap();
        }
        let rows = read(&root, 0, 25, "recent", "modified").unwrap();
        assert_eq!(rows[0].name, "Recent B.txt");
        assert_eq!(rows[1].name, "Recent A.txt");
        fs::remove_dir_all(root).unwrap();
    }
}
