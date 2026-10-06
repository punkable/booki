//! Field-level optimistic concurrency: unrelated edits merge, conflicts stay explicit.
use serde_json::Value;
pub fn merge(
    current: Value,
    patch: &Value,
    base: Option<&Value>,
    expected: Option<u64>,
) -> Result<Value, String> {
    let fields = patch.as_object().ok_or("invalid config patch")?;
    let object = current.as_object().ok_or("invalid config")?;
    let mut conflicts = Vec::new();
    for (key, desired) in fields {
        if key == "revision" || !object.contains_key(key) {
            return Err(format!("unknown or protected config field: {key}"));
        }
        if let Some(base) = base {
            if base.get(key) != object.get(key) && object.get(key) != Some(desired) {
                conflicts.push(key.clone());
            }
        } else if expected.is_some_and(|value| value != current["revision"].as_u64().unwrap_or(0)) {
            conflicts.push(key.clone());
        }
    }
    if !conflicts.is_empty() {
        return Err(format!(
            "BOOKI_CONFIG_CONFLICT:{}",
            serde_json::json!({ "keys": conflicts, "current": current })
        ));
    }
    let mut next = current;
    for (key, desired) in fields {
        next[key] = desired.clone();
    }
    Ok(next)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn unrelated_edits_merge_without_losing_newer_preferences() {
        let current = json!({"revision":2,"theme":"dark","edge":"top"});
        let result = merge(
            current,
            &json!({"theme":"light"}),
            Some(&json!({"theme":"dark"})),
            Some(1),
        )
        .unwrap();
        assert_eq!(result["edge"], "top");
        assert_eq!(result["theme"], "light");
    }
    #[test]
    fn overlapping_edits_fail_without_replacing_current_values() {
        let current = json!({"revision":2,"edge":"top"});
        let error = merge(
            current.clone(),
            &json!({"edge":"left"}),
            Some(&json!({"edge":"bottom"})),
            Some(1),
        )
        .unwrap_err();
        let details: Value =
            serde_json::from_str(error.strip_prefix("BOOKI_CONFIG_CONFLICT:").unwrap()).unwrap();
        assert_eq!(details["current"], current);
        assert_eq!(details["keys"], json!(["edge"]));
    }
    #[test]
    fn identical_concurrent_edits_are_safe_but_revision_is_protected() {
        let current = json!({"revision":2,"edge":"top"});
        assert!(merge(
            current.clone(),
            &json!({"edge":"top"}),
            Some(&json!({"edge":"bottom"})),
            Some(1)
        )
        .is_ok());
        assert!(merge(current, &json!({"revision":99}), None, None).is_err());
    }
}
