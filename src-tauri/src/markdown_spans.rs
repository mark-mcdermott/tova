/*!
Where a `#` is not a tag.

The editor has always known this — it asks its syntax tree and draws no pill
where the `#` sits inside code, a URL, a link, an image or a heading — but
nothing on this side did. First a `#deprecated` comment alone on a line in a
pasted shell script was read as a tag heading a block, and deleting that tag
took the prose underneath it. Then, with code accounted for, a `#fragment` at
the end of a URL was still listed in the sidebar as a tag of its own, sending a
reader looking through a note for something it never said.

There is no markdown parser here, so the rule is written out by hand and held
to the editor's answer by `conformance/tags.json`, which is generated from the
very parser the editor uses. A port in both directions with
`src/shared/markdownSpans.ts`.

What it knows: fenced and indented code, code spans, ATX and setext headings,
links and images with their labels, titles and destinations, `<…>` autolinks,
the bare URLs GitHub-flavoured markdown links on sight, link reference
definitions, and where a block of raw HTML starts and stops.

HTML is here only to be skipped. A block of it is handed to the HTML parser and
never read as markdown, so a link written inside one is not a link — reading it
as one would take a real tag out of the sidebar, which is the expensive
direction to be wrong in.
*/

use std::ops::Range;

use crate::js::is_whitespace;

pub struct Spans {
    /// Fenced code, indented code, and code spans.
    pub code: Vec<Range<usize>>,
    /// Those, and everywhere else a `#` already means something.
    pub excluded: Vec<Range<usize>>,
}

/// Whether `offset` falls inside any of `ranges`.
pub fn covers(ranges: &[Range<usize>], offset: usize) -> bool {
    ranges.iter().any(|range| range.contains(&offset))
}

/*
 * What the markdown parser calls whitespace, which is neither what Rust calls
 * it nor what JavaScript's `\s` matches: space, tab, newline and carriage
 * return, and nothing else.
 */
fn is_space(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | b'\r')
}

fn is_letter(byte: u8) -> bool {
    byte.is_ascii_alphabetic()
}

fn is_digit(byte: u8) -> bool {
    byte.is_ascii_digit()
}

fn is_alphanumeric(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
}

/// `\w` without the `u` flag, which is what the parser's own patterns mean by it.
fn is_word(byte: u8) -> bool {
    is_alphanumeric(byte) || byte == b'_'
}

/*
 * Past the end reads as a zero byte, which no rule here looks for. It stands in
 * for the `undefined` the TypeScript compares against, so that the two sides
 * can be read side by side.
 */
fn byte_at(bytes: &[u8], at: usize) -> u8 {
    bytes.get(at).copied().unwrap_or(0)
}

fn skip_space(bytes: &[u8], from: usize) -> usize {
    let mut at = from;
    while at < bytes.len() && is_space(bytes[at]) {
        at += 1;
    }
    at
}

/// How far a run of bytes `allowed` reaches from `from`.
fn run(bytes: &[u8], from: usize, allowed: impl Fn(u8) -> bool) -> usize {
    let mut at = from;
    while at < bytes.len() && allowed(bytes[at]) {
        at += 1;
    }
    at
}

// ---------------------------------------------------------------- blocks ----

struct Fence {
    mark: u8,
    len: usize,
    indent: usize,
    /// The quote depth and open list items it was written inside.
    quote: usize,
    depth: usize,
}

/// One line of prose, and where it sits in the note.
struct Piece<'a> {
    at: usize,
    text: &'a str,
}

/// An open list item: the column its content starts at, and what opened it.
struct Container {
    indent: usize,
    ordered: bool,
    /// The quote depth it was opened at, which is the one it lives at.
    quote: usize,
}

/// The lines gathered so far into the paragraph being read.
struct Leaf<'a> {
    pieces: Vec<Piece<'a>>,
    /// The quote depth it opened at: a deeper one starts a paragraph of its own.
    quote: usize,
    /// The number of list items open around it, for the same reason.
    depth: usize,
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
fn fence_at(content: &str) -> Option<(u8, usize)> {
    let bytes = content.as_bytes();
    let mark = byte_at(bytes, 0);
    if mark != b'`' && mark != b'~' {
        return None;
    }

    let len = run(bytes, 0, |byte| byte == mark);
    if len < 3 {
        return None;
    }

    // What a backtick fence says it holds may not itself contain a backtick, so
    // a line of prose with two code spans in it does not open a code block.
    if mark == b'`' && bytes[len..].contains(&b'`') {
        return None;
    }
    Some((mark, len))
}

/// Whether a line is still inside whatever the fence was opened in.
fn holds(open: &Fence, quote: usize, indent: usize, containers: &[Container], blank: bool) -> bool {
    if quote < open.quote {
        return false;
    }
    if blank || open.depth == 0 {
        return true;
    }
    indent >= containers[open.depth - 1].indent
}

/// Whether this line closes `open`: the same mark, at least as long, nothing after.
fn closes(open: &Fence, indent: usize, content: &str) -> bool {
    if indent > open.indent + 3 {
        return false;
    }

    let Some((mark, len)) = fence_at(content) else {
        return false;
    };
    mark == open.mark && len >= open.len && crate::js::trim(&content[len..]).is_empty()
}

