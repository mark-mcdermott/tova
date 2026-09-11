/*!
Notes: reading them, writing them, and naming the files they live in — a port
of `src/main/notes.ts`.

This half is the note itself. Moving one — to another section, to Trash, back
out of it — is the slice after this, and is a different kind of risk: it
renames files, and it is worth reviewing on its own rather than underneath
this.
*/

// The other half's callers arrive with it.
#![allow(dead_code)]

use chrono::{DateTime, Local, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::backup::save_version;
use crate::front_matter::{self, Data, Value};
use crate::note_location::{
    is_section, is_valid_folder_name, parse_note_id, restore_location, to_note_id, NoteLocation,
};
use crate::note_name::{compare_titles, slugify, unique_slug};
use crate::tags::{all_tags, normalize_manual_tags};
use crate::vault::{directory_of, note_path, require_location, resolve_in_vault, vault_root};
use crate::vault_file::{read_vault_text, write_vault_text};

/// Sections whose notes are filed one folder deep. Everything else is flat.
const FOLDERED: [&str; 2] = ["notes", "posts"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    /// Vault-relative path, e.g. `notes/ideas/river.md`. Changes when renamed.
    pub id: String,
    pub title: String,
    pub section: String,
    pub folder: Option<String>,
    /// Every tag the note carries: front matter first, then the prose's.
    pub tags: Vec<String>,
    pub manual_tags: Vec<String>,
    pub favorite: bool,
    pub updated_at: f64,
    pub created_at: f64,
    pub deleted_at: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    #[serde(flatten)]
    pub summary: NoteSummary,
    pub body: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub section: String,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    /// Exact filename to use instead of one derived from the title.
    #[serde(default)]
    pub filename: Option<String>,
}

struct Home {
    section: String,
    folder: Option<String>,
}

struct Loaded {
    location: NoteLocation,
    /// Where the note belongs — for a trashed note, where it came from.
    home: Home,
    title: String,
    body: String,
    deleted_at: Option<f64>,
    favorite: bool,
    /// The tags the row put in front matter. Prose tags are not in here.
    manual_tags: Vec<String>,
    updated_at: f64,
    created_at: f64,
}

fn stem(filename: &str) -> &str {
    filename.strip_suffix(".md").unwrap_or(filename)
}

/*
 * `Date.parse` of what `persist` wrote, which is an ISO 8601 instant.
 *
 * Narrower than `Date.parse`, which will have a go at almost any string. The
 * only values here are ones Tova wrote, and a hand-edited one that this cannot
 * read reads as "not deleted" — which is the same answer the TypeScript gives
 * for a string it cannot read either.
 */
fn read_timestamp(value: Option<&Value>) -> Option<f64> {
    let text = value?.as_str()?;
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|at| at.timestamp_millis() as f64)
}

