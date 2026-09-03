import { describe, it, expect } from "vitest"
import { slugify, uniqueSlug } from "./noteName"

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Project River")).toBe("project-river")
  })

  it("strips punctuation", () => {
    expect(slugify("What's next?!")).toBe("whats-next")
  })

  it("collapses runs of separators", () => {
    expect(slugify("a   ---   b")).toBe("a-b")
  })

  it("trims leading and trailing separators", () => {
    expect(slugify("  --hello--  ")).toBe("hello")
  })

  it("folds accents to ascii", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu")
  })

  it("falls back to untitled for an empty title", () => {
    expect(slugify("")).toBe("untitled")
  })

  it("falls back to untitled when nothing survives", () => {
    expect(slugify("!!! ???")).toBe("untitled")
  })

  it("caps length without leaving a trailing hyphen", () => {
    const slug = slugify("word ".repeat(40))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith("-")).toBe(false)
  })
})

describe("uniqueSlug", () => {
  it("keeps the candidate when it is free", () => {
    expect(uniqueSlug("river", [])).toBe("river")
  })

  it("appends -2 on the first collision", () => {
    expect(uniqueSlug("river", ["river"])).toBe("river-2")
  })

  it("skips past every taken suffix", () => {
    expect(uniqueSlug("river", ["river", "river-2", "river-3"])).toBe("river-4")
  })

  it("ignores unrelated names", () => {
    expect(uniqueSlug("river", ["ocean", "lake"])).toBe("river")
  })
})
