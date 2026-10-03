/*!
Markdown to HTML for export, and the printable page a note becomes — a port of
`src/shared/markdownToHtml.ts` and `src/shared/notePdfPage.ts`.

Deliberately small and its own thing rather than a general converter: Tova only
needs what its editor already writes, and a full one would be a large library
for a single button.

Everything is escaped before any markup is added, so a note containing HTML
exports as the text it is rather than as markup — a note is prose, not a
document someone else authored.

The inline rules are six regex replacements on the TypeScript side, run one
after another over the whole string. They are hand-written here for the reason
every other pattern in this port is: one of them contains `\S`, and a Rust
regex would read that as Unicode where JavaScript reads it as ASCII.
*/

// Read by the PDF export, which is the slice after this one. Split off because
// the printing is the platform's problem and the page is ours: this half can be
// held to the TypeScript exactly, and that half cannot be tested without a
// window on screen.
#![allow(dead_code)]

use crate::js;
use crate::tables::{parse_table, Alignment, Table};

pub fn escape_html(text: &str) -> String {
    // Ampersand first, or the entities the others introduce get escaped again.
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            c => out.push(c),
        }
    }
    out
}

// `fence` then `inner` then `fence`, where `inner` may not contain `forbidden`
// and may not be empty — which is what the code, strong and strikethrough
// patterns all say. Leftmost first, non-overlapping, scanning on from the end
// of each match, the way a global replace does.
fn wrapped(text: &str, fence: &str, forbidden: char, open: &str, close: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let fence_len = fence.chars().count();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;

    while at < chars.len() {
        let here: String = chars[at..(at + fence_len).min(chars.len())]
            .iter()
            .collect();
        if here != fence {
            out.push(chars[at]);
            at += 1;
            continue;
        }

        // The inner run: everything up to the next forbidden character.
        let start = at + fence_len;
        let mut end = start;
        while end < chars.len() && chars[end] != forbidden {
            end += 1;
        }

        let closing: String = chars[end..(end + fence_len).min(chars.len())]
            .iter()
            .collect();
        if end == start || closing != fence {
            out.push(chars[at]);
            at += 1;
            continue;
        }

        out.push_str(open);
        out.extend(&chars[start..end]);
        out.push_str(close);
        at = end + fence_len;
    }

    out
}

// `*one star*`. The TypeScript's pattern puts the character before the opening
// star inside the match and the replacement puts it back, which in practice
// means a star preceded by a star opens nothing — and that is how `**bold**`
// survives this rule intact, having already become a tag.
//
// Written as a line comment rather than a block one: the pattern it describes
// ends in `*` followed by a slash, which closes a block comment early. That
// cost a compile the first time.
fn emphasis(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;

    while at < chars.len() {
        let opens = chars[at] == '*' && (at == 0 || chars[at - 1] != '*');
        if !opens {
            out.push(chars[at]);
            at += 1;
            continue;
        }

        let start = at + 1;
        let mut end = start;
        while end < chars.len() && chars[end] != '*' {
            end += 1;
        }

        if end == start || end >= chars.len() {
            out.push(chars[at]);
            at += 1;
            continue;
        }

        out.push_str("<em>");
        out.extend(&chars[start..end]);
        out.push_str("</em>");
        at = end + 1;
    }

    out
}

/*
 * `![alt](src)` and `[text](url)`. The link target may not hold a closing
 * bracket or whitespace — and that whitespace is JavaScript's, which is why
 * this is not a regex.
 */
fn linked(text: &str, image: bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut at = 0;

    let read = |from: usize, close: char, empty_ok: bool, no_space: bool| -> Option<usize> {
        let mut end = from;
        while end < chars.len() && chars[end] != close {
            if no_space && js::is_whitespace(chars[end]) {
                return None;
            }
            end += 1;
        }
        (end < chars.len() && (empty_ok || end > from)).then_some(end)
    };

    while at < chars.len() {
        let marked = if image {
            chars[at] == '!' && chars.get(at + 1) == Some(&'[')
        } else {
            chars[at] == '['
        };
        if !marked {
            out.push(chars[at]);
            at += 1;
            continue;
        }

        let label_from = at + usize::from(image) + 1;
        let found = read(label_from, ']', image, false)
            .filter(|label_to| chars.get(label_to + 1) == Some(&'('))
            .and_then(|label_to| {
                read(label_to + 2, ')', false, true).map(|target_to| (label_to, target_to))
            });

        let Some((label_to, target_to)) = found else {
            out.push(chars[at]);
            at += 1;
            continue;
        };

        let label: String = chars[label_from..label_to].iter().collect();
        let target: String = chars[label_to + 2..target_to].iter().collect();
        if image {
            out.push_str(&format!("<img alt=\"{label}\" src=\"{target}\">"));
        } else {
            out.push_str(&format!("<a href=\"{target}\">{label}</a>"));
        }
        at = target_to + 1;
    }

    out
}