fn to_iso(ms: f64) -> String {
    Utc.timestamp_millis_opt(ms as i64)
        .single()
        .map(|at| at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
        .unwrap_or_default()
}

fn now_ms() -> f64 {
    Local::now().timestamp_millis() as f64
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> f64 {
    time.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn load(location: &NoteLocation) -> Result<Loaded, String> {
    let absolute = note_path(location)?;
    let raw = read_vault_text(&absolute)?;
    let stats = std::fs::metadata(&absolute).map_err(|e| e.to_string())?;
    let parsed = front_matter::parse(&raw);

    let home = if location.section == "trash" {
        let restored = restore_location(&parsed.data, &location.filename);
        Home {
            section: restored.section,
            folder: restored.folder,
        }
    } else {
        Home {
            section: location.section.clone(),
            folder: location.folder.clone(),
        }
    };

    let title = parsed
        .data
        .str("title")
        .filter(|recorded| !crate::js::trim(recorded).is_empty())
        .unwrap_or_else(|| stem(&location.filename))
        .to_string();

    Ok(Loaded {
        location: location.clone(),
        home,
        title,
        deleted_at: read_timestamp(parsed.data.get("deletedAt")),
        favorite: parsed.data.str("favorite") == Some("true"),
        manual_tags: normalize_manual_tags(parsed.data.get("tags")),
        updated_at: millis(stats.modified()),
        created_at: millis(stats.created()),
        body: parsed.body,
    })
}

fn persist(note: &Loaded) -> Result<(), String> {
    let mut data = Data::default();
    data.set("title", note.title.clone());
    data.set("section", note.home.section.clone());
    if let Some(folder) = &note.home.folder {
        data.set("folder", folder.clone());
    }
    if let Some(at) = note.deleted_at {
        data.set("deletedAt", to_iso(at));
    }
    // Written only when set, so an ordinary note's front matter stays quiet.
    if note.favorite {
        data.set("favorite", "true");
    }
    // Only the tags the reader asked for in the row. The ones written into the
    // prose are the prose, and storing them here as well would be a copy that
    // goes stale the moment the file is edited anywhere else.
    if !note.manual_tags.is_empty() {
        data.set("tags", note.manual_tags.clone());
    }

    write_vault_text(
        &note_path(&note.location)?,
        &front_matter::serialize(&data, &note.body),
    )
}

fn to_summary(note: &Loaded) -> NoteSummary {
    NoteSummary {
        id: to_note_id(&note.location),
        title: note.title.clone(),
        section: note.location.section.clone(),
        folder: note.location.folder.clone(),
        tags: all_tags(&note.manual_tags, &note.body),
        manual_tags: note.manual_tags.clone(),
        favorite: note.favorite,
        updated_at: note.updated_at,
        created_at: note.created_at,
        deleted_at: note.deleted_at,
    }
}

fn to_note(note: Loaded) -> Note {
    Note {
        summary: to_summary(&note),
        body: note.body,
    }
}

/// Favourites first, then most recently touched, with title as a stable
/// tie-break. The favourite rank is applied within whatever list it is given,
/// so a note pins to the top of its own section rather than the whole vault.
pub fn sort_notes(notes: &mut [NoteSummary]) {
    notes.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| {
                b.updated_at
                    .partial_cmp(&a.updated_at)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| compare_titles(&a.title, &b.title))
    });
}

fn names_in(directory: &std::path::Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

/// Free `.md` filename in `directory`, ignoring the note's own current name.
fn free_filename(directory: &std::path::Path, title: &str, keep: Option<&str>) -> String {
    let taken: Vec<String> = names_in(directory)
        .into_iter()
        .filter(|name| name.ends_with(".md") && Some(name.as_str()) != keep)
        .map(|name| stem(&name).to_string())
        .collect();

    format!(
        "{}.md",
        unique_slug(&slugify(title), taken.iter().map(String::as_str))
    )
}

fn normalize_folder(section: &str, folder: Option<&str>) -> Option<String> {
    if !FOLDERED.contains(&section) {
        return None;
    }
    let folder = folder?;
    is_valid_folder_name(folder).then(|| crate::js::trim(folder).to_string())
}

fn list_locations() -> Vec<NoteLocation> {
    let mut locations = Vec::new();

    // The vault's own directories rather than the configured list: a section
    // the reader has since removed may still hold notes, and they should still
    // be found rather than quietly disappearing.
    let mut sections: Vec<String> = std::fs::read_dir(vault_root())
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.path().is_dir())
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| is_section(name))
                .collect()
        })
        .unwrap_or_default();
    sections.sort();

    for section in sections {
        let Ok(section_dir) = resolve_in_vault(&section) else {
            continue;
        };

        for name in names_in(&section_dir) {
            let path = section_dir.join(&name);
            if path.is_file() && name.ends_with(".md") {
                locations.push(NoteLocation {
                    section: section.clone(),
                    folder: None,
                    filename: name,
                });
                continue;
            }

            // One folder level, and only where a section has them: user folders
            // under Notes, one per blog under Posts. Nothing recurses further.
            if path.is_dir() && FOLDERED.contains(&section.as_str()) && is_valid_folder_name(&name)
            {
                for file in names_in(&path) {
                    if path.join(&file).is_file() && file.ends_with(".md") {
                        locations.push(NoteLocation {
                            section: section.clone(),
                            folder: Some(name.clone()),
                            filename: file,
                        });
                    }
                }
            }
        }
    }

    locations
}

pub fn list() -> Vec<NoteSummary> {
    let mut summaries: Vec<NoteSummary> = list_locations()
        .iter()
        .filter_map(|location| load(location).ok())
        .map(|note| to_summary(&note))
        .collect();

    sort_notes(&mut summaries);
    summaries
}

pub fn read(id: &str) -> Result<Note, String> {
    Ok(to_note(load(&require_location(id)?)?))
}

