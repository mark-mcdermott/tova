/*!
Where the reader was when the app last had their attention — a port of
`src/main/session.ts`.

Written on every move rather than on quit, which the window's own state does. A
frame only matters as it was left, so losing it to a crash costs nothing; losing
your place does, and a crash is exactly when you have not had the chance to
leave tidily.

It is not a preference. Preferences are chosen and this is only observed, so it
lives in its own file and clearing it changes nothing the reader asked for.
*/

use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::screen::{normalize_screen, Screen};

fn path_to_session(data_dir: &Path) -> PathBuf {
    data_dir.join("session.json")
}

pub fn read(data_dir: &Path) -> Option<Screen> {
    // No file yet, or one that cannot be read. Either way there is nowhere to
    // return to, which is the same answer as a first launch.
    let text = std::fs::read_to_string(path_to_session(data_dir)).ok()?;
    let parsed: Value = serde_json::from_str(&text).ok()?;
    if !parsed.is_object() {
        return None;
    }
    normalize_screen(parsed.get("screen"))
}

pub fn write(data_dir: &Path, value: &Value) {
    let Some(screen) = normalize_screen(Some(value)) else {
        return;
    };

    let path = path_to_session(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(&serde_json::json!({ "screen": screen })) {
        let _ = std::fs::write(&path, text + "\n");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tova-session-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn nowhere_to_return_to_before_anything_is_written() {
        assert_eq!(read(&scratch("empty")), None);
    }

    #[test]
    fn remembers_the_note_the_reader_was_on() {
        let dir = scratch("note");
        write(
            &dir,
            &json!({ "kind": "note", "noteId": "notes/slow-morning.md" }),
        );

        assert_eq!(
            read(&dir),
            Some(Screen::Note {
                note_id: "notes/slow-morning.md".into()
            })
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_nothing_at_all_for_a_screen_that_is_not_one() {
        // Rather than writing a file that the next launch has to reject.
        let dir = scratch("refused");
        write(&dir, &json!({ "kind": "search", "query": "coffee" }));

        assert!(!dir.join("session.json").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_a_place_already_stored_when_a_bad_one_arrives() {
        let dir = scratch("kept");
        write(&dir, &json!({ "kind": "note", "noteId": "notes/kept.md" }));
        write(&dir, &json!({ "kind": "note", "noteId": "../escape.md" }));

        assert_eq!(
            read(&dir),
            Some(Screen::Note {
                note_id: "notes/kept.md".into()
            })
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_that_cannot_be_read_is_a_first_launch() {
        let dir = scratch("broken");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("session.json"), "{ not json").unwrap();

        assert_eq!(read(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_the_shape_the_electron_side_reads() {
        // { "screen": … }, not the screen bare — the two backends share the file.
        let dir = scratch("shape");
        write(
            &dir,
            &json!({ "kind": "index", "target": { "kind": "tags" } }),
        );

        let text = std::fs::read_to_string(dir.join("session.json")).unwrap();
        let stored: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(stored["screen"]["kind"], "index");
        assert_eq!(stored["screen"]["target"]["kind"], "tags");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
