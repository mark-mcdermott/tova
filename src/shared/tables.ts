/**
 * GFM tables, read and laid out.
 *
 * Here rather than in the editor extension because none of it needs a
 * CodeMirror to be true, and because the alignment is the part with the edge
 * cases — escaped pipes, outer pipes that may or may not be there, rows that
 * do not agree with the header about how many columns there are.
 *
 * Laying the source out is how Tova renders a table at all. Every other
 * construct is drawn with decorations over the text; a table wants a grid, and
 * decorations paint runs of text rather than arrange them. The body font is
 * monospace, so padding the cells with real spaces is the whole of it — and it
 * leaves a table that is still text, still editable in place, and still a table
 * to anything that reads the file afterwards.
 */

/** Which side a column is read from, or null when it does not say. */
export type Alignment = "left" | "center" | "right" | null

export type Table = {
  /** Header first, then the body. The delimiter row is not one of these. */
  rows: string[][]
  alignments: Alignment[]
}

/** A delimiter cell: dashes, with a colon allowed at either end. */
const DELIMITER_CELL = /^:?-+:?$/

/**
 * Splits a row into its cells.
 *
 * Hand-written rather than `split("|")` because an escaped pipe is content: a
 * cell reading `one \| two` is one cell, and splitting on every pipe cuts it in
 * half and shifts every column after it along by one.
 */
function cells(line: string): string[] {
  const found: string[] = []
  let cell = ""

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cell += "\\|"
      i += 1
      continue
    }
    if (line[i] === "|") {
      found.push(cell)
      cell = ""
      continue
    }
    cell += line[i]
  }
  found.push(cell)

  // The outer pipes are optional, and leave an empty cell at each end when
  // they are there. Dropped either way, so both spellings read the same.
  if (found.length > 1 && found[0].trim() === "") found.shift()
  if (found.length > 1 && found[found.length - 1].trim() === "") found.pop()

  return found.map((text) => text.trim())
}

/** Whether a line is a table's delimiter row rather than a row of content. */
export function isDelimiterRow(line: string): boolean {
  const found = cells(line)
  return found.length > 0 && found.every((cell) => DELIMITER_CELL.test(cell))
}

function alignmentOf(cell: string): Alignment {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  if (left && right) return "center"
  if (left) return "left"
  if (right) return "right"
  return null
}

/**
 * The table these lines make, or null if they do not make one.
 *
 * A header, a delimiter agreeing with it about the column count, and any
 * number of rows. GFM pads a short row and truncates a long one rather than
 * refusing it, so the rows that come back are all the same width.
 */
export function parseTable(lines: string[]): Table | null {
  if (lines.length < 2) return null

  const header = cells(lines[0])
  if (!isDelimiterRow(lines[1])) return null

  const delimiters = cells(lines[1])
  if (delimiters.length !== header.length) return null

  const width = header.length
  const body = lines.slice(2).map((line) => {
    const row = cells(line).slice(0, width)
    while (row.length < width) row.push("")
    return row
  })

  return { rows: [header, ...body], alignments: delimiters.map(alignmentOf) }
}

/** What a cell occupies on screen, in a monospace font. */
function width(cell: string): number {
  return [...cell].length
}

/** The dashes for one column, keeping whichever markers it came in with. */
function delimiterFor(alignment: Alignment, to: number): string {
  if (alignment === "center") return `:${"-".repeat(Math.max(1, to - 2))}:`
  if (alignment === "left") return `:${"-".repeat(Math.max(1, to - 1))}`
  if (alignment === "right") return `${"-".repeat(Math.max(1, to - 1))}:`
  return "-".repeat(Math.max(3, to))
}

/**
 * The same table with its cells padded so the pipes line up.
 *
 * Idempotent: running it on its own output changes nothing, which is what lets
 * it run whenever the cursor leaves a table without the document drifting.
 * Lines that are not a table come back untouched.
 */
export function alignTable(lines: string[]): string[] {
  const table = parseTable(lines)
  if (table === null) return lines

  const columns = table.rows[0].length
  const widths = Array.from({ length: columns }, (_, column) =>
    // Three is the floor a delimiter needs to still read as one.
    Math.max(3, ...table.rows.map((row) => width(row[column])))
  )

  const row = (values: string[]) =>
    `| ${values.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`

  const [header, ...body] = table.rows
  return [
    row(header),
    `| ${table.alignments.map((alignment, column) => delimiterFor(alignment, widths[column])).join(" | ")} |`,
    ...body.map(row)
  ]
}
