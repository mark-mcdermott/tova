/*!
Deleting everything a tag holds.

For when a job ends and the notes from it should stop existing: name the tag,
see exactly what would go, and then it goes. Nothing here is recoverable,
which is why the plan is a separate step from carrying it out and why every
caller is expected to show it first.

Two rules, and the difference between them is the whole design:

- A tag in a note's **tag row** is a claim about the note. The note goes.
- A tag heading a **block** is a claim about the text under it. That text goes
  and the rest of the note stays.

A tag written inside a sentence is neither, and costs nothing. That is what
makes the feature usable on a tag like `#work`, which anybody would also have
written in passing.

Trashed notes are included. A note in the trash is still a file in the vault,
and leaving it would be the one copy the reader thought they had destroyed.
*/

use serde::Serialize;

use crate::tag_blocks::{blocks_for, head_tags, without_blocks};

/// Why a whole note goes, when one does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Because {
    /// The tag is in the note's own tag row, so the note is the job's.
    TagRow,
    /// Every block was the tag's, and removing them leaves nothing.
    Emptied,
}

/// What would happen to one note.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Planned {
    pub id: String,
    pub title: String,
    pub section: String,
    /// Blocks to remove. Zero when the tag is in the tag row and the note goes
    /// without being read for blocks at all.
    pub blocks: usize,
    /// Whether the file is deleted rather than rewritten.
    pub deletes_note: bool,
    pub because: Option<Because>,
    /// Other tags heading the same blocks, which lose their text with this
    /// one. Empty in the ordinary case; the reason the preview exists in the
    /// case where it is not.
    pub shared_with: Vec<String>,
}

/// Everything `tag` would take, in the order the notes are listed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub tag: String,
    pub notes: Vec<Planned>,
}

fn same_tag(a: &str, b: &str) -> bool {
    a.trim_start_matches('#')
        .eq_ignore_ascii_case(b.trim_start_matches('#'))
}

/// What deleting `tag` would do. Reads; changes nothing.
pub fn plan(tag: &str) -> Plan {
    let Some(tag) = crate::tags::normalize_tag(tag) else {
        return Plan {
            tag: String::new(),
            notes: Vec::new(),
        };
    };

    let mut notes = Vec::new();
    for summary in crate::notes::list() {
        // The tag row first: it decides the note without reading its prose.
        if summary.manual_tags.iter().any(|own| same_tag(own, &tag)) {
            notes.push(Planned {
                id: summary.id,
                title: summary.title,
                section: summary.section,
                blocks: 0,
                deletes_note: true,
                because: Some(Because::TagRow),
                shared_with: Vec::new(),
            });
            continue;
        }

        let Ok(note) = crate::notes::read(&summary.id) else {
            continue;
        };
        let blocks = blocks_for(&note.body, &tag);
        if blocks.is_empty() {
            continue;
        }

        let mut shared_with: Vec<String> = Vec::new();
        for block in &blocks {
            for other in head_tags(&note.body, block) {
                if !same_tag(&other, &tag) && !shared_with.iter().any(|seen| same_tag(seen, &other))
                {
                    shared_with.push(other);
                }
            }
        }

        // A note that is nothing but this tag's blocks is this tag's note.
        let left = without_blocks(&note.body, &tag);
        let emptied = crate::js::trim(&left).is_empty();

        notes.push(Planned {
            id: summary.id,
            title: summary.title,
            section: summary.section,
            blocks: blocks.len(),
            deletes_note: emptied,
            because: emptied.then_some(Because::Emptied),
            shared_with,
        });
    }

    Plan { tag, notes }
}

/// What a purge did, for saying so afterwards.
#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Purged {
    pub notes_deleted: usize,
    pub notes_trimmed: usize,
    pub blocks_removed: usize,
    /// Notes that could not be written or removed, by id. Reported rather
    /// than swallowed: a purge that half worked is worth knowing about.
    pub failed: Vec<String>,
}

