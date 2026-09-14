/**
 * Which parts of a note are code.
 *
 * Tags inside code are not tags. The editor gets this from its syntax tree and
 * draws no pill inside a fence; everything that has no parser — the Rust, and
 * `allTags` here — needs the rule written out. `conformance/tags.json` is
 * generated from the editor's own parser and holds all three to one answer.
 *
 * A port in both directions with `src-tauri/src/markdown_code.rs`. What it
 * knows: fenced code, indented code, and code spans. What it does not: a code
 * span running across a line break.
 */

export interface CodeRange {
  from: number
  to: number
}

interface Fence {
  mark: string
  length: number
  indent: number
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
  return length >= 3 ? { mark, length } : null
}

/** Whether this line closes `open`: the same mark, at least as long, nothing after. */
function closes(open: Fence, indent: number, content: string): boolean {
  if (indent > open.indent + 3) return false

  const fence = fenceAt(content)
  if (fence === null || fence.mark !== open.mark || fence.length < open.length) return false
  return content.slice(fence.length).trim() === ""
}

/** The content indent of a list item opened by this line, if it opens one. */
function listMarker(content: string, indent: number): number | null {
  const first = content[0]
  let after: number

  if (first === "-" || first === "*" || first === "+") after = 1
  else if (first >= "0" && first <= "9") {
    let digits = 0
    while (content[digits] >= "0" && content[digits] <= "9") digits++
    // CommonMark allows nine digits, then `.` or `)`.
    if (digits > 9) return null
    const delimiter = content[digits]
    if (delimiter !== "." && delimiter !== ")") return null
    after = digits + 1
  } else return null

  let spaces = 0
  while (content[after + spaces] === " ") spaces++

  // `-` on its own opens an item whose content is empty.
  if (spaces === 0) return content.length === after ? indent + after + 1 : null

  // More than four spaces is an indented code block inside the item, which
  // still starts the item's content one space past the marker.
  return indent + after + (spaces > 4 ? 1 : spaces)
}

/** Strips any `>` quote markers, returning what is left and its column. */
function unquote(line: string): { columns: number; rest: string } {
  let rest = line
  let columns = 0

  for (;;) {
    const { columns: indent, at } = indentOf(rest)
    if (indent > columns + 3 || rest[at] !== ">") return { columns, rest }

    columns = indent + 1
    rest = rest.slice(at + 1)
    if (rest.startsWith(" ")) {
      rest = rest.slice(1)
      columns += 1
    }
  }
}

/** Code spans on one line: a run of backticks closed by a run of the same length. */
function spansIn(line: string, offset: number, found: CodeRange[]): void {
  let at = 0

  while (at < line.length) {
    if (line[at] !== "`") {
      at++
      continue
    }

    let open = 0
    while (line[at + open] === "`") open++

    let scan = at + open
    while (scan < line.length) {
      if (line[scan] !== "`") {
        scan++
        continue
      }
      let close = 0
      while (line[scan + close] === "`") close++
      if (close === open) {
        found.push({ from: offset + at, to: offset + scan + close })
        break
      }
      scan += close
    }

    at = scan < line.length ? scan + open : line.length
  }
}

/** Every range of `text` that is code. */
export function codeRanges(text: string): CodeRange[] {
  const found: CodeRange[] = []
  const containers: number[] = []
  let fence: Fence | null = null
  let paragraph = false
  let at = 0

  for (const line of text.split("\n")) {
    const start = at
    at += line.length + 1

    const { columns: quoted, rest } = unquote(line)
    const { columns, at: contentAt } = indentOf(rest)
    const indent = columns + quoted
    const content = rest.slice(contentAt)
    const contentStart = start + (line.length - rest.length) + contentAt

    if (fence !== null) {
      found.push({ from: start, to: start + line.length })
      if (closes(fence, indent, content)) fence = null
      continue
    }

    if (content.trim() === "") {
      paragraph = false
      continue
    }

    while (containers.length > 0 && indent < containers[containers.length - 1]) containers.pop()
    const base = containers.length > 0 ? containers[containers.length - 1] : 0

    if (indent < base + 4) {
      const opening = fenceAt(content)
      if (opening !== null) {
        fence = { mark: opening.mark, length: opening.length, indent }
        found.push({ from: start, to: start + line.length })
        paragraph = false
        continue
      }

      const inner = listMarker(content, indent)
      if (inner !== null) {
        containers.push(inner)
        paragraph = true
        // The item's own first line may still hold a code span.
        spansIn(content, contentStart, found)
        continue
      }
    }

    // Indented code cannot interrupt a paragraph, which is what stops the
    // second line of a wrapped sentence from becoming a code block.
    if (indent >= base + 4 && !paragraph) {
      found.push({ from: start, to: start + line.length })
      continue
    }

    paragraph = true
    spansIn(content, contentStart, found)
  }

  return found
}

/** Whether the character at `offset` is inside code. */
export function inCode(ranges: readonly CodeRange[], offset: number): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to)
}
