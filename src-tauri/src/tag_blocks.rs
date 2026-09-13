/*!
How far a tag's block reaches.

A tag on a line of its own — `isTagOnlyLine` in the editor, `is_tag_only_line`
here — is the head of a block: everything written under it belongs to that
tag. The block ends at whichever comes first of the next such line, a `---`
rule, or the end of the note.

A tag *inside* a line of prose is not a block head and claims nothing. That
distinction is the whole safety property of deleting by tag: mentioning a
former employer in a sentence cannot cost you the paragraph around it.

The editor already draws these two differently — `.cm-tag-top` against
`.cm-tag-body` — so a reader can see which of their tags own text before
anything is deleted on the strength of it.
*/

use crate::tags::is_tag_only_line;

/// A block's reach, as byte offsets into the text it was found in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Block {
    /// The start of the tag line itself, which is part of the block.
    pub from: usize,
    /// Just past the block's last byte — the start of whatever ended it, or
    /// the end of the text.
    pub to: usize,
}

/*
 * A horizontal rule, which ends a block.
 *
 * Three or more of the same mark — `-`, `*` or `_` — with spaces allowed
 * between them. This knew only dashes at first, which made the editor and the
 * deletion disagree: `***` was drawn as a divider and was not treated as one,
 * so text a reader had deliberately separated off would have gone with the
 * block above it. Matched against the parser the editor uses rather than
 * written from memory of the spec.
 *
 * Markdown also reads `---` under a line of text as a setext heading
 * underline rather than a rule. That is not distinguished here, and
 * deliberately: treating it as a terminator ends the block sooner, and for
 * something that deletes what it finds, sooner is the side to err on.
 */
fn is_rule(line: &str) -> bool {
    // Four columns of indent is a code block rather than a rule, and a tab is
    // four. Three is still a rule, which is why this counts rather than trims.
    let marks_at = line
        .find(|c: char| c != ' ' && c != '\t')
        .unwrap_or(line.len());
    let indent: usize = line[..marks_at]
        .chars()
        .map(|c| if c == '\t' { 4 } else { 1 })
        .sum();
    if indent >= 4 {
        return false;
    }

    let mut marks = line[marks_at..]
        .chars()
        .filter(|c| !crate::js::is_whitespace(*c));

    let Some(first) = marks.next() else {
        return false;
    };
    if !matches!(first, '-' | '*' | '_') {
        return false;
    }

    let mut seen = 1;
    for mark in marks {
        if mark != first {
            return false;
        }
        seen += 1;
    }
    seen >= 3
}

/// Whether a tag-only line names this tag. Case-insensitive, because the
/// sidebar and the tag row both treat `#Work` and `#work` as one tag.
fn line_names(line: &str, tag: &str) -> bool {
    let wanted = tag.trim_start_matches('#').to_ascii_lowercase();

    crate::js::trim(line)
        .split(|c: char| crate::js::is_whitespace(c))
        .filter(|word| !word.is_empty())
        .any(|word| word.trim_start_matches('#').to_ascii_lowercase() == wanted)
}

/// Every block `tag` heads, in the order they appear.
pub fn blocks_for(text: &str, tag: &str) -> Vec<Block> {
    let mut found = Vec::new();

    // Offsets alongside the lines, so a block can be cut out of the original
    // text rather than rebuilt from pieces.
    let mut starts = Vec::new();
    let mut at = 0usize;
    let lines: Vec<&str> = text.split('\n').collect();
    for line in &lines {
        starts.push(at);
        at += line.len() + 1;
    }

    for (index, line) in lines.iter().enumerate() {
        if !is_tag_only_line(line) || !line_names(line, tag) {
            continue;
        }

        // Past the head, to whatever ends it.
        let end = lines
            .iter()
            .enumerate()
            .skip(index + 1)
            .find(|(_, later)| is_tag_only_line(later) || is_rule(later))
            .map_or(text.len(), |(at, _)| starts[at]);

        found.push(Block {
            from: starts[index],
            to: end,
        });
    }

    found
}

