//! Local recovery copies of notes. Windows storage must remain encrypted.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
static LOCK: Mutex<()> = Mutex::new(());
const MAGIC: &[u8] = b"booki-note-dpapi-v1\n";
const PLAIN: &[u8] = b"booki-note-json-v1\n";
#[derive(Deserialize, Serialize)]
struct Draft {
    version: u8,
    id: String,
    text: String,
}
fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 120 {
        return Err("Invalid note identifier".into());
    }
    let name: String = id.as_bytes().iter().map(|b| format!("{b:02x}")).collect();
    Ok(root.join("note-drafts").join(format!("{name}.dat")))
}
fn read_locked(
    root: &Path,
    id: &str,
    decrypt: impl FnOnce(&[u8]) -> Option<Vec<u8>>,
    encrypted: bool,
) -> Result<Option<String>, String> {
    let file = path(root, id)?;
    if fs::metadata(&file).is_ok_and(|m| m.len() > 256_000) {
        return Err("Note recovery copy is too large".into());
    }
    let bytes = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if bytes.len() > 256_000 {
        return Err("Note recovery copy is too large".into());
    }
    let json = if let Some(data) = bytes.strip_prefix(MAGIC) {
        decrypt(data).ok_or("Note recovery copy could not be decrypted")?
    } else if !encrypted {
        bytes
            .strip_prefix(PLAIN)
            .ok_or("Unrecognized note recovery copy")?
            .to_vec()
    } else {
        return Err("Unencrypted note recovery copy rejected".into());
    };
    let draft: Draft = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
    if draft.version != 1 || draft.id != id || draft.text.chars().count() > 20_000 {
        return Err("Invalid note recovery copy".into());
    }
    Ok(Some(draft.text))
}
pub fn read(
    root: &Path,
    id: &str,
    decrypt: impl FnOnce(&[u8]) -> Option<Vec<u8>>,
    encrypted: bool,
) -> Result<Option<String>, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    read_locked(root, id, decrypt, encrypted)
}
pub fn write(
    root: &Path,
    id: &str,
    text: &str,
    encrypt: impl FnOnce(&[u8]) -> Option<Vec<u8>>,
    encrypted: bool,
) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let file = path(root, id)?;
    if text.chars().count() > 20_000 {
        return Err("Note draft is too long".into());
    }
    let json = serde_json::to_vec(&Draft {
        version: 1,
        id: id.into(),
        text: text.into(),
    })
    .map_err(|e| e.to_string())?;
    let bytes = match encrypt(&json) {
        Some(data) => [MAGIC, &data].concat(),
        None if encrypted => {
            return Err("Note encryption unavailable; previous recovery copy retained".into())
        }
        None => [PLAIN, &json].concat(),
    };
    crate::snapshot::write_bytes(&file, &bytes)
}
/// Never delete a newer draft after an older configuration save completes.
pub fn clear(
    root: &Path,
    id: &str,
    expected: &str,
    decrypt: impl FnOnce(&[u8]) -> Option<Vec<u8>>,
    encrypted: bool,
) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    if read_locked(root, id, decrypt, encrypted)?.as_deref() == Some(expected) {
        fs::remove_file(path(root, id)?).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn windows_dpapi_roundtrip_keeps_note_out_of_plaintext_storage() {
        let root = std::env::temp_dir().join(format!("booki-note-dpapi-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write(
            &root,
            "notes",
            "Private recovery text",
            crate::win::protect_data,
            true,
        )
        .unwrap();
        let stored = fs::read(path(&root, "notes").unwrap()).unwrap();
        assert!(stored.starts_with(MAGIC));
        assert!(!stored.windows(21).any(|b| b == b"Private recovery text"));
        assert_eq!(
            read(&root, "notes", crate::win::unprotect_data, true)
                .unwrap()
                .as_deref(),
            Some("Private recovery text")
        );
        clear(
            &root,
            "notes",
            "Private recovery text",
            crate::win::unprotect_data,
            true,
        )
        .unwrap();
        assert!(read(&root, "notes", crate::win::unprotect_data, true)
            .unwrap()
            .is_none());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn recovery_is_isolated_atomic_and_never_downgrades_or_clears_newer_text() {
        let root = std::env::temp_dir().join(format!("booki-note-journal-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let cipher = |bytes: &[u8]| Some(bytes.iter().map(|b| b ^ 0xa5).collect::<Vec<_>>());
        write(&root, "../note", "private draft", cipher, true).unwrap();
        assert_eq!(
            read(&root, "../note", cipher, true).unwrap().as_deref(),
            Some("private draft")
        );
        assert!(!fs::read(path(&root, "../note").unwrap())
            .unwrap()
            .windows(13)
            .any(|b| b == b"private draft"));
        assert!(write(&root, "../note", "lost", |_| None, true).is_err());
        assert_eq!(
            read(&root, "../note", cipher, true).unwrap().as_deref(),
            Some("private draft")
        );
        write(&root, "../note", "newer", cipher, true).unwrap();
        clear(&root, "../note", "private draft", cipher, true).unwrap();
        assert_eq!(
            read(&root, "../note", cipher, true).unwrap().as_deref(),
            Some("newer")
        );
        assert!(read(&root, "../note", |_| None, true).is_err());
        assert!(write(&root, "", "text", cipher, true).is_err());
        assert!(write(&root, "x", &"a".repeat(20_001), cipher, true).is_err());
        clear(&root, "../note", "newer", cipher, true).unwrap();
        assert!(read(&root, "../note", cipher, true).unwrap().is_none());
        write(&root, "other", "portable", |_| None, false).unwrap();
        assert!(read(&root, "other", cipher, true).is_err());
        assert_eq!(
            read(&root, "other", |_| None, false).unwrap().as_deref(),
            Some("portable")
        );
        fs::write(path(&root, "other").unwrap(), b"broken").unwrap();
        assert!(read(&root, "other", |_| None, false).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
