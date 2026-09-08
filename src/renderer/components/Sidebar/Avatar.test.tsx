import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Avatar } from "./Avatar"

afterEach(cleanup)

describe("Avatar", () => {
  it("shows the picture when there is one", () => {
    const { container } = render(<Avatar className="a" src="data:image/png;base64,AA" name="Mark" />)
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

  it("shows nothing rather than guessing when there is no name", () => {
    const { container } = render(<Avatar className="a" src={null} name="" />)
    expect(container.querySelector(".avatar-initials")?.textContent).toBe("")
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
