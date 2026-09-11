import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Avatar } from "./Avatar"

afterEach(cleanup)

describe("Avatar", () => {
  it("shows the picture when there is one", () => {
    const { container } = render(
      <Avatar className="a" src="data:image/png;base64,AA" name="Mark" />
    )
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AA")
  })

  it("falls back to a single initial for one name", () => {
    render(<Avatar className="a" src={null} name="stuxxnet" />)
    expect(screen.getByText("S")).toBeDefined()
  })

  it("uses the first and last for a full name", () => {
    render(<Avatar className="a" src={null} name="Mark McDermott" />)
    expect(screen.getByText("MM")).toBeDefined()
  })

  it("reads through the separators a login name tends to use", () => {
    render(<Avatar className="a" src={null} name="mark.mcdermott" />)
    expect(screen.getByText("MM")).toBeDefined()
  })

  it("signs it with Tova's t rather than guessing when there is no name", () => {
    // An empty disc was what an empty name used to give. The t is the app's
    // own, which is the honest thing to put there when the reader has not
    // said who they are.
    const { container } = render(<Avatar className="a" src={null} name="" />)

    expect(container.querySelector(".avatar-initials")?.textContent).toBe("")
    expect(container.querySelector(".avatar-wordmark")).not.toBeNull()
  })

  it("takes the accent for the disc, there being no name to colour it by", () => {
    const { container } = render(<Avatar className="a" src={null} name="" />)
    const disc = container.querySelector(".avatar-initials")

    expect(disc?.classList.contains("is-unnamed")).toBe(true)
    // Not an hsl() of a hash of nothing, which came out an arbitrary red.
    expect(disc?.getAttribute("style")).toBeNull()
  })

  it("leaves a named one its own colour and no mark", () => {
    const { container } = render(<Avatar className="a" src={null} name="Mark" />)

    expect(container.querySelector(".avatar-wordmark")).toBeNull()
    // jsdom rewrites hsl() to rgb(), so this asks that a colour was set at all.
    expect(container.querySelector(".avatar-initials")?.getAttribute("style")).toMatch(/background/)
  })

  it("gives the same name the same colour every time", () => {
    const { container: first } = render(<Avatar className="a" src={null} name="Mark" />)
    const one = first.querySelector(".avatar-initials")?.getAttribute("style")
    cleanup()

    const { container: second } = render(<Avatar className="a" src={null} name="Mark" />)
    expect(second.querySelector(".avatar-initials")?.getAttribute("style")).toBe(one)
  })

  it("gives different names different colours", () => {
    const { container: a } = render(<Avatar className="a" src={null} name="Mark" />)
    const one = a.querySelector(".avatar-initials")?.getAttribute("style")
    cleanup()

    const { container: b } = render(<Avatar className="a" src={null} name="Alex" />)
    expect(b.querySelector(".avatar-initials")?.getAttribute("style")).not.toBe(one)
  })
})
