/*!
Which parts of a note are code.

Tags inside code are not tags. The editor has always known this — it asks its
syntax tree and draws no pill inside a fence — but nothing on this side did, so
a `#deprecated` comment alone on a line in a pasted shell script was read as a
tag heading a block, and deleting that tag took the prose underneath it. The
reader had no warning, because the editor had drawn no tag there at all.

There is no markdown parser here, so the rule is written out by hand and held
to the editor's answer by `conformance/tags.json`, which is generated from the
very parser the editor uses.

What it knows: fenced code, indented code, and code spans. What it does not:
a code span that runs across a line break, which cannot be written by accident
and cannot head a block either way.
*/

use std::ops::Range;

use crate::js::is_whitespace;

/// A fence that is currently open.
struct Fence {
    mark: char,
    len: usize,
    indent: usize,
}

/// How far a line is indented, counting a tab as four columns.
fn indent_of(line: &str) -> (usize, usize) {
    let mut columns = 0;
    for (at, c) in line.char_indices() {
        match c {
            ' ' => columns += 1,
            '\t' => columns += 4,
            _ => return (columns, at),
        }
    }
    (columns, line.len())
}

/// `` ``` `` or `~~~`: three or more of one mark. Returns the mark and its run.
fn fence_at(content: &str) -> Option<(char, usize)> {
    let mark = content.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let len = content.chars().take_while(|c| *c == mark).count();
    (len >= 3).then_some((mark, len))
}

/// Whether this line closes `open`: the same mark, at least as long, nothing after.
fn closes(open: &Fence, indent: usize, content: &str) -> bool {
    if indent > open.indent + 3 {
        return false;
    }
    let Some((mark, len)) = fence_at(content) else {
        return false;
    };
    mark == open.mark
        && len >= open.len
        && content[len..].chars().all(is_whitespace)
        // A closing fence carries no info string, and a tilde fence's would be
        // the only one allowed to contain a backtick anyway.
        && !content[len..].chars().any(|c| !is_whitespace(c))
}

/// The content indent of a list item opened by this line, if it opens one.
fn list_marker(content: &str, indent: usize) -> Option<usize> {
    let mut chars = content.char_indices();
    let (_, first) = chars.next()?;

    let after = if first == '-' || first == '*' || first == '+' {
        1
    } else if first.is_ascii_digit() {
        let digits = content.chars().take_while(char::is_ascii_digit).count();
        // CommonMark allows nine digits, then `.` or `)`.
        if digits > 9 {
            return None;
        }
        match content[digits..].chars().next() {
            Some('.') | Some(')') => digits + 1,
            _ => return None,
        }
    } else {
        return None;
    };

    // At least one space after the marker, and the item's content begins there.
    let spaces = content[after..].chars().take_while(|c| *c == ' ').count();
    if spaces == 0 {
        // `-` on its own opens an item whose content is empty.
        return content[after..].is_empty().then_some(indent + after + 1);
    }
    // More than four spaces is an indented code block inside the item, which
    // still starts the item's content one space past the marker.
    Some(indent + after + if spaces > 4 { 1 } else { spaces })
}

/// Strips any `>` quote markers, returning what is left and its column.
fn unquote(line: &str) -> (usize, &str) {
    let mut rest = line;
    let mut columns = 0;

    loop {
        let (indent, at) = indent_of(rest);
        if indent > columns + 3 || !rest[at..].starts_with('>') {
            return (columns, rest);
        }
        columns = indent + 1;
        rest = &rest[at + 1..];
        if rest.starts_with(' ') {
            rest = &rest[1..];
            columns += 1;
        }
    }
}

