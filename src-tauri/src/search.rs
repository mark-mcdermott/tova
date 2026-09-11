/*!
Matching a note against a query — a port of `src/shared/search.ts`.

Pure, so the rules are testable without a vault: the backend reads the files
and hands the text in, and the renderer never sees a body at all.

Everything here works in UTF-16 code units rather than bytes or characters,
because the TypeScript works in JavaScript string indices and they are the
same thing. It is not cosmetic: `snippetAround` slices the body at an index
`indexOf` produced, and a body with one accent in it before the match would
cut in the wrong place — or, in Rust, panic.
*/

use serde::Serialize;

use crate::js::Utf16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Field {
    Title,
    Tag,
    Body,
}

#[derive(Debug, Clone, Serialize)]
pub struct Match {
    /// Where it matched, so the result can say why it is in the list.
    // `where` is a Rust keyword and a plain field name in the TypeScript, and
    // the renderer reads the TypeScript's name.
    #[serde(rename = "where")]
    pub where_: Field,
    /// A line of context around a body match; null for title and tag hits.
    pub snippet: Option<String>,
    /// Higher is a better answer. Only meaningful against the same query.
    pub score: i64,
}

/// How much of the body to show either side of a match.
const CONTEXT: usize = 40;

/*
 * What each kind of hit is worth. The numbers are arbitrary in the way any
 * ranking is, but the order between them is not: a title you typed exactly
 * beats a title that merely contains the word, which beats a tag, which beats
 * a mention buried in a paragraph.
 *
 * Whole-word hits outrank substrings throughout — "morning" meaning the word
 * morning is nearly always what was meant, not the middle of "morningside".
 */
const TITLE_EXACT: i64 = 100;
const TITLE_STARTS: i64 = 60;
const TITLE_WORD: i64 = 45;
const TITLE_PART: i64 = 30;
const TAG_EXACT: i64 = 25;
const TAG_PART: i64 = 15;
const BODY_WORD: i64 = 10;
const BODY_PART: i64 = 4;
/// Each further mention past the first, so a note about a thing beats one that
/// mentions it.
const BODY_REPEAT: i64 = 2;
/// All the terms together, in order — a phrase is a much stronger signal than
/// its words.
const PHRASE_TITLE: i64 = 40;
const PHRASE_BODY: i64 = 8;

/// Repeats stop counting here: past a handful it says length, not relevance.
const MAX_REPEATS: usize = 5;

pub struct Searchable<'a> {
    pub title: &'a str,
    pub tags: &'a [String],
    pub body: &'a str,
}

/// The words a query is looking for. Splitting on whitespace means "slow
/// morning" finds a note that says "morning, slow" — a single string would not.
pub fn query_terms(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split(crate::js::is_whitespace)
        .map(|term| crate::js::trim(term).to_string())
        .filter(|term| !term.is_empty())
        .collect()
}

/// What one term is worth across a note, summed over the fields it appears in.
fn score_term(term: &Utf16, title: &Utf16, tags: &[Utf16], body: &Utf16) -> i64 {
    let mut score = 0;

    if title.len() == term.len() && title.starts_with(term) {
        score += TITLE_EXACT;
    } else if title.starts_with(term) {
        score += TITLE_STARTS;
    } else if title.has_word(term) {
        score += TITLE_WORD;
    } else if title.contains(term) {
        score += TITLE_PART;
    }

    if tags
        .iter()
        .any(|tag| tag.len() == term.len() && tag.starts_with(term))
    {
        score += TAG_EXACT;
    } else if tags.iter().any(|tag| tag.contains(term)) {
        score += TAG_PART;
    }

    let count = body.occurrences(term);
    if count > 0 {
        score += if body.has_word(term) {
            BODY_WORD
        } else {
            BODY_PART
        };
        score += (count - 1).min(MAX_REPEATS) as i64 * BODY_REPEAT;
    }

    score
}

/// A line of the body around the first match, with the whitespace collapsed so
/// a hit inside a wrapped paragraph still reads as one line. Ellipses only
/// where something was actually cut.
pub fn snippet_around(body: &str, at: usize, length: usize) -> String {
    let body = Utf16::new(body);
    let from = at.saturating_sub(CONTEXT);
    let to = (at + length + CONTEXT).min(body.len());

    let cut = body.slice(from, to);
    let mut text = String::with_capacity(cut.len());
    let mut spaced = false;
    for c in cut.chars() {
        if crate::js::is_whitespace(c) {
            spaced = true;
            continue;
        }
        if spaced && !text.is_empty() {
            text.push(' ');
        }
        spaced = false;
        text.push(c);
    }

    format!(
        "{}{text}{}",
        if from > 0 { "…" } else { "" },
        if to < body.len() { "…" } else { "" }
    )
}

