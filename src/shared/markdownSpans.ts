/**
 * Where a `#` is not a tag.
 *
 * The editor asks its syntax tree and draws no pill where the parser says the
 * `#` sits inside code, a URL, a link, an image or a heading — `EXCLUDES_TAGS`
 * in `markdownDecorations.ts`. Everything without a parser needs the rule
 * written out: the Rust, and `allTags` here. `conformance/tags.json` is
 * generated from the editor's own parser and holds all three to one answer.
 *
 * A port in both directions with `src-tauri/src/markdown_spans.rs`. The
 * character tests are hand-written rather than regexes for the reason the rest
 * of this port is: `\w` and `\s` mean one thing to JavaScript and another to
 * Rust, and the two sides have to agree.
 *
 * What it knows: fenced and indented code, code spans, ATX and setext
 * headings, links and images with their labels, titles and destinations,
 * `<…>` autolinks, the bare URLs GitHub-flavoured markdown links on sight,
 * link reference definitions, and where a block of raw HTML starts and stops.
 *
 * HTML is here only to be skipped. A block of it is handed to the HTML parser
 * and never read as markdown, so a link written inside one is not a link —
 * reading it as one would take a real tag out of the sidebar, which is the
 * expensive direction to be wrong in.
 */

export interface Span {
  from: number
  to: number
}

export interface Spans {
  /** Fenced code, indented code, and code spans. */
  code: Span[]
  /** Those, and everywhere else a `#` already means something. */
  excluded: Span[]
}

/** Whether `offset` falls inside any of `ranges`. */
export function covers(ranges: readonly Span[], offset: number): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to)
}

/*
 * What the markdown parser calls whitespace, which is not what JavaScript
 * calls whitespace: space, tab, newline and carriage return, and nothing else.
 * A `\s` here would read a non-breaking space as the end of a line.
 */
function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9"
}

function isAlphanumeric(ch: string): boolean {
  return isLetter(ch) || isDigit(ch)
}

/** `\w` without the `u` flag, which is what the parser's own patterns mean by it. */
function isWord(ch: string): boolean {
  return isAlphanumeric(ch) || ch === "_"
}

function skipSpace(text: string, from: number): number {
  let at = from
  while (at < text.length && isSpace(text[at])) at++
  return at
}

/** How far a run of characters `allowed` reaches from `from`. */
function run(text: string, from: number, allowed: (ch: string) => boolean): number {
  let at = from
  while (at < text.length && allowed(text[at])) at++
  return at
}

// ---------------------------------------------------------------- blocks ----

interface Fence {
  mark: string
  length: number
  indent: number
  /** The quote depth and open list items it was written inside. */
  quote: number
  depth: number
}

/** One line of prose, and where it sits in the note. */
interface Piece {
  at: number
  text: string
}

/** An open list item: the column its content starts at, and what opened it. */
interface Container {
  indent: number
  ordered: boolean
  /** The quote depth it was opened at, which is the one it lives at. */
  quote: number
}

/** The lines gathered so far into the paragraph being read. */
interface Leaf {
  pieces: Piece[]
  /** The quote depth it opened at: a deeper one starts a paragraph of its own. */
  quote: number
  /** The number of list items open around it, for the same reason. */
  depth: number
}

/** How far a line is indented, counting a tab as four columns. */
function indentOf(line: string): { columns: number; at: number } {
  let columns = 0
  for (let at = 0; at < line.length; at++) {
    if (line[at] === " ") columns += 1
    else if (line[at] === "\t") columns += 4
    else return { columns, at }
  }
  return { columns, at: line.length }
}

/** ``` or ~~~: three or more of one mark. */
function fenceAt(content: string): { mark: string; length: number } | null {
  const mark = content[0]
  if (mark !== "`" && mark !== "~") return null

  let length = 0
  while (content[length] === mark) length++
  if (length < 3) return null

  // What a backtick fence says it holds may not itself contain a backtick, so
  // a line of prose with two code spans in it does not open a code block.
  if (mark === "`" && content.includes("`", length)) return null
  return { mark, length }
}

/** Whether a line is still inside whatever the fence was opened in. */
function holds(
  open: Fence,
  quote: number,
  indent: number,
  containers: readonly Container[],
  blank: boolean
): boolean {
  if (quote < open.quote) return false
  if (blank || open.depth === 0) return true
  return indent >= containers[open.depth - 1].indent
}

