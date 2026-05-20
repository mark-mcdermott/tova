import { describe, it, expect } from "vitest"
import { countWords } from "./wordCount"

describe("countWords", () => {
  it("returns 0 for empty string", () => expect(countWords("")).toBe(0))
  it("returns 0 for whitespace only", () => expect(countWords("   ")).toBe(0))
  it("counts single word", () => expect(countWords("hello")).toBe(1))
  it("counts multiple words", () => expect(countWords("hello world foo")).toBe(3))
  it("handles extra whitespace", () => expect(countWords("  hello   world")).toBe(2))
})