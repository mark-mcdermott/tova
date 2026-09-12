import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TagPurge } from "./TagPurge"
import { stubBridge } from "../../../testing/bridge"
import type { PurgePlan, Purged } from "../../../../shared/types"

/*
 * Nothing here can be undone, so what the reader is shown before confirming
 * is the feature's only safety rail. These are tests of that rail.
 */
const plan: PurgePlan = {
  tag: "work",
  notes: [
    {
      id: "notes/standup.md",
      title: "Standup",
      section: "notes",
      blocks: 0,
      deletesNote: true,
      because: "tagRow",
      sharedWith: []
    },
    {
      id: "notes/mixed.md",
      title: "Mixed",
      section: "notes",
      blocks: 2,
      deletesNote: false,
      because: null,
      sharedWith: ["urgent"]
    }
  ]
}

const purged: Purged = {
  notesDeleted: 1,
  notesTrimmed: 1,
  blocksRemoved: 2,
  copiesDeleted: 3,
  copiesTrimmed: 1,
  snapshotsSkipped: 2,
  failed: []
}

const tagPurgePlan = vi.fn()
const tagPurge = vi.fn()

beforeEach(() => {
  // Cleared, not just re-stubbed: `restoreMocks` restores spies and leaves a
  // `vi.fn()`'s call history alone, so "was never called" would be answered
  // by the previous test's click. It was.
  vi.clearAllMocks()
  tagPurgePlan.mockResolvedValue(plan)
  tagPurge.mockResolvedValue(purged)
  window.tova = stubBridge({ preferences: { tagPurgePlan, tagPurge } })
})
afterEach(cleanup)

async function ask(tag: string): Promise<void> {
  await userEvent.type(screen.getByLabelText("Tag"), tag)
  await userEvent.click(screen.getByRole("button", { name: "Find what it holds" }))
}

describe("deleting everything under a tag", () => {
  it("will not look for a tag that has not been typed", () => {
    render(<TagPurge />)

    expect(screen.getByRole("button", { name: "Find what it holds" })).toHaveProperty(
      "disabled",
      true
    )
  })

  /*
   * Named rather than counted. "12 notes" is not something anybody can check,
   * and this is the last chance to notice a tag typed wrong.
   */
  it("names every note before anything happens", async () => {
    render(<TagPurge />)
    await ask("work")

    expect(screen.getByText(/Standup — the whole note — tagged in its tag row/)).toBeDefined()
    expect(screen.getByText(/Mixed — 2 blocks/)).toBeDefined()
  })

  /** The case worth surfacing: this block is another tag's too. */
  it("says when a block belongs to another tag as well", async () => {
    render(<TagPurge />)
    await ask("work")

    expect(screen.getByText(/also under #urgent/)).toBeDefined()
  })

  it("deletes nothing until the word is typed", async () => {
    render(<TagPurge />)
    await ask("work")

    const confirm = screen.getByRole("button", { name: /Delete everything under #work/ })
    await userEvent.click(confirm)
    expect(tagPurge).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText(/type/i), "confirm")
    await userEvent.click(confirm)
    expect(tagPurge).toHaveBeenCalledWith("work")
  })

  it("deletes nothing when the confirm is waved off", async () => {
    render(<TagPurge />)
    await ask("work")

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(tagPurge).not.toHaveBeenCalled()
  })

  /* A tag that is not a tag must not open a dialog at all. */
  it("says so rather than asking, when the box does not hold a tag", async () => {
    tagPurgePlan.mockResolvedValue({ tag: "", notes: [] })
    render(<TagPurge />)
    await ask("not a tag")

    expect(await screen.findByText(/is not a tag/)).toBeDefined()
    expect(screen.queryByRole("button", { name: /^Delete everything/ })).toBeNull()
  })

  /* And neither must a tag nothing carries. */
  it("says so rather than asking, when nothing carries the tag", async () => {
    tagPurgePlan.mockResolvedValue({ tag: "work", notes: [] })
    render(<TagPurge />)
    await ask("work")

    expect(await screen.findByText(/Nothing carries #work/)).toBeDefined()
    expect(screen.queryByRole("button", { name: /^Delete everything/ })).toBeNull()
  })

  it("says what it did, including the copies and what it left alone", async () => {
    render(<TagPurge />)
    await ask("work")
    await userEvent.type(screen.getByLabelText(/type/i), "confirm")
    await userEvent.click(screen.getByRole("button", { name: /Delete everything under #work/ }))

    const said = await screen.findByRole("status")
    expect(said.textContent).toContain("1 note deleted")
    expect(said.textContent).toContain("1 trimmed")
    expect(said.textContent).toContain("4 copies in backups and history")
    expect(said.textContent).toContain("2 snapshots from another vault left alone")
  })

  it("says when something could not be removed, rather than reporting success", async () => {
    tagPurge.mockResolvedValue({ ...purged, failed: ["notes/locked.md"] })
    render(<TagPurge />)
    await ask("work")
    await userEvent.type(screen.getByLabelText(/type/i), "confirm")
    await userEvent.click(screen.getByRole("button", { name: /Delete everything under #work/ }))

    expect((await screen.findByRole("status")).textContent).toContain("1 could not be removed")
  })
})
