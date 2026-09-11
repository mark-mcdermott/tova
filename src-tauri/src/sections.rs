/*!
The sidebar's sections — a port of `src/shared/sections.ts`.

Only the normalising half is here. The rest of that file is the renderer's, and
stays where it is: the port moves `src/main`, not the parts of `src/shared` the
webview uses for itself.
*/

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SectionKind {
    Section,
    Blog,
}

pub const SECTION_ICONS: [&str; 9] = [
    "notes", "daily", "ideas", "journal", "posts", "trash", "folder", "tag", "star",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SectionConfig {
    /// A vault directory, or — for a blog — the blog's name.
    pub id: String,
    pub kind: SectionKind,
    pub label: String,
    pub icon: String,
    /// Hidden from the sidebar. Its notes stay on disk and still turn up in search.
    pub enabled: bool,
}

impl SectionConfig {
    fn new(id: &str, label: &str, icon: &str) -> Self {
        Self {
            id: id.to_string(),
            kind: SectionKind::Section,
            label: label.to_string(),
            icon: icon.to_string(),
            enabled: true,
        }
    }

    /// A rail entry's identity. Blog names are not section ids — they can carry
    /// dots and could otherwise collide with one — so the two namespaces are
    /// kept apart here.
    fn rail_key(&self) -> String {
        match self.kind {
            SectionKind::Blog => format!("blog:{}", self.id),
            SectionKind::Section => self.id.clone(),
        }
    }
}

pub fn default_sections() -> Vec<SectionConfig> {
    vec![
        // Daily leads, because Tova opens on today's note.
        SectionConfig::new("daily", "Daily", "daily"),
        SectionConfig::new("notes", "Notes", "notes"),
        SectionConfig::new("ideas", "Ideas", "ideas"),
        SectionConfig::new("journal", "Journal", "journal"),
        SectionConfig::new("trash", "Trash", "trash"),
    ]
}

/// A section id is a directory and has to look like one.
fn is_section_id(id: &str) -> bool {
    let mut chars = id.chars();
    match chars.next() {
        Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit() => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Stored entries first, in the order they were stored, then any default that
/// was not among them. What is unrecognised is dropped rather than repaired.
pub fn normalize_sections(value: Option<&Value>) -> Vec<SectionConfig> {
    let stored = value.and_then(Value::as_array).cloned().unwrap_or_default();
    let mut out: Vec<SectionConfig> = Vec::new();

    for entry in stored {
        let Some(raw) = entry.as_object() else {
            continue;
        };
        let id = raw.get("id").and_then(Value::as_str).unwrap_or("");
        let kind = if raw.get("kind").and_then(Value::as_str) == Some("blog") {
            SectionKind::Blog
        } else {
            SectionKind::Section
        };

        // A blog is keyed by its name, which is only barred from carrying
        // spaces; a section id has to look like a directory.
        let valid = match kind {
            SectionKind::Blog => !id.is_empty() && !id.contains(char::is_whitespace),
            SectionKind::Section => is_section_id(id),
        };
        if !valid {
            continue;
        }

        let key = match kind {
            SectionKind::Blog => format!("blog:{id}"),
            SectionKind::Section => id.to_string(),
        };
        if out.iter().any(|s| s.rail_key() == key) {
            continue;
        }

        let fallback = default_sections()
            .into_iter()
            .find(|s| s.kind == kind && s.id == id);

        let label = match raw.get("label").and_then(Value::as_str) {
            Some(l) if !l.trim().is_empty() => l.trim().chars().take(40).collect(),
            _ => fallback
                .as_ref()
                .map(|f| f.label.clone())
                .unwrap_or_else(|| id.to_string()),
        };

        let icon = match raw.get("icon").and_then(Value::as_str) {
            Some(i) if SECTION_ICONS.contains(&i) => i.to_string(),
            _ => fallback
                .as_ref()
                .map(|f| f.icon.clone())
                .unwrap_or_else(|| match kind {
                    SectionKind::Blog => "posts".to_string(),
                    SectionKind::Section => "folder".to_string(),
                }),
        };

        out.push(SectionConfig {
            id: id.to_string(),
            kind,
            label,
            icon,
            enabled: raw.get("enabled") != Some(&Value::Bool(false)),
        });
    }

    for section in default_sections() {
        if !out.iter().any(|s| s.rail_key() == section.rail_key()) {
            out.push(section);
        }
    }

    out
}