/** Whether this line closes `open`: the same mark, at least as long, nothing after. */
function closes(open: Fence, indent: number, content: string): boolean {
  if (indent > open.indent + 3) return false

  const fence = fenceAt(content)
  if (fence === null || fence.mark !== open.mark || fence.length < open.length) return false
  return content.slice(fence.length).trim() === ""
}

/**
 * A divider: three or more of one mark, spaces allowed between them.
 *
 * Not `is_rule` in `tag_blocks.rs`, which answers a neighbouring question and
 * deliberately answers it differently — that one counts a setext underline as
 * a divider, because a block that ends sooner deletes less. Here the parser's
 * own precedence applies, and an underline under a paragraph is a heading.
 */
function thematicBreak(content: string): boolean {
  const mark = content[0]
  if (mark !== "-" && mark !== "*" && mark !== "_") return false

  let count = 0
  for (const ch of content) {
    if (ch === mark) count++
    else if (!isSpace(ch)) return false
  }
  return count >= 3
}

/** `===` or `---` under a paragraph, which turns the paragraph into a heading. */
function setextUnderline(content: string): boolean {
  const mark = content[0]
  if (mark !== "-" && mark !== "=") return false

  let at = 0
  while (at < content.length && content[at] === mark) at++
  return skipSpace(content, at) === content.length
}

/**
 * An ATX heading, as the stretch of `content` the parser reads as its text.
 *
 * One to six hashes, then a space or the end of the line — a tab does not
 * count, which is why `#\tword` stays a paragraph. A run of hashes at the far
 * end with a space before it closes the heading rather than belonging to it.
 */
function atxHeading(content: string): { from: number; to: number } | null {
  if (content[0] !== "#") return null

  let size = 0
  while (size < content.length && content[size] === "#") size++
  if (size > 6) return null
  if (size < content.length && content[size] !== " ") return null

  let trimmed = content.length
  while (trimmed > 0 && isSpace(content[trimmed - 1])) trimmed--

  let after = trimmed
  while (after > 0 && content[after - 1] === "#") after--
  if (after === trimmed || after === 0 || !isSpace(content[after - 1])) after = content.length

  const from = Math.min(size + 1, content.length)
  return { from, to: Math.max(from, after) }
}

/** The list item opened by this line, if it opens one. */
function listMarker(content: string, indent: number, quote: number): Container | null {
  const first = content[0]
  let after: number
  let ordered = false

  if (first === "-" || first === "*" || first === "+") after = 1
  else if (isDigit(first)) {
    let digits = 0
    while (digits < content.length && isDigit(content[digits])) digits++
    // CommonMark allows nine digits, then `.` or `)`.
    if (digits > 9) return null
    const delimiter = content[digits]
    if (delimiter !== "." && delimiter !== ")") return null
    after = digits + 1
    ordered = true
  } else return null

  let spaces = 0
  while (content[after + spaces] === " ") spaces++

  // `-` on its own opens an item whose content is empty.
  if (spaces === 0) {
    return content.length === after ? { indent: indent + after + 1, ordered, quote } : null
  }

  // More than four spaces is an indented code block inside the item, which
  // still starts the item's content one space past the marker.
  return { indent: indent + after + (spaces > 4 ? 1 : spaces), ordered, quote }
}

/**
 * Whether a list marker can start a list with a paragraph already open above
 * it.
 *
 * An item with nothing in it cannot interrupt one, and neither can a numbered
 * list that does not start at a single-digit 1 — which is what keeps a
 * sentence that wraps onto "10. Not bad." from turning into a list. Neither
 * rule applies once a list of that kind is already open.
 */
function canInterrupt(content: string, ordered: boolean, containers: readonly Container[]): boolean {
  if (containers.some((container) => container.ordered === ordered)) return true

  if (!ordered) return skipSpace(content, 2) < content.length

  let digits = 0
  while (digits < content.length && isDigit(content[digits])) digits++
  if (digits !== 1 || content[0] !== "1") return false
  return skipSpace(content, digits + 1) < content.length
}

/*
 * Raw HTML, which markdown hands to the HTML parser and never reads. Each kind
 * of block runs to a different closing line.
 *
 * `<![CDATA[` has a rule of its own in the parser that it can never reach,
 * because `<!` followed by a capital claims it first and ends it at the first
 * `>`. Left the same way here on purpose: this has to match the parser, not
 * the specification the parser was written from.
 */
