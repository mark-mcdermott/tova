/*!
Turning a title into a filename — a port of `src/shared/noteName.ts`.

`displayName` is not here. It is how the sidebar draws a title, and the sidebar
is still the TypeScript's: this port replaces the main process, not the
renderer, so the renderer's half of `src/shared` stays where it is.
*/

// Ported ahead of its caller, the way `vault.rs` was: this is the layer a
// note is read and written through, and it is worth having under a
// conformance fixture before the code that leans on it exists rather than
// after. Read by `notes.rs`, which is the slice after this one.
#![allow(dead_code)]

use std::collections::HashSet;

use unicode_normalization::UnicodeNormalization;

const MAX_SLUG_LENGTH: usize = 80;

/// Filename-safe form of a note title. Never empty — falls back to `untitled`.
///
/// The compatibility decomposition is the step that cannot be skipped: it is
/// what turns `café` into `cafe` rather than `caf-`, and `ﬁreside` into
/// `fireside`. Without it every accented title would slug differently here
/// than in Electron, and a note would be written under a name the other
/// backend would not have chosen.
pub fn slugify(title: &str) -> String {
    let folded: String = title
        .nfkd()
        // The combining marks the decomposition just separated out.
        .filter(|c| !matches!(c, '\u{300}'..='\u{36f}'))
        .flat_map(char::to_lowercase)
        // Dropped rather than replaced, so `don't` slugs as `dont`.
        .filter(|c| !matches!(c, '\'' | '\u{2019}' | '`'))
        .collect();

    let mut slug = String::with_capacity(folded.len());
    for c in folded.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            slug.push(c);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }

    // Trimmed, then cut to length, then trimmed again — the cut can land in
    // the middle of a run and leave a trailing dash that was not there before.
    let slug = slug.trim_matches('-');
    let slug: String = slug.chars().take(MAX_SLUG_LENGTH).collect();
    let slug = slug.trim_end_matches('-');

    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug.to_string()
    }
}

/// Picks the first free name in `candidate`, `candidate-2`, `candidate-3`… so
/// a second note titled the same never clobbers the first.
pub fn unique_slug<'a>(candidate: &str, taken: impl IntoIterator<Item = &'a str>) -> String {
    let used: HashSet<&str> = taken.into_iter().collect();
    if !used.contains(candidate) {
        return candidate.to_string();
    }

    (2..)
        .map(|suffix| format!("{candidate}-{suffix}"))
        .find(|next| !used.contains(next.as_str()))
        .expect("the integers do not run out")
}

/// The key two titles are ordered by: accents folded onto their base letters,
/// case ignored. The same fold `slugify` does, and for the same reason —
/// `Émile` belongs beside `Emile` rather than after `Zebra`.
pub fn sort_key(value: &str) -> String {
    value
        .nfkd()
        .filter(|c| !matches!(c, '\u{300}'..='\u{36f}'))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Orders two titles, deterministically.
///
/// This replaces `localeCompare`, on both sides. See the note on the
/// TypeScript's `compareTitles` for why it is gone: called with no locale, as
/// it was, it asks the operating system, so two readers already saw their
/// folders in different orders. Matching that collation here would mean
/// carrying ICU's tables, which is a large thing to carry for a tie-break.
pub fn compare_titles(a: &str, b: &str) -> std::cmp::Ordering {
    match crate::js::compare(&sort_key(a), &sort_key(b)) {
        std::cmp::Ordering::Equal => crate::js::compare(a, b),
        other => other,
    }
}
