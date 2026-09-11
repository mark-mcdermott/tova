/*!
A place the reader can be — a port of `src/shared/screen.ts`.

Only the normalising half, as with sections: the renderer keeps its own copy for
its own use, and this one exists because main writes a screen to disk between
launches and has to be able to check what it reads back.
*/

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum IndexTarget {
    Section { section: String },
    Folder { folder: String },
    Blog { blog: String },
    Tag { tag: String },
    Tags,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Screen {
    #[serde(rename_all = "camelCase")]
    Note {
        note_id: String,
    },
    Index {
        target: IndexTarget,
    },
}

/// A string with something in it, which is what `text` does in the TypeScript.
/// Untrimmed: what it returns is what was stored, not a tidied version of it.
fn text(raw: &Value, key: &str) -> Option<String> {
    raw.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
}

/// What a stored screen becomes once it has been checked, or None when it is
/// not one. Anything unrecognised falls back to the note Tova would have opened
/// anyway, so a hand-edited or half-written file costs a launch and nothing more.
///
/// A search is deliberately not restorable. Its results were read from the vault
/// as it stood, and reopening the query hours later would show a page that looks
/// remembered and is not.
pub fn normalize_screen(value: Option<&Value>) -> Option<Screen> {
    let raw = value?;
    if !raw.is_object() {
        return None;
    }

    match raw.get("kind").and_then(Value::as_str) {
        Some("note") => {
            let note_id = text(raw, "noteId")?;
            // The vault's own guard rejects a path that climbs; this only has
            // to stop an obvious one reaching it.
            if note_id.contains("..") {
                return None;
            }
            Some(Screen::Note { note_id })
        }
        Some("index") => {
            let target = raw.get("target").filter(|t| t.is_object())?;
            let inner = match target.get("kind").and_then(Value::as_str)? {
                "section" => IndexTarget::Section {
                    section: text(target, "section")?,
                },
                "folder" => IndexTarget::Folder {
                    folder: text(target, "folder")?,
                },
                "blog" => IndexTarget::Blog {
                    blog: text(target, "blog")?,
                },
                "tag" => IndexTarget::Tag {
                    tag: text(target, "tag")?,
                },
                "tags" => IndexTarget::Tags,
                _ => return None,
            };
            Some(Screen::Index { target: inner })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn screen(value: serde_json::Value) -> Option<Screen> {
        normalize_screen(Some(&value))
    }

    #[test]
    fn a_note_is_the_id_it_names() {
        assert_eq!(
            screen(json!({ "kind": "note", "noteId": "notes/slow-morning.md" })),
            Some(Screen::Note {
                note_id: "notes/slow-morning.md".into()
            })
        );
    }

    #[test]
    fn refuses_an_id_that_climbs() {
        // The vault's own guard would refuse it too. This one stops it earlier,
        // and stops a stored session from being a way to ask.
        assert_eq!(
            screen(json!({ "kind": "note", "noteId": "../../etc/passwd" })),
            None
        );
        assert_eq!(
            screen(json!({ "kind": "note", "noteId": "notes/../../escape.md" })),
            None
        );
    }

    #[test]
    fn refuses_two_dots_anywhere_at_all() {
        // Including `a..b.md`, which climbs nowhere and is a legal filename.
        // The guard is deliberately blunter than the thing it guards — the
        // vault's own resolver decides what is really inside it, and this only
        // has to stop the obvious case from reaching it. Kept blunt here
        // because the Electron side is blunt, and a stored session that opened
        // on one backend and not the other would be worse than a name nobody
        // writes.
        assert_eq!(
            screen(json!({ "kind": "note", "noteId": "notes/a..b.md" })),
            None
        );
    }

    #[test]
    fn a_note_with_no_id_is_not_a_screen() {
        assert_eq!(screen(json!({ "kind": "note" })), None);
        assert_eq!(screen(json!({ "kind": "note", "noteId": "" })), None);
        assert_eq!(screen(json!({ "kind": "note", "noteId": "   " })), None);
        assert_eq!(screen(json!({ "kind": "note", "noteId": 7 })), None);
    }

    #[test]
    fn a_search_is_deliberately_not_one() {
        // Its results were read from the vault as it stood; reopening the query
        // hours later would show a page that looks remembered and is not.
        assert_eq!(screen(json!({ "kind": "search", "query": "coffee" })), None);
    }

    #[test]
    fn an_index_needs_a_target_that_is_one() {
        assert_eq!(screen(json!({ "kind": "index" })), None);
        assert_eq!(screen(json!({ "kind": "index", "target": null })), None);
        assert_eq!(screen(json!({ "kind": "index", "target": "notes" })), None);
        assert_eq!(
            screen(json!({ "kind": "index", "target": { "kind": "elsewhere" } })),
            None
        );
    }

    #[test]
    fn every_listing_the_reader_can_be_on() {
        let cases = [
            (
                json!({ "kind": "section", "section": "notes" }),
                IndexTarget::Section {
                    section: "notes".into(),
                },
            ),
            (
                json!({ "kind": "folder", "folder": "post" }),
                IndexTarget::Folder {
                    folder: "post".into(),
                },
            ),
            (
                json!({ "kind": "blog", "blog": "a.io" }),
                IndexTarget::Blog {
                    blog: "a.io".into(),
                },
            ),
            (
                json!({ "kind": "tag", "tag": "coffee" }),
                IndexTarget::Tag {
                    tag: "coffee".into(),
                },
            ),
            (json!({ "kind": "tags" }), IndexTarget::Tags),
        ];

        for (target, want) in cases {
            assert_eq!(
                screen(json!({ "kind": "index", "target": target })),
                Some(Screen::Index { target: want })
            );
        }
    }

    #[test]
    fn keeps_a_name_as_it_was_stored_rather_than_tidying_it() {
        assert_eq!(
            screen(json!({ "kind": "index", "target": { "kind": "tag", "tag": "  spaced  " } })),
            Some(Screen::Index {
                target: IndexTarget::Tag {
                    tag: "  spaced  ".into()
                }
            })
        );
    }

    #[test]
    fn answers_every_case_the_typescript_does() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/screen.json");
        let doc: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json");

        let cases = doc["cases"].as_array().expect("cases");
        let expected = doc["expected"].as_array().expect("expected");
        assert_eq!(
            cases.len(),
            expected.len(),
            "a case with no answer beside it"
        );

        for (case, want) in cases.iter().zip(expected) {
            let got = serde_json::to_value(normalize_screen(Some(case))).expect("serialize");
            assert_eq!(&got, want, "\ncase: {case}");
        }
    }
}
