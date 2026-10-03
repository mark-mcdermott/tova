/*!
GFM tables, read — a port of the parsing half of `src/shared/tables.ts`.

Only the parsing. The TypeScript also lays a table's source out so the pipes
line up, which is how the editor renders one at all; nothing on this side has an
editor, and porting code with no caller is worse than not having it.

What this side needs tables for is the HTML export and the PDF, both of which
printed the pipes until `markdown_html` learned to call this.
*/

#![allow(dead_code)]

use crate::js;

/// Which side a column is read from, or `None` when it does not say.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Alignment {
    Left,
    Center,
    Right,
}

pub struct Table {
    /// Header first, then the body. The delimiter row is not one of these.
    pub rows: Vec<Vec<String>>,
    pub alignments: Vec<Option<Alignment>>,
}

/// A delimiter cell: dashes, with a colon allowed at either end.
fn is_delimiter_cell(cell: &str) -> bool {
    let trimmed = cell.strip_prefix(':').unwrap_or(cell);
    let trimmed = trimmed.strip_suffix(':').unwrap_or(trimmed);
    !trimmed.is_empty() && trimmed.chars().all(|c| c == '-')
}

/// Splits a row into its cells.
///
/// Hand-written rather than a split on every pipe because an escaped pipe is
/// content: a cell reading `one \| two` is one cell, and splitting on every
/// pipe cuts it in half and shifts every column after it along by one.
fn cells(line: &str) -> Vec<String> {
    let chars: Vec<char> = line.chars().collect();
    let mut found: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut at = 0;

    while at < chars.len() {
        if chars[at] == '\\' && chars.get(at + 1) == Some(&'|') {
            cell.push_str("\\|");
            at += 2;
            continue;
        }
        if chars[at] == '|' {
            found.push(std::mem::take(&mut cell));
            at += 1;
            continue;
        }
        cell.push(chars[at]);
        at += 1;
    }
    found.push(cell);

    // The outer pipes are optional, and leave an empty cell at each end when
    // they are there. Dropped either way, so both spellings read the same.
    if found.len() > 1 && js::trim(&found[0]).is_empty() {
        found.remove(0);
    }
    if found.len() > 1 && js::trim(found.last().unwrap()).is_empty() {
        found.pop();
    }

    found
        .iter()
        .map(|text| js::trim(text).to_string())
        .collect()
}

/// Whether a line is a table's delimiter row rather than a row of content.
pub fn is_delimiter_row(line: &str) -> bool {
    let found = cells(line);
    !found.is_empty() && found.iter().all(|cell| is_delimiter_cell(cell))
}

fn alignment_of(cell: &str) -> Option<Alignment> {
    match (cell.starts_with(':'), cell.ends_with(':')) {
        (true, true) => Some(Alignment::Center),
        (true, false) => Some(Alignment::Left),
        (false, true) => Some(Alignment::Right),
        (false, false) => None,
    }
}

/// The table these lines make, or `None` if they do not make one.
///
/// A header, a delimiter agreeing with it about the column count, and any
/// number of rows. GFM pads a short row and truncates a long one rather than
/// refusing it, so the rows that come back are all the same width.
pub fn parse_table(lines: &[&str]) -> Option<Table> {
    if lines.len() < 2 {
        return None;
    }

    let header = cells(lines[0]);
    if !is_delimiter_row(lines[1]) {
        return None;
    }

    let delimiters = cells(lines[1]);
    if delimiters.len() != header.len() {
        return None;
    }

    let width = header.len();
    let mut rows = vec![header];
    for line in &lines[2..] {
        let mut row = cells(line);
        row.truncate(width);
        row.resize(width, String::new());
        rows.push(row);
    }

    Some(Table {
        rows,
        alignments: delimiters.iter().map(|cell| alignment_of(cell)).collect(),
    })
}
