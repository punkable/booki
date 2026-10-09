//! Bounded reads for reviewed configuration documents and saved profiles.
use crate::config::Config;
use std::{fs::File, io::Read, path::Path};

pub fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    const LIMIT: u64 = 16 * 1024 * 1024;
    let source = File::open(path).map_err(|e| e.to_string())?;
    if source.metadata().map_err(|e| e.to_string())?.len() > LIMIT {
        return Err("BOOKI_IMPORT_TOO_LARGE".into());
    }
    let mut bytes = Vec::new();
    source
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("BOOKI_IMPORT_TOO_LARGE".into());
    }
    Ok(bytes)
}

pub fn read(path: &Path) -> Result<Config, String> {
    let value: serde_json::Value =
        serde_json::from_slice(&read_bytes(path)?).map_err(|e| e.to_string())?;
    if !value
        .as_object()
        .is_some_and(|value| value.contains_key("pinned"))
    {
        return Err("BOOKI_IMPORT_INVALID".into());
    }
    serde_json::from_value(value).map_err(|e| e.to_string())
}
