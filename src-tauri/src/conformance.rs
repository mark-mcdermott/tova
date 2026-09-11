/*!
The text layer, held to what the TypeScript answers.

One module for four ports rather than a block in each, because they are held
to one fixture and read it the same way. `conformance/text.json` says what the
cases are for; the short version is that they are chosen for the places where
a Rust idiom reads as the obvious translation of the JavaScript and answers
differently.
*/

use serde_json::Value as Json;

use crate::front_matter::{self, Data, Value};
use crate::note_location as loc;
use crate::note_name;
use crate::tags;

fn fixture() -> Json {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/text.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
}

fn cases(name: &str) -> Vec<Json> {
    let doc = fixture();
    let list = doc[name].as_array().expect(name).clone();
    assert!(!list.is_empty(), "{name} has no cases");
    list
}

fn text(value: &Json) -> &str {
    value.as_str().unwrap_or_default()
}

/// A `Data` from the JSON object the fixture records.
///
/// `order` is passed separately and is not dressing: front matter is written
/// in insertion order, and JSON object order is not something a cross-language
/// fixture may lean on — serde_json sorts its keys, JavaScript preserves them.
/// So the order is part of the expected answer, and the fixture records it as
/// data rather than as a property of the file format.
fn data_from(json: &Json, order: &[&str]) -> Data {
    let mut data = Data::default();
    let object = json.as_object().expect("object");
    let keys: Vec<&str> = if order.is_empty() {
        object.keys().map(String::as_str).collect()
    } else {
        order.to_vec()
    };

    for key in keys {
        let value = &object[key];
        match value {
            Json::String(s) => data.set(key, s.clone()),
            Json::Array(items) => data.set(
                key,
                items
                    .iter()
                    .map(|i| text(i).to_string())
                    .collect::<Vec<_>>(),
            ),
            // The fixture carries a few values that are not either, to say what
            // happens when front matter holds something unexpected.
            other => data.set(key, other.to_string()),
        }
    }
    data
}

fn data_to_json(data: &Data, keys: &Json) -> Json {
    let mut out = serde_json::Map::new();
    for key in keys.as_object().expect("object").keys() {
        let value = match data.get(key) {
            Some(Value::One(s)) => Json::String(s.clone()),
            Some(Value::Many(items)) => {
                Json::Array(items.iter().map(|i| Json::String(i.clone())).collect())
            }
            None => continue,
        };
        out.insert(key.clone(), value);
    }
    Json::Object(out)
}

#[test]
fn parses_front_matter_the_same_way() {
    for case in cases("parse") {
        let raw = text(&case["raw"]);
        let parsed = front_matter::parse(raw);

        assert_eq!(
            data_to_json(&parsed.data, &case["data"]),
            case["data"],
            "data of {raw:?}"
        );
        // Every key the TypeScript found, and no others.
        assert_eq!(
            data_to_json(&parsed.data, &case["data"])
                .as_object()
                .unwrap()
                .len(),
            case["data"].as_object().unwrap().len(),
            "keys of {raw:?}"
        );
        assert_eq!(parsed.body, text(&case["body"]), "body of {raw:?}");
    }
}

#[test]
fn writes_front_matter_the_same_way() {
    for case in cases("serialize") {
        let order: Vec<&str> = case["order"]
            .as_array()
            .expect("order")
            .iter()
            .map(text)
            .collect();
        let data = data_from(&case["data"], &order);

        assert_eq!(
            front_matter::serialize(&data, text(&case["body"])),
            text(&case["text"]),
            "for {:?}",
            case["data"]
        );
    }
}

#[test]
fn slugs_a_title_the_same_way() {
    for case in cases("slugify") {
        let title = text(&case["title"]);

        assert_eq!(
            note_name::slugify(title),
            text(&case["slug"]),
            "for {title:?}"
        );
    }
}

#[test]
fn picks_the_same_free_name() {
    for case in cases("uniqueSlug") {
        let taken: Vec<&str> = case["taken"]
            .as_array()
            .expect("taken")
            .iter()
            .map(text)
            .collect();

        assert_eq!(
            note_name::unique_slug(text(&case["candidate"]), taken),
            text(&case["unique"]),
            "for {:?}",
            case["candidate"]
        );
    }
}

#[test]
fn finds_the_same_tags() {
    for case in cases("allTags") {
        let manual: Vec<String> = case["manual"]
            .as_array()
            .expect("manual")
            .iter()
            .map(|v| text(v).to_string())
            .collect();
        let body = text(&case["body"]);

        let found: Vec<Json> = tags::all_tags(&manual, body)
            .into_iter()
            .map(Json::String)
            .collect();
        assert_eq!(Json::Array(found), case["tags"], "for {body:?}");
    }
}

#[test]
fn reads_a_written_tag_the_same_way() {
    for case in cases("normalizeTag") {
        let input = text(&case["input"]);
        let expected = case["tag"].as_str().map(str::to_string);

        assert_eq!(tags::normalize_tag(input), expected, "for {input:?}");
    }
}

