import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Home } from "./Home"
import { stubBridge } from "../../testing/bridge"

/*
 * The one screen that is not a list of work or a piece of work. It holds
 * nothing and does nothing, so what there is to check is that it says what it
 * says and does not fall over waiting for its picture.
 */
beforeEach(() => {
  // The page asks for the version now, so it needs a bridge to ask.
  window.tova = stubBridge()
})

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

/*
 * "v1.0.0" rather than "1.0.0": the `v` is how a version is written on a
 * release page, in a tag and in a changelog, so it is what somebody reading it
 * here expects to see.
 */
describe("the version", () => {
  it("names the version that is running", async () => {
    render(<Home />)

    expect(await screen.findByText("v1.0.0")).toBeDefined()
  })

  /* It is a fact about the app, set the way the About panel sets one, so the
     same kind of thing reads the same wherever it appears. */
  it("is set in mono, like every other version in the app", async () => {
    render(<Home />)

    const version = await screen.findByText("v1.0.0")
    expect(version.className).toContain("home-version")
  })

  /* Nothing on this page should wait on the backend to be readable. */
  it("leaves the page standing before the version arrives", () => {
    render(<Home />)

    expect(screen.getByRole("heading", { level: 1 })).toBeDefined()
    expect(screen.queryByText(/^v\d/)).toBeNull()
  })
})