type HtmlBlock = "script" | "comment" | "instruction" | "declaration" | "blank"

/** The tags whose contents markdown does not read at all. */
const VERBATIM_TAGS = new Set(["script", "pre", "style"])

/** The tags that open an HTML block just by being at the start of a line. */
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
  "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
  "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section",
  "source", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title",
  "tr", "track", "ul"
])

/**
 * The kind of HTML block this line opens, if it opens one.
 *
 * A bare tag on a line of its own is the one kind that cannot interrupt a
 * paragraph, which is what keeps `an <b>emphatic</b>` from ending a sentence.
 */
function htmlBlockStart(content: string, inParagraph: boolean): HtmlBlock | null {
  if (content[0] !== "<") return null

  if (tagNameAt(content, 1, VERBATIM_TAGS, false)) return "script"
  if (content.startsWith("<!--")) return "comment"
  if (content.startsWith("<?")) return "instruction"
  if (content[1] === "!" && content[2] >= "A" && content[2] <= "Z") return "declaration"
  if (tagNameAt(content, content[1] === "/" ? 2 : 1, BLOCK_TAGS, true)) return "blank"
  if (!inParagraph && wholeTagLine(content)) return "blank"
  return null
}

/** Whether `content` holds one of `names` at `from`, with nothing joined to it. */
function tagNameAt(
  content: string,
  from: number,
  names: ReadonlySet<string>,
  selfClosing: boolean
): boolean {
  const end = run(content, from, isAlphanumeric)
  if (!names.has(content.slice(from, end).toLowerCase())) return false

  const after = content[end]
  if (after === undefined || isSpace(after) || after === ">") return true
  return selfClosing && after === "/" && content[end + 1] === ">"
}

/** One complete `<tag …>` or `</tag>` with nothing else on the line. */
function wholeTagLine(content: string): boolean {
  let at = 1
  const closing = content[at] === "/"
  if (closing) at++
  if (at >= content.length || !isLetter(content[at])) return false
  at = run(content, at + 1, (ch) => isWord(ch) || ch === "-")

  if (!closing) {
    for (;;) {
      const name = skipSpace(content, at)
      if (name === at) break
      if (!isLetter(content[name]) && content[name] !== ":" && content[name] !== "_") break
      at = run(content, name + 1, (ch) => isWord(ch) || ch === "-" || ch === ".")

      // A value the parser cannot read leaves the attribute behind with it.
      const equals = skipSpace(content, at)
      if (content[equals] !== "=") continue
      const value = attributeValueEnd(content, skipSpace(content, equals + 1))
      if (value === null) break
      at = value
    }
  }

  at = skipSpace(content, at)
  if (content[at] !== ">") return false
  return skipSpace(content, at + 1) === content.length
}

/** An attribute value: quoted either way, or a run with no whitespace or markup in it. */
function attributeValueEnd(content: string, from: number): number | null {
  const quote = content[from]
  if (quote === "'" || quote === '"') {
    const close = content.indexOf(quote, from + 1)
    return close < 0 ? null : close + 1
  }

  const end = run(content, from, (ch) => !isSpace(ch) && !"\"'=<>`".includes(ch))
  return end === from ? null : end
}

/** Whether this line is the last of an HTML block, and part of it. */
function htmlBlockEnds(kind: HtmlBlock, line: string): boolean {
  const lower = line.toLowerCase()
  switch (kind) {
    case "script":
      return lower.includes("</script>") || lower.includes("</pre>") || lower.includes("</style>")
    case "comment":
      return line.includes("-->")
    case "instruction":
      return line.includes("?>")
    case "declaration":
      return line.includes(">")
    case "blank":
      return run(line, 0, (ch) => ch === " " || ch === "\t") === line.length
  }
}

/**
 * Strips `>` quote markers, returning what is left, its column and its depth.
 *
 * At most `limit` of them: inside a fence, a `>` below the depth the fence was
 * written at is a character of code rather than a quote, which is what stops a
 * quoted fence mark in a code block from closing it.
 */
