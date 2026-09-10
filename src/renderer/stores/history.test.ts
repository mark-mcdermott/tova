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
  History,
  Screen,
  HistoryEntry
} from "./history"

/** Notes were the only kind of screen for a long while, so most of this reads
 *  in note ids and these two keep it that way. */
const noteScreen = (noteId: string): Screen => ({ kind: "note", noteId })
const idOf = (entry: HistoryEntry | null): string | undefined =>
  entry?.screen.kind === "note" ? entry.screen.noteId : undefined

function historyOf(...ids: string[]): History {
  return ids.reduce((history, id) => push(history, noteScreen(id)), emptyHistory)
}

describe("push", () => {
  it("starts empty", () => {
    expect(current(emptyHistory)).toBeNull()
    expect(canGoBack(emptyHistory)).toBe(false)
    expect(canGoForward(emptyHistory)).toBe(false)
  })

  it("records the first entry as current", () => {
    expect(idOf(current(push(emptyHistory, noteScreen("notes/a.md"))))).toBe("notes/a.md")
  })

  it("advances the current entry", () => {
    expect(idOf(current(historyOf("notes/a.md", "notes/b.md")))).toBe("notes/b.md")
  })

  it("ignores re-opening the note already showing", () => {
    const history = push(historyOf("notes/a.md"), noteScreen("notes/a.md"))
    expect(history.entries).toHaveLength(1)
  })

  it("still records a note revisited after navigating elsewhere", () => {
    const history = historyOf("notes/a.md", "notes/b.md", "notes/a.md")
    expect(history.entries).toHaveLength(3)
  })

  it("discards the forward trail, like a browser", () => {
    const history = goBack(historyOf("notes/a.md", "notes/b.md", "notes/c.md"))
    const branched = push(history, noteScreen("notes/d.md"))

    expect(branched.entries.map((entry) => idOf(entry))).toEqual([
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
    expect(idOf(current(goBack(historyOf("notes/a.md", "notes/b.md"))))).toBe("notes/a.md")
  })

  it("offers forward only after going back", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(canGoForward(history)).toBe(false)
    expect(canGoForward(goBack(history))).toBe(true)
  })

  it("returns forward to where it started", () => {
    const history = historyOf("notes/a.md", "notes/b.md")
    expect(idOf(current(goForward(goBack(history))))).toBe("notes/b.md")
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
    expect(idOf(current(history))).toBe("notes/a.md")

    history = goForward(history)
    expect(idOf(current(history))).toBe("notes/b.md")
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
    history = push(history, noteScreen("notes/b.md"))
    expect(current(goBack(history))?.scrollTop).toBe(200)
  })

  it("does nothing on an empty history", () => {
    expect(rememberScroll(emptyHistory, 100)).toEqual(emptyHistory)
  })
})

describe("forget", () => {
  it("drops every entry for a deleted note", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md", "notes/a.md"), "notes/a.md")
    expect(history.entries.map((entry) => idOf(entry))).toEqual(["notes/b.md"])
  })

  it("keeps the position pointing at a surviving entry", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md"), "notes/b.md")
    expect(idOf(current(history))).toBe("notes/a.md")
  })

  it("shifts the index back when an earlier entry goes", () => {
    const history = forget(historyOf("notes/a.md", "notes/b.md"), "notes/a.md")
    expect(idOf(current(history))).toBe("notes/b.md")
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
    expect(idOf(current(history))).toBe("notes/c.md")
  })

  it("updates every occurrence", () => {
    const history = rename(
      historyOf("notes/a.md", "notes/b.md", "notes/a.md"),
      "notes/a.md",
      "notes/z.md"
    )
    expect(history.entries.map((entry) => idOf(entry))).toEqual([
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

describe("index screens", () => {
  const ideas: Screen = { kind: "index", target: { kind: "section", section: "ideas" } }
  const notes: Screen = { kind: "index", target: { kind: "section", section: "notes" } }

  it("records a listing, which used to pass through without a trace", () => {
    // Ideas, then a note in it, then back — the listing was skipped entirely.
    const history = push(push(historyOf("notes/a.md"), ideas), noteScreen("ideas/b.md"))

    expect(current(goBack(history))?.screen).toEqual(ideas)
  })

  it("treats two different searches as two places", () => {
    // indexKey collapses every search to one key so the rail can mark where you
    // are. History cannot: back has to return to the earlier query.
    const wri: Screen = { kind: "index", target: { kind: "search", query: "wri" } }
    const writing: Screen = { kind: "index", target: { kind: "search", query: "writing" } }
    const history = push(push(emptyHistory, wri), writing)

    expect(history.entries).toHaveLength(2)
    expect(current(goBack(history))?.screen).toEqual(wri)
  })

  it("does not record the listing already showing", () => {
    expect(push(push(emptyHistory, ideas), ideas).entries).toHaveLength(1)
  })

  it("keeps a section and a blog of the same name apart", () => {
    const section: Screen = { kind: "index", target: { kind: "section", section: "notes" } }
    const blog: Screen = { kind: "index", target: { kind: "blog", blog: "notes" } }

    expect(push(push(emptyHistory, section), blog).entries).toHaveLength(2)
  })

  it("leaves listings alone when a note is deleted", () => {
    // A listing outlives the notes in it; forgetting one must not strand the
    // cursor on a screen that was never the problem.
    const history = push(push(historyOf("notes/a.md"), ideas), noteScreen("ideas/b.md"))
    const after = forget(history, "ideas/b.md")

    expect(after.entries.map((entry) => entry.screen)).toEqual([noteScreen("notes/a.md"), ideas])
    expect(current(after)?.screen).toEqual(ideas)
  })

  it("renames only the note it is asked about", () => {
    const history = push(push(emptyHistory, notes), noteScreen("notes/a.md"))
    const after = rename(history, "notes/a.md", "notes/renamed.md")

    expect(after.entries[0].screen).toEqual(notes)
    expect(idOf(after.entries[1])).toBe("notes/renamed.md")
  })
})