/*
 * A divider: three or more of one mark, spaces allowed between them.
 *
 * Not `is_rule` in `tag_blocks.rs`, which answers a neighbouring question and
 * deliberately answers it differently — that one counts a setext underline as a
 * divider, because a block that ends sooner deletes less. Here the parser's own
 * precedence applies, and an underline under a paragraph is a heading.
 */
fn thematic_break(content: &str) -> bool {
    let bytes = content.as_bytes();
    let mark = byte_at(bytes, 0);
    if mark != b'-' && mark != b'*' && mark != b'_' {
        return false;
    }

    let mut count = 0;
    for byte in bytes {
        if *byte == mark {
            count += 1;
        } else if !is_space(*byte) {
            return false;
        }
    }
    count >= 3
}

/// `===` or `---` under a paragraph, which turns the paragraph into a heading.
fn setext_underline(content: &str) -> bool {
    let bytes = content.as_bytes();
    let mark = byte_at(bytes, 0);
    if mark != b'-' && mark != b'=' {
        return false;
    }

    let at = run(bytes, 0, |byte| byte == mark);
    skip_space(bytes, at) == bytes.len()
}

/*
 * An ATX heading, as the stretch of `content` the parser reads as its text.
 *
 * One to six hashes, then a space or the end of the line — a tab does not
 * count, which is why `#\tword` stays a paragraph. A run of hashes at the far
 * end with a space before it closes the heading rather than belonging to it.
 */
fn atx_heading(content: &str) -> Option<Range<usize>> {
    let bytes = content.as_bytes();
    if byte_at(bytes, 0) != b'#' {
        return None;
    }

    let size = run(bytes, 0, |byte| byte == b'#');
    if size > 6 {
        return None;
    }
    if size < bytes.len() && bytes[size] != b' ' {
        return None;
    }

    let mut trimmed = bytes.len();
    while trimmed > 0 && is_space(bytes[trimmed - 1]) {
        trimmed -= 1;
    }

    let mut after = trimmed;
    while after > 0 && bytes[after - 1] == b'#' {
        after -= 1;
    }
    if after == trimmed || after == 0 || !is_space(bytes[after - 1]) {
        after = bytes.len();
    }

    let from = (size + 1).min(bytes.len());
    Some(from..after.max(from))
}

/// The list item opened by this line, if it opens one.
fn list_marker(content: &str, indent: usize, quote: usize) -> Option<Container> {
    let bytes = content.as_bytes();
    let first = byte_at(bytes, 0);
    let after;
    let mut ordered = false;

    if first == b'-' || first == b'*' || first == b'+' {
        after = 1;
    } else if is_digit(first) {
        let digits = run(bytes, 0, is_digit);
        // CommonMark allows nine digits, then `.` or `)`.
        if digits > 9 {
            return None;
        }
        let delimiter = byte_at(bytes, digits);
        if delimiter != b'.' && delimiter != b')' {
            return None;
        }
        after = digits + 1;
        ordered = true;
    } else {
        return None;
    }

    let spaces = run(bytes, after, |byte| byte == b' ') - after;

    // `-` on its own opens an item whose content is empty.
    if spaces == 0 {
        return (bytes.len() == after).then(|| Container {
            indent: indent + after + 1,
            ordered,
            quote,
        });
    }

    // More than four spaces is an indented code block inside the item, which
    // still starts the item's content one space past the marker.
    Some(Container {
        indent: indent + after + if spaces > 4 { 1 } else { spaces },
        ordered,
        quote,
    })
}

/*
 * Whether a list marker can start a list with a paragraph already open above it.
 *
 * An item with nothing in it cannot interrupt one, and neither can a numbered
 * list that does not start at a single-digit 1 — which is what keeps a sentence
 * that wraps onto "10. Not bad." from turning into a list. Neither rule applies
 * once a list of that kind is already open.
 */
fn can_interrupt(content: &str, ordered: bool, containers: &[Container]) -> bool {
    if containers.iter().any(|item| item.ordered == ordered) {
        return true;
    }

    let bytes = content.as_bytes();
    if !ordered {
        return skip_space(bytes, 2) < bytes.len();
    }

    let digits = run(bytes, 0, is_digit);
    if digits != 1 || bytes[0] != b'1' {
        return false;
    }
    skip_space(bytes, digits + 1) < bytes.len()
}

/*
 * Raw HTML, which markdown hands to the HTML parser and never reads. Each kind
 * of block runs to a different closing line.
 *
 * `<![CDATA[` has a rule of its own in the parser that it can never reach,
 * because `<!` followed by a capital claims it first and ends it at the first
 * `>`. Left the same way here on purpose: this has to match the parser, not the
 * specification the parser was written from.
 */
#[derive(Clone, Copy)]
enum HtmlBlock {
    Script,
    Comment,
    Instruction,
    Declaration,
    Blank,
}

/// The tags whose contents markdown does not read at all.
const VERBATIM_TAGS: [&str; 3] = ["script", "pre", "style"];

/// The tags that open an HTML block just by being at the start of a line.
#[rustfmt::skip]
const BLOCK_TAGS: [&str; 62] = [
    "address", "article", "aside", "base", "basefont", "blockquote", "body",
    "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
    "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
    "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
    "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
    "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section",
    "source", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title",
    "tr", "track", "ul",
];

/*
 * The kind of HTML block this line opens, if it opens one.
 *
 * A bare tag on a line of its own is the one kind that cannot interrupt a
 * paragraph, which is what keeps `an <b>emphatic</b>` from ending a sentence.
 */
