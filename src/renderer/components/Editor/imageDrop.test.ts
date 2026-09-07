import { describe, it, expect } from "vitest"
import { altTextFor, composeInsertion } from "./imageDrop"

describe("altTextFor", () => {
  it("drops the extension", () => {
    expect(altTextFor("river bend.png")).toBe("river bend")
  })

  it("strips brackets that would break the link", () => {
    expect(altTextFor("shot [final].jpg")).toBe("shot final")
  })
})

describe("composeInsertion", () => {
  it("drops straight in on an empty line", () => {
    expect(composeInsertion(["![a](../assets/a.png)"], "")).toBe("![a](../assets/a.png)\n")
  })

  it("keeps clear of text already on the line", () => {
    expect(composeInsertion(["![a](../assets/a.png)"], "As I was saying")).toBe(
      "\n\n![a](../assets/a.png)\n"
    )
  })

  it("separates several images dropped at once", () => {
    expect(composeInsertion(["![a](a.png)", "![b](b.png)"], "  ")).toBe(
      "![a](a.png)\n\n![b](b.png)\n"
    )
  })
})