/// Carries out a plan. Not recoverable.
pub fn apply(plan: &Plan) -> Purged {
    let mut done = Purged::default();

    for note in &plan.notes {
        if note.deletes_note {
            match crate::notes::delete_note_file(&note.id) {
                Ok(()) => {
                    done.notes_deleted += 1;
                    done.blocks_removed += note.blocks;
                }
                Err(_) => done.failed.push(note.id.clone()),
            }
            continue;
        }

        // Re-read rather than trusting the plan's arithmetic: the plan was
        // made from what was on disk then, and this is what is there now.
        let Ok(current) = crate::notes::read(&note.id) else {
            done.failed.push(note.id.clone());
            continue;
        };
        let left = without_blocks(&current.body, &plan.tag);

        match crate::notes::overwrite_body(&note.id, &left) {
            Ok(()) => {
                done.notes_trimmed += 1;
                done.blocks_removed += note.blocks;
            }
            Err(_) => done.failed.push(note.id.clone()),
        }
    }

    done
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{self, CreateNoteInput};
    use crate::vault::{one_at_a_time, set_active_vault};

    /// A vault of its own, under the same lock everything that switches the
    /// vault in use holds.
    struct Scratch {
        vault: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let vault = std::env::temp_dir().join(format!("tova-purge-{name}"));
            let _ = std::fs::remove_dir_all(&vault);
            for section in ["notes", "daily", "trash"] {
                std::fs::create_dir_all(vault.join(section)).unwrap();
            }
            set_active_vault(Some(vault.clone()));
            Self { vault, _held: held }
        }

        fn exists(&self, id: &str) -> bool {
            self.vault.join(id).is_file()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.vault);
        }
    }

    fn made(section: &str, title: &str, body: &str) -> String {
        notes::create(CreateNoteInput {
            section: section.to_string(),
            title: Some(title.to_string()),
            body: Some(body.to_string()),
            ..Default::default()
        })
        .unwrap()
        .summary
        .id
    }

    fn tagged(section: &str, title: &str, tags: &[&str], body: &str) -> String {
        let id = made(section, title, body);
        notes::set_manual_tags(&id, tags.iter().map(|t| (*t).to_string()).collect()).unwrap();
        id
    }

    fn body_of(id: &str) -> String {
        notes::read(id).unwrap().body
    }

    #[test]
    fn a_tag_in_the_tag_row_takes_the_whole_note() {
        let scratch = Scratch::new("row");
        let id = tagged(
            "notes",
            "Standup",
            &["work"],
            "Nothing about the tag here.\n",
        );

        let plan = plan("work");
        assert_eq!(plan.notes.len(), 1);
        assert_eq!(plan.notes[0].because, Some(Because::TagRow));
        assert!(plan.notes[0].deletes_note);

        let done = apply(&plan);
        assert_eq!(done.notes_deleted, 1);
        assert!(done.failed.is_empty());
        assert!(!scratch.exists(&id));
    }

    #[test]
    fn a_block_takes_its_text_and_leaves_the_rest_of_the_note() {
        let scratch = Scratch::new("block");
        let id = made(
            "notes",
            "Mixed",
            "Personal thoughts.\n\n#work\nThe job.\n\n---\n\nMore personal.\n",
        );

        let done = apply(&plan("work"));

        assert_eq!((done.notes_deleted, done.notes_trimmed), (0, 1));
        assert!(scratch.exists(&id));
        assert_eq!(
            body_of(&id),
            "Personal thoughts.\n\n---\n\nMore personal.\n"
        );
    }

    /*
     * The property that makes this usable on a tag anybody would also write in
     * a sentence. Nothing about this note is the job's.
     */
    #[test]
    fn a_tag_mentioned_in_prose_costs_nothing() {
        let scratch = Scratch::new("prose");
        let id = made("notes", "Diary", "I left #work early and felt fine.\n");

        let plan = plan("work");
        assert!(plan.notes.is_empty());

        apply(&plan);
        assert!(scratch.exists(&id));
        assert_eq!(body_of(&id), "I left #work early and felt fine.\n");
    }

    #[test]
    fn a_note_that_is_nothing_but_the_tags_blocks_goes_with_them() {
        let scratch = Scratch::new("emptied");
        let id = made("notes", "All Work", "#work\nEvery word of it.\n");

        let plan = plan("work");
        assert_eq!(plan.notes[0].because, Some(Because::Emptied));
        assert!(plan.notes[0].deletes_note);

        apply(&plan);
        assert!(!scratch.exists(&id));
    }

    /// A note in the trash is still a file in the vault.
    #[test]
    fn a_trashed_note_is_not_a_hiding_place() {
        let scratch = Scratch::new("trash");
        let id = made("notes", "Old Job", "#work\nStill here.\n");
        notes::trash_note(&id).unwrap();

        let trashed = notes::list()
            .into_iter()
            .find(|note| note.section == "trash")
            .expect("the note is in the trash");
        assert!(scratch.exists(&trashed.id));

        apply(&plan("work"));
        assert!(!scratch.exists(&trashed.id));
    }

    /// The case the preview exists for: text under `#work #urgent` goes.
    #[test]
    fn a_block_two_tags_head_is_reported_as_shared() {
        let _s = Scratch::new("shared");
        made("notes", "Both", "Keep.\n\n#work #urgent\nShared.\n");

        let plan = plan("work");
        assert_eq!(plan.notes[0].shared_with, ["urgent"]);

        apply(&plan);
        assert_eq!(body_of(&plan.notes[0].id), "Keep.\n\n");
    }

    /*
     * The sharp edge of the design, pinned so it cannot drift: a blank line
     * does not end a block. Only another tag line, a rule, or the end of the
     * note does. So prose written under a block and separated from it by
     * nothing but a blank line is that block's, and goes with it.
     *
     * Text above the block is untouched — the block starts at its tag line,
     * and the blank line above belongs to the paragraph before.
     */
    #[test]
    fn a_blank_line_does_not_end_a_block() {
        let _s = Scratch::new("blank-line");
        let id = made("notes", "Spacing", "Before.\n\n#work\nThe job.\n\nAfter.\n");

        apply(&plan("work"));

        assert_eq!(body_of(&id), "Before.\n\n");
    }

    /// Which is why a rule is how you get your note back below a block.
    #[test]
    fn a_rule_is_how_prose_under_a_block_stays() {
        let _s = Scratch::new("rule-ends");
        let id = made(
            "notes",
            "Spacing",
            "Before.\n\n#work\nThe job.\n\n---\n\nAfter.\n",
        );

        apply(&plan("work"));

        assert_eq!(body_of(&id), "Before.\n\n---\n\nAfter.\n");
    }

    #[test]
    fn a_tag_nothing_carries_changes_nothing() {
        let scratch = Scratch::new("absent");
        let id = made("notes", "Quiet", "#garden\nTomatoes.\n");

        let plan = plan("work");
        assert!(plan.notes.is_empty());

        apply(&plan);
        assert!(scratch.exists(&id));
        assert_eq!(body_of(&id), "#garden\nTomatoes.\n");
    }

    /*
     * Nonsense in the box must not be read as "everything". An empty plan is
     * the only safe answer to a tag that is not a tag.
     */
    #[test]
    fn something_that_is_not_a_tag_plans_nothing() {
        let _s = Scratch::new("nonsense");
        made("notes", "Anything", "#work\nThe job.\n");

        for input in ["", "   ", "#", "#1", "not a tag", "*"] {
            let plan = plan(input);
            assert!(plan.notes.is_empty(), "for {input:?}");
            assert!(plan.tag.is_empty(), "for {input:?}");
        }
    }

    #[test]
    fn the_hash_and_the_capitals_are_optional() {
        let _s = Scratch::new("spelling");
        made("notes", "Job", "#Work\nThe job.\n");

        for input in ["work", "#work", "WORK", "#Work"] {
            assert_eq!(plan(input).notes.len(), 1, "for {input:?}");
        }
    }

    /// Deleting the text must not leave a copy of it in the note's history.
    #[test]
    fn trimming_a_note_does_not_file_a_version_of_what_it_removed() {
        let _s = Scratch::new("versions");
        let id = made("notes", "Mixed", "Keep.\n\n#work\nThe job.\n");

        apply(&plan("work"));

        let versions = crate::backup::list_versions(&id);
        let kept: Vec<String> = versions
            .iter()
            .filter_map(|name| crate::backup::read_version(&id, name).ok())
            .filter(|text| text.contains("The job."))
            .collect();
        assert!(kept.is_empty(), "found the removed text in {versions:?}");
    }
}