fn html_block_start(content: &str, in_paragraph: bool) -> Option<HtmlBlock> {
    let bytes = content.as_bytes();
    if byte_at(bytes, 0) != b'<' {
        return None;
    }

    if tag_name_at(content, 1, &VERBATIM_TAGS, false) {
        return Some(HtmlBlock::Script);
    }
    if content.starts_with("<!--") {
        return Some(HtmlBlock::Comment);
    }
    if content.starts_with("<?") {
        return Some(HtmlBlock::Instruction);
    }
    if byte_at(bytes, 1) == b'!' && byte_at(bytes, 2).is_ascii_uppercase() {
        return Some(HtmlBlock::Declaration);
    }
    let name = if byte_at(bytes, 1) == b'/' { 2 } else { 1 };
    if tag_name_at(content, name, &BLOCK_TAGS, true) {
        return Some(HtmlBlock::Blank);
    }
    if !in_paragraph && whole_tag_line(content) {
        return Some(HtmlBlock::Blank);
    }
    None
}

/// Whether `content` holds one of `names` at `from`, with nothing joined to it.
fn tag_name_at(content: &str, from: usize, names: &[&str], self_closing: bool) -> bool {
    let bytes = content.as_bytes();
    if from > bytes.len() {
        return false;
    }

    let end = run(bytes, from, is_alphanumeric);
    let name = content[from..end].to_ascii_lowercase();
    if !names.contains(&name.as_str()) {
        return false;
    }

    let after = byte_at(bytes, end);
    if after == 0 || is_space(after) || after == b'>' {
        return true;
    }
    self_closing && after == b'/' && byte_at(bytes, end + 1) == b'>'
}

/// One complete `<tag …>` or `</tag>` with nothing else on the line.
fn whole_tag_line(content: &str) -> bool {
    let bytes = content.as_bytes();
    let mut at = 1;
    let closing = byte_at(bytes, at) == b'/';
    if closing {
        at += 1;
    }
    if !is_letter(byte_at(bytes, at)) {
        return false;
    }
    at = run(bytes, at + 1, |byte| is_word(byte) || byte == b'-');

    if !closing {
        loop {
            let name = skip_space(bytes, at);
            if name == at {
                break;
            }
            let start = byte_at(bytes, name);
            if !is_letter(start) && start != b':' && start != b'_' {
                break;
            }
            at = run(bytes, name + 1, |byte| {
                is_word(byte) || byte == b'-' || byte == b'.'
            });

            // A value the parser cannot read leaves the attribute behind with it.
            let equals = skip_space(bytes, at);
            if byte_at(bytes, equals) != b'=' {
                continue;
            }
            match attribute_value_end(bytes, skip_space(bytes, equals + 1)) {
                Some(end) => at = end,
                None => break,
            }
        }
    }

    at = skip_space(bytes, at);
    byte_at(bytes, at) == b'>' && skip_space(bytes, at + 1) == bytes.len()
}

/// An attribute value: quoted either way, or a run with no whitespace or markup in it.
fn attribute_value_end(bytes: &[u8], from: usize) -> Option<usize> {
    let quote = byte_at(bytes, from);
    if quote == b'\'' || quote == b'"' {
        let close = bytes[(from + 1).min(bytes.len())..]
            .iter()
            .position(|byte| *byte == quote)?;
        return Some(from + 1 + close + 1);
    }

    let end = run(bytes, from, |byte| {
        !is_space(byte) && !b"\"'=<>`".contains(&byte)
    });
    (end != from).then_some(end)
}

/// Whether this line is the last of an HTML block, and part of it.
fn html_block_ends(kind: HtmlBlock, line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    match kind {
        HtmlBlock::Script => {
            lower.contains("</script>") || lower.contains("</pre>") || lower.contains("</style>")
        }
        HtmlBlock::Comment => line.contains("-->"),
        HtmlBlock::Instruction => line.contains("?>"),
        HtmlBlock::Declaration => line.contains('>'),
        HtmlBlock::Blank => line.bytes().all(|byte| byte == b' ' || byte == b'\t'),
    }
}

/// What stripping a line's quote markers left behind.
struct Unquoted<'a> {
    columns: usize,
    depth: usize,
    rest: &'a str,
    /// The column the first `>` sits at, which is the indent a list item sees.
    outer: usize,
}

/*
 * Strips `>` quote markers, returning what is left, its column and its depth.
 *
 * At most `limit` of them: inside a fence, a `>` below the depth the fence was
 * written at is a character of code rather than a quote, which is what stops a
 * quoted fence mark in a code block from closing it.
 */
fn unquote(line: &str, limit: usize) -> Unquoted<'_> {
    let mut rest = line;
    let mut columns = 0;
    let mut depth = 0;
    let mut outer = indent_of(line).0;

    while depth < limit {
        let (indent, at) = indent_of(rest);
        if indent > columns + 3 || !rest[at..].starts_with('>') {
            break;
        }
        if depth == 0 {
            outer = indent;
        }

        columns = indent + 1;
        depth += 1;
        rest = &rest[at + 1..];
        if rest.starts_with(' ') {
            rest = &rest[1..];
            columns += 1;
        }
    }

    Unquoted {
        columns,
        depth,
        rest,
        outer,
    }
}