function unquote(
  line: string,
  limit: number
): { columns: number; depth: number; rest: string; outer: number } {
  let rest = line
  let columns = 0
  let depth = 0
  let outer = indentOf(line).columns

  while (depth < limit) {
    const { columns: indent, at } = indentOf(rest)
    if (indent > columns + 3 || rest[at] !== ">") break
    if (depth === 0) outer = indent

    columns = indent + 1
    depth += 1
    rest = rest.slice(at + 1)
    if (rest.startsWith(" ")) {
      rest = rest.slice(1)
      columns += 1
    }
  }

  return { columns, depth, rest, outer }
}

/** The paragraph a container opens when there is nothing after its marker. */
function emptyLeaf(at: number, quote: number, depth: number): Leaf {
  return { pieces: [{ at, text: "" }], quote, depth }
}

function mark(out: Spans, code: boolean, from: number, to: number): void {
  const span = { from, to }
  if (code) out.code.push(span)
  out.excluded.push(span)
}

/** Every span of `text` that a `#` in it would not be a tag in. */
export function spans(text: string): Spans {
  const out: Spans = { code: [], excluded: [] }
  const containers: Container[] = []
  let fence: Fence | null = null
  let html: HtmlBlock | null = null
  let leaf: Leaf | null = null
  let quotes = 0
  let at = 0

  const flush = (): void => {
    if (leaf !== null) inlineSpans(leaf.pieces, out)
    leaf = null
  }

  for (const line of text.split("\n")) {
    const start = at
    const lineTo = start + line.length
    at = lineTo + 1

    const quote = unquote(line, fence === null ? Number.MAX_SAFE_INTEGER : fence.quote)
    const measured = indentOf(quote.rest)
    let indent = quote.columns + measured.columns
    let content = quote.rest.slice(measured.at)
    let contentAt = start + (line.length - quote.rest.length) + measured.at

    const blank = content.trim() === ""

    // A fence reaches no further than whatever it was written inside: leaving
    // the quote or the list item closes it, wherever its own marks are.
    if (fence !== null) {
      if (holds(fence, quote.depth, indent, containers, blank)) {
        mark(out, true, start, lineTo)
        if (closes(fence, indent, content)) fence = null
        continue
      }
      fence = null
    }

    // Raw HTML is never read as markdown, so it holds nothing to record.
    if (html !== null) {
      if (htmlBlockEnds(html, line)) html = null
      continue
    }

    // A quote stays open under a line that lazily carries its paragraph on;
    // anything else closes it back to whatever this line marks.
    const opensQuote = quote.depth > quotes
    if (opensQuote || blank || leaf === null) quotes = quote.depth

    if (blank) {
      flush()
      // A quote marker with nothing after it still opens a paragraph, and the
      // line below carries on from there rather than starting something new.
      if (opensQuote) leaf = emptyLeaf(contentAt, quote.depth, containers.length)
      continue
    }

    // A quote opening under a paragraph opens a paragraph of its own, and a
    // link reference definition is a block that has already closed.
    if (leaf !== null && (quote.depth > leaf.quote || definitionsEndBefore(leaf, content))) flush()

    // A list item is continued by indentation, and a quote marker is not
    // indentation: a `>` written left of the item closes it rather than
    // opening a quote inside it.
    while (containers.length > 0) {
      const item = containers[containers.length - 1]
      const reaches = quote.depth > item.quote ? quote.outer : indent
      if (reaches >= item.indent) break
      containers.pop()
    }
    // Indent is measured from the start of the line, so the column a quote's
    // content begins at is where "not indented" is inside one.
    let base = containers.length > 0 ? containers[containers.length - 1].indent : quote.columns

    if (
      leaf !== null &&
      quote.depth === leaf.quote &&
      containers.length === leaf.depth &&
      indent < base + 4 &&
      setextUnderline(content)
    ) {
      // The paragraph and its underline are one heading — and the text of it
      // is still read for whatever it holds.
      out.excluded.push({ from: leaf.pieces[0].at, to: lineTo })
      flush()
      continue
    }

    // Peel off whatever this line opens before reading what it holds: a fence,
    // a divider, or the list markers a heading can then sit after.
    let opened = false
    for (;;) {
      if (indent >= base + 4) break

      const opening = fenceAt(content)
      if (opening !== null) {
        flush()
        fence = {
          mark: opening.mark,
          length: opening.length,
          indent,
          quote: quote.depth,
          depth: containers.length
        }
        mark(out, true, start, lineTo)
        opened = true
        break
      }

      if (thematicBreak(content)) {
        flush()
        opened = true
        break
      }

      const item = listMarker(content, indent, quote.depth)
      if (item === null) break
      if (leaf !== null && !canInterrupt(content, item.ordered, containers)) break

      flush()
      containers.push(item)
      base = item.indent

      const skip = Math.min(item.indent - indent, content.length)
      content = content.slice(skip)
      contentAt += skip

      const after = indentOf(content)
      indent = item.indent + after.columns
      content = content.slice(after.at)
      contentAt += after.at

      if (content === "") {
        // An item with nothing in it still opens a paragraph, the same way an
        // empty quote line does.
        leaf = emptyLeaf(contentAt, quote.depth, containers.length)
        opened = true
        break
      }
    }
    if (opened) continue

    if (indent < base + 4) {
      const heading = atxHeading(content)
      if (heading !== null) {
        flush()
        out.excluded.push({ from: contentAt, to: lineTo })
        const text = content.slice(heading.from, heading.to)
        inlineSpans([{ at: contentAt + heading.from, text }], out)
        continue
      }

      const opening = htmlBlockStart(content, leaf !== null)
      if (opening !== null) {
        flush()
        html = htmlBlockEnds(opening, line) ? null : opening
        continue
      }
    }

    // Indented code cannot interrupt a paragraph, which is what stops the
    // second line of a wrapped sentence from becoming a code block.
    if (leaf === null && indent >= base + 4) {
      mark(out, true, start, lineTo)
      continue
    }

    if (leaf === null) leaf = { pieces: [], quote: quote.depth, depth: containers.length }
    leaf.pieces.push({ at: contentAt, text: content })
  }

  flush()
  return out
}

