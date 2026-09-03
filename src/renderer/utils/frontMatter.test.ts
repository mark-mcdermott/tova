import { describe, it, expect } from "vitest"
import { parseFrontMatter, serializeFrontMatter } from "./frontMatter"

describe("parseFrontMatter", () => {
  it("returns the whole document as body when there is no front matter", () => {
    expect(parseFrontMatter("# Just a note")).toEqual({ data: {}, body: "# Just a note" })
  })

  it("parses flat key/value pairs", () => {
    const { data, body } = parseFrontMatter("---\nsection: Notes\nfolder: work\n---\n\nHello")
    expect(data).toEqual({ section: "Notes", folder: "work" })
    expect(body).toBe("Hello")
  })

  it("parses inline arrays", () => {
    const { data } = parseFrontMatter("---\ntags: [a, b, c]\n---\n")
    expect(data.tags).toEqual(["a", "b", "c"])
  })

  it("parses an empty array", () => {
    expect(parseFrontMatter("---\ntags: []\n---\n").data.tags).toEqual([])
  })

  it("strips surrounding quotes", () => {
    expect(parseFrontMatter('---\ntitle: "Hello: World"\n---\n').data.title).toBe("Hello: World")
  })

  it("treats unterminated front matter as body", () => {
    const raw = "---\nsection: Notes\n"
    expect(parseFrontMatter(raw)).toEqual({ data: {}, body: raw })
  })

  it("ignores front matter that does not start on line one", () => {
    const raw = "text\n---\nsection: Notes\n---\n"
    expect(parseFrontMatter(raw).data).toEqual({})
  })

  it("normalizes CRLF line endings", () => {
    expect(parseFrontMatter("---\r\nsection: Notes\r\n---\r\n\r\nBody").body).toBe("Body")
  })

  it("keeps a body containing its own --- separator", () => {
    const { body } = parseFrontMatter("---\nsection: Notes\n---\n\nabove\n\n---\n\nbelow")
    expect(body).toBe("above\n\n---\n\nbelow")
  })
})

describe("serializeFrontMatter", () => {
  it("returns the body unchanged when there is no data", () => {
    expect(serializeFrontMatter({}, "Hello")).toBe("Hello")
  })

  it("round-trips through parseFrontMatter", () => {
    const data = { section: "Notes", folder: "work", tags: ["a", "b"] }
    const parsed = parseFrontMatter(serializeFrontMatter(data, "Body text"))
    expect(parsed.data).toEqual(data)
    expect(parsed.body).toBe("Body text")
  })

  it("quotes values that would otherwise break the parse", () => {
    const round = parseFrontMatter(serializeFrontMatter({ title: "Hello: World" }, ""))
    expect(round.data.title).toBe("Hello: World")
  })
})