/// The paragraph a container opens when there is nothing after its marker.
fn empty_leaf<'a>(at: usize, quote: usize, depth: usize) -> Leaf<'a> {
    Leaf {
        pieces: vec![Piece { at, text: "" }],
        quote,
        depth,
    }
}

fn mark(out: &mut Spans, code: bool, from: usize, to: usize) {
    if code {
        out.code.push(from..to);
    }
    out.excluded.push(from..to);
}

fn flush(leaf: &mut Option<Leaf>, out: &mut Spans) {
    if let Some(open) = leaf.take() {
        inline_spans(&open.pieces, out);
    }
}

/// Every span of `text` that a `#` in it would not be a tag in.
pub fn spans(text: &str) -> Spans {
    let mut out = Spans {
        code: Vec::new(),
        excluded: Vec::new(),
    };
    let mut containers: Vec<Container> = Vec::new();
    let mut fence: Option<Fence> = None;
    let mut html: Option<HtmlBlock> = None;
    let mut leaf: Option<Leaf> = None;
    let mut quotes = 0;
    let mut at = 0usize;

    for line in text.split('\n') {
        let start = at;
        let line_to = start + line.len();
        at = line_to + 1;

        let quote = unquote(line, fence.as_ref().map_or(usize::MAX, |open| open.quote));
        let (columns, measured) = indent_of(quote.rest);
        let mut indent = quote.columns + columns;
        let mut content = &quote.rest[measured..];
        let mut content_at = start + (line.len() - quote.rest.len()) + measured;

        let blank = content.chars().all(is_whitespace);

        // A fence reaches no further than whatever it was written inside:
        // leaving the quote or the list item closes it, wherever its own marks
        // are.
        if let Some(open) = &fence {
            if holds(open, quote.depth, indent, &containers, blank) {
                mark(&mut out, true, start, line_to);
                if closes(open, indent, content) {
                    fence = None;
                }
                continue;
            }
            fence = None;
        }

        // Raw HTML is never read as markdown, so it holds nothing to record.
        if let Some(kind) = html {
            if html_block_ends(kind, line) {
                html = None;
            }
            continue;
        }

        // A quote stays open under a line that lazily carries its paragraph on;
        // anything else closes it back to whatever this line marks.
        let opens_quote = quote.depth > quotes;
        if opens_quote || blank || leaf.is_none() {
            quotes = quote.depth;
        }

        if blank {
            flush(&mut leaf, &mut out);
            // A quote marker with nothing after it still opens a paragraph, and
            // the line below carries on from there rather than starting
            // something new.
            if opens_quote {
                leaf = Some(empty_leaf(content_at, quote.depth, containers.len()));
            }
            continue;
        }

        // A quote opening under a paragraph opens a paragraph of its own, and a
        // link reference definition is a block that has already closed.
        if leaf
            .as_ref()
            .is_some_and(|open| quote.depth > open.quote || definitions_end_before(open, content))
        {
            flush(&mut leaf, &mut out);
        }

        // A list item is continued by indentation, and a quote marker is not
        // indentation: a `>` written left of the item closes it rather than
        // opening a quote inside it.
        while let Some(item) = containers.last() {
            let reaches = if quote.depth > item.quote {
                quote.outer
            } else {
                indent
            };
            if reaches >= item.indent {
                break;
            }
            containers.pop();
        }
        // Indent is measured from the start of the line, so the column a
        // quote's content begins at is where "not indented" is inside one.
        let mut base = containers.last().map_or(quote.columns, |item| item.indent);

        if leaf.as_ref().is_some_and(|open| {
            quote.depth == open.quote
                && containers.len() == open.depth
                && indent < base + 4
                && setext_underline(content)
        }) {
            // The paragraph and its underline are one heading — and the text of
            // it is still read for whatever it holds.
            let from = leaf.as_ref().expect("open").pieces[0].at;
            out.excluded.push(from..line_to);
            flush(&mut leaf, &mut out);
            continue;
        }

        // Peel off whatever this line opens before reading what it holds: a
        // fence, a divider, or the list markers a heading can then sit after.
        let mut opened = false;
        loop {
            if indent >= base + 4 {
                break;
            }

            if let Some((fence_mark, len)) = fence_at(content) {
                flush(&mut leaf, &mut out);
                fence = Some(Fence {
                    mark: fence_mark,
                    len,
                    indent,
                    quote: quote.depth,
                    depth: containers.len(),
                });
                mark(&mut out, true, start, line_to);
                opened = true;
                break;
            }

            if thematic_break(content) {
                flush(&mut leaf, &mut out);
                opened = true;
                break;
            }

            let Some(item) = list_marker(content, indent, quote.depth) else {
                break;
            };
            if leaf.is_some() && !can_interrupt(content, item.ordered, &containers) {
                break;
            }

            flush(&mut leaf, &mut out);
            let inner = item.indent;
            base = inner;
            containers.push(item);

            let skip = (inner - indent).min(content.len());
            content = &content[skip..];
            content_at += skip;

            let (after_columns, after_at) = indent_of(content);
            indent = inner + after_columns;
            content = &content[after_at..];
            content_at += after_at;

            if content.is_empty() {
                // An item with nothing in it still opens a paragraph, the same
                // way an empty quote line does.
                leaf = Some(empty_leaf(content_at, quote.depth, containers.len()));
                opened = true;
                break;
            }
        }
        if opened {
            continue;
        }

        if indent < base + 4 {
            if let Some(heading) = atx_heading(content) {
                flush(&mut leaf, &mut out);
                out.excluded.push(content_at..line_to);
                let piece = Piece {
                    at: content_at + heading.start,
                    text: &content[heading.clone()],
                };
                inline_spans(&[piece], &mut out);
                continue;
            }

            if let Some(kind) = html_block_start(content, leaf.is_some()) {
                flush(&mut leaf, &mut out);
                html = (!html_block_ends(kind, line)).then_some(kind);
                continue;
            }
        }

        // Indented code cannot interrupt a paragraph, which is what stops the
        // second line of a wrapped sentence from becoming a code block.
        if leaf.is_none() && indent >= base + 4 {
            mark(&mut out, true, start, line_to);
            continue;
        }

        leaf.get_or_insert_with(|| Leaf {
            pieces: Vec::new(),
            quote: quote.depth,
            depth: containers.len(),
        })
        .pieces
        .push(Piece {
            at: content_at,
            text: content,
        });
    }

    flush(&mut leaf, &mut out);
    out
}

