/*!
The tags a note carries — a port of the part of `src/shared/tags.ts` the main
process uses.

The rest of that file is editing: where a tag sits in a document, what to
remove to take one out, how a toggle rewrites a line. All of it belongs to the
editor, which is the renderer's, and the renderer keeps the TypeScript. Only
what reads a note's tags is here.
*/

// Ported ahead of its caller, the way `vault.rs` was: this is the layer a
// note is read and written through, and it is worth having under a
// conformance fixture before the code that leans on it exists rather than
// after. Read by `notes.rs`, which is the slice after this one.
#![allow(dead_code)]

use crate::front_matter::Value;

/*
 * A tag is `#` followed by a letter, then word characters or hyphens.
 * Requiring a leading letter keeps `# Heading` (hash + space) and `#1` from
 * being mistaken for tags.
 *
 * Hand-written rather than a regex, and ASCII on purpose: JavaScript's `\w` is
 * `[A-Za-z0-9_]` unless the pattern is given the `u` flag, and this one is
 * not. A Rust regex would read `\w` as Unicode and quietly accept `#café`.
 */
fn is_tag_body(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

fn find_tags(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut at = 0;

    while at < chars.len() {
        if chars[at] != '#' || !chars.get(at + 1).is_some_and(char::is_ascii_alphabetic) {
            at += 1;
            continue;
        }

        let start = at + 1;
        let mut end = start;
        while end < chars.len() && is_tag_body(chars[end]) {
            end += 1;
        }
        found.push(chars[start..end].iter().collect::<String>());
        at = end;
    }

    found
}

/// Unique tag names in first-seen order, deduped case-insensitively.
fn unique(tags: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    tags.into_iter()
        .filter(|tag| seen.insert(tag.to_lowercase()))
        .collect()
}

/// Every tag a note carries: the ones written into its front matter by the tag
/// row, then the ones written into its prose. Front matter leads, because those
/// were asked for rather than picked up, and a tag in both is the one that was
/// asked for.
pub fn all_tags(manual: &[String], body: &str) -> Vec<String> {
    unique(manual.iter().cloned().chain(find_tags(body)))
}

/// A tag as it would be written: no hash, no spaces, and a letter to start.
pub fn normalize_tag(input: &str) -> Option<String> {
    let tag = crate::js::trim(input).trim_start_matches('#');

    let mut chars = tag.chars();
    let starts = chars.next().is_some_and(|c| c.is_ascii_alphabetic());
    (starts && chars.all(is_tag_body)).then(|| tag.to_string())
}

/// The tags front matter holds, from whatever it actually holds — which may be
/// one string, a list, or nothing that makes sense.
pub fn normalize_manual_tags(value: Option<&Value>) -> Vec<String> {
    let list: Vec<&str> = match value {
        Some(Value::Many(items)) => items.iter().map(String::as_str).collect(),
        Some(Value::One(item)) => vec![item.as_str()],
        None => Vec::new(),
    };

    unique(list.into_iter().filter_map(normalize_tag))
}
