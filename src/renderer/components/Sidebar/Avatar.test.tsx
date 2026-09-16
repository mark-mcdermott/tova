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

  it("takes the default disc colour when none has been chosen", () => {
    const { container } = render(<Avatar className="a" src={null} name="" />)

    expect(container.querySelector(".avatar-initials")?.getAttribute("style")).toContain(
      "background: rgb(217, 194, 94)"
    )
  })

  it("paints the disc the colour it is given, whatever the name says", () => {
    const { container } = render(<Avatar className="a" src={null} name="Mark" color="#123456" />)

    expect(container.querySelector(".avatar-initials")?.getAttribute("style")).toContain(
      "background: rgb(18, 52, 86)"
    )
  })

  it("paints it behind a picture too, for the robot to sit on", () => {
    // The robot is drawn with nothing behind it, so the disc is its background.
    const { container } = render(
      <Avatar className="a" src="data:image/png;base64,AA" name="Mark" color="#123456" />
    )

    expect(container.querySelector("img")?.getAttribute("style")).toContain(
      "background: rgb(18, 52, 86);"
    )
  })

  it("leaves a named one its own colour and no mark", () => {
    const { container } = render(<Avatar className="a" src={null} name="Mark" />)

    expect(container.querySelector(".avatar-wordmark")).toBeNull()
    expect(container.querySelector(".avatar-initials")?.getAttribute("style")).toMatch(/background/)
  })

  it("gives every name the same disc, the colour being a choice and not a hash", () => {
    const { container: a } = render(<Avatar className="a" src={null} name="Mark" />)
    const one = a.querySelector(".avatar-initials")?.getAttribute("style")
    cleanup()

    const { container: b } = render(<Avatar className="a" src={null} name="Alex" />)
    expect(b.querySelector(".avatar-initials")?.getAttribute("style")).toBe(one)
  })
})
