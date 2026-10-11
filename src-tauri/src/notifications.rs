//! Native Windows toast notifications.

use super::*;

/// The AppUserModelID Booki runs under. It must equal `identifier` in
/// tauri.conf.json: the NSIS and MSI installers stamp that value on the
/// Start-menu shortcut, and Windows only shows toasts for an ID that a
/// shortcut carries. A test keeps the two in step.
pub(crate) const APP_USER_MODEL_ID: &str = "com.booki.dock";

/// Toast text limits. Windows trims long text anyway; capping here keeps a
/// runaway string from producing a huge XML document.
const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 1000;

/// Show a Windows toast with a title and an optional body. Do not disturb and
/// the per-app notification switch are applied by Windows. Errors when toasts
/// are unavailable (turned off, not registered, or not on Windows).
#[tauri::command]
pub(crate) async fn notify(title: String, body: Option<String>) -> Result<(), String> {
    let xml = toast_xml(&title, body.as_deref().unwrap_or(""))?;
    util::blocking(move || win::show_toast(APP_USER_MODEL_ID, &xml)).await?
}

/// The ToastGeneric document for a title and body, with the text escaped.
pub(crate) fn toast_xml(title: &str, body: &str) -> Result<String, String> {
    let title = clean_text(title, MAX_TITLE_CHARS);
    if title.is_empty() {
        return Err("a toast needs a title".into());
    }
    let body = clean_text(body, MAX_BODY_CHARS);
    let mut xml = String::from(r#"<toast><visual><binding template="ToastGeneric">"#);
    xml.push_str("<text>");
    xml.push_str(&xml_escape(&title));
    xml.push_str("</text>");
    if !body.is_empty() {
        xml.push_str("<text>");
        xml.push_str(&xml_escape(&body));
        xml.push_str("</text>");
    }
    xml.push_str("</binding></visual></toast>");
    Ok(xml)
}

/// Trim, drop characters XML 1.0 cannot carry (C0 controls other than tab
/// and line breaks), and cap the length in characters.
fn clean_text(text: &str, max: usize) -> String {
    text.trim()
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\t' | '\n' | '\r'))
        .filter(|c| !matches!(c, '\u{FFFE}' | '\u{FFFF}'))
        .take(max)
        .collect()
}

pub(crate) fn xml_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{toast_xml, xml_escape, APP_USER_MODEL_ID};

    #[test]
    fn app_id_matches_bundle_identifier() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"].as_str(), Some(APP_USER_MODEL_ID));
    }

    #[test]
    fn escapes_markup() {
        assert_eq!(
            xml_escape(r#"<a href="x">Tom & 'Jerry'</a>"#),
            "&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;"
        );
    }

    #[test]
    fn builds_generic_toast() {
        assert_eq!(
            toast_xml("Focus done", "Take a <break>").unwrap(),
            "<toast><visual><binding template=\"ToastGeneric\"><text>Focus done</text>\
             <text>Take a &lt;break&gt;</text></binding></visual></toast>"
        );
    }

    #[test]
    fn omits_empty_body_and_rejects_empty_title() {
        assert!(!toast_xml("Update", "  ").unwrap().contains("<text></text>"));
        assert_eq!(
            toast_xml("Update", "").unwrap().matches("<text>").count(),
            1
        );
        assert!(toast_xml("   ", "body").is_err());
    }

    #[test]
    fn strips_control_characters_and_caps_length() {
        let xml = toast_xml("a\u{0}b\u{7}c", &"x".repeat(5000)).unwrap();
        assert!(xml.contains("<text>abc</text>"));
        assert!(xml.contains(&format!("<text>{}</text>", "x".repeat(1000))));
        assert!(!xml.contains(&"x".repeat(1001)));
    }
}
