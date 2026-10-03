import { describe, it, expect } from "vitest"
import { mergeThreeWay } from "./merge"

const lines = (...text: string[]) => text.join("\n")

describe("when one side never moved", () => {
  it("takes the other, without looking at anything", () => {
    expect(mergeThreeWay("a\nb", "a\nb", "a\nB")).toBe("a\nB")
    expect(mergeThreeWay("a\nb", "A\nb", "a\nb")).toBe("A\nb")
  })

  it("takes either when both made the same edit", () => {
    expect(mergeThreeWay("a\nb", "a\nB", "a\nB")).toBe("a\nB")
  })

  it("leaves text alone when nobody moved at all", () => {
    expect(mergeThreeWay("a\nb", "a\nb", "a\nb")).toBe("a\nb")
  })
})

describe("edits in different places", () => {
  it("keeps both", () => {
    const base = lines("one", "two", "three", "four")
    const ours = lines("ONE", "two", "three", "four")
    const theirs = lines("one", "two", "three", "FOUR")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("ONE", "two", "three", "FOUR"))
  })

  it("keeps a line each side added in a different place", () => {
    const base = lines("one", "two")
    const ours = lines("start", "one", "two")
    const theirs = lines("one", "two", "end")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("start", "one", "two", "end"))
  })

  it("keeps a deletion from one side and an edit from the other", () => {
    const base = lines("one", "two", "three")
    const ours = lines("one", "three")
    const theirs = lines("one", "two", "THREE")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("one", "THREE"))
  })

  it("merges into an empty base", () => {
    expect(mergeThreeWay("", "ours", "")).toBe("ours")
    expect(mergeThreeWay("", "", "theirs")).toBe("theirs")
  })
})

describe("edits in the same place", () => {
  /*
   * The whole reason this returns null rather than a text with markers in it.
   * `docs/SYNC.md` settles a real conflict by keeping both notes, one as a
   * copy — a marker left in a file is a note that silently stopped being prose.
   */
  it("declines when both rewrote the same line differently", () => {
    expect(mergeThreeWay("a\nb\nc", "a\nOURS\nc", "a\nTHEIRS\nc")).toBeNull()
  })

  it("declines when one rewrote a line and the other removed it", () => {
    expect(mergeThreeWay("a\nb\nc", "a\nOURS\nc", "a\nc")).toBeNull()
  })

  it("declines when both added a different line in the same gap", () => {
    expect(mergeThreeWay("a\nc", "a\nOURS\nc", "a\nTHEIRS\nc")).toBeNull()
  })

  it("accepts when both added the same line in the same gap", () => {
    expect(mergeThreeWay("a\nc", "a\nb\nc", "a\nb\nc")).toBe("a\nb\nc")
  })
})

describe("edits that meet without arguing", () => {
  /*
   * An insertion at the edge of somebody else's replacement is next to the
   * change rather than inside it. Calling that a conflict would split a note in
   * two over a paragraph added right after an edited line.
   */
  it("keeps a line added right where another was removed", () => {
    const base = lines("one", "two")
    const ours = lines("one")
    const theirs = lines("one", "two", "three")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("one", "three"))
  })

  /*
   * Both sides made the same change, and one of them also made another. The
   * shared edit has to be applied once — twice would quietly duplicate a line
   * neither of them wrote twice.
   */
  it("applies a change both sides made exactly once", () => {
    const base = lines("a", "b", "c")
    const ours = lines("A", "b", "C")
    const theirs = lines("A", "b", "c")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("A", "b", "C"))
  })

  /*
   * Ours either side of theirs. Applied in the order they arrive rather than
   * the order they sit in, the middle one lands past the end and takes its
   * removed lines with it — a quiet corruption that still returns a string.
   */
  it("applies edits in the order of the text, not the order of the sides", () => {
    const base = lines("one", "two", "three", "four", "five", "six")
    const ours = lines("ONE", "two", "three", "four", "FIVE", "six")
    const theirs = lines("one", "two", "THREE", "four", "five", "six")

    expect(mergeThreeWay(base, ours, theirs)).toBe(
      lines("ONE", "two", "THREE", "four", "FIVE", "six")
    )
  })

  it("keeps edits far apart in a long note", () => {
    const base = lines(...Array.from({ length: 20 }, (_, at) => `line ${at}`))
    const ours = base.replace("line 2", "LINE TWO")
    const theirs = base.replace("line 17", "LINE SEVENTEEN")

    expect(mergeThreeWay(base, ours, theirs)).toBe(
      base.replace("line 2", "LINE TWO").replace("line 17", "LINE SEVENTEEN")
    )
  })
})

describe("the shape of a note rather than a line", () => {
  it("merges two paragraphs added at opposite ends of a real note", () => {
    const base = lines("# Slow Morning", "", "Coffee. Empty streets.", "")
    const ours = lines(
      "# Slow Morning",
      "",
      "A note from the desk.",
      "",
      "Coffee. Empty streets.",
      ""
    )
    const theirs = lines(
      "# Slow Morning",
      "",
      "Coffee. Empty streets.",
      "",
      "Later: it rained.",
      ""
    )

    expect(mergeThreeWay(base, ours, theirs)).toBe(
      lines(
        "# Slow Morning",
        "",
        "A note from the desk.",
        "",
        "Coffee. Empty streets.",
        "",
        "Later: it rained.",
        ""
      )
    )
  })

  /*
   * Blank lines repeat, so they are poor anchors — a merge that trusted them
   * would stitch two paragraphs together at the wrong seam.
   */
  it("does not anchor on a blank line it cannot tell from another", () => {
    const base = lines("one", "", "two", "", "three")
    const ours = lines("one", "", "TWO", "", "three")
    const theirs = lines("one", "", "two", "", "THREE")

    expect(mergeThreeWay(base, ours, theirs)).toBe(lines("one", "", "TWO", "", "THREE"))
  })

  it("keeps the trailing blank line a note ends with", () => {
    expect(mergeThreeWay("a\n", "a\nb\n", "a\n")).toBe("a\nb\n")
  })
})

describe("line endings", () => {
  /*
   * A note edited on Windows and one edited here must not read as two edits to
   * every line. Normalised before anything is compared, and `\n` comes back,
   * which is what the editor writes anyway.
   */
  it("reads CRLF and LF as the same text", () => {
    expect(mergeThreeWay("a\r\nb", "a\r\nB", "a\nb")).toBe("a\nB")
    expect(mergeThreeWay("a\nb", "a\r\nb", "a\nb")).toBe("a\nb")
  })

  /*
   * The case above is answered before any merging happens, because one side
   * matches the base once the endings are normalised. This one reaches the
   * walk, where the base is sliced for the lines neither side touched — and a
   * base split without normalising carries a stray carriage return into the
   * middle of the result.
   */
  it("does not carry a carriage return out of an untouched line", () => {
    expect(mergeThreeWay("a\r\nb\r\nc", "A\r\nb\r\nc", "a\r\nb\r\nC")).toBe("A\nb\nC")
  })
})