// ---------------------------------------------------------------- inline ----

/// A span of a paragraph's joined text, before it is mapped back to the note.
struct Found {
    range: Range<usize>,
    code: bool,
}

/*
 * A paragraph read as the one run of text the parser reads it as.
 *
 * A link or a code span can open on one line and close on the next, so the
 * lines are joined before anything is looked for and the answers mapped back to
 * the note afterwards.
 */
fn inline_spans(pieces: &[Piece], out: &mut Spans) {
    let text = pieces
        .iter()
        .map(|piece| piece.text)
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        return;
    }

    // Where each byte of the joined text sits in the note. A joining newline
    // takes the position of the line ending it stands for.
    let mut offsets: Vec<usize> = Vec::with_capacity(text.len());
    for (index, piece) in pieces.iter().enumerate() {
        if index > 0 {
            let previous = &pieces[index - 1];
            offsets.push(previous.at + previous.text.len());
        }
        for byte in 0..piece.text.len() {
            offsets.push(piece.at + byte);
        }
    }

    let mut found: Vec<Found> = Vec::new();

    // A paragraph opening with `[` may be a run of link reference definitions,
    // each one ending where its line does, before any prose starts.
    let mut written: Vec<Range<usize>> = Vec::new();
    let from = definitions(&text, &mut written);
    for definition in written {
        found.push(Found {
            range: definition,
            code: false,
        });
    }

    scan(&text, from, &mut found);

    for one in found {
        mark(
            out,
            one.code,
            offsets[one.range.start],
            offsets[one.range.end - 1] + 1,
        );
    }
}

/// The link reference definitions at the start of `text`, and where prose picks
/// up after them.
fn definitions(text: &str, found: &mut Vec<Range<usize>>) -> usize {
    let bytes = text.as_bytes();
    let mut at = 0;

    while at < bytes.len() && bytes[at] == b'[' {
        let Some(end) = link_reference_end(bytes, at) else {
            return at;
        };
        found.push(at..end);
        if end >= bytes.len() {
            return bytes.len();
        }
        at = end + 1;
    }
    at
}

/*
 * Whether the paragraph so far is definitions that the line about to be read
 * falls outside of — in which case the block closed on the line before it.
 *
 * It takes the next line to answer, because a definition is only finished once
 * something that is not part of it turns up: a title on a line of its own still
 * belongs to the definition above.
 */
fn definitions_end_before(leaf: &Leaf, next: &str) -> bool {
    if !leaf.pieces[0].text.starts_with('[') {
        return false;
    }

    let mut text = leaf
        .pieces
        .iter()
        .map(|piece| piece.text)
        .collect::<Vec<_>>()
        .join("\n");
    text.push('\n');
    text.push_str(next);

    let mut found = Vec::new();
    definitions(&text, &mut found);
    found.last().is_some_and(|last| last.end < text.len())
}

/// An open `[` or `![`, waiting for the `]` that would make it a link.
struct Bracket {
    image: bool,
    from: usize,
    to: usize,
    valid: bool,
}

const ESCAPABLE: &[u8] = b"!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

fn scan(text: &str, from: usize, found: &mut Vec<Found>) {
    let bytes = text.as_bytes();
    let mut open: Vec<Bracket> = Vec::new();
    let mut at = from;

    while at < bytes.len() {
        let byte = bytes[at];

        if byte == b'\\' {
            at += if at + 1 < bytes.len() && ESCAPABLE.contains(&bytes[at + 1]) {
                2
            } else {
                1
            };
            continue;
        }

        if byte == b'`' {
            match code_span_end(bytes, at) {
                Some(end) => {
                    found.push(Found {
                        range: at..end,
                        code: true,
                    });
                    at = end;
                }
                None => at += 1,
            }
            continue;
        }

        if byte == b'<' {
            match angle_autolink_end(bytes, at) {
                Some(end) => {
                    found.push(Found {
                        range: at..end,
                        code: false,
                    });
                    at = end;
                }
                None => at += 1,
            }
            continue;
        }

        if byte == b'[' {
            open.push(Bracket {
                image: false,
                from: at,
                to: at + 1,
                valid: true,
            });
            at += 1;
            continue;
        }

        if byte == b'!' && byte_at(bytes, at + 1) == b'[' {
            open.push(Bracket {
                image: true,
                from: at,
                to: at + 2,
                valid: true,
            });
            at += 2;
            continue;
        }

        if byte == b']' {
            at = close_bracket(bytes, at, &mut open, found).unwrap_or(at + 1);
            continue;
        }

        match bare_url_end(bytes, at, !open.is_empty()) {
            Some(end) => {
                found.push(Found {
                    range: at..end,
                    code: false,
                });
                at = end;
            }
            None => at += 1,
        }
    }
}