/// Inline constructs, applied to already-escaped text, in the order the
/// TypeScript applies them — which is why `**bold**` never reaches the
/// single-star rule.
fn inline(text: &str) -> String {
    let text = wrapped(text, "`", '`', "<code>", "</code>");
    let text = linked(&text, true);
    let text = linked(&text, false);
    let text = wrapped(&text, "**", '*', "<strong>", "</strong>");
    let text = emphasis(&text);
    wrapped(&text, "~~", '~', "<del>", "</del>")
}

fn is_fence(line: &str) -> bool {
    let rest = js::trim_start(line);
    rest.starts_with("```") || rest.starts_with("~~~")
}

/// `^(#{1,6})\s+(.*)$`
fn heading(line: &str) -> Option<(usize, &str)> {
    let level = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let rest = &line[level..];
    let text = js::trim_start(rest);
    (text.len() < rest.len()).then_some((level, text))
}

/// `^\s*[-*+]\s+(.*)$`
fn list_item(line: &str) -> Option<&str> {
    let rest = js::trim_start(line);
    let mut chars = rest.char_indices();
    let (_, bullet) = chars.next()?;
    if !matches!(bullet, '-' | '*' | '+') {
        return None;
    }
    let after = &rest[bullet.len_utf8()..];
    let text = js::trim_start(after);
    (text.len() < after.len()).then_some(text)
}

/// `^\s*(---|\*\*\*|___)\s*$`
fn is_rule(line: &str) -> bool {
    let trimmed = js::trim(line);
    matches!(trimmed, "---" | "***" | "___")
}

/// A cell, aligned if its column said to be.
///
/// `style` rather than the `align` attribute, which HTML dropped. Inline
/// because exported HTML has no stylesheet of Tova's to reach for — it is
/// pasted into somebody else's blog, and an alignment that only works with a
/// class is an alignment that does not work.
///
/// `\|` becomes `|`. The parser keeps the escape because it exists to re-emit
/// markdown; here the markdown is being left behind, and a cell written
/// `one \| two` means `one | two`.
fn cell(tag: &str, text: &str, alignment: Option<Alignment>) -> String {
    let style = match alignment {
        Some(Alignment::Left) => " style=\"text-align:left\"",
        Some(Alignment::Center) => " style=\"text-align:center\"",
        Some(Alignment::Right) => " style=\"text-align:right\"",
        None => "",
    };
    format!(
        "<{tag}{style}>{}</{tag}>",
        inline(&text.replace("\\|", "|"))
    )
}

fn table_to_html(table: &Table) -> String {
    let row = |tag: &str, cells: &[String]| -> String {
        let inner: String = cells
            .iter()
            .enumerate()
            .map(|(column, text)| cell(tag, text, table.alignments[column]))
            .collect();
        format!("<tr>{inner}</tr>")
    };

    let head = row("th", &table.rows[0]);
    // No `<tbody>` at all when there are no rows, rather than an empty one.
    let body = if table.rows.len() == 1 {
        String::new()
    } else {
        let rows: String = table.rows[1..]
            .iter()
            .map(|cells| row("td", cells))
            .collect();
        format!("<tbody>{rows}</tbody>")
    };

    format!("<table><thead>{head}</thead>{body}</table>")
}