// ---------------------------------------------------------------- inline ----

/** Takes one span of the joined text, to be mapped back to the note. */
type Take = (code: boolean, from: number, to: number) => void

/**
 * A paragraph read as the one run of text the parser reads it as.
 *
 * A link or a code span can open on one line and close on the next, so the
 * lines are joined before anything is looked for and the answers mapped back
 * to the note afterwards.
 */
function inlineSpans(pieces: readonly Piece[], out: Spans): void {
  const text = pieces.map((piece) => piece.text).join("\n")
  if (text === "") return

  // Where each character of the joined text sits in the note. A joining
  // newline takes the position of the line ending it stands for.
  const offsets: number[] = []
  for (let index = 0; index < pieces.length; index++) {
    if (index > 0) {
      const previous = pieces[index - 1]
      offsets.push(previous.at + previous.text.length)
    }
    for (let i = 0; i < pieces[index].text.length; i++) offsets.push(pieces[index].at + i)
  }

  const record: Take = (code, from, to) => {
    mark(out, code, offsets[from], offsets[to - 1] + 1)
  }

  // A paragraph opening with `[` may be a run of link reference definitions,
  // each one ending where its line does, before any prose starts.
  const found: Span[] = []
  const from = definitions(text, found)
  for (const definition of found) record(false, definition.from, definition.to)

  scan(text, from, record)
}

/**
 * The link reference definitions at the start of `text`, and where prose picks
 * up after them.
 */
function definitions(text: string, found: Span[]): number {
  let at = 0
  while (at < text.length && text[at] === "[") {
    const end = linkReferenceEnd(text, at)
    if (end === null) return at
    found.push({ from: at, to: end })
    if (end >= text.length) return text.length
    at = end + 1
  }
  return at
}

/**
 * Whether the paragraph so far is definitions that the line about to be read
 * falls outside of — in which case the block closed on the line before it.
 *
 * It takes the next line to answer, because a definition is only finished once
 * something that is not part of it turns up: a title on a line of its own still
 * belongs to the definition above.
 */
function definitionsEndBefore(leaf: Leaf, next: string): boolean {
  if (leaf.pieces[0].text[0] !== "[") return false

  const text = leaf.pieces.map((piece) => piece.text).join("\n") + "\n" + next
  const found: Span[] = []
  definitions(text, found)
  return found.length > 0 && found[found.length - 1].to < text.length
}

/** An open `[` or `![`, waiting for the `]` that would make it a link. */
interface Bracket {
  image: boolean
  from: number
  to: number
  valid: boolean
}

const ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"