/// Where a note matches, or nothing if it does not. Every term has to appear
/// somewhere, but they need not all appear in the same place: a note titled
/// "Slow Morning" tagged #writing matches "slow writing".
///
/// The reported field is the best one any single term hit, title first — that
/// is what the reader is most likely to have meant.
pub fn match_note(note: &Searchable, query: &str) -> Option<Match> {
    let terms = query_terms(query);
    if terms.is_empty() {
        return None;
    }

    let title = Utf16::new(&note.title.to_lowercase());
    let tags: Vec<Utf16> = note
        .tags
        .iter()
        .map(|tag| Utf16::new(&tag.to_lowercase()))
        .collect();
    let body = Utf16::new(&note.body.to_lowercase());

    let mut best: Option<Field> = None;
    let mut score = 0;
    let mut body_at: Option<usize> = None;
    let mut body_length = 0;

    for term in &terms {
        let term = Utf16::new(term);
        let in_title = title.contains(&term);
        let in_tag = tags.iter().any(|tag| tag.contains(&term));
        let at = body.index_of(&term);

        if !in_title && !in_tag && at.is_none() {
            return None;
        }

        if in_title {
            if best.is_none() || best == Some(Field::Body) {
                best = Some(Field::Title);
            }
        } else if in_tag && best != Some(Field::Title) {
            best = Some(Field::Tag);
        } else if best.is_none() {
            best = Some(Field::Body);
        }

        if let (Some(at), None) = (at, body_at) {
            body_at = Some(at);
            body_length = term.len();
        }

        score += score_term(&term, &title, &tags, &body);
    }

    let best = best?;

    // The terms in order, as one string, is a far stronger signal than the
    // same words scattered through a note.
    if terms.len() > 1 {
        let phrase = Utf16::new(&terms.join(" "));
        if title.contains(&phrase) {
            score += PHRASE_TITLE;
        }
        if body.contains(&phrase) {
            score += PHRASE_BODY;
        }
    }

    Some(Match {
        where_: best,
        score,
        snippet: body_at.map(|at| snippet_around(note.body, at, body_length)),
    })
}

/*
 * The other search.ts — the one in src/main, which reads the files.
 *
 * Bodies live on disk and the renderer never holds them, so searching them
 * happens here.
 */

use crate::notes::NoteSummary;
use crate::vault::{note_path, require_location};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

#[derive(Debug, Clone, Serialize)]
pub struct Hit {
    pub note: NoteSummary,
    #[serde(rename = "match")]
    pub match_: Match,
}

/*
 * Keyed by modification time rather than invalidated by hand: every write path
 * would otherwise have to remember to tell the index, and the one that forgot
 * would return stale results silently. A stat is cheap next to a read, so a
 * keystroke re-reads only what actually changed.
 */
static BODIES: LazyLock<Mutex<HashMap<String, (f64, String)>>> = LazyLock::new(Default::default);

fn cache() -> std::sync::MutexGuard<'static, HashMap<String, (f64, String)>> {
    BODIES.lock().unwrap_or_else(|e| e.into_inner())
}

fn body_of(id: &str) -> Result<String, String> {
    let path = note_path(&require_location(id)?)?;
    let modified = std::fs::metadata(&path)
        .and_then(|stats| stats.modified())
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);

    if let Some((at, body)) = cache().get(id) {
        if *at == modified {
            return Ok(body.clone());
        }
    }

    let raw = crate::vault_file::read_vault_text(&path)?;
    let body = crate::front_matter::parse(&raw).body;
    cache().insert(id.to_string(), (modified, body.clone()));
    Ok(body)
}

/// Notes matching the query, best answer first. Ranking is by score; ties fall
/// back to the recency `notes::list` already ordered by, so a tie is never
/// arbitrary.
pub fn search_notes(query: &str, limit: usize) -> Vec<Hit> {
    if crate::js::trim(query).is_empty() {
        return Vec::new();
    }

    let notes = crate::notes::list();
    let mut hits: Vec<Hit> = Vec::new();

    for note in &notes {
        // Trash is a holding pen, not a place to find things.
        if note.section == "trash" {
            continue;
        }

        let body = body_of(&note.id).unwrap_or_default();
        let found = match_note(
            &Searchable {
                title: &note.title,
                tags: &note.tags,
                body: &body,
            },
            query,
        );
        if let Some(match_) = found {
            hits.push(Hit {
                note: note.clone(),
                match_,
            });
        }
    }

    // A note that no longer exists should not sit in the cache for the session.
    let live: std::collections::HashSet<&str> = notes.iter().map(|n| n.id.as_str()).collect();
    cache().retain(|id, _| live.contains(id.as_str()));

    hits.sort_by(|a, b| {
        b.match_.score.cmp(&a.match_.score).then_with(|| {
            b.note
                .updated_at
                .partial_cmp(&a.note.updated_at)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    hits.truncate(limit);
    hits
}
