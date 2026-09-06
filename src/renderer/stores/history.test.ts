import { describe, it, expect } from "vitest"
import {
  emptyHistory,
  current,
  canGoBack,
  canGoForward,
  push,
  goBack,
  goForward,
  rememberScroll,
  forget,
  rename,
  History
} from "./history"

function historyOf(...ids: string[]): History {
  return ids.reduce((history, id) => push(history, id), emptyHistory)
}

describe("push", () => {
  it("starts empty", () => {
    expect(current(emptyHistory)).toBeNull()
    expect(canGoBack(emptyHistory)).toBe(false)
    expect(canGoForward(emptyHistory)).toBe(false)
  })

  it("records the first entry as current", () => {
    expect(current(push(emptyHistory, "notes/a.md"))?.noteId).toBe("notes/a.md")
  })

  it("advances the current entry", () => {
    expect(current(historyOf("notes/a.md", "notes/b.md"))?.noteId).toBe("notes/b.md")
  })

  it("ignores re-opening the note already showing", () => {
    const history = push(historyOf("notes/a.md"), "notes/a.md")
    expect(history.entries).toHaveLength(1)
  })

  it("still records a note revisited after navigating elsewhere", () => {
    const history = historyOf("notes/a.md", "notes/b.md", "notes/a.md")
    expect(history.entries).toHaveLength(3)
  })

  it("discards the forward trail, like a browser", () => {
    const history = goBack(historyOf("notes/a.md", "notes/b.md", "notes/c.md"))
    const branched = push(history, "notes/d.md")

    expect(branched.entries.map((entry) => entry.noteId)).toEqual([
      "notes/a.md",
      "notes/b.md",
      "notes/d.md"
    ])
    expect(canGoForward(branched)).toBe(false)
  })
})

describe("goBack and goForward", () => {
  it("cannot go back from a single entry", () => {
    expect(canGoBack(historyOf("notes/a.md"))).toBe(false)
  })

  it("goes back to the previous note", () => {
    expect(current(goBack(historyOf("notes/a.md", "notes/b.md")))?.noteId).toBe("notes/a.md")
  })

  it("offers forward only after going back", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(canGoForward(history)).toBe(false)
    expect(canGoForward(goBack(history))).toBe(true)
  })

  it("returns forward to where it started", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(current(goForward(goBack(history)))?.noteId).toBe("notes/b.md")
  })

  it("stops at the beginning rather than going negative", () => {
    const history = goBack(goBack(goBack(historyOf("notes/a.md", "notes/b.md"))))
    expect(history.index).toBe(0)
  })

  it("stops at the end rather than running past it", () => {
    const history = goForward(goForward(historyOf("notes/a.md", "notes/b.md")))
    expect(history.index).toBe(1)
  })

  it("walks a longer trail in both directions", () => {
    let history = historyOf("notes/a.md", "notes/b.md", "notes/c.md")
    history = goBack(goBack(history))
    expect(current(history)?.noteId).toBe("notes/a.md")

    history = goForward(history)
    expect(current(history)?.noteId).toBe("notes/b.md")
  })
})

describe("rememberScroll", () => {
  it("stores the offset against the current entry", () => {
    const history = rememberScroll(historyOf("notes/a.md", "notes/b.md"), 420)
    expect(current(history)?.scrollTop).toBe(420)
  })

  it("leaves other entries untouched", () => {
    const history = rememberScroll(historyOf("notes/a.md", "notes/b.md"), 420)
    expect(history.entries[0].scrollTop).toBe(0)
  })

  it("restores the offset on the way back", () => {
    let history = rememberScroll(historyOf("notes/a.md"), 200)
    history = push(history, "notes/b.md")
    expect(current(goBack(history))?.scrollTop).toBe(200)
  })

  it("does nothing on an empty history", () => {
    expect(rememberScroll(emptyHistory, 100)).toEqual(emptyHistory)
  })
})

describe("forget", () => {
  it("drops every entry for a deleted note", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md", "notes/a.md"), "notes/a.md")
    expect(history.entries.map((entry) => entry.noteId)).toEqual(["notes/b.md"])
  })

  it("keeps the position pointing at a surviving entry", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md"), "notes/b.md")
    expect(current(history)?.noteId).toBe("notes/a.md")
  })

  it("shifts the index back when an earlier entry goes", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md"), "notes/a.md")
    expect(current(history)?.noteId).toBe("notes/b.md")
  })

  it("empties cleanly when the only note goes", () => {
    const history = forget(historyOf("notes/a.md"), "notes/a.md")
    expect(history).toEqual(emptyHistory)
  })

  it("leaves history alone for an unknown note", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(forget(history, "notes/z.md")).toEqual(history)
  })
})

describe("rename", () => {
  it("follows a note whose id changed on save", () => {
    const history = rename(historyOf("notes/a.md", "notes/b.md"), "notes/b.md", "notes/c.md")
    expect(current(history)?.noteId).toBe("notes/c.md")
  })

  it("updates every occurrence", () => {
    const history = rename(
      historyOf("notes/a.md", "notes/b.md", "notes/a.md"),
      "notes/a.md",
      "notes/z.md"
    )
    expect(history.entries.map((entry) => entry.noteId)).toEqual([
      "notes/z.md",
      "notes/b.md",
      "notes/z.md"
    ])
  })

  it("does not move the current position", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(rename(history, "notes/a.md", "notes/z.md").index).toBe(history.index)
  })

  it("is a no-op when the id is unchanged", () => {
    const history = historyOf("notes/a.md")
    expect(rename(history, "notes/a.md", "notes/a.md")).toBe(history)
  })
})
