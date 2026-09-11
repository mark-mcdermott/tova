/*!
The handful of places where JavaScript means something Rust does not.

Every module here is a port of one that runs in Node, and most of the
translation is mechanical. These are the parts that are not: a Rust idiom that
reads as the obvious equivalent, and quietly answers differently. They are
gathered in one file because each is small, easy to get wrong, and wrong in a
way no test of the port against itself would show.
*/

// Ported ahead of its caller, the way `vault.rs` was: this is the layer a
// note is read and written through, and it is worth having under a
// conformance fixture before the code that leans on it exists rather than
// after. `is_whitespace` has a caller in `crypto.rs`; the rest are read by
// `front_matter.rs`, which is itself waiting on `notes.rs`.
#![allow(dead_code)]

/*
 * What a JavaScript `\s` matches, which is not what `char::is_whitespace`
 * matches: `\s` includes the byte-order mark and excludes U+0085, and Rust
 * does the opposite.
 */
pub fn is_whitespace(c: char) -> bool {
    c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
}

pub fn trim(value: &str) -> &str {
    value.trim_matches(is_whitespace)
}

pub fn trim_start(value: &str) -> &str {
    value.trim_start_matches(is_whitespace)
}

/*
 * `JSON.stringify` of a string, which is how the front matter quotes a value
 * it cannot write bare. Shorter than the general escape a JSON library would
 * apply: quote, backslash, the five named control characters, and `\u00XX` for
 * the rest below a space. Nothing above it is touched — not the line and
 * paragraph separators, which are legal in a JSON string and which a stricter
 * escaper would helpfully mangle.
 */
pub fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');

    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }

    out.push('"');
    out
}

/*
 * How JavaScript orders two strings with `<`, which is by UTF-16 code unit and
 * not by code point. The two agree for everything in the basic plane and part
 * company above it: JavaScript says "\u{FFFD}" < "\u{10000}" is false, because
 * the second starts with a surrogate at 0xD800, and Rust's own `<` says true.
 *
 * Measured rather than assumed, and the test below is the measurement. It only
 * shows up in a title with an emoji in it — which is not a rare title.
 */
