import { describe, it, expect } from "vitest"
import { countWords } from "./wordCount"

describe("countWords", () => {
  it("returns 0 for empty string", () => expect(countWords("")).toBe(0))
  it("returns 0 for whitespace only", () => expect(countWords("   ")).toBe(0))
  it("counts single word", () => expect(countWords("hello")).toBe(1))
  it("counts multiple words", () => expect(countWords("hello world foo")).toBe(3))
  it("handles extra whitespace", () => expect(countWords("  hello   world")).toBe(2))
})

/*
 * It used to be `trim().split(/\s+/).length`. These are the cases where a
 * hand-written scan could differ from the regex it replaced — JavaScript's
 * `\s` is a particular set, and the whole point of the change is that the
 * answer does not move.
 */
describe("counting without building a list of the words", () => {
  it("agrees with the regex it replaced", () => {
    const split = (text: string): number =>
      text.trim() === "" ? 0 : text.trim().split(/\s+/).length

    for (const text of [
      "",
      "   ",
      "hello",
      "hello world foo",
      "  hello   world  ",
      "tabs\tand\nnewlines\r\nbetween",
      "non\u00a0breaking\u00a0spaces",
      "an\u2003em space and\u2009a thin one",
      "a zero width\ufeffspace",
      "trailing punctuation, and \u2014 dashes",
      "Caf\u00e9 \u2014 na\u00efve, \ud83d\ude42 emoji",
      "one\u2028line\u2029separators",
      "ideographic\u3000space"
    ]) {
      expect(countWords(text), JSON.stringify(text)).toBe(split(text))
    }
  })

  /*
   * U+0085 is whitespace to Unicode and not to JavaScript, so it sits inside a
   * word here. Pinned because it is the one the two disagree about, and a
   * scan written from memory of "whitespace" would get it wrong.
   */
  it("treats U+0085 the way JavaScript does, not the way Unicode does", () => {
    expect(countWords("one\u0085two")).toBe(1)
  })

  it("counts a long document without building one", () => {
    const doc = "The quick brown fox jumps over the lazy dog. ".repeat(1000)

    expect(countWords(doc)).toBe(9000)
  })
})
