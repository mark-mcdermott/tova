import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import { Tooltip } from "./Tooltip"
import { useTooltipStore } from "../../stores/tooltipStore"

/*
 * The layer that draws the one tooltip on screen. It is portalled to the body
 * because the glass panels carry `backdrop-filter`, which makes them the
 * containing block for `position: fixed` and clips anything inside them.
 */
function show(text = "New note", around = new DOMRect(100, 100, 80, 24)): void {
  act(() => useTooltipStore.getState().show({ text, around }))
}

beforeEach(() => {
  useTooltipStore.setState({ showing: null })
  // jsdom measures everything as zero, which would make every placement the
  // same answer. A tooltip has a size.
  Object.defineProperty(HTMLDivElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 120, 32)
  })
  window.innerWidth = 1000
  window.innerHeight = 800
})
afterEach(cleanup)

describe("the tooltip", () => {
  it("draws nothing until there is something to say", () => {
    const { container } = render(<Tooltip />)

    expect(container.textContent).toBe("")
    expect(document.querySelector(".tooltip")).toBeNull()
  })

  it("says what it was given", () => {
    render(<Tooltip />)
    show("Show sidebar")

    expect(screen.getByText("Show sidebar")).toBeDefined()
  })

  /*
   * Every control keeps its own `aria-label`, so this says nothing a screen
   * reader has not already been told — and announcing it twice would be worse
   * than not at all.
   */
  it("is not read out, because the control already is", () => {
    render(<Tooltip />)
    show()

    expect(document.querySelector(".tooltip")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("draws outside the panel the control lives in", () => {
    const panel = document.createElement("div")
    document.body.append(panel)
    render(<Tooltip />, { container: panel })
    show()

    const tooltip = document.querySelector(".tooltip")
    expect(tooltip).not.toBeNull()
    expect(panel.contains(tooltip)).toBe(false)
  })

  it("sits under the control, centred on it", () => {
    render(<Tooltip />)
    show("New note", new DOMRect(100, 100, 80, 24))

    const style = (document.querySelector(".tooltip") as HTMLElement).style
    // 100 + 80/2 - 120/2 = 80, and 124 + 8 below.
    expect(style.left).toBe("80px")
    expect(style.top).toBe("132px")
  })

  /* Above instead, where there is no room below — the one direction a tooltip
     can always find space in. */
  it("flips above a control near the bottom", () => {
    render(<Tooltip />)
    show("New note", new DOMRect(100, 760, 80, 24))

    const style = (document.querySelector(".tooltip") as HTMLElement).style
    expect(style.top).toBe("720px")
  })

  it("stays on screen beside a control at the edge", () => {
    render(<Tooltip />)
    show("New note", new DOMRect(0, 100, 20, 24))

    expect((document.querySelector(".tooltip") as HTMLElement).style.left).toBe("8px")
  })

  /*
   * It is placed against a box measured once, so anything that moves the page
   * leaves it pointing at nothing.
   */
  it.each([
    ["a scroll", () => window.dispatchEvent(new Event("scroll"))],
    ["a resize", () => window.dispatchEvent(new Event("resize"))],
    ["a click", () => window.dispatchEvent(new Event("pointerdown"))],
    ["Escape", () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))]
  ])("goes away on %s", (_what, happen) => {
    render(<Tooltip />)
    show()

    act(() => {
      happen()
    })
    expect(document.querySelector(".tooltip")).toBeNull()
  })
})