function scan(text: string, from: number, record: Take): void {
  const open: Bracket[] = []
  let at = from

  while (at < text.length) {
    const ch = text[at]

    if (ch === "\\") {
      at += at + 1 < text.length && ESCAPABLE.includes(text[at + 1]) ? 2 : 1
      continue
    }

    if (ch === "`") {
      const end = codeSpanEnd(text, at)
      if (end !== null) {
        record(true, at, end)
        at = end
        continue
      }
      at++
      continue
    }

    if (ch === "<") {
      const end = angleAutolinkEnd(text, at)
      if (end !== null) {
        record(false, at, end)
        at = end
        continue
      }
      at++
      continue
    }

    if (ch === "[") {
      open.push({ image: false, from: at, to: at + 1, valid: true })
      at++
      continue
    }

    if (ch === "!" && text[at + 1] === "[") {
      open.push({ image: true, from: at, to: at + 2, valid: true })
      at += 2
      continue
    }

    if (ch === "]") {
      const closed = closeBracket(text, at, open, record)
      at = closed === null ? at + 1 : closed
      continue
    }

    const url = bareUrlEnd(text, at, open.length > 0)
    if (url !== null) {
      record(false, at, url)
      at = url
      continue
    }

    at++
  }
}

/**
 * A `]` closing the nearest open bracket, and where the link it makes ends.
 *
 * Only the nearest one is considered: where it has already been ruled out,
 * both it and this `]` are dropped rather than the search carrying on behind
 * it. A link that does close rules out every bracket still open behind it,
 * which is what stops links from nesting.
 */
function closeBracket(text: string, at: number, open: Bracket[], record: Take): number | null {
  const bracket = open[open.length - 1]
  if (bracket === undefined) return null

  const blank = skipSpace(text, bracket.to) === at
  if (!bracket.valid || (blank && text[at + 1] !== "(" && text[at + 1] !== "[")) {
    open.pop()
    return null
  }

  const end = linkEnd(text, at + 1)
  open.pop()
  record(false, bracket.from, end)
  // Links cannot nest, so closing one rules out every link still open behind
  // it. Images can: `[![alt](a.png)](b)` is a picture that is also a link.
  if (!bracket.image) {
    for (const earlier of open) if (!earlier.image) earlier.valid = false
  }
  return end
}

/** Where a link ends: past its `(destination "title")` or `[label]`, or at the `]`. */
function linkEnd(text: string, afterMark: number): number {
  const next = text[afterMark]

  if (next === "(") {
    let at = skipSpace(text, afterMark + 1)
    const destination = urlEnd(text, at)
    if (destination !== null) {
      at = skipSpace(text, destination)
      // A destination and a title have to be separated by whitespace.
      if (at !== destination) {
        const title = titleEnd(text, at)
        if (title !== null) at = skipSpace(text, title)
      }
    }
    return text[at] === ")" ? at + 1 : afterMark
  }

  if (next === "[") {
    const label = labelEnd(text, afterMark, false)
    if (label !== null) return label
  }

  return afterMark
}

/** A link destination: `<…>`, or a run with no whitespace and balanced parentheses. */
function urlEnd(text: string, from: number): number | null {
  if (text[from] === "<") {
    for (let at = from + 1; at < text.length; at++) {
      if (text[at] === ">") return at + 1
      if (text[at] === "<" || text[at] === "\n") return null
    }
    return null
  }

  let depth = 0
  let escaped = false
  let at = from
  for (; at < text.length; at++) {
    const ch = text[at]
    if (isSpace(ch)) break
    else if (escaped) escaped = false
    else if (ch === "(") depth++
    else if (ch === ")") {
      if (depth === 0) break
      depth--
    } else if (ch === "\\") escaped = true
  }
  return at > from ? at : null
}

/** A link title, quoted with `"`, `'` or parentheses. */
function titleEnd(text: string, from: number): number | null {
  const open = text[from]
  if (open !== "'" && open !== '"' && open !== "(") return null

  const close = open === "(" ? ")" : open
  let escaped = false
  for (let at = from + 1; at < text.length; at++) {
    const ch = text[at]
    if (escaped) escaped = false
    else if (ch === close) return at + 1
    else if (ch === "\\") escaped = true
  }
  return null
}

