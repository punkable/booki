//! The few strings Rust draws itself (the tray menu and the Settings window
//! title), in the five languages the app ships. Everything else is localized
//! by the frontend.

use std::sync::Mutex;

pub(crate) const LANGUAGES: [&str; 5] = ["es", "en", "pt", "fr", "de"];

/// The language the native strings are in now. Starts from the config and is
/// corrected by the dock once it has resolved "system" the same way the pages
/// do (`sync_native_language`).
static CURRENT: Mutex<&'static str> = Mutex::new("en");

pub(crate) struct NativeText {
    pub(crate) toggle: &'static str,
    pub(crate) settings: &'static str,
    pub(crate) quit: &'static str,
    pub(crate) settings_title: &'static str,
}

/// A supported language code, or None.
pub(crate) fn supported(code: &str) -> Option<&'static str> {
    let base = code.trim().to_ascii_lowercase();
    let base = base.split(['-', '_']).next().unwrap_or("");
    LANGUAGES.iter().copied().find(|known| *known == base)
}

/// The config's language, with "system" (or anything unknown) resolved to the
/// Windows display language, falling back to English like the pages do.
pub(crate) fn resolve(language: &str) -> &'static str {
    supported(language)
        .or_else(|| system_language().and_then(supported))
        .unwrap_or("en")
}

#[cfg(windows)]
fn system_language() -> Option<&'static str> {
    // The low 10 bits of a LANGID are the primary language.
    let id = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } & 0x3ff;
    match id {
        0x0a => Some("es"),
        0x09 => Some("en"),
        0x16 => Some("pt"),
        0x0c => Some("fr"),
        0x07 => Some("de"),
        _ => None,
    }
}

#[cfg(not(windows))]
fn system_language() -> Option<&'static str> {
    None
}

pub(crate) fn current() -> &'static str {
    *CURRENT.lock().unwrap_or_else(|e| e.into_inner())
}

/// Record the language; true when it changed.
pub(crate) fn set_current(language: &'static str) -> bool {
    let mut slot = CURRENT.lock().unwrap_or_else(|e| e.into_inner());
    let changed = *slot != language;
    *slot = language;
    changed
}

pub(crate) fn text(language: &str) -> NativeText {
    match language {
        "es" => NativeText {
            toggle: "Mostrar / ocultar dock",
            settings: "Ajustes…",
            quit: if cfg!(booki_dev) {
                "Salir de Booki Dev"
            } else {
                "Salir de Booki"
            },
            settings_title: if cfg!(booki_dev) {
                "Booki Dev — Ajustes"
            } else {
                "Booki — Ajustes"
            },
        },
        "pt" => NativeText {
            toggle: "Mostrar / ocultar dock",
            settings: "Configurações…",
            quit: if cfg!(booki_dev) {
                "Sair do Booki Dev"
            } else {
                "Sair do Booki"
            },
            settings_title: if cfg!(booki_dev) {
                "Booki Dev — Configurações"
            } else {
                "Booki — Configurações"
            },
        },
        "fr" => NativeText {
            toggle: "Afficher / masquer le dock",
            settings: "Réglages…",
            quit: if cfg!(booki_dev) {
                "Quitter Booki Dev"
            } else {
                "Quitter Booki"
            },
            settings_title: if cfg!(booki_dev) {
                "Booki Dev — Réglages"
            } else {
                "Booki — Réglages"
            },
        },
        "de" => NativeText {
            toggle: "Dock ein-/ausblenden",
            settings: "Einstellungen…",
            quit: if cfg!(booki_dev) {
                "Booki Dev beenden"
            } else {
                "Booki beenden"
            },
            settings_title: if cfg!(booki_dev) {
                "Booki Dev — Einstellungen"
            } else {
                "Booki — Einstellungen"
            },
        },
        _ => NativeText {
            toggle: "Show / hide dock",
            settings: "Settings…",
            quit: if cfg!(booki_dev) {
                "Quit Booki Dev"
            } else {
                "Quit Booki"
            },
            settings_title: if cfg!(booki_dev) {
                "Booki Dev — Settings"
            } else {
                "Booki — Settings"
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_language_has_its_own_text_and_codes_resolve() {
        let titles: Vec<&str> = LANGUAGES.iter().map(|l| text(l).settings_title).collect();
        for (i, title) in titles.iter().enumerate() {
            assert!(!titles[i + 1..].contains(title), "{title} repeated");
        }
        assert_eq!(supported("pt-BR"), Some("pt"));
        assert_eq!(supported("DE"), Some("de"));
        assert_eq!(supported("system"), None);
        assert_eq!(resolve("fr"), "fr");
        assert_eq!(text("xx").quit, "Quit Booki");
    }
}