/*
 * A `]` closing the nearest open bracket, and where the link it makes ends.
 *
 * Only the nearest one is considered: where it has already been ruled out, both
 * it and this `]` are dropped rather than the search carrying on behind it.
 */
fn close_bracket(
    bytes: &[u8],
    at: usize,
    open: &mut Vec<Bracket>,
    found: &mut Vec<Found>,
) -> Option<usize> {
    let bracket = open.last()?;

    let blank = skip_space(bytes, bracket.to) == at;
    let next = byte_at(bytes, at + 1);
    if !bracket.valid || (blank && next != b'(' && next != b'[') {
        open.pop();
        return None;
    }

    let image = bracket.image;
    let from = bracket.from;
    let end = link_end(bytes, at + 1);
    open.pop();
    found.push(Found {
        range: from..end,
        code: false,
    });

    // Links cannot nest, so closing one rules out every link still open behind
    // it. Images can: `[![alt](a.png)](b)` is a picture that is also a link.
    if !image {
        for earlier in open.iter_mut().filter(|earlier| !earlier.image) {
            earlier.valid = false;
        }
    }
    Some(end)
}

/// Where a link ends: past its `(destination "title")` or `[label]`, or at the `]`.
fn link_end(bytes: &[u8], after_mark: usize) -> usize {
    let next = byte_at(bytes, after_mark);

    if next == b'(' {
        let mut at = skip_space(bytes, after_mark + 1);
        if let Some(destination) = url_end(bytes, at) {
            at = skip_space(bytes, destination);
            // A destination and a title have to be separated by whitespace.
            if at != destination {
                if let Some(title) = title_end(bytes, at) {
                    at = skip_space(bytes, title);
                }
            }
        }
        return if byte_at(bytes, at) == b')' {
            at + 1
        } else {
            after_mark
        };
    }

    if next == b'[' {
        if let Some(label) = label_end(bytes, after_mark, false) {
            return label;
        }
    }

    after_mark
}

/// A link destination: `<…>`, or a run with no whitespace and balanced parentheses.
fn url_end(bytes: &[u8], from: usize) -> Option<usize> {
    if byte_at(bytes, from) == b'<' {
        let mut at = from + 1;
        while at < bytes.len() {
            if bytes[at] == b'>' {
                return Some(at + 1);
            }
            if bytes[at] == b'<' || bytes[at] == b'\n' {
                return None;
            }
            at += 1;
        }
        return None;
    }

    let mut depth = 0;
    let mut escaped = false;
    let mut at = from;
    while at < bytes.len() {
        let byte = bytes[at];
        if is_space(byte) {
            break;
        } else if escaped {
            escaped = false;
        } else if byte == b'(' {
            depth += 1;
        } else if byte == b')' {
            if depth == 0 {
                break;
            }
            depth -= 1;
        } else if byte == b'\\' {
            escaped = true;
        }
        at += 1;
    }
    (at > from).then_some(at)
}

/// A link title, quoted with `"`, `'` or parentheses.
fn title_end(bytes: &[u8], from: usize) -> Option<usize> {
    let open = byte_at(bytes, from);
    if open != b'\'' && open != b'"' && open != b'(' {
        return None;
    }

    let close = if open == b'(' { b')' } else { open };
    let mut escaped = false;
    let mut at = from + 1;
    while at < bytes.len() {
        let byte = bytes[at];
        if escaped {
            escaped = false;
        } else if byte == close {
            return Some(at + 1);
        } else if byte == b'\\' {
            escaped = true;
        }
        at += 1;
    }
    None
}

/// A `[label]`, which may hold no second `[` and may not run past 999 characters.
fn label_end(bytes: &[u8], from: usize, require_text: bool) -> Option<usize> {
    let mut wanted = require_text;
    let mut escaped = false;
    let limit = bytes.len().min(from + 1000);

    let mut at = from + 1;
    while at < limit {
        let byte = bytes[at];
        if escaped {
            escaped = false;
        } else if byte == b']' {
            return (!wanted).then_some(at + 1);
        } else {
            if wanted && !is_space(byte) {
                wanted = false;
            }
            if byte == b'[' {
                return None;
            }
            if byte == b'\\' {
                escaped = true;
            }
        }
        at += 1;
    }
    None
}

/// `[label]: destination "title"` — a definition rather than prose, reaching to
/// the end of whichever line the destination or the title finished on.
fn link_reference_end(bytes: &[u8], from: usize) -> Option<usize> {
    let label = label_end(bytes, from, true)?;
    if byte_at(bytes, label) != b':' {
        return None;
    }

    let destination = url_end(bytes, skip_space(bytes, label + 1))?;

    let after_space = skip_space(bytes, destination);
    if after_space > destination {
        if let Some(title) = title_end(bytes, after_space) {
            if let Some(end) = rest_of_line(bytes, title) {
                return Some(end);
            }
        }
    }
    rest_of_line(bytes, destination)
}