/// The tags on a block's head line, in the order they were written.
///
/// A head line can name more than one tag, and then the text under it belongs
/// to all of them — so deleting one takes text the others were heading. The
/// preview needs to be able to say so.
pub fn head_tags(text: &str, block: &Block) -> Vec<String> {
    text[block.from..block.to]
        .split('\n')
        .next()
        .map(|line| {
            crate::js::trim(line)
                .split(|c: char| crate::js::is_whitespace(c))
                .filter(|word| !word.is_empty())
                .map(|word| word.trim_start_matches('#').to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// The text with every block `tag` heads taken out of it.
pub fn without_blocks(text: &str, tag: &str) -> String {
    let blocks = blocks_for(text, tag);
    if blocks.is_empty() {
        return text.to_string();
    }

    let mut kept = String::with_capacity(text.len());
    let mut at = 0usize;
    for block in &blocks {
        // Blocks are found in order and cannot overlap, but a later one
        // starting inside an earlier one would silently reverse this slice.
        if block.from >= at {
            kept.push_str(&text[at..block.from]);
            at = block.to;
        }
    }
    kept.push_str(&text[at..]);
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The text a block covers, which is what a reader would lose.
    fn covered<'a>(text: &'a str, tag: &str) -> Vec<&'a str> {
        blocks_for(text, tag)
            .iter()
            .map(|block| &text[block.from..block.to])
            .collect()
    }

    #[test]
    fn a_tag_on_its_own_line_owns_what_follows() {
        let note = "#work\nThe standup notes.\nAnd more.\n";

        assert_eq!(
            covered(note, "work"),
            ["#work\nThe standup notes.\nAnd more.\n"]
        );
    }

    /*
     * The safety property the whole feature rests on. A tag inside a sentence
     * is a mention, not a claim on the paragraph around it.
     */
    #[test]
    fn a_tag_inside_a_sentence_owns_nothing() {
        let note = "I left #work early and wrote this.\nA second line.\n";

        assert!(blocks_for(note, "work").is_empty());
        assert_eq!(without_blocks(note, "work"), note);
    }

    #[test]
    fn a_block_ends_where_the_next_one_starts() {
        let note = "#work\nJob notes.\n\n#garden\nTomatoes.\n";

        assert_eq!(covered(note, "work"), ["#work\nJob notes.\n\n"]);
        assert_eq!(without_blocks(note, "work"), "#garden\nTomatoes.\n");
    }

    #[test]
    fn a_rule_ends_a_block_and_is_left_where_it_is() {
        let note = "#work\nJob notes.\n\n---\n\nSomething else.\n";

        assert_eq!(covered(note, "work"), ["#work\nJob notes.\n\n"]);
        assert_eq!(without_blocks(note, "work"), "---\n\nSomething else.\n");
    }

    /*
     * Three dashes is the rule; fewer is not. Without the length the block
     * would stop at the first stray dash, which is a quiet way to keep text a
     * reader asked to have deleted.
     */
    #[test]
    fn it_takes_three_dashes_to_end_a_block() {
        let short = "#work
Job notes.
-
--
Still job notes.
";
        assert_eq!(covered(short, "work"), [short]);

        for rule in ["---", "----", "  ---  "] {
            let note = format!(
                "#work
Job notes.
{rule}
After.
"
            );
            assert_eq!(
                covered(&note, "work"),
                ["#work
Job notes.
"],
                "for {rule:?}"
            );
        }
    }

    /*
     * A block stops where a reader sees a line across the page, and the reader
     * sees whatever the editor's Markdown parser draws one for. The two are
     * held together by `conformance/rules.json`, which is generated from that
     * parser and read from both sides — this test and its counterpart in
     * `src/renderer/rules.conformance.test.ts`.
     *
     * They had already drifted once: this knew only dashes, so `***` was drawn
     * as a divider and not treated as one, and text a reader had deliberately
     * separated off would have gone with the block above it.
     */
    #[test]
    fn a_rule_is_whatever_the_editor_draws_a_rule_for() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/rules.json");
        let fixture: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json");
        let cases = fixture["rules"].as_array().expect("rules");
        assert!(cases.len() > 20, "a fixture worth checking");

        for case in cases {
            let line = case["line"].as_str().expect("line");
            let wanted = case["rule"].as_bool().expect("rule");
            assert_eq!(is_rule(line), wanted, "for {line:?}");
        }
    }

    /// And the same shapes, seen from the outside: what a block gives up at.
    #[test]
    fn a_line_that_only_looks_like_a_rule_does_not_end_one() {
        for plain in [
            "--",
            "**",
            "__",
            "-*-",
            "---x",
            "* item",
            "*emphasis*",
            "-",
            "    ---",
        ] {
            let note = format!("#work\nJob notes.\n{plain}\nStill the job.\n");
            assert_eq!(covered(&note, "work"), [note.as_str()], "for {plain:?}");
        }

        for rule in ["***", "___", "* * *", "   ---"] {
            let note = format!("#work\nJob notes.\n{rule}\nAfter.\n");
            assert_eq!(
                covered(&note, "work"),
                ["#work\nJob notes.\n"],
                "expected {rule:?} to end the block"
            );
        }
    }

    #[test]
    fn the_end_of_the_note_ends_a_block() {
        let note = "Opening thoughts.\n\n#work\nThe last word.";

        assert_eq!(covered(note, "work"), ["#work\nThe last word."]);
        assert_eq!(without_blocks(note, "work"), "Opening thoughts.\n\n");
    }

    #[test]
    fn text_above_the_first_block_is_not_part_of_one() {
        let note = "A private paragraph.\n\n#work\nJob notes.\n";

        assert_eq!(without_blocks(note, "work"), "A private paragraph.\n\n");
    }

    #[test]
    fn every_block_in_a_note_goes_not_only_the_first() {
        let note = "#work\nOne.\n\n#garden\nKeep.\n\n#work\nTwo.\n";

        assert_eq!(covered(note, "work").len(), 2);
        assert_eq!(without_blocks(note, "work"), "#garden\nKeep.\n\n");
    }

    /// Answered deliberately: the text under `#work #urgent` is work's, and
    /// deleting work takes it. The preview is where this gets surfaced.
    #[test]
    fn a_block_headed_by_two_tags_belongs_to_both() {
        let note = "#work #urgent\nShared.\n\n#garden\nKeep.\n";

        assert_eq!(covered(note, "work"), ["#work #urgent\nShared.\n\n"]);
        assert_eq!(covered(note, "urgent"), ["#work #urgent\nShared.\n\n"]);
    }

    #[test]
    fn a_block_head_with_nothing_under_it_is_still_a_block() {
        let note = "#work\n#garden\nTomatoes.\n";

        assert_eq!(covered(note, "work"), ["#work\n"]);
        assert_eq!(without_blocks(note, "work"), "#garden\nTomatoes.\n");
    }

    #[test]
    fn the_tag_is_matched_however_it_was_capitalised() {
        let note = "#Work\nJob notes.\n";

        assert_eq!(covered(note, "work").len(), 1);
        assert_eq!(covered(note, "#WORK").len(), 1);
    }

    /// `#working` is a different tag, and a prefix is not a match.
    #[test]
    fn a_longer_tag_that_starts_the_same_is_a_different_tag() {
        let note = "#working\nStill employed.\n";

        assert!(blocks_for(note, "work").is_empty());
        assert_eq!(without_blocks(note, "work"), note);
    }

    #[test]
    fn a_tag_that_appears_nowhere_changes_nothing() {
        let note = "#work\nJob notes.\n";

        assert_eq!(without_blocks(note, "garden"), note);
        assert_eq!(without_blocks("", "work"), "");
    }

    /*
     * A heading is a hash and a space; a tag is a hash and a letter. The two
     * are one keystroke apart and a heading must never head a block.
     */
    #[test]
    fn a_heading_is_not_a_tag() {
        let note = "# Work\nUnder a heading.\n";

        assert!(blocks_for(note, "work").is_empty());
    }

    #[test]
    fn indentation_and_trailing_spaces_do_not_hide_a_block_head() {
        let note = "  #work  \nJob notes.\n";

        assert_eq!(covered(note, "work"), ["  #work  \nJob notes.\n"]);
    }

    /// Offsets are bytes, and a note is not always ASCII.
    #[test]
    fn a_note_with_wider_characters_is_cut_in_the_right_place() {
        let note = "Café — naïve.\n\n#work\nJob notes.\n";

        assert_eq!(without_blocks(note, "work"), "Café — naïve.\n\n");
    }
}