/** A `[label]`, which may hold no second `[` and may not run past 999 characters. */
function labelEnd(text: string, from: number, requireText: boolean): number | null {
  let wanted = requireText
  let escaped = false
  const limit = Math.min(text.length, from + 1000)

  for (let at = from + 1; at < limit; at++) {
    const ch = text[at]
    if (escaped) escaped = false
    else if (ch === "]") return wanted ? null : at + 1
    else {
      if (wanted && !isSpace(ch)) wanted = false
      if (ch === "[") return null
      if (ch === "\\") escaped = true
    }
  }
  return null
}

/**
 * `[label]: destination "title"` — a definition rather than prose, reaching to
 * the end of whichever line the destination or the title finished on.
 */
function linkReferenceEnd(text: string, from: number): number | null {
  const label = labelEnd(text, from, true)
  if (label === null || text[label] !== ":") return null

  const destination = urlEnd(text, skipSpace(text, label + 1))
  if (destination === null) return null

  const afterSpace = skipSpace(text, destination)
  if (afterSpace > destination) {
    const title = titleEnd(text, afterSpace)
    if (title !== null) {
      const end = restOfLine(text, title)
      if (end !== null) return end
    }
  }
  return restOfLine(text, destination)
}

/** The end of the line `from` sits on, when nothing but whitespace is left of it. */
function restOfLine(text: string, from: number): number | null {
  for (let at = from; at < text.length; at++) {
    if (text[at] === "\n") return at
    if (!isSpace(text[at])) return null
  }
  return text.length
}

/** A code span: a run of backticks closed by a run of exactly the same length. */
function codeSpanEnd(text: string, from: number): number | null {
  if (from > 0 && text[from - 1] === "`") return null

  let at = from + 1
  while (at < text.length && text[at] === "`") at++
  const size = at - from

  let seen = 0
  for (; at < text.length; at++) {
    if (text[at] !== "`") {
      seen = 0
      continue
    }
    seen++
    if (seen === size && text[at + 1] !== "`") return at + 1
  }
  return null
}

// -------------------------------------------------------------- autolinks ---

/** `<scheme:…>` or `<someone@example.com>`. */
function angleAutolinkEnd(text: string, from: number): number | null {
  const scheme = schemeUrlEnd(text, from + 1)
  if (scheme !== null) return scheme

  const local = run(text, from + 1, isEmailLocal)
  if (local === from + 1 || text[local] !== "@") return null

  let at = local + 1
  for (;;) {
    const label = hostLabelEnd(text, at)
    if (label === null) return null
    at = label
    if (text[at] !== ".") break
    at++
  }
  return text[at] === ">" ? at + 1 : null
}

function isEmailLocal(ch: string): boolean {
  return isAlphanumeric(ch) || ".!#$%&'*+/=?^_`{|}~-".includes(ch)
}

/** `scheme:` — a letter, then letters, digits, `+`, `-`, `_` or `.` — then a run to `>`. */
function schemeUrlEnd(text: string, from: number): number | null {
  if (from >= text.length || !isLetter(text[from])) return null

  const scheme = run(text, from + 1, (ch) => isWord(ch) || ch === "+" || ch === "." || ch === "-")
  if (scheme === from + 1 || text[scheme] !== ":") return null

  const end = run(text, scheme + 1, (ch) => !isSpace(ch) && ch !== ">")
  return end > scheme + 1 && text[end] === ">" ? end + 1 : null
}

/** One dot-separated part of a host: alphanumeric at both ends, at most 63 long. */
function hostLabelEnd(text: string, from: number): number | null {
  if (from >= text.length || !isAlphanumeric(text[from])) return null

  let at = run(text, from, (ch) => isAlphanumeric(ch) || ch === "-")
  while (at > from && text[at - 1] === "-") at--
  return at - from <= 63 ? at : null
}

/**
 * A URL written with no markup around it, which GitHub-flavoured markdown
 * links on sight — `www.`, `http://`, `https://`, `mailto:`, `xmpp:`, and a
 * bare email address. Never in the middle of a word.
 */
