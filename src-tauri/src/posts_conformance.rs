/*!
The `@blog post` format and the sync plan, held to what the TypeScript answers.

See `conformance/posts.json`. The two things worth knowing before reading a
failure here: the offsets in an edit are UTF-16 code units, because the editor
that applies them counts that way, and the header and field patterns use `\S`
and `\w`, which without the `u` flag are ASCII.
*/

use serde_json::Value as Json;
use std::collections::BTreeMap;

use crate::blog_post as post;
use crate::publish_state::PostState;
use crate::sync_plan::{plan_sync, LocalPost, RemotePost};

fn fixture() -> Json {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/posts.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
}

fn cases(name: &str) -> Vec<Json> {
    let list = fixture()[name].as_array().expect(name).clone();
    assert!(!list.is_empty());
    list
}

fn text(value: &Json) -> &str {
    value.as_str().unwrap_or_default()
}

fn today() -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(2026, 9, 11).expect("a date")
}

#[test]
fn reads_the_same_posts_out_of_a_document() {
    for case in cases("posts") {
        let doc = text(&case["doc"]);
        let found = post::parse_posts(doc);
        let want = case["posts"].as_array().expect("posts");

        assert_eq!(found.len(), want.len(), "how many posts are in {doc:?}");

        for (post, want) in found.iter().zip(want) {
            let what = format!("{doc:?} post at line {}", post.header_line);
            assert_eq!(post.blog, text(&want["blog"]), "blog of {what}");
            assert_eq!(post.body, text(&want["body"]), "body of {what}");
            assert_eq!(
                post.header_line as u64,
                want["headerLine"].as_u64().expect("headerLine"),
                "headerLine of {what}"
            );
            assert_eq!(
                post.end_line as u64,
                want["endLine"].as_u64().expect("endLine"),
                "endLine of {what}"
            );

            let fields = want["fields"].as_array().expect("fields");
            assert_eq!(post.fields.len(), fields.len(), "fields of {what}");
            for (field, want) in post.fields.iter().zip(fields) {
                assert_eq!(field.name, text(&want["name"]), "field name in {what}");
                assert_eq!(field.value, text(&want["value"]), "field value in {what}");
                assert_eq!(
                    field.line as u64,
                    want["line"].as_u64().expect("line"),
                    "field line in {what}"
                );
            }
        }
    }
}

#[test]
fn derives_the_same_things_from_a_post() {
    for case in cases("posts") {
        let doc = text(&case["doc"]);
        let found = post::parse_posts(doc);

        for (one, want) in found
            .iter()
            .zip(case["derived"].as_array().expect("derived"))
        {
            let what = format!("{doc:?}");

            assert_eq!(
                post::field_value(one, "title"),
                want["title"].as_str(),
                "title of {what}"
            );
            // Field lookup is case-insensitive, which is easy to lose.
            assert_eq!(
                post::field_value(one, "TITLE"),
                want["TITLE"].as_str(),
                "TITLE of {what}"
            );
            assert_eq!(
                post::post_date(one, &today()),
                text(&want["date"]),
                "date of {what}"
            );
            assert_eq!(
                serde_json::to_value(post::post_tags(one)).unwrap(),
                want["tags"],
                "tags of {what}"
            );
            assert_eq!(post::post_slug(one), text(&want["slug"]), "slug of {what}");
            assert_eq!(
                post::post_filename(one, &today()),
                text(&want["filename"]),
                "filename of {what}"
            );
            assert_eq!(
                post::published_as(one),
                want["publishedAs"].as_str().map(str::to_string),
                "publishedAs of {what}"
            );
            assert_eq!(
                post::to_yaml(one, &today()),
                text(&want["yaml"]),
                "yaml of {what}"
            );
        }
    }
}

#[test]
fn records_what_a_post_went_out_as_in_the_same_place() {
    /*
     * The offsets are the point. One of these documents has an emoji in its
     * title, so a port counting bytes lands the edit somewhere else — and
     * `apply_edit` would then either split a character or move the line.
     */
    for case in cases("posts") {
        let doc = text(&case["doc"]);
        let found = post::parse_posts(doc);

        for (one, want) in found.iter().zip(case["edits"].as_array().expect("edits")) {
            let edit = post::published_field_edit(doc, one, "26-09-11-new.md");
            let what = format!("{doc:?}");

            assert_eq!(
                edit.from as u64,
                want["edit"]["from"].as_u64().expect("from"),
                "from of {what}"
            );
            assert_eq!(
                edit.to as u64,
                want["edit"]["to"].as_u64().expect("to"),
                "to of {what}"
            );
            assert_eq!(
                edit.insert,
                text(&want["edit"]["insert"]),
                "insert of {what}"
            );
            assert_eq!(
                post::apply_edit(doc, &edit),
                text(&want["applied"]),
                "applied to {what}"
            );
        }
    }
}

#[test]
fn converts_a_fetched_post_the_same_way() {
    for case in cases("yaml") {
        let raw = text(&case["raw"]);

        assert_eq!(
            post::from_yaml(raw, text(&case["blog"])),
            text(&case["at"]),
            "for {raw:?}"
        );
    }
}

#[test]
fn reads_a_declared_date_the_same_way() {
    for case in cases("dates") {
        let value = text(&case["value"]);

        assert_eq!(
            post::normalize_date(value),
            case["normalized"].as_str().map(str::to_string),
            "for {value:?}"
        );
    }
}

#[test]
fn plans_the_same_sync() {
    for case in cases("plans") {
        let remote: Vec<RemotePost> = case["remote"]
            .as_array()
            .expect("remote")
            .iter()
            .map(|post| RemotePost {
                filename: text(&post["filename"]).to_string(),
                sha: text(&post["sha"]).to_string(),
            })
            .collect();
        let local: Vec<LocalPost> = case["local"]
            .as_array()
            .expect("local")
            .iter()
            .map(|post| LocalPost {
                filename: text(&post["filename"]).to_string(),
                hash: text(&post["hash"]).to_string(),
            })
            .collect();
        let known: BTreeMap<String, PostState> = case["known"]
            .as_object()
            .expect("known")
            .iter()
            .map(|(name, state)| {
                (
                    name.clone(),
                    PostState {
                        remote_sha: text(&state["remoteSha"]).to_string(),
                        local_hash: text(&state["localHash"]).to_string(),
                    },
                )
            })
            .collect();

        let planned: Vec<Json> = plan_sync(&remote, &local, &known)
            .into_iter()
            .map(|step| {
                serde_json::json!({
                    "filename": step.filename,
                    "action": serde_json::to_value(step.action).unwrap(),
                })
            })
            .collect();

        assert_eq!(Json::Array(planned), case["plan"], "for {case}");
    }
}
