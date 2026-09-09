import { describe, it, expect } from "vitest"
import { notePdfPage } from "./notePdfPage"

describe("notePdfPage", () => {
  it("puts the title at the top and in the document's own title", () => {
    const page = notePdfPage("Slow Morning", "Coffee.")
    expect(page).toContain("<title>Slow Morning</title>")
    expect(page).toContain("<h1>Slow Morning</h1>")
  })

  it("renders the body as markup", () => {
    expect(notePdfPage("t", "# Heading\n\n- one")).toContain("<h1>Heading</h1>")
    expect(notePdfPage("t", "- one")).toContain("<li>one</li>")
  })

  it("escapes a title that would otherwise become markup", () => {
    const page = notePdfPage("<script>x</script>", "")
    expect(page).not.toContain("<script>x</script>")
    expect(page).toContain("&lt;script&gt;")
  })

  it("carries print styles rather than the app's own", () => {
    // Glass and a photograph mean nothing on paper.
    const page = notePdfPage("t", "")
    expect(page).toContain("orphans: 2")
    expect(page).not.toContain("--glass-bg")
  })
})
