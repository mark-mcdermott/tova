/*!
Today's note — a port of the part of `src/main/daily.ts` that touches files.

`startDailyNoteSchedule` is not here. It is a timer, a wake handler and a focus
handler wound together, and all three are the application's rather than the
vault's: the Electron one exists in the shape it does because Chromium throttles
background timers. Whatever arms this on the Tauri side will call
`ensure_daily_note`, which is the part that knows what a daily note is.
*/

use chrono::NaiveDate;

use crate::date::{
    format_daily_title, is_blank_daily_body, parse_daily_note_name, to_daily_note_name, today,
};
use crate::note_location::{to_note_id, NoteLocation};
use crate::notes::{self, CreateNoteInput, Note};
use crate::vault::resolve_in_vault;

fn daily_id(date: &NaiveDate) -> String {
    to_note_id(&NoteLocation {
        section: "daily".to_string(),
        folder: None,
        filename: format!("{}.md", to_daily_note_name(date)),
    })
}

fn ensure(date: &NaiveDate) -> Result<(Note, bool), String> {
    let id = daily_id(date);
    if let Ok(existing) = notes::read(&id) {
        return Ok((existing, false));
    }

    let note = notes::create(CreateNoteInput {
        section: "daily".to_string(),
        title: Some(format_daily_title(date)),
        filename: Some(format!("{}.md", to_daily_note_name(date))),
        ..Default::default()
    })?;
    Ok((note, true))
}

/// Today's daily note, created with an `M/D/YY` title if it does not exist.
pub fn ensure_daily_note(date: &NaiveDate) -> Result<Note, String> {
    Ok(ensure(date)?.0)
}

/// Removes past daily notes that were never written in. Today's note is never
/// touched, and neither is anything the reader actually typed into.
pub fn cleanup_blank_daily_notes(now: &NaiveDate) -> Result<Vec<String>, String> {
    let directory = resolve_in_vault("daily")?;
    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Ok(Vec::new());
    };

    let today = to_daily_note_name(now);
    let mut removed = Vec::new();

    for filename in entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
    {
        let Some(date) = parse_daily_note_name(&filename) else {
            continue;
        };
        if to_daily_note_name(&date) >= today {
            continue;
        }

        let id = to_note_id(&NoteLocation {
            section: "daily".to_string(),
            folder: None,
            filename,
        });
        let Ok(note) = notes::read(&id) else { continue };
        if !is_blank_daily_body(&note.body, &note.summary.title) {
            continue;
        }

        // Deleted outright rather than trashed: an empty auto-generated note is
        // not something anyone wants to find in Trash. Launch backs up first.
        // Errors propagate — a sweep that quietly fails is worse than a loud one.
        notes::delete_note_file(&id)?;
        removed.push(id);
    }

    Ok(removed)
}

pub fn today_note() -> Result<Note, String> {
    ensure_daily_note(&today())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};

    struct Scratch {
        vault: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let vault = std::env::temp_dir().join(format!("tova-daily-{name}"));
            let _ = std::fs::remove_dir_all(&vault);
            for section in ["notes", "daily", "trash"] {
                std::fs::create_dir_all(vault.join(section)).unwrap();
            }
            set_active_vault(Some(vault.clone()));
            Self { vault, _held: held }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.vault);
        }
    }

    fn on(day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, day).unwrap()
    }

    #[test]
    fn todays_note_is_made_once_and_then_found() {
        let _s = Scratch::new("ensure");

        let first = ensure(&on(3)).unwrap();
        let second = ensure(&on(3)).unwrap();

        assert!(first.1, "the first call should have created it");
        assert!(!second.1, "the second should have found it");
        assert_eq!(first.0.summary.id, "daily/2026-09-03.md");
        assert_eq!(first.0.summary.title, "9/3/26");
    }

    #[test]
    fn a_daily_note_keeps_the_words_that_were_put_in_it() {
        let _s = Scratch::new("keep");
        let note = ensure_daily_note(&on(3)).unwrap();
        notes::write(&note.summary.id, "9/3/26", "Coffee.").unwrap();

        let found = ensure_daily_note(&on(3)).unwrap();

        assert_eq!(found.body, "Coffee.");
        assert_eq!(found.summary.id, "daily/2026-09-03.md");
    }

    #[test]
    fn the_sweep_removes_empty_days_and_leaves_written_ones() {
        let _s = Scratch::new("sweep");
        ensure_daily_note(&on(1)).unwrap();
        let written = ensure_daily_note(&on(2)).unwrap();
        notes::write(&written.summary.id, "9/2/26", "Something happened.").unwrap();

        let removed = cleanup_blank_daily_notes(&on(3)).unwrap();

        assert_eq!(removed, ["daily/2026-09-01.md"]);
        assert!(notes::read("daily/2026-09-02.md").is_ok());
    }

    #[test]
    fn the_sweep_never_touches_today_or_anything_later() {
        // A note for today is the one the reader is about to write in, and a
        // clock that went backwards should not take tomorrow's with it.
        let _s = Scratch::new("sweeptoday");
        ensure_daily_note(&on(3)).unwrap();
        ensure_daily_note(&on(4)).unwrap();

        assert!(cleanup_blank_daily_notes(&on(3)).unwrap().is_empty());
        assert!(notes::read("daily/2026-09-03.md").is_ok());
        assert!(notes::read("daily/2026-09-04.md").is_ok());
    }

    #[test]
    fn the_sweep_ignores_files_that_are_not_daily_notes() {
        let s = Scratch::new("sweepother");
        std::fs::write(s.vault.join("daily/keep-me.md"), "Not a date.").unwrap();
        std::fs::write(s.vault.join("daily/2026-02-31.md"), "Not a date either.").unwrap();

        assert!(cleanup_blank_daily_notes(&on(3)).unwrap().is_empty());
        assert!(s.vault.join("daily/keep-me.md").is_file());
        assert!(s.vault.join("daily/2026-02-31.md").is_file());
    }

    #[test]
    fn an_empty_day_is_deleted_outright_rather_than_trashed() {
        // Nobody wants to find an auto-generated empty note in Trash.
        let _s = Scratch::new("outright");
        ensure_daily_note(&on(1)).unwrap();

        cleanup_blank_daily_notes(&on(3)).unwrap();

        assert!(notes::list().iter().all(|n| n.section != "trash"));
    }
}