/// Code spans on one line: a run of backticks closed by a run of the same length.
fn spans_in(line: &str, offset: usize, found: &mut Vec<Range<usize>>) {
    let bytes = line.as_bytes();
    let mut at = 0;

    while at < bytes.len() {
        if bytes[at] != b'`' {
            at += 1;
            continue;
        }

        let open = bytes[at..].iter().take_while(|b| **b == b'`').count();
        let mut scan = at + open;

        while scan < bytes.len() {
            if bytes[scan] != b'`' {
                scan += 1;
                continue;
            }
            let close = bytes[scan..].iter().take_while(|b| **b == b'`').count();
            if close == open {
                found.push(offset + at..offset + scan + close);
                break;
            }
            scan += close;
        }

        at = if scan < bytes.len() {
            scan + open
        } else {
            bytes.len()
        };
    }
}

/// Every byte range of `text` that is code.
pub fn code_ranges(text: &str) -> Vec<Range<usize>> {
    let mut found: Vec<Range<usize>> = Vec::new();
    let mut containers: Vec<usize> = Vec::new();
    let mut fence: Option<Fence> = None;
    let mut paragraph = false;

    let mut at = 0usize;
    for line in text.split('\n') {
        let start = at;
        at += line.len() + 1;

        let (quoted, rest) = unquote(line);
        let (indent, content_at) = indent_of(rest);
        let indent = indent + quoted;
        let content = &rest[content_at..];
        let content_start = start + (line.len() - rest.len()) + content_at;

        if let Some(open) = &fence {
            found.push(start..start + line.len());
            if closes(open, indent, content) {
                fence = None;
            }
            continue;
        }

        if content.chars().all(is_whitespace) {
            paragraph = false;
            continue;
        }

        while containers.last().is_some_and(|top| indent < *top) {
            containers.pop();
        }
        let base = containers.last().copied().unwrap_or(0);

        if indent < base + 4 {
            if let Some((mark, len)) = fence_at(content) {
                fence = Some(Fence { mark, len, indent });
                found.push(start..start + line.len());
                paragraph = false;
                continue;
            }

            if let Some(inner) = list_marker(content, indent) {
                containers.push(inner);
                paragraph = true;
                // The item's own first line may still hold a code span.
                spans_in(content, content_start, &mut found);
                continue;
            }
        }

        // Indented code cannot interrupt a paragraph, which is what stops the
        // second line of a wrapped sentence from becoming a code block.
        if indent >= base + 4 && !paragraph {
            found.push(start..start + line.len());
            continue;
        }

        paragraph = true;
        spans_in(content, content_start, &mut found);
    }

    found
}

/// Whether the byte at `offset` is inside code.
pub fn in_code(ranges: &[Range<usize>], offset: usize) -> bool {
    ranges.iter().any(|range| range.contains(&offset))
}

#[cfg(test)]
mod tests {
    use serde_json::Value as Json;

    fn cases() -> Vec<Json> {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/tags.json");
        let doc: Json =
            serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json");
        let list = doc["occurrences"].as_array().expect("occurrences").clone();
        assert!(!list.is_empty(), "no cases");
        list
    }

    /*
     * The whole point of the module, held to the parser the editor uses.
     *
     * A failure here is not a style disagreement: it means the editor and the
     * thing that deletes by tag would once again disagree about what a tag is.
     */
    #[test]
    fn agrees_with_the_editors_parser_about_what_is_code() {
        let mut checked = 0;

        for case in cases() {
            let name = case["name"].as_str().expect("name");
            let text = case["text"].as_str().expect("text");
            let ranges = super::code_ranges(text);

            for tag in case["tags"].as_array().expect("tags") {
                let at = tag["at"].as_u64().expect("at") as usize;
                let wanted = tag["code"].as_bool().expect("code");
                let got = super::in_code(&ranges, at);
                assert_eq!(
                    got,
                    wanted,
                    "{name}: {} at {at} — parser says code={wanted}, we say {got}\n{text:?}",
                    tag["tag"].as_str().unwrap_or_default()
                );
                checked += 1;
            }
        }

        assert!(checked >= 25, "only {checked} tag occurrences checked");
    }
}
