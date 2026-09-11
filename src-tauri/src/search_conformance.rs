/*!
Search and daily-note dates, held to what the TypeScript answers.

See `conformance/search.json` for what the cases are for. The short version is
that every index in the fixture is a JavaScript string index — a UTF-16 code
unit — and that JavaScript's `\b` follows an ASCII `\w`.
*/

use serde_json::Value as Json;

use crate::date;
use crate::search::{self, Searchable};

fn fixture() -> Json {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/search.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
}

fn cases(name: &str) -> Vec<Json> {
    let list = fixture()[name].as_array().expect(name).clone();
    assert!(!list.is_empty(), "{name} has no cases");
    list
}

fn text(value: &Json) -> &str {
    value.as_str().unwrap_or_default()
}

#[test]
fn splits_a_query_into_the_same_terms() {
    for case in cases("queryTerms") {
        let query = text(&case["query"]);
        let terms: Vec<Json> = search::query_terms(query)
            .into_iter()
            .map(Json::String)
            .collect();

        assert_eq!(Json::Array(terms), case["terms"], "for {query:?}");
    }
}

#[test]
fn cuts_the_same_snippet_out_of_a_body() {
    for case in cases("snippetAround") {
        let body = text(&case["body"]);
        let at = case["at"].as_u64().expect("at") as usize;
        let length = case["length"].as_u64().expect("length") as usize;

        assert_eq!(
            search::snippet_around(body, at, length),
            text(&case["snippet"]),
            "for {body:?} at {at}"
        );
    }
}

#[test]
fn matches_and_scores_a_note_the_same_way() {
    for case in cases("match") {
        let note = &case["note"];
        let tags: Vec<String> = note["tags"]
            .as_array()
            .expect("tags")
            .iter()
            .map(|t| text(t).to_string())
            .collect();
        let query = text(&case["query"]);
        let what = format!("{:?} against {query:?}", text(&note["title"]));

        let found = search::match_note(
            &Searchable {
                title: text(&note["title"]),
                tags: &tags,
                body: text(&note["body"]),
            },
            query,
        );

        match (&found, &case["result"]) {
            (None, Json::Null) => {}
            (Some(found), Json::Object(want)) => {
                assert_eq!(
                    found.score,
                    want["score"].as_i64().expect("score"),
                    "score of {what}"
                );
                assert_eq!(
                    serde_json::to_value(found.where_).unwrap(),
                    want["where"],
                    "where of {what}"
                );
                assert_eq!(
                    found.snippet.as_deref(),
                    want["snippet"].as_str(),
                    "snippet of {what}"
                );
            }
            _ => panic!("disagreed about whether {what} matches at all"),
        }
    }
}

#[test]
fn reads_a_daily_note_name_the_same_way() {
    for case in cases("dates") {
        let name = text(&case["name"]);
        let parsed = date::parse_daily_note_name(name);

        assert_eq!(
            parsed.as_ref().map(date::to_daily_note_name),
            case["parsed"].as_str().map(str::to_string),
            "for {name:?}"
        );
        assert_eq!(
            parsed.as_ref().map(date::format_daily_title),
            case["title"].as_str().map(str::to_string),
            "title of {name:?}"
        );
    }
}

#[test]
fn judges_an_untouched_daily_note_the_same_way() {
    for case in cases("blankBody") {
        let body = text(&case["body"]);

        assert_eq!(
            date::is_blank_daily_body(body, text(&case["title"])),
            case["blank"] == true,
            "for {body:?}"
        );
    }
}