pub fn create(input: CreateNoteInput) -> Result<Note, String> {
    let section = if input.section == "trash" {
        "notes".to_string()
    } else {
        input.section
    };
    let folder = normalize_folder(&section, input.folder.as_deref());
    let title = crate::js::trim(input.title.as_deref().unwrap_or_default()).to_string();

    let directory = directory_of(&section, folder.as_deref())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    // A caller-supplied filename is validated by round-tripping it through the
    // id parser, which is the same check every other entry point uses.
    let location = match &input.filename {
        None => NoteLocation {
            section: section.clone(),
            folder: folder.clone(),
            filename: free_filename(&directory, &title, None),
        },
        Some(filename) => parse_note_id(&to_note_id(&NoteLocation {
            section: section.clone(),
            folder: folder.clone(),
            filename: filename.clone(),
        }))
        .ok_or_else(|| format!("Invalid filename: {filename}"))?,
    };

    let at = now_ms();
    persist(&Loaded {
        location: location.clone(),
        home: Home { section, folder },
        title,
        body: input.body.unwrap_or_default(),
        deleted_at: None,
        favorite: false,
        manual_tags: Vec::new(),
        updated_at: at,
        created_at: at,
    })?;

    Ok(to_note(load(&location)?))
}

/// Saves content, and follows the title with the filename. Daily notes keep
/// their date-based names, and a note that has been emptied of its title keeps
/// whatever filename it already had rather than churning to `untitled`.
pub fn write(id: &str, title: &str, body: &str) -> Result<NoteSummary, String> {
    let mut note = load(&require_location(id)?)?;

    // Snapshot what is on disk before overwriting it; save_version throttles so
    // continuous typing does not burn through the ten version slots.
    if let Ok(previous) = read_vault_text(&note_path(&note.location)?) {
        save_version(id, &previous, &Local::now())?;
    }

    note.title = crate::js::trim(title).to_string();
    note.body = body.to_string();
    persist(&note)?;

    // Notes only: a synced post's filename is the blog's, and renaming it here
    // would quietly break the mapping to the file it came from.
    let should_rename = note.location.section == "notes"
        && !note.title.is_empty()
        && slugify(&note.title) != stem(&note.location.filename);

    if !should_rename {
        return Ok(to_summary(&load(&note.location)?));
    }

    let directory = directory_of(&note.location.section, note.location.folder.as_deref())?;
    let filename = free_filename(&directory, &note.title, Some(&note.location.filename));
    let next = NoteLocation {
        filename,
        ..note.location.clone()
    };

    std::fs::rename(note_path(&note.location)?, note_path(&next)?).map_err(|e| e.to_string())?;
    Ok(to_summary(&load(&next)?))
}

pub fn rename(id: &str, title: &str) -> Result<NoteSummary, String> {
    let note = load(&require_location(id)?)?;
    write(id, title, &note.body)
}

/// Pins a note to the top of its section, or unpins it.
pub fn set_favorite(id: &str, favorite: bool) -> Result<NoteSummary, String> {
    let mut note = load(&require_location(id)?)?;
    if note.favorite == favorite {
        return Ok(to_summary(&note));
    }

    note.favorite = favorite;
    persist(&note)?;
    Ok(to_summary(&load(&note.location)?))
}

