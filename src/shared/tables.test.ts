import { describe, it, expect } from "vitest"
import { parseTable, alignTable, isDelimiterRow } from "./tables"

/** A table as lines, written the way someone types it. */
const RAGGED = [
  "| Note | Words | Blog |",
  "| --- | --- | --- |",
  "| Avalanche season | 1840 | yes |"
]

describe("reading a table", () => {
  it("takes the header, the alignments and the rows", () => {
    const table = parseTable(RAGGED)

    expect(table?.rows).toEqual([
      ["Note", "Words", "Blog"],
      ["Avalanche season", "1840", "yes"]
    ])
    expect(table?.alignments).toEqual([null, null, null])
  })

  it("reads the three alignment markers", () => {
    const table = parseTable([
      "| a | b | c | d |",
      "| :-- | --: | :-: | --- |",
      "| 1 | 2 | 3 | 4 |"
    ])

    expect(table?.alignments).toEqual(["left", "right", "center", null])
  })

  /*
   * GFM lets the outer pipes go. A row written without them is the same row,
   * and a table whose header drops them is still a table.
   */
  it("does not require the outer pipes", () => {
    const table = parseTable(["Note | Words", "--- | ---", "Avalanche | 1840"])

    expect(table?.rows).toEqual([
      ["Note", "Words"],
      ["Avalanche", "1840"]
    ])
  })

  /*
   * An escaped pipe is content. Splitting on every `|` would cut this cell in
   * half and shift every column after it along by one.
   */
  it("keeps an escaped pipe inside its cell", () => {
    const table = parseTable(["| a | b |", "| --- | --- |", String.raw`| one \| two | three |`])

    expect(table?.rows[1]).toEqual([String.raw`one \| two`, "three"])
  })

  it("pads a short row and truncates a long one, as GFM says", () => {
    const table = parseTable(["| a | b | c |", "| --- | --- | --- |", "| 1 |", "| 1 | 2 | 3 | 4 |"])

    expect(table?.rows[1]).toEqual(["1", "", ""])
    expect(table?.rows[2]).toEqual(["1", "2", "3"])
  })

  it("is not a table without a delimiter row", () => {
    expect(parseTable(["| a | b |", "| 1 | 2 |"])).toBeNull()
  })

  /*
   * The delimiter has to agree with the header about how many columns there
   * are, or GFM does not call it a table at all — it is a paragraph that
   * happens to contain pipes.
   */
  it("is not a table when the delimiter disagrees about the columns", () => {
    expect(parseTable(["| a | b | c |", "| --- | --- |", "| 1 | 2 | 3 |"])).toBeNull()
  })

  it("is not a table on its own", () => {
    expect(parseTable(["| a | b |"])).toBeNull()
  })

  it("knows a delimiter row from a row that merely has dashes in it", () => {
    expect(isDelimiterRow("| --- | :-: |")).toBe(true)
    expect(isDelimiterRow("| -- an aside -- | x |")).toBe(false)
    expect(isDelimiterRow("| 1 | 2 |")).toBe(false)
  })
})

describe("aligning a table", () => {
  it("pads every cell to its column", () => {
    expect(alignTable(RAGGED)).toEqual([
      "| Note             | Words | Blog |",
      "| ---------------- | ----- | ---- |",
      "| Avalanche season | 1840  | yes  |"
    ])
  })

  it("leaves an aligned table exactly as it is", () => {
    const once = alignTable(RAGGED)

    expect(alignTable(once)).toEqual(once)
  })

  /*
   * The markers survive, and they say which side a column is read from — so
   * they have to end up on the right end of the dashes they came in on.
   */
  it("keeps the alignment markers at their ends", () => {
    expect(alignTable(["| a | b | c |", "| :-- | --: | :-: |", "| 1 | 2 | 3 |"])).toEqual([
      "| a   | b   | c   |",
      "| :-- | --: | :-: |",
      "| 1   | 2   | 3   |"
    ])
  })

  it("widens the dashes to the column, keeping a marker at each end", () => {
    expect(alignTable(["| name | n |", "| :-- | --: |", "| Avalanche | 1840 |"])).toEqual([
      "| name      | n    |",
      "| :-------- | ---: |",
      "| Avalanche | 1840 |"
    ])
  })

  it("fills a short row out to the header's columns", () => {
    expect(alignTable(["| a | b |", "| --- | --- |", "| 1 |"])).toEqual([
      "| a   | b   |",
      "| --- | --- |",
      "| 1   |     |"
    ])
  })

  it("gives the outer pipes back to a table written without them", () => {
    expect(alignTable(["a | b", "--- | ---", "1 | 2"])).toEqual([
      "| a   | b   |",
      "| --- | --- |",
      "| 1   | 2   |"
    ])
  })

  it("counts an escaped pipe as the two characters it is written with", () => {
    const aligned = alignTable(["| a | b |", "| --- | --- |", String.raw`| one \| two | x |`])

    // Every line the same length is the whole point; a cell measured wrongly
    // shows up as one row's pipes sitting out of step with the rest.
    expect(new Set(aligned.map((line) => line.length)).size).toBe(1)
  })

  it("hands back what it was given when the lines are not a table", () => {
    const notATable = ["| a | b |", "| 1 | 2 |"]

    expect(alignTable(notATable)).toEqual(notATable)
  })
})