pub fn compare(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/*
 * A string as JavaScript sees it: a sequence of UTF-16 code units.
 *
 * `indexOf`, `slice` and `length` in JavaScript all count those, and a Rust
 * port that counts bytes or characters instead does not merely order things
 * differently — it cuts a snippet in the wrong place, and `&s[a..b]` on a
 * boundary that is not a character boundary panics. Any body with an accent or
 * an emoji before the match is enough.
 */
pub struct Utf16(Vec<u16>);

impl Utf16 {
    pub fn new(value: &str) -> Self {
        Utf16(value.encode_utf16().collect())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn index_of(&self, needle: &Utf16) -> Option<usize> {
        if needle.0.is_empty() {
            return Some(0);
        }
        self.0.windows(needle.0.len()).position(|w| w == needle.0)
    }

    pub fn contains(&self, needle: &Utf16) -> bool {
        self.index_of(needle).is_some()
    }

    pub fn starts_with(&self, needle: &Utf16) -> bool {
        self.0.starts_with(&needle.0)
    }

    /// How many times `needle` occurs, counted the way `split(term).length - 1`
    /// counts: without overlaps, left to right.
    pub fn occurrences(&self, needle: &Utf16) -> usize {
        if needle.0.is_empty() {
            return 0;
        }
        let mut at = 0;
        let mut found = 0;
        while at + needle.0.len() <= self.0.len() {
            if &self.0[at..at + needle.0.len()] == needle.0.as_slice() {
                found += 1;
                at += needle.0.len();
            } else {
                at += 1;
            }
        }
        found
    }

    /// `slice(from, to)`, clamped the way JavaScript clamps it.
    ///
    /// A cut through a surrogate pair leaves JavaScript holding half of one.
    /// Rust has no such string, so the half becomes U+FFFD — which is what a
    /// reader would see either way, in a snippet that was cut mid-emoji.
    pub fn slice(&self, from: usize, to: usize) -> String {
        let from = from.min(self.0.len());
        let to = to.clamp(from, self.0.len());
        String::from_utf16_lossy(&self.0[from..to])
    }
}

/*
 * `\w` in a JavaScript regex without the `u` flag, and so `\b` too: ASCII
 * letters, digits and underscore, and nothing else. A word boundary sits
 * wherever one side is a word character and the other is not.
 */
fn is_word(unit: Option<&u16>) -> bool {
    let Some(&c) = unit else { return false };
    let c = c as u32;
    (0x30..=0x39).contains(&c)
        || (0x41..=0x5a).contains(&c)
        || (0x61..=0x7a).contains(&c)
        || c == 0x5f
}

impl Utf16 {
    fn boundary_at(&self, at: usize) -> bool {
        is_word(at.checked_sub(1).and_then(|i| self.0.get(i))) != is_word(self.0.get(at))
    }

    /// `new RegExp("\\b" + term + "\\b").test(self)` — whether the term
    /// occurs as a whole word.
    pub fn has_word(&self, needle: &Utf16) -> bool {
        if needle.0.is_empty() {
            return false;
        }
        (0..=self.0.len().saturating_sub(needle.0.len())).any(|at| {
            self.0[at..].starts_with(&needle.0)
                && self.boundary_at(at)
                && self.boundary_at(at + needle.0.len())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitespace_is_the_set_javascript_means() {
        // The two the obvious implementation gets wrong, in both directions.
        assert!(is_whitespace('\u{feff}'));
        assert!(!is_whitespace('\u{85}'));

        for c in [
            ' ', '\t', '\n', '\r', '\u{b}', '\u{c}', '\u{a0}', '\u{2028}', '\u{3000}',
        ] {
            assert!(is_whitespace(c), "{c:?}");
        }
        for c in ['a', '-', '\u{200b}'] {
            assert!(!is_whitespace(c), "{c:?}");
        }
    }

    #[test]
    fn utf16_indices_are_the_ones_javascript_would_give() {
        // "héllo 😀 world": the emoji is one character and two code units, and
        // JavaScript's indexOf counts the second one.
        let body = Utf16::new("héllo 😀 world");

        assert_eq!(body.len(), 14);
        assert_eq!(body.index_of(&Utf16::new("world")), Some(9));
        assert_eq!(body.slice(9, 14), "world");
        // A cut through the pair: half a character, which Rust cannot hold.
        assert_eq!(body.slice(6, 7), "\u{fffd}");
    }

    #[test]
    fn occurrences_are_counted_the_way_split_counts_them() {
        assert_eq!(Utf16::new("aaa").occurrences(&Utf16::new("aa")), 1);
        assert_eq!(Utf16::new("abab").occurrences(&Utf16::new("ab")), 2);
        assert_eq!(Utf16::new("abc").occurrences(&Utf16::new("z")), 0);
    }

    #[test]
    fn a_word_boundary_is_the_ascii_one() {
        let body = Utf16::new("morning, morningside and café");

        assert!(body.has_word(&Utf16::new("morning")));
        assert!(!body.has_word(&Utf16::new("morningsid")));
        // `é` is not a word character to JavaScript, so `caf` is a whole word
        // here — surprising, and what the other backend does.
        assert!(body.has_word(&Utf16::new("caf")));
    }

    #[test]
    fn a_string_is_quoted_the_way_json_stringify_quotes_one() {
        assert_eq!(json_string("plain"), "\"plain\"");
        assert_eq!(json_string("has \"quotes\""), "\"has \\\"quotes\\\"\"");
        assert_eq!(json_string("back\\slash"), "\"back\\\\slash\"");
        assert_eq!(json_string("tab\there"), "\"tab\\there\"");
        assert_eq!(json_string("bell\u{7}"), "\"bell\\u0007\"");
        // Above a space and legal in JSON, so left alone.
        assert_eq!(json_string("line\u{2028}sep"), "\"line\u{2028}sep\"");
    }
}
