import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorTags } from "./EditorTags"

afterEach(cleanup)

describe("EditorTags", () => {
  it("shows each tag with its hash", () => {
    render(<EditorTags tags={["thoughts", "writing"]} onAddTag={vi.fn()} />)
    const row = screen.getByLabelText("Tags")

    const tags = [...row.querySelectorAll(".editor-tag")]
    expect(tags.map((tag) => tag.textContent)).toEqual(["#thoughts", "#writing"])
  })

  it("keeps the row when a note has no tags", () => {
    render(<EditorTags tags={[]} onAddTag={vi.fn()} />)
    // The row holds its height, so writing the first tag does not shove the
    // document down a line.
    expect(screen.getByLabelText("Tags").querySelectorAll(".editor-tag")).toHaveLength(0)
  })

  it("offers a visible way in", async () => {
    // The band between title and prose is 116px tall and the row is 26 of
    // them; an unmarked target in there is one nobody finds.
    render(<EditorTags tags={[]} onAddTag={vi.fn()} />)

    await userEvent.click(screen.getByLabelText("Add tag"))
    expect(screen.getByLabelText("New tag")).toBeDefined()
  })

  it("puts the way in after the tags a note already has", () => {
    render(<EditorTags tags={["thoughts"]} onAddTag={vi.fn()} />)
    const row = screen.getByLabelText("Tags")

    expect(row.lastElementChild?.className).toBe("editor-tag-add")
  })

  it("hides the way in while a tag is being typed", async () => {
    render(<EditorTags tags={[]} onAddTag={vi.fn()} />)

    await userEvent.click(screen.getByLabelText("Add tag"))
    expect(screen.queryByLabelText("Add tag")).toBeNull()
  })

  it("opens a field when the strip is clicked", async () => {
    render(<EditorTags tags={[]} onAddTag={vi.fn()} />)
    expect(screen.queryByLabelText("New tag")).toBeNull()

    await userEvent.click(screen.getByLabelText("Tags"))
    expect(screen.getByLabelText("New tag")).toBeDefined()
  })

  it("leaves a click that landed on a tag alone", async () => {
    render(<EditorTags tags={["thoughts"]} onAddTag={vi.fn()} />)
    await userEvent.click(screen.getByText("thoughts"))
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("adds the tag on Enter and closes the field", async () => {
    const onAddTag = vi.fn()
    render(<EditorTags tags={[]} onAddTag={onAddTag} />)

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.type(screen.getByLabelText("New tag"), "writing{Enter}")

    expect(onAddTag).toHaveBeenCalledWith("writing")
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("abandons the field on Escape without adding anything", async () => {
    const onAddTag = vi.fn()
    render(<EditorTags tags={[]} onAddTag={onAddTag} />)

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.type(screen.getByLabelText("New tag"), "writing{Escape}")

    expect(onAddTag).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("adds nothing when the field is left empty", async () => {
    const onAddTag = vi.fn()
    render(<EditorTags tags={[]} onAddTag={onAddTag} />)

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.tab()

    expect(onAddTag).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })
})
