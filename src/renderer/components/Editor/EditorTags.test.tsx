import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorTags } from "./EditorTags"

afterEach(cleanup)

/** Defaults for the props each test does not care about. */
function renderTags(props: Partial<Parameters<typeof EditorTags>[0]> = {}) {
  return render(
    <EditorTags
      tags={[]}
      originOf={() => "row"}
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      {...props}
    />
  )
}

describe("EditorTags", () => {
  it("shows each tag with its hash", () => {
    renderTags({ tags: ["thoughts", "writing"], onAddTag: vi.fn() })
    const row = screen.getByLabelText("Tags")

    // Each chip carries its own remove control, so read the label rather than
    // the whole chip's text.
    const tags = [...row.querySelectorAll(".editor-tag")]
    expect(
      tags.map((tag) => tag.firstChild?.textContent + (tag.childNodes[1]?.textContent ?? ""))
    ).toEqual(["#thoughts", "#writing"])
  })

  it("keeps the row when a note has no tags", () => {
    renderTags({ tags: [], onAddTag: vi.fn() })
    // The row holds its height, so writing the first tag does not shove the
    // document down a line.
    expect(screen.getByLabelText("Tags").querySelectorAll(".editor-tag")).toHaveLength(0)
  })

  it("offers a visible way in", async () => {
    // The band between title and prose is 116px tall and the row is 26 of
    // them; an unmarked target in there is one nobody finds.
    renderTags({ tags: [], onAddTag: vi.fn() })

    await userEvent.click(screen.getByLabelText("Add tag"))
    expect(screen.getByLabelText("New tag")).toBeDefined()
  })

  it("puts the way in after the tags a note already has", () => {
    renderTags({ tags: ["thoughts"], onAddTag: vi.fn() })
    const row = screen.getByLabelText("Tags")

    expect(row.lastElementChild?.className).toBe("editor-tag-add")
  })

  it("hides the way in while a tag is being typed", async () => {
    renderTags({ tags: [], onAddTag: vi.fn() })

    await userEvent.click(screen.getByLabelText("Add tag"))
    expect(screen.queryByLabelText("Add tag")).toBeNull()
  })

  it("opens a field when the strip is clicked", async () => {
    renderTags({ tags: [], onAddTag: vi.fn() })
    expect(screen.queryByLabelText("New tag")).toBeNull()

    await userEvent.click(screen.getByLabelText("Tags"))
    expect(screen.getByLabelText("New tag")).toBeDefined()
  })

  it("leaves a click that landed on a tag alone", async () => {
    renderTags({ tags: ["thoughts"], onAddTag: vi.fn() })
    await userEvent.click(screen.getByText("thoughts"))
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("adds the tag on Enter and closes the field", async () => {
    const onAddTag = vi.fn()
    renderTags({ tags: [], onAddTag: onAddTag })

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.type(screen.getByLabelText("New tag"), "writing{Enter}")

    expect(onAddTag).toHaveBeenCalledWith("writing")
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("abandons the field on Escape without adding anything", async () => {
    const onAddTag = vi.fn()
    renderTags({ tags: [], onAddTag: onAddTag })

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.type(screen.getByLabelText("New tag"), "writing{Escape}")

    expect(onAddTag).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("adds nothing when the field is left empty", async () => {
    const onAddTag = vi.fn()
    renderTags({ tags: [], onAddTag: onAddTag })

    await userEvent.click(screen.getByLabelText("Tags"))
    await userEvent.tab()

    expect(onAddTag).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("hands Tab onwards to the prose", async () => {
    const onLeaveForwards = vi.fn()
    renderTags({ tags: [], onAddTag: vi.fn(), onLeaveForwards: onLeaveForwards })

    screen.getByLabelText("Add tag").focus()
    await userEvent.tab()

    expect(onLeaveForwards).toHaveBeenCalled()
  })

  it("hands Shift+Tab back to the title", async () => {
    const onLeaveBackwards = vi.fn()
    renderTags({ tags: [], onAddTag: vi.fn(), onLeaveBackwards: onLeaveBackwards })

    screen.getByLabelText("Add tag").focus()
    await userEvent.tab({ shift: true })

    expect(onLeaveBackwards).toHaveBeenCalled()
  })
})

describe("removing a tag from the row", () => {
  it("offers a remove control on every tag", () => {
    renderTags({ tags: ["thoughts", "writing"] })

    expect(screen.getByLabelText("Remove thoughts")).toBeDefined()
    expect(screen.getByLabelText("Remove writing")).toBeDefined()
  })

  it("asks for the tag to go, by name", async () => {
    const onRemoveTag = vi.fn()
    renderTags({ tags: ["thoughts"], onRemoveTag })

    await userEvent.click(screen.getByLabelText("Remove thoughts"))
    expect(onRemoveTag).toHaveBeenCalledWith("thoughts")
  })

  it("does not open the new-tag field when the remove control is used", async () => {
    // The strip opens the field on a click that lands on nothing. The × is not
    // nothing, and the click must not do both.
    const onRemoveTag = vi.fn()
    renderTags({ tags: ["thoughts"], onRemoveTag })

    await userEvent.click(screen.getByLabelText("Remove thoughts"))
    expect(screen.queryByLabelText("New tag")).toBeNull()
  })

  it("marks where each tag came from, so one that can vanish on its own looks different", () => {
    renderTags({
      tags: ["asked", "written"],
      originOf: (tag) => (tag === "asked" ? "row" : "inline")
    })

    const tags = [...screen.getByLabelText("Tags").querySelectorAll(".editor-tag")]
    expect(tags[0].className).toContain("is-row")
    expect(tags[1].className).toContain("is-inline")
  })
})
