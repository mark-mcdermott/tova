/*!
The `@blog post` format — a port of `src/shared/blogPost.ts`.

Tova authors blog posts with `@` decorators rather than YAML, so a note stays
readable prose while it is being written. YAML only exists at the two edges: a
post imported from a repo is converted in, and a post being published is
converted out. The two conversions are inverses.

Offsets here are JavaScript string offsets — UTF-16 code units — because
`publishedFieldEdit` hands one to the editor, which is the renderer's and
counts them that way.
*/

// Called by the sync and the publisher, which are the slices after this one.
#![allow(dead_code)]

use serde::Serialize;

use crate::front_matter::{self, Value};
use crate::js::{self, Utf16};
use crate::note_name::slugify;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PostField {
    pub name: String,
    /// Everything after `@name `, trimmed, with any outer double quotes removed.
    pub value: String,
    /// 0-based line in the document the field was read from.
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlogPost {
    /// The name between `@` and ` post`, e.g. `markmcdermott.io`.
    pub blog: String,
    pub fields: Vec<PostField>,
    pub body: String,
    /// 0-based line of the `@blog post` header.
    pub header_line: usize,
    /// 0-based line after the post's last line, exclusive.
    pub end_line: usize,
}

/// Tova's own bookkeeping. It stays in the note and never reaches the blog.
pub const PUBLISHED_FIELD: &str = "published";

/// `^@(\S+)[ \t]+post[ \t]*$` — the blog name, then the word `post`.
fn parse_header(line: &str) -> Option<&str> {
    let rest = line.strip_prefix('@')?;
    let name_len = rest
        .char_indices()
        .find(|(_, c)| js::is_whitespace(*c))
        .map(|(at, _)| at)?;
    let (name, rest) = rest.split_at(name_len);
    if name.is_empty() {
        return None;
    }

    // Spaces and tabs only, which is narrower than `\s` and deliberate: a
    // header is one line, and a line break inside it is not a header.
    let rest = rest.trim_start_matches([' ', '\t']);
    if rest == rest.trim_start_matches([' ', '\t']) && rest.len() == rest.len() {
        // no-op, kept for clarity below
    }
    let body = rest.strip_prefix("post")?;
    body.chars().all(|c| c == ' ' || c == '\t').then_some(name)
}

/// `^@([A-Za-z][\w-]*)(?:[ \t]+(.*))?$` — a field name, then anything.
fn parse_field(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix('@')?;
    let mut chars = rest.char_indices();
    let (_, first) = chars.next()?;
    if !first.is_ascii_alphabetic() {
        return None;
    }

    // `\w` is ASCII here, as everywhere in a JavaScript regex without `u`.
    let end = rest
        .char_indices()
        .find(|(at, c)| *at > 0 && !(c.is_ascii_alphanumeric() || *c == '_' || *c == '-'))
        .map(|(at, _)| at)
        .unwrap_or(rest.len());
    let (name, after) = rest.split_at(end);

    if after.is_empty() {
        return Some((name, ""));
    }
    // The value group only matches after at least one space or tab; anything
    // else after the name means this is not a field line at all.
    let value = after.trim_start_matches([' ', '\t']);
    (value.len() < after.len()).then_some((name, value))
}

/// `^-{3,}[ \t]*$`
fn is_separator(line: &str) -> bool {
    let dashes = line.chars().take_while(|c| *c == '-').count();
    dashes >= 3 && line[dashes..].chars().all(|c| c == ' ' || c == '\t')
}

fn unquote(value: &str) -> &str {
    let trimmed = js::trim(value);
    let quoted = trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.chars().count() >= 2;
    if quoted {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

/// Reads every `@blog post` block in a document. Prose outside them is ignored.
pub fn parse_posts(doc: &str) -> Vec<BlogPost> {
    let normalized = doc.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut posts = Vec::new();

    let mut index = 0;
    while index < lines.len() {
        let Some(blog) = parse_header(lines[index]) else {
            index += 1;
            continue;
        };

        let mut fields = Vec::new();
        let mut cursor = index + 1;

        while cursor < lines.len() && parse_header(lines[cursor]).is_none() {
            let Some((name, value)) = parse_field(lines[cursor]) else {
                break;
            };
            fields.push(PostField {
                name: name.to_string(),
                value: unquote(value).to_string(),
                line: cursor,
            });
            cursor += 1;
        }

        let body_start = cursor;
        while cursor < lines.len()
            && !is_separator(lines[cursor])
            && parse_header(lines[cursor]).is_none()
        {
            cursor += 1;
        }

        let ended_on_separator = cursor < lines.len() && is_separator(lines[cursor]);
        posts.push(BlogPost {
            blog: blog.to_string(),
            fields,
            body: js::trim(&lines[body_start..cursor].join("\n")).to_string(),
            header_line: index,
            // The `---` belongs to the post as its end marker; a following
            // header does not, so the next pass can pick it up.
            end_line: if ended_on_separator {
                cursor + 1
            } else {
                cursor
            },
        });

        index = cursor.max(index + 1);
    }

    posts
}

pub fn field_value<'a>(post: &'a BlogPost, name: &str) -> Option<&'a str> {
    post.fields
        .iter()
        .find(|field| field.name.to_lowercase() == name.to_lowercase())
        .map(|field| field.value.as_str())
}

/// `YY-MM-DD` is accepted and widened; anything else is left for the caller.
pub fn normalize_date(value: &str) -> Option<String> {
    let value = js::trim(value);
    let parts: Vec<&str> = value.split('-').collect();
    let digits =
        |part: &str, len: usize| part.len() == len && part.chars().all(|c| c.is_ascii_digit());

    match parts.as_slice() {
        [y, m, d] if digits(y, 2) && digits(m, 2) && digits(d, 2) => Some(format!("20{y}-{m}-{d}")),
        [y, m, d] if digits(y, 4) && digits(m, 2) && digits(d, 2) => Some(value.to_string()),
        _ => None,
    }
}

pub fn post_date(post: &BlogPost, today: &chrono::NaiveDate) -> String {
    field_value(post, "date")
        .and_then(normalize_date)
        .unwrap_or_else(|| crate::date::to_daily_note_name(today))
}

pub fn post_tags(post: &BlogPost) -> Vec<String> {
    field_value(post, "tags")
        .map(|raw| {
            raw.split(',')
                .map(|tag| js::trim(tag).to_string())
                .filter(|tag| !tag.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn post_slug(post: &BlogPost) -> String {
    match field_value(post, "slug") {
        Some(declared) if !js::trim(declared).is_empty() => slugify(declared),
        _ => slugify(field_value(post, "title").unwrap_or_default()),
    }
}

/// `YY-MM-DD-slug.md`. Computed from the post's own fields rather than from a
/// stored template — Xin shipped `{slug}.md` as a literal filename by storing
/// the template and interpolating too late.
pub fn post_filename(post: &BlogPost, today: &chrono::NaiveDate) -> String {
    let date = post_date(post, today);
    format!("{}-{}.md", &date[2..], post_slug(post))
}

/* ── YAML conversion ──────────────────────────────────────────────────── */

/// Astro quotes its strings; a value carrying a double quote takes single ones.
fn yaml_string(value: &str) -> String {
    if value.contains('"') {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        format!("\"{value}\"")
    }
}

/// Emitted explicitly by `to_yaml`, so the pass-through loop skips them.
const HANDLED: [&str; 5] = ["title", "subtitle", "date", "tags", "slug"];

/// `@` fields to the Astro front matter a repo expects. Unknown fields pass
/// through as quoted strings rather than being dropped, so a blog with its own
/// schema keeps working without Tova knowing about it.
pub fn to_yaml(post: &BlogPost, today: &chrono::NaiveDate) -> String {
    let mut lines: Vec<String> = Vec::new();

    if let Some(title) = field_value(post, "title") {
        lines.push(format!("title: {}", yaml_string(title)));
    }
    if let Some(subtitle) = field_value(post, "subtitle") {
        lines.push(format!("subtitle: {}", yaml_string(subtitle)));
    }
    lines.push(format!("date: \"{}\"", post_date(post, today)));

    let tags = post_tags(post);
    if !tags.is_empty() {
        let quoted: Vec<String> = tags
            .iter()
            .map(|tag| format!("\"{}\"", tag.to_lowercase()))
            .collect();
        lines.push(format!("tags: [{}]", quoted.join(", ")));
    }
    if let Some(slug) = field_value(post, "slug") {
        lines.push(format!("slug: {slug}"));
    }

    for field in &post.fields {
        let name = field.name.to_lowercase();
        if HANDLED.contains(&name.as_str()) || name == PUBLISHED_FIELD {
            continue;
        }
        lines.push(format!("{}: {}", field.name, yaml_string(&field.value)));
    }

    format!("---\n{}\n---\n\n{}\n", lines.join("\n"), post.body)
}

/// The other direction: a post fetched from a repo becomes the `@` form the
/// editor shows. Field order follows the spec's example rather than the file's,
/// so imported posts read the same as ones written here.
pub fn from_yaml(raw: &str, blog: &str) -> String {
    let parsed = front_matter::parse(raw);
    let mut lines = vec![format!("@{blog} post")];

    let flat = |value: &Value| match value {
        Value::One(one) => one.clone(),
        Value::Many(many) => many.join(", "),
    };

    let ordered = ["title", "subtitle", "date", "tags", "slug"];
    for name in ordered {
        if let Some(value) = parsed.data.get(name) {
            let value = flat(value);
            if !js::trim(&value).is_empty() {
                lines.push(format!("@{name} {value}"));
            }
        }
    }

    for (name, value) in parsed.data.in_order() {
        if ordered.contains(&name.as_str()) {
            continue;
        }
        let value = flat(value);
        if !js::trim(&value).is_empty() {
            lines.push(format!("@{name} {value}"));
        }
    }

    format!("{}\n\n{}\n", lines.join("\n"), js::trim(&parsed.body))
}

/// The filename this post last went out as, if it has been published before.
pub fn published_as(post: &BlogPost) -> Option<String> {
    field_value(post, PUBLISHED_FIELD)
        .map(js::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocumentEdit {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

/// Where to record what a post was published as — replacing the existing line
/// if there is one, otherwise adding it as the last field. Returned as an edit
/// rather than a new document so the editor can apply it to the live one
/// without disturbing the cursor.
///
/// The offsets are UTF-16, because the editor that applies them counts that
/// way. A post with an emoji in its title and a byte offset would land the
/// edit in the wrong place, or split a character.
pub fn published_field_edit(doc: &str, post: &BlogPost, filename: &str) -> DocumentEdit {
    let normalized = doc.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let offset_of = |line: usize| -> usize {
        lines[..line.min(lines.len())]
            .iter()
            .map(|text| Utf16::new(text).len() + 1)
            .sum()
    };

    let existing = post
        .fields
        .iter()
        .find(|field| field.name.to_lowercase() == PUBLISHED_FIELD);

    if let Some(existing) = existing {
        let from = offset_of(existing.line);
        return DocumentEdit {
            from,
            to: from + Utf16::new(lines[existing.line]).len(),
            insert: format!("@{PUBLISHED_FIELD} {filename}"),
        };
    }

    let last_line = post
        .fields
        .last()
        .map(|field| field.line)
        .unwrap_or(post.header_line);
    let at = offset_of(last_line) + Utf16::new(lines[last_line]).len();
    DocumentEdit {
        from: at,
        to: at,
        insert: format!("\n@{PUBLISHED_FIELD} {filename}"),
    }
}

pub fn apply_edit(doc: &str, edit: &DocumentEdit) -> String {
    let units = Utf16::new(doc);
    format!(
        "{}{}{}",
        units.slice(0, edit.from),
        edit.insert,
        units.slice(edit.to, units.len())
    )
}
