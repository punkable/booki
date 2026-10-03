//! Explicit shortcut transfers. Never overwrite an existing desktop file.
use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

pub fn copy_unique(source: &Path, directory: &Path) -> Result<PathBuf, String> {
    if !source
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("lnk"))
        || !fs::symlink_metadata(source)
            .map_err(|e| e.to_string())?
            .is_file()
    {
        return Err("Only regular Windows shortcuts can be transferred".into());
    }
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let stem = source
        .file_stem()
        .ok_or("Invalid shortcut name")?
        .to_string_lossy();
    for suffix in 0..1000 {
        let name = if suffix == 0 {
            format!("{stem}.lnk")
        } else {
            format!("{stem} ({suffix}).lnk")
        };
        let target = directory.join(name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut dest) => {
                let result = fs::File::open(source)
                    .and_then(|mut src| io::copy(&mut src, &mut dest))
                    .and_then(|_| dest.sync_all());
                drop(dest);
                if let Err(e) = result {
                    let _ = fs::remove_file(&target);
                    return Err(e.to_string());
                }
                return Ok(target);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Too many shortcuts with the same name".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transfer_preserves_original_and_never_overwrites() {
        let root = std::env::temp_dir().join(format!("booki-shortcut-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("App.lnk");
        fs::write(&source, b"shortcut with arguments and working directory").unwrap();
        let destination = root.join("desktop");
        let first = copy_unique(&source, &destination).unwrap();
        let second = copy_unique(&source, &destination).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&source).unwrap(), fs::read(&second).unwrap());
        fs::write(root.join("App.exe"), b"executable").unwrap();
        assert!(copy_unique(&root.join("App.exe"), &destination).is_err());
        assert!(copy_unique(&root.join("missing.lnk"), &destination).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