pub fn markdown_to_html(markdown: &str) -> String {
    let escaped = escape_html(markdown);
    let lines: Vec<&str> = escaped.split('\n').collect();

    let mut out: Vec<String> = Vec::new();
    let mut paragraph: Vec<&str> = Vec::new();
    let mut list: Vec<&str> = Vec::new();
    let mut fence: Option<Vec<&str>> = None;

    macro_rules! flush_paragraph {
        () => {
            if !paragraph.is_empty() {
                out.push(format!("<p>{}</p>", inline(&paragraph.join(" "))));
                paragraph.clear();
            }
        };
    }
    macro_rules! flush_list {
        () => {
            if !list.is_empty() {
                let items: String = list
                    .iter()
                    .map(|item| format!("<li>{}</li>", inline(item)))
                    .collect();
                out.push(format!("<ul>{items}</ul>"));
                list.clear();
            }
        };
    }

    let mut at = 0;
    while at < lines.len() {
        let line = &lines[at];
        at += 1;

        if is_fence(line) {
            match fence.take() {
                None => {
                    flush_paragraph!();
                    flush_list!();
                    fence = Some(Vec::new());
                }
                Some(held) => out.push(format!("<pre><code>{}</code></pre>", held.join("\n"))),
            }
            continue;
        }

        if let Some(held) = fence.as_mut() {
            held.push(line);
            continue;
        }

        if let Some((level, text)) = heading(line) {
            flush_paragraph!();
            flush_list!();
            out.push(format!("<h{level}>{}</h{level}>", inline(text)));
            continue;
        }

        if let Some(item) = list_item(line) {
            flush_paragraph!();
            list.push(item);
            continue;
        }

        if is_rule(line) {
            flush_paragraph!();
            flush_list!();
            out.push("<hr>".to_string());
            continue;
        }

        /*
         * Last of the block constructs, so a heading, a list item or a rule
         * that happens to contain a pipe stays what it is.
         *
         * The run of lines from here that all contain a pipe, and `parse_table`
         * decides. One condition does three jobs, which is why there are no
         * others: a line with no pipe makes a run of nothing, so `a` over `---`
         * stays a paragraph and a rule rather than becoming a one-column table;
         * a blank line has no pipe either, so it ends a run without being
         * checked for; and a run `parse_table` refuses falls through to the
         * paragraph below, which is what makes a sentence containing a pipe
         * harmless.
         */
        let from = at - 1;
        let mut end = from;
        while end < lines.len() && lines[end].contains('|') {
            end += 1;
        }

        if let Some(table) = parse_table(&lines[from..end]) {
            flush_paragraph!();
            flush_list!();
            out.push(table_to_html(&table));
            at = end;
            continue;
        }

        if js::trim(line).is_empty() {
            flush_paragraph!();
            flush_list!();
            continue;
        }

        flush_list!();
        paragraph.push(js::trim(line));
    }

    // An unclosed fence still exports: the writing matters more than the syntax.
    if let Some(held) = fence {
        out.push(format!("<pre><code>{}</code></pre>", held.join("\n")));
    }
    flush_paragraph!();
    flush_list!();

    out.join("\n")
}

/// The printable page for a note. Its own function so it can be read and tested
/// without a window: the printing is the platform's problem, but what goes on
/// the page is ours.
///
/// Print styles rather than screen ones — the app's glass and photograph mean
/// nothing on paper, and the point of a PDF is that it reads like a document.
pub fn note_pdf_page(title: &str, body: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>{title_text}</title>
<style>
  body {{ font: 11pt/1.7 -apple-system, system-ui, sans-serif; margin: 0; color: #17141f }}
  h1 {{ font-size: 22pt; margin: 0 0 1.5rem }}
  h2 {{ font-size: 16pt; margin: 2rem 0 0.75rem }}
  h3, h4, h5, h6 {{ font-size: 12pt; margin: 1.5rem 0 0.5rem }}
  /* A line stranded alone at a page break reads as a mistake. */
  p, li {{ orphans: 2; widows: 2 }}
  pre {{ background: #f4f3f7; padding: 0.75rem 1rem; border-radius: 6px;
        white-space: pre-wrap; overflow-wrap: anywhere;
        font: 9.5pt/1.5 ui-monospace, Menlo, monospace }}
  code {{ font: 0.92em ui-monospace, Menlo, monospace }}
  img {{ max-width: 100% }}
  hr {{ border: none; border-top: 1px solid #d8d5e0; margin: 2rem 0 }}
  table {{ border-collapse: collapse; margin: 1.25rem 0; font-size: 10pt }}
  /* A table split across a page is readable; a row split in half is not. */
  tr {{ page-break-inside: avoid }}
  th, td {{ border: 1px solid #d8d5e0; padding: 0.35rem 0.6rem;
           text-align: left; vertical-align: top }}
  th {{ background: #f4f3f7; font-weight: 600 }}
</style></head><body>
<h1>{title_text}</h1>
{body_html}
</body></html>"#,
        title_text = escape_html(title),
        body_html = markdown_to_html(body)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;

    fn fixture() -> Json {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/markdown.json");
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

    #[test]
    fn escapes_the_same_characters() {
        for case in cases("escapeHtml") {
            let raw = text(&case["text"]);

            assert_eq!(escape_html(raw), text(&case["escaped"]), "for {raw:?}");
        }
    }

    #[test]
    fn turns_the_same_markdown_into_the_same_html() {
        for case in cases("markdownToHtml") {
            let body = text(&case["body"]);

            assert_eq!(markdown_to_html(body), text(&case["html"]), "for {body:?}");
        }
    }

    #[test]
    fn builds_the_same_printable_page() {
        for case in cases("notePdfPage") {
            let title = text(&case["title"]);

            assert_eq!(
                note_pdf_page(title, text(&case["body"])),
                text(&case["page"]),
                "for {title:?}"
            );
        }
    }

    #[test]
    fn a_note_full_of_html_exports_as_the_text_it_is() {
        // Not as markup. A note is prose, not a document someone else
        // authored, and this is the assertion that says so out loud.
        let html = markdown_to_html("<script>alert(1)</script>\n");

        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
    }
}