#[test]
fn reads_front_matter_tags_the_same_way() {
    for case in cases("normalizeManualTags") {
        // Whatever the front matter held: a list, one string, or neither.
        let value = match &case["value"] {
            Json::Array(items) => Some(Value::Many(
                items
                    .iter()
                    // A non-string in the list is dropped by the TypeScript
                    // before it reaches the tag rules, and `Value` cannot hold
                    // one — so dropping it here is the same thing.
                    .filter(|i| i.is_string())
                    .map(|i| text(i).to_string())
                    .collect(),
            )),
            Json::String(s) => Some(Value::One(s.clone())),
            _ => None,
        };

        let found: Vec<Json> = tags::normalize_manual_tags(value.as_ref())
            .into_iter()
            .map(Json::String)
            .collect();
        assert_eq!(Json::Array(found), case["tags"], "for {:?}", case["value"]);
    }
}

#[test]
fn parses_a_note_id_the_same_way() {
    for case in cases("parseNoteId") {
        let id = text(&case["id"]);
        let parsed = loc::parse_note_id(id);

        match (&parsed, &case["location"]) {
            (None, Json::Null) => {}
            (Some(location), Json::Object(want)) => {
                assert_eq!(
                    location.section,
                    text(&want["section"]),
                    "section of {id:?}"
                );
                assert_eq!(
                    location.folder.as_deref(),
                    want["folder"].as_str(),
                    "folder of {id:?}"
                );
                assert_eq!(
                    location.filename,
                    text(&want["filename"]),
                    "filename of {id:?}"
                );
                assert_eq!(
                    loc::to_note_id(location),
                    text(&case["roundTrip"]),
                    "round trip of {id:?}"
                );
            }
            _ => panic!("disagreed about whether {id:?} is a note id"),
        }
    }
}

#[test]
fn judges_a_folder_name_the_same_way() {
    for case in cases("isValidFolderName") {
        let name = text(&case["name"]);

        assert_eq!(
            loc::is_valid_folder_name(name),
            case["valid"] == true,
            "for {name:?}"
        );
    }
}

#[test]
fn restores_a_trashed_note_to_the_same_place() {
    for case in cases("restoreLocation") {
        let data = data_from(&case["data"], &[]);
        let want = &case["location"];

        let location = loc::restore_location(&data, text(&case["filename"]));

        assert_eq!(
            location.section,
            text(&want["section"]),
            "for {:?}",
            case["data"]
        );
        assert_eq!(
            location.folder.as_deref(),
            want["folder"].as_str(),
            "for {:?}",
            case["data"]
        );
    }
}

#[test]
fn puts_a_deleted_note_in_the_same_place() {
    for case in cases("trashLocation") {
        let want = &case["location"];

        let location = loc::trash_location(text(&case["filename"]));

        assert_eq!(location.section, text(&want["section"]));
        assert_eq!(location.folder, None);
        assert_eq!(location.filename, text(&want["filename"]));
    }
}

#[test]
fn folds_a_title_to_the_same_sort_key() {
    for case in cases("sortKey") {
        let title = text(&case["title"]);

        assert_eq!(
            note_name::sort_key(title),
            text(&case["key"]),
            "for {title:?}"
        );
    }
}

#[test]
fn orders_titles_the_same_way() {
    let doc = fixture();
    let mut titles: Vec<String> = doc["compareTitles"]["titles"]
        .as_array()
        .expect("titles")
        .iter()
        .map(|t| text(t).to_string())
        .collect();

    titles.sort_by(|a, b| note_name::compare_titles(a, b));

    let want: Vec<String> = doc["compareTitles"]["sorted"]
        .as_array()
        .expect("sorted")
        .iter()
        .map(|t| text(t).to_string())
        .collect();
    assert_eq!(titles, want);
}

#[test]
fn orders_a_list_of_notes_the_same_way() {
    /*
     * The three that matter are at the end: an emoji, an astral character and
     * U+FFFD. JavaScript orders them by UTF-16 code unit, which puts the
     * emoji first; Rust's own `<` orders by code point, which does not. The
     * fixture records JavaScript's answer, so a `js::compare` that forgot the
     * surrogates fails here.
     */
    let doc = fixture();
    let mut notes: Vec<crate::notes::NoteSummary> = doc["sortNotes"]["notes"]
        .as_array()
        .expect("notes")
        .iter()
        .map(|n| crate::notes::NoteSummary {
            id: text(&n["id"]).to_string(),
            title: text(&n["title"]).to_string(),
            section: text(&n["section"]).to_string(),
            folder: None,
            tags: Vec::new(),
            manual_tags: Vec::new(),
            favorite: n["favorite"] == true,
            updated_at: n["updatedAt"].as_f64().expect("updatedAt"),
            created_at: 0.0,
            deleted_at: None,
        })
        .collect();

    crate::notes::sort_notes(&mut notes);

    let order: Vec<&str> = notes.iter().map(|n| n.id.as_str()).collect();
    let want: Vec<&str> = doc["sortNotes"]["order"]
        .as_array()
        .expect("order")
        .iter()
        .map(text)
        .collect();
    assert_eq!(order, want);
}
