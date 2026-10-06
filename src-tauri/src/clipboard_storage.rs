//! A failed encryption must never silently downgrade Windows history to JSON.
pub fn payload(
    text: &[u8],
    protected: Option<Vec<u8>>,
    require_encryption: bool,
) -> Result<Vec<u8>, &'static str> {
    match protected {
        Some(bytes) => Ok([b"booki-dpapi-v1\n".as_slice(), &bytes].concat()),
        None if require_encryption => {
            Err("Clipboard encryption unavailable; previous history retained")
        }
        None => Ok([b"booki-json-v1\n".as_slice(), text].concat()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_windows_encryption_does_not_create_a_plaintext_payload() {
        assert!(payload(b"private text", None, true).is_err());
        assert_eq!(
            payload(b"private text", Some(vec![1, 2]), true).unwrap(),
            b"booki-dpapi-v1\n\x01\x02"
        );
        assert_eq!(
            payload(b"sample", None, false).unwrap(),
            b"booki-json-v1\nsample"
        );
    }
}