/// The end of the line `from` sits on, when nothing but whitespace is left of it.
fn rest_of_line(bytes: &[u8], from: usize) -> Option<usize> {
    let mut at = from;
    while at < bytes.len() {
        if bytes[at] == b'\n' {
            return Some(at);
        }
        if !is_space(bytes[at]) {
            return None;
        }
        at += 1;
    }
    Some(bytes.len())
}

/// A code span: a run of backticks closed by a run of exactly the same length.
fn code_span_end(bytes: &[u8], from: usize) -> Option<usize> {
    if from > 0 && bytes[from - 1] == b'`' {
        return None;
    }

    let mut at = run(bytes, from + 1, |byte| byte == b'`');
    let size = at - from;

    let mut seen = 0;
    while at < bytes.len() {
        if bytes[at] != b'`' {
            seen = 0;
        } else {
            seen += 1;
            if seen == size && byte_at(bytes, at + 1) != b'`' {
                return Some(at + 1);
            }
        }
        at += 1;
    }
    None
}

// ------------------------------------------------------------- autolinks ----

/// `<scheme:…>` or `<someone@example.com>`.
fn angle_autolink_end(bytes: &[u8], from: usize) -> Option<usize> {
    if let Some(scheme) = scheme_url_end(bytes, from + 1) {
        return Some(scheme);
    }

    let local = run(bytes, from + 1, is_email_local);
    if local == from + 1 || byte_at(bytes, local) != b'@' {
        return None;
    }

    let mut at = local + 1;
    loop {
        at = host_label_end(bytes, at)?;
        if byte_at(bytes, at) != b'.' {
            break;
        }
        at += 1;
    }
    (byte_at(bytes, at) == b'>').then_some(at + 1)
}

fn is_email_local(byte: u8) -> bool {
    is_alphanumeric(byte) || b".!#$%&'*+/=?^_`{|}~-".contains(&byte)
}

/// `scheme:` — a letter, then letters, digits, `+`, `-`, `_` or `.` — then a run to `>`.
fn scheme_url_end(bytes: &[u8], from: usize) -> Option<usize> {
    if !is_letter(byte_at(bytes, from)) {
        return None;
    }

    let scheme = run(bytes, from + 1, |byte| {
        is_word(byte) || byte == b'+' || byte == b'.' || byte == b'-'
    });
    if scheme == from + 1 || byte_at(bytes, scheme) != b':' {
        return None;
    }

    let end = run(bytes, scheme + 1, |byte| !is_space(byte) && byte != b'>');
    (end > scheme + 1 && byte_at(bytes, end) == b'>').then_some(end + 1)
}

/// One dot-separated part of a host: alphanumeric at both ends, at most 63 long.
fn host_label_end(bytes: &[u8], from: usize) -> Option<usize> {
    if !is_alphanumeric(byte_at(bytes, from)) {
        return None;
    }

    let mut at = run(bytes, from, |byte| is_alphanumeric(byte) || byte == b'-');
    while at > from && bytes[at - 1] == b'-' {
        at -= 1;
    }
    (at - from <= 63).then_some(at)
}

/*
 * A URL written with no markup around it, which GitHub-flavoured markdown links
 * on sight — `www.`, `http://`, `https://`, `mailto:`, `xmpp:`, and a bare
 * email address. Never in the middle of a word.
 */
fn bare_url_end(bytes: &[u8], from: usize, inside_link: bool) -> Option<usize> {
    if from > 0 && is_word(bytes[from - 1]) {
        return None;
    }

    for prefix in [b"www." as &[u8], b"http://", b"https://"] {
        if bytes[from..].starts_with(prefix) {
            return host_url_end(bytes, from, from + prefix.len(), inside_link);
        }
    }

    let local = run(bytes, from, is_email_body);
    if local > from && local - from <= 100 && byte_at(bytes, local) == b'@' {
        return email_end(bytes, from);
    }

    if bytes[from..].starts_with(b"mailto:") {
        return email_end(bytes, from + 7);
    }
    if bytes[from..].starts_with(b"xmpp:") {
        let end = email_end(bytes, from + 5)?;
        let resource = run(bytes, end + 1, |byte| {
            is_alphanumeric(byte) || byte == b'@' || byte == b'.'
        });
        return Some(if byte_at(bytes, end) == b'/' && resource > end + 1 {
            resource
        } else {
            end
        });
    }

    None
}

fn is_email_body(byte: u8) -> bool {
    is_word(byte) || byte == b'.' || byte == b'+' || byte == b'-'
}

fn is_host_body(byte: u8) -> bool {
    is_word(byte) || byte == b'-'
}

/*
 * How far a bare `www.`/`http://` URL reaches: a dotted host and an optional
 * path, less whatever punctuation at the end reads as the sentence's rather
 * than the URL's.
 */