function bareUrlEnd(text: string, from: number, insideLink: boolean): number | null {
  if (from > 0 && isWord(text[from - 1])) return null

  for (const prefix of ["www.", "http://", "https://"]) {
    if (text.startsWith(prefix, from)) {
      return hostUrlEnd(text, from, from + prefix.length, insideLink)
    }
  }

  const local = run(text, from, isEmailBody)
  if (local > from && local - from <= 100 && text[local] === "@") return emailEnd(text, from)

  if (text.startsWith("mailto:", from)) return emailEnd(text, from + 7)
  if (text.startsWith("xmpp:", from)) {
    const end = emailEnd(text, from + 5)
    if (end === null) return null
    const resource = run(text, end + 1, (ch) => isAlphanumeric(ch) || ch === "@" || ch === ".")
    return text[end] === "/" && resource > end + 1 ? resource : end
  }

  return null
}

function isEmailBody(ch: string): boolean {
  return isWord(ch) || ch === "." || ch === "+" || ch === "-"
}

function isHostBody(ch: string): boolean {
  return isWord(ch) || ch === "-"
}

/**
 * How far a bare `www.`/`http://` URL reaches: a dotted host and an optional
 * path, less whatever punctuation at the end reads as the sentence's rather
 * than the URL's.
 */
function hostUrlEnd(text: string, url: number, host: number, insideLink: boolean): number | null {
  let at = run(text, host, isHostBody)
  if (at === host) return null

  let dots = 0
  while (text[at] === "." && at + 1 < text.length && isHostBody(text[at + 1])) {
    at = run(text, at + 1, isHostBody)
    dots++
  }
  if (dots === 0) return null

  // An underscore in either of the last two parts of the host means it is not
  // one, and the parser leaves the whole thing as prose.
  if (lastTwoHostParts(text.slice(host, at)).includes("_")) return null

  if (text[at] === "/") at = run(text, at + 1, (ch) => !isSpace(ch) && ch !== "<")

  let end = trimSentence(text, host, at)
  if (insideLink) end = host + unbracketedLength(text.slice(host, end))
  return end > url ? end : null
}

/** The last two dot-separated parts of a host, which are the ones that must be plain. */
function lastTwoHostParts(host: string): string {
  return host.split(".").slice(-2).join(".")
}

/** Drops the trailing characters that belong to the sentence rather than the URL. */
function trimSentence(text: string, from: number, to: number): number {
  let end = to

  for (;;) {
    const last = text[end - 1]

    if ("?!.,:*_~".includes(last)) {
      end--
      continue
    }

    if (last === ")" && count(text, from, end, ")") > count(text, from, end, "(")) {
      end--
      continue
    }

    if (last === ";") {
      const entity = entityStart(text, from, end)
      if (entity !== null) {
        end = entity
        continue
      }
    }

    return end
  }
}

/** Where a trailing `&…;` entity begins, so that a URL does not swallow one. */
function entityStart(text: string, from: number, end: number): number | null {
  const at = text.lastIndexOf("&", end - 1)
  if (at < from) return null

  const body = text.slice(at + 1, end - 1)
  if (body === "") return null

  if (body[0] === "#") {
    const digits = body.slice(body[1] === "x" ? 2 : 1)
    const hex = body[1] === "x"
    if (digits === "") return null
    return [...digits].every((ch) => (hex ? isHexDigit(ch) : isDigit(ch))) ? at : null
  }
  return [...body].every(isWord) ? at : null
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= "a" && ch <= "f")
}

function count(text: string, from: number, to: number, ch: string): number {
  let seen = 0
  for (let at = from; at < to; at++) if (text[at] === ch) seen++
  return seen
}

/**
 * How much of a URL inside an unclosed link is still the URL: a `[` or `]`
 * that does not pair off belongs to the link around it.
 */
function unbracketedLength(url: string): number {
  let at = 0
  while (at < url.length) {
    if (url[at] === "]") break
    if (url[at] === "[") {
      const close = url.indexOf("]", at + 1)
      if (close < 0) break
      at = close + 1
    } else at++
  }
  return at
}

/** An email address, less a trailing dot, and refused outright on a trailing `_` or `-`. */
function emailEnd(text: string, from: number): number | null {
  const local = run(text, from, isEmailBody)
  if (local === from || text[local] !== "@") return null

  const host = run(text, local + 1, isHostBody)
  if (host === local + 1 || text[host] !== ".") return null

  const end = run(text, host + 1, (ch) => isWord(ch) || ch === "." || ch === "-")
  if (end === host + 1) return null

  const last = text[end - 1]
  if (last === "_" || last === "-") return null
  return last === "." ? end - 1 : end
}
