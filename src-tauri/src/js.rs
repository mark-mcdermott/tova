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
