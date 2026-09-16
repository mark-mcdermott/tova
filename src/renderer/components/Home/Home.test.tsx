import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Home } from "./Home"

/*
 * The one screen that is not a list of work or a piece of work. It holds
 * nothing and does nothing, so what there is to check is that it says what it
 * says and does not fall over waiting for its picture.
 */
afterEach(cleanup)

describe("the home page", () => {
  /*
   * The name is in the rail, a few inches left and on every screen. Printing
   * it here again said nothing the reader did not know, so the line that says
   * what Tova is for leads instead — and is the page's heading, because a page
   * still needs one.
   */
  it("leads with what the app is for rather than its own name", () => {
    render(<Home />)

    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.textContent).toContain("A quieter place")
    expect(screen.queryByRole("heading", { name: "Tova" })).toBeNull()
  })

  it("has exactly one heading", () => {
    render(<Home />)

    expect(screen.getAllByRole("heading")).toHaveLength(1)
  })

  /* Set over two lines, as the brand sheet has them, so the text is checked
     a line at a time rather than as one run with the breaks flattened out. */
  it("says what the app is for", () => {
    const { container } = render(<Home />)
    const lines = [...container.querySelectorAll(".home-line")].map((line) =>
      [...line.childNodes].map((node) => node.textContent).filter(Boolean)
    )

    expect(lines).toEqual([
      ["A quieter place", "for your thoughts."],
      ["Same thoughts.", "Brighter tomorrows."]
    ])
  })

  /*
   * The artwork is bundled and may not be there yet. The page is built to
   * open without it rather than to fail its import, so this is the state it
   * ships in until a file is dropped at assets/home/.
   */
  it("stands up before there is a picture", () => {
    const { container } = render(<Home />)
    const page = container.querySelector(".home")

    expect(page).not.toBeNull()
    if (container.querySelector(".home-art") === null) {
      expect(page?.className).toContain("is-unillustrated")
    }
  })

  /* Decoration, not content: it must not be announced or described. */
  it("does not describe the picture, because it says nothing", () => {
    const { container } = render(<Home />)
    const art = container.querySelector(".home-art")

    if (art !== null) expect(art.getAttribute("alt")).toBe("")
  })
})