fn host_url_end(bytes: &[u8], url: usize, host: usize, inside_link: bool) -> Option<usize> {
    let mut at = run(bytes, host, is_host_body);
    if at == host {
        return None;
    }

    let mut dots = 0;
    while byte_at(bytes, at) == b'.' && is_host_body(byte_at(bytes, at + 1)) {
        at = run(bytes, at + 1, is_host_body);
        dots += 1;
    }
    if dots == 0 {
        return None;
    }

    // An underscore in either of the last two parts of the host means it is not
    // one, and the parser leaves the whole thing as prose.
    if last_two_host_parts(&bytes[host..at]).contains(&b'_') {
        return None;
    }

    if byte_at(bytes, at) == b'/' {
        at = run(bytes, at + 1, |byte| !is_space(byte) && byte != b'<');
    }

    let mut end = trim_sentence(bytes, host, at);
    if inside_link {
        end = host + unbracketed_length(&bytes[host..end]);
    }
    (end > url).then_some(end)
}

/// The last two dot-separated parts of a host, which are the ones that must be plain.
fn last_two_host_parts(host: &[u8]) -> &[u8] {
    let dots = host.iter().filter(|byte| **byte == b'.').count();
    if dots < 2 {
        return host;
    }

    let mut seen = 0;
    for (at, byte) in host.iter().enumerate() {
        if *byte == b'.' {
            seen += 1;
            if seen == dots - 1 {
                return &host[at + 1..];
            }
        }
    }
    host
}

/// Drops the trailing characters that belong to the sentence rather than the URL.
fn trim_sentence(bytes: &[u8], from: usize, to: usize) -> usize {
    let mut end = to;

    loop {
        let last = bytes[end - 1];

        if b"?!.,:*_~".contains(&last) {
            end -= 1;
            continue;
        }

        if last == b')' && count(bytes, from, end, b')') > count(bytes, from, end, b'(') {
            end -= 1;
            continue;
        }

        if last == b';' {
            if let Some(entity) = entity_start(bytes, from, end) {
                end = entity;
                continue;
            }
        }

        return end;
    }
}

/// Where a trailing `&…;` entity begins, so that a URL does not swallow one.
fn entity_start(bytes: &[u8], from: usize, end: usize) -> Option<usize> {
    let at = bytes[..end - 1].iter().rposition(|byte| *byte == b'&')?;
    if at < from {
        return None;
    }

    let body = &bytes[at + 1..end - 1];
    if body.is_empty() {
        return None;
    }

    if body[0] == b'#' {
        let hex = byte_at(body, 1) == b'x';
        let digits = &body[if hex { 2 } else { 1 }..];
        if digits.is_empty() {
            return None;
        }
        let ok = digits
            .iter()
            .all(|byte| if hex { is_hex(*byte) } else { is_digit(*byte) });
        return ok.then_some(at);
    }
    body.iter().all(|byte| is_word(*byte)).then_some(at)
}

fn is_hex(byte: u8) -> bool {
    is_digit(byte) || (b'a'..=b'f').contains(&byte)
}

fn count(bytes: &[u8], from: usize, to: usize, wanted: u8) -> usize {
    bytes[from..to]
        .iter()
        .filter(|byte| **byte == wanted)
        .count()
}

/// How much of a URL inside an unclosed link is still the URL: a `[` or `]`
/// that does not pair off belongs to the link around it.
fn unbracketed_length(url: &[u8]) -> usize {
    let mut at = 0;
    while at < url.len() {
        if url[at] == b']' {
            break;
        }
        if url[at] == b'[' {
            match url[at + 1..].iter().position(|byte| *byte == b']') {
                Some(close) => at = at + 1 + close + 1,
                None => break,
            }
        } else {
            at += 1;
        }
    }
    at
}

/// An email address, less a trailing dot, and refused outright on a trailing `_` or `-`.
fn email_end(bytes: &[u8], from: usize) -> Option<usize> {
    let local = run(bytes, from, is_email_body);
    if local == from || byte_at(bytes, local) != b'@' {
        return None;
    }

    let host = run(bytes, local + 1, is_host_body);
    if host == local + 1 || byte_at(bytes, host) != b'.' {
        return None;
    }

    let end = run(bytes, host + 1, |byte| {
        is_word(byte) || byte == b'.' || byte == b'-'
    });
    if end == host + 1 {
        return None;
    }

    let last = bytes[end - 1];
    if last == b'_' || last == b'-' {
        return None;
    }
    Some(if last == b'.' { end - 1 } else { end })
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
     * sidebar have gone back to disagreeing about what a tag is, and the reader
     * is once again being shown tags their note does not contain — or, on the
     * `code` column, that the thing which deletes by tag has stopped agreeing
     * with the thing that draws one.
     */
    #[test]
    fn agrees_with_the_editors_parser_about_where_a_tag_is_not_one() {
        let mut checked = 0;

        for case in cases() {
            let name = case["name"].as_str().expect("name");
            let text = case["text"].as_str().expect("text");
            let found = super::spans(text);

            for tag in case["tags"].as_array().expect("tags") {
                let at = tag["at"].as_u64().expect("at") as usize;
                let tag_name = tag["tag"].as_str().unwrap_or_default();

                for (column, wanted, ranges) in [
                    ("code", tag["code"].as_bool().expect("code"), &found.code),
                    (
                        "excluded",
                        tag["excluded"].as_bool().expect("excluded"),
                        &found.excluded,
                    ),
                ] {
                    let got = super::covers(ranges, at);
                    assert_eq!(
                        got, wanted,
                        "{name}: {tag_name} at {at} — parser says {column}={wanted}, \
                         we say {got}\n{text:?}"
                    );
                    checked += 1;
                }
            }
        }

        assert!(checked >= 200, "only {checked} answers checked");
    }
}
