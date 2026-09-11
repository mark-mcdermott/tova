/*!
Where a note lives, and the id the renderer names it by — a port of
`src/shared/noteLocation.ts`.

`sortNotes` is not here. It ends in `localeCompare`, which is a collation and
not a comparison, and Rust has no equivalent in the standard library. It
belongs with `notes.rs`, where it is used and where the choice about collation
can be made against something real rather than in the abstract.
*/

// Ported ahead of its caller, the way `vault.rs` was: this is the layer a
// note is read and written through, and it is worth having under a
// conformance fixture before the code that leans on it exists rather than
// after. Read by `notes.rs`, which is the slice after this one.
#![allow(dead_code)]

use crate::front_matter::Data;
use crate::js;

/// Sections whose notes are filed one folder deep. Everything else is flat.
const FOLDERED: [&str; 2] = ["notes", "posts"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteLocation {
    pub section: String,
    /// Single folder under Notes, or the blog under Posts; null elsewhere.
    pub folder: Option<String>,
    pub filename: String,
}

/*
 * A section is a directory in the vault and the reader configures which ones
 * exist, so this is the shape of an id rather than a list of them. What makes
 * it safe is that it cannot climb a path, and the vault's own choke point
 * refuses anything that tries.
 */
pub fn is_section(value: &str) -> bool {
    let mut chars = value.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn to_note_id(location: &NoteLocation) -> String {
    match &location.folder {
        None => format!("{}/{}", location.section, location.filename),
        Some(folder) => format!("{}/{}/{}", location.section, folder, location.filename),
    }
}

/// Parses a vault-relative note id, rejecting anything that could point outside
/// the vault or nest deeper than the one folder level Tova supports. Returning
/// `None` rather than erroring keeps the command layer's validation simple.
pub fn parse_note_id(id: &str) -> Option<NoteLocation> {
    if id.is_empty() || id.starts_with('/') || id.contains('\\') || id.contains('\0') {
        return None;
    }

    let parts: Vec<&str> = id.split('/').collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return None;
    }
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }

    let section = parts[0];
    if !is_section(section) {
        return None;
    }

    let rest = &parts[1..];
    let filename = rest[rest.len() - 1];
    if !filename.ends_with(".md") {
        return None;
    }

    let folder = (rest.len() == 2).then(|| rest[0].to_string());
    // Notes has user folders and Posts has one per blog; the rest are flat.
    if folder.is_some() && !FOLDERED.contains(&section) {
        return None;
    }

    Some(NoteLocation {
        section: section.to_string(),
        folder,
        filename: filename.to_string(),
    })
}

pub fn is_valid_folder_name(name: &str) -> bool {
    let trimmed = js::trim(name);
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return false;
    }
    !trimmed.contains(['/', '\\', '\0'])
}

/// Trash is flat: a note keeps its filename but loses its folder on the way in.
pub fn trash_location(filename: &str) -> NoteLocation {
    NoteLocation {
        section: "trash".to_string(),
        folder: None,
        filename: filename.to_string(),
    }
}

/// Where a trashed note goes when restored. The original section and folder are
/// carried in front matter, so a note restores to where it was deleted from —
/// falling back to the Notes root if that metadata is missing or nonsensical.
pub fn restore_location(data: &Data, filename: &str) -> NoteLocation {
    let section = data
        .str("section")
        .filter(|s| is_section(s) && *s != "trash")
        .unwrap_or("notes")
        .to_string();

    let folder = (section == "notes")
        .then(|| data.str("folder"))
        .flatten()
        .filter(|f| is_valid_folder_name(f))
        .map(|f| js::trim(f).to_string());

    NoteLocation {
        section,
        folder,
        filename: filename.to_string(),
    }
}
