import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { EditorTags } from "./EditorTags"

afterEach(cleanup)

describe("EditorTags", () => {
  it("shows each tag with its hash", () => {
    render(<EditorTags tags={["thoughts", "writing"]} />)
    const row = screen.getByLabelText("Tags")

    expect(row.textContent).toBe("#thoughts#writing")
    expect(row.querySelectorAll(".editor-tag")).toHaveLength(2)
  })

  it("keeps the row when a note has no tags", () => {
    render(<EditorTags tags={[]} />)
    // The row holds its height, so writing the first tag does not shove the
    // document down a line.
    expect(screen.getByLabelText("Tags")).toBeDefined()
    expect(screen.getByLabelText("Tags").querySelectorAll(".editor-tag")).toHaveLength(0)
  })
})