/// Replaces the tags the row keeps in front matter. Only those: a tag written
/// into the prose stays in the prose, and is read back out of it.
pub fn set_manual_tags(id: &str, tags: Vec<String>) -> Result<NoteSummary, String> {
    let mut note = load(&require_location(id)?)?;
    let next = normalize_manual_tags(Some(&Value::Many(tags)));

    if next == note.manual_tags {
        return Ok(to_summary(&note));
    }

    note.manual_tags = next;
    persist(&note)?;
    Ok(to_summary(&load(&note.location)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};

    /*
     * A vault of its own, held under the same lock everything that switches
     * the vault in use holds.
     */
    struct Scratch {
        vault: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let vault = std::env::temp_dir().join(format!("tova-notes-{name}"));
            let _ = std::fs::remove_dir_all(&vault);
            for section in ["notes", "daily", "posts", "trash"] {
                std::fs::create_dir_all(vault.join(section)).unwrap();
            }
            set_active_vault(Some(vault.clone()));
            Self { vault, _held: held }
        }

        fn raw(&self, id: &str) -> String {
            std::fs::read_to_string(self.vault.join(id)).unwrap()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.vault);
        }
    }

    fn made(section: &str, title: &str, body: &str) -> Note {
        create(CreateNoteInput {
            section: section.to_string(),
            title: Some(title.to_string()),
            body: Some(body.to_string()),
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn a_new_note_is_named_after_its_title() {
        let _s = Scratch::new("create");

        let note = made("notes", "Slow Morning", "Coffee.\n");

        assert_eq!(note.summary.id, "notes/slow-morning.md");
        assert_eq!(note.summary.title, "Slow Morning");
        assert_eq!(note.body, "Coffee.\n");
    }

    #[test]
    fn a_second_note_of_the_same_name_does_not_clobber_the_first() {
        let _s = Scratch::new("clobber");
        made("notes", "Slow Morning", "First.");

        let second = made("notes", "Slow Morning", "Second.");

        assert_eq!(second.summary.id, "notes/slow-morning-2.md");
        assert_eq!(read("notes/slow-morning.md").unwrap().body, "First.");
    }

    #[test]
    fn a_note_with_no_title_still_gets_a_filename() {
        let _s = Scratch::new("untitled");

        assert_eq!(made("notes", "", "").summary.id, "notes/untitled.md");
    }

    #[test]
    fn a_note_created_in_the_trash_is_created_in_notes_instead() {
        // Nothing should be able to create something already deleted.
        let _s = Scratch::new("trashcreate");

        assert_eq!(made("trash", "Nope", "").summary.section, "notes");
    }

    #[test]
    fn what_is_written_comes_back() {
        let s = Scratch::new("roundtrip");
        let note = made("notes", "Slow Morning", "Coffee. Empty streets.\n");

        let raw = s.raw(&note.summary.id);

        assert!(raw.starts_with("---\ntitle: Slow Morning\nsection: notes\n---\n\n"));
        assert_eq!(
            read(&note.summary.id).unwrap().body,
            "Coffee. Empty streets.\n"
        );
    }

    #[test]
    fn an_ordinary_notes_front_matter_stays_quiet() {
        // No favourite, no tags, no deletedAt unless they are actually set.
        let s = Scratch::new("quiet");
        let note = made("notes", "Slow Morning", "Coffee.");

        let raw = s.raw(&note.summary.id);

        assert!(!raw.contains("favorite"));
        assert!(!raw.contains("tags"));
        assert!(!raw.contains("deletedAt"));
    }

    #[test]
    fn renaming_follows_the_filename_along() {
        let _s = Scratch::new("rename");
        let note = made("notes", "Slow Morning", "Coffee.");

        let renamed = rename(&note.summary.id, "Quiet Evening").unwrap();

        assert_eq!(renamed.id, "notes/quiet-evening.md");
        assert_eq!(renamed.title, "Quiet Evening");
        assert!(read("notes/slow-morning.md").is_err());
        assert_eq!(read(&renamed.id).unwrap().body, "Coffee.");
    }

    #[test]
    fn a_note_emptied_of_its_title_keeps_the_name_it_had() {
        // Rather than churning to `untitled` halfway through being retyped.
        let _s = Scratch::new("emptied");
        let note = made("notes", "Slow Morning", "Coffee.");

        let written = write(&note.summary.id, "", "Coffee.").unwrap();

        assert_eq!(written.id, "notes/slow-morning.md");
        assert_eq!(written.title, "slow-morning");
    }

    #[test]
    fn a_daily_note_keeps_its_date_for_a_name() {
        // And a post keeps the blog's. Renaming either would break the mapping
        // to the thing it came from.
        let _s = Scratch::new("daily");
        let note = create(CreateNoteInput {
            section: "daily".to_string(),
            filename: Some("2026-09-11.md".to_string()),
            title: Some("Wednesday".to_string()),
            ..Default::default()
        })
        .unwrap();

        let written = write(&note.summary.id, "Something Else", "body").unwrap();

        assert_eq!(written.id, "daily/2026-09-11.md");
    }

    #[test]
    fn a_filename_that_would_climb_out_of_the_vault_is_refused() {
        let _s = Scratch::new("climb");

        for filename in ["../escape.md", "a/b.md", "no-extension", "", "/etc/passwd"] {
            let made = create(CreateNoteInput {
                section: "notes".to_string(),
                filename: Some(filename.to_string()),
                ..Default::default()
            });
            assert!(made.is_err(), "allowed {filename:?}");
        }
    }

    #[test]
    fn the_tags_in_the_prose_are_read_back_out_of_it() {
        let _s = Scratch::new("prosetags");

        let note = made("notes", "Slow Morning", "A #quiet start, and #coffee.");

        assert_eq!(note.summary.tags, ["quiet", "coffee"]);
        // And are not copied into front matter, where they would go stale.
        assert!(note.summary.manual_tags.is_empty());
    }

    #[test]
    fn the_tags_the_row_sets_lead_and_the_prose_follows() {
        let _s = Scratch::new("rowtags");
        let note = made("notes", "Slow Morning", "A #quiet start, and #coffee.");

        let tagged = set_manual_tags(
            &note.summary.id,
            vec!["asked".into(), "#coffee".into(), "not a tag".into()],
        )
        .unwrap();

        assert_eq!(tagged.manual_tags, ["asked", "coffee"]);
        assert_eq!(tagged.tags, ["asked", "coffee", "quiet"]);
    }

    #[test]
    fn a_favourite_says_so_and_can_stop() {
        let _s = Scratch::new("favorite");
        let note = made("notes", "Slow Morning", "Coffee.");

        assert!(set_favorite(&note.summary.id, true).unwrap().favorite);
        assert!(!set_favorite(&note.summary.id, false).unwrap().favorite);
    }

    #[test]
    fn listing_finds_notes_in_folders_and_no_deeper() {
        let s = Scratch::new("list");
        made("notes", "Loose", "");
        std::fs::create_dir_all(s.vault.join("notes/work/deeper")).unwrap();
        std::fs::write(s.vault.join("notes/work/filed.md"), "Filed.").unwrap();
        std::fs::write(s.vault.join("notes/work/deeper/buried.md"), "Buried.").unwrap();

        let ids: Vec<String> = list().into_iter().map(|n| n.id).collect();

        assert!(ids.contains(&"notes/loose.md".to_string()));
        assert!(ids.contains(&"notes/work/filed.md".to_string()));
        // One folder level, and nothing recurses further.
        assert!(!ids.iter().any(|id| id.contains("deeper")));
    }

    #[test]
    fn listing_still_finds_notes_in_a_section_that_is_no_longer_configured() {
        // The vault's own directories rather than the configured list: notes
        // in a removed section should not quietly disappear.
        let s = Scratch::new("stale");
        std::fs::create_dir_all(s.vault.join("archive")).unwrap();
        std::fs::write(s.vault.join("archive/old.md"), "Still here.").unwrap();

        let ids: Vec<String> = list().into_iter().map(|n| n.id).collect();

        assert!(ids.contains(&"archive/old.md".to_string()));
    }

    #[test]
    fn a_file_that_cannot_be_read_does_not_take_the_whole_list_down() {
        let s = Scratch::new("broken");
        made("notes", "Fine", "");
        std::fs::create_dir_all(s.vault.join("notes/not-a-note.md")).unwrap();

        assert!(list().iter().any(|n| n.id == "notes/fine.md"));
    }

    #[test]
    fn writing_keeps_the_version_that_was_there_before() {
        let s = Scratch::new("versions");
        let note = made("notes", "Slow Morning", "First draft.");

        write(&note.summary.id, "Slow Morning", "Second draft.").unwrap();

        let versions = crate::backup::list_versions(&note.summary.id);
        assert_eq!(versions.len(), 1);
        assert!(crate::backup::read_version(&note.summary.id, &versions[0])
            .unwrap()
            .contains("First draft."));
        assert!(s.vault.join(".versions").is_dir());
    }

    #[test]
    fn continuous_typing_does_not_burn_through_the_version_slots() {
        // Throttled to one every five minutes, so a morning's autosaves leave
        // one snapshot rather than ten of the same paragraph.
        let _s = Scratch::new("throttle");
        let note = made("notes", "Slow Morning", "First.");

        for n in 0..5 {
            write(&note.summary.id, "Slow Morning", &format!("Draft {n}.")).unwrap();
        }

        assert_eq!(crate::backup::list_versions(&note.summary.id).len(), 1);
    }

    #[test]
    fn a_note_goes_over_the_wire_in_the_shape_the_renderer_expects() {
        /*
         * The one thing this port may not get wrong. The renderer is unchanged
         * and reads these field names; `Note` is a flattened `NoteSummary`
         * plus a body, and a flatten that went wrong would nest them instead
         * and break every component at once.
         *
         * The names are `NoteSummary` and `Note` in src/shared/types.ts.
         */
        let _s = Scratch::new("wire");
        let note = made("notes", "Slow Morning", "Coffee.");

        let json = serde_json::to_value(&note).unwrap();
        let mut keys: Vec<&str> = json
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();

        assert_eq!(
            keys,
            [
                "body",
                "createdAt",
                "deletedAt",
                "favorite",
                "folder",
                "id",
                "manualTags",
                "section",
                "tags",
                "title",
                "updatedAt"
            ]
        );

        // And a summary is the same thing without the body.
        let summary = serde_json::to_value(to_summary(
            &load(&require_location(&note.summary.id).unwrap()).unwrap(),
        ))
        .unwrap();
        assert_eq!(summary.as_object().unwrap().len(), keys.len() - 1);
        assert!(summary.get("body").is_none());
    }

    #[test]
    fn a_version_name_that_is_not_one_is_refused() {
        let _s = Scratch::new("badversion");

        assert!(crate::backup::read_version("notes/a.md", "../../escape.md").is_err());
        assert!(crate::backup::read_version("notes/a.md", "2026-13-45_99-99-99.md").is_err());
    }
}
