import { describe, it, expect } from "vitest"
import {
  planNotes,
  toPush,
  toTake,
  type KnownNote,
  type LocalNote,
  type NoteAction,
  type RemoteNote
} from "./notePlan"

const remote = (over: Partial<RemoteNote> = {}): RemoteNote => ({
  id: "a",
  hash: "r1",
  version: 2n,
  deleted: false,
  ...over
})
const local = (over: Partial<LocalNote> = {}): LocalNote => ({
  id: "a",
  hash: "l1",
  deleted: false,
  ...over
})
const known = (over: Partial<KnownNote> = {}): KnownNote => ({
  version: 1n,
  hash: "same",
  deleted: false,
  ...over
})

/** The plan for one note, which is what every case below is about. */
const planOne = (r: RemoteNote | null, l: LocalNote | null, k: KnownNote | null): NoteAction =>
  planNotes(r === null ? [] : [r], l === null ? [] : [l], k === null ? {} : { a: k })[0].action

describe("a note only one side has", () => {
  it("takes one the server has and this device has never seen", () => {
    expect(planOne(remote(), null, null)).toBe("take")
  })

  /*
   * A tombstone for a note this device never held is a fact about somebody
   * else's past. Nothing to create and nothing to delete.
   */
  it("does nothing with a tombstone for a note it never had", () => {
    expect(planOne(remote({ deleted: true }), null, null)).toBe("unchanged")
  })

  it("pushes one written here that the server has never heard of", () => {
    expect(planOne(null, local(), null)).toBe("push")
  })

  it("keeps a local tombstone to itself when the server never had the note", () => {
    expect(planOne(null, local({ deleted: true }), null)).toBe("unchanged")
  })
})

describe("a note gone from disk without a tombstone", () => {
  /*
   * Tova reads a folder somebody else can reach. A note can vanish from a stray
   * rm, a half-restored backup, or a file sync that has not caught up — and
   * reading absence as intent would turn any of those into a deletion on every
   * device at once.
   */
  it("takes it back rather than deleting it everywhere", () => {
    expect(planOne(remote(), null, known())).toBe("take")
  })

  it("leaves it alone when the server deleted it too", () => {
    expect(planOne(remote({ deleted: true }), null, known())).toBe("unchanged")
  })
})

describe("a note both sides have, with a point they agreed on", () => {
  it("does nothing when neither has moved", () => {
    expect(planOne(null, local({ hash: "same" }), known())).toBe("unchanged")
  })

  it("takes the server's when only it moved", () => {
    expect(planOne(remote(), local({ hash: "same" }), known())).toBe("take")
  })

  it("pushes ours when only we moved", () => {
    expect(planOne(null, local({ hash: "new" }), known())).toBe("push")
  })

  it("pushes a tombstone when only we deleted it", () => {
    expect(planOne(null, local({ hash: "same", deleted: true }), known())).toBe("pushDeletion")
  })

  it("takes a deletion when only the server deleted it", () => {
    expect(planOne(remote({ deleted: true }), local({ hash: "same" }), known())).toBe(
      "takeDeletion"
    )
  })

  it("calls it a conflict when both moved and the text differs", () => {
    expect(planOne(remote({ hash: "theirs" }), local({ hash: "ours" }), known())).toBe("conflict")
  })

  /*
   * The same edit made twice. Common enough to be worth not calling a conflict:
   * two devices arriving at the same text have agreed, however they got there.
   */
  it("calls it nothing when both moved to the same text", () => {
    expect(planOne(remote({ hash: "both" }), local({ hash: "both" }), known())).toBe("unchanged")
  })

  it("calls it nothing when both deleted it", () => {
    expect(
      planOne(remote({ deleted: true }), local({ hash: "same", deleted: true }), known())
    ).toBe("unchanged")
  })
})

/*
 * The asymmetry that decides the two cases nothing else can. Undoing a deletion
 * costs one more deletion; undoing a lost edit costs the writing. Deletions are
 * tombstones rather than erasures, so a note coming back is the cheap outcome.
 */
describe("an edit against a deletion", () => {
  it("sends the edit up when the server deleted and we wrote", () => {
    expect(planOne(remote({ deleted: true }), local({ hash: "ours" }), known())).toBe(
      "pushOverDeletion"
    )
  })

  it("brings the edit down when we deleted and the server wrote", () => {
    expect(
      planOne(remote({ hash: "theirs" }), local({ hash: "same", deleted: true }), known())
    ).toBe("takeOverDeletion")
  })
})

describe("a note both sides have and neither has told the other about", () => {
  it("is a conflict when the text differs, because there is nothing to measure from", () => {
    expect(planOne(remote({ hash: "theirs" }), local({ hash: "ours" }), null)).toBe("conflict")
  })

  it("is nothing when the text already agrees", () => {
    expect(planOne(remote({ hash: "both" }), local({ hash: "both" }), null)).toBe("unchanged")
  })

  it("still lets an edit beat a deletion", () => {
    expect(planOne(remote({ deleted: true }), local(), null)).toBe("pushOverDeletion")
    expect(planOne(remote(), local({ deleted: true }), null)).toBe("takeOverDeletion")
  })
})

describe("the version is what says the server moved", () => {
  /*
   * A pull returns rows above a cursor, so anything it carries has moved — but
   * a client replaying an old page, or one whose cursor ran ahead, must not
   * read a stale row as news.
   */
  it("ignores a row no newer than the last agreed version", () => {
    expect(planOne(remote({ version: 1n }), local({ hash: "same" }), known({ version: 1n }))).toBe(
      "unchanged"
    )
    expect(planOne(remote({ version: 2n }), local({ hash: "same" }), known({ version: 1n }))).toBe(
      "take"
    )
  })

  it("treats a stale row and a local edit as ours alone, not a conflict", () => {
    expect(planOne(remote({ version: 1n }), local({ hash: "new" }), known({ version: 1n }))).toBe(
      "push"
    )
  })
})

describe("the plan as a whole", () => {
  it("covers every note either side knows about, in one order", () => {
    const plan = planNotes(
      [remote({ id: "c" }), remote({ id: "a" })],
      [local({ id: "b" }), local({ id: "a", hash: "r1" })],
      { d: known() }
    )

    expect(plan.map((one) => one.id)).toEqual(["a", "b", "c", "d"])
  })

  it("sorts by id rather than by arrival, so two devices agree", () => {
    const forward = planNotes([remote({ id: "b" }), remote({ id: "a" })], [], {})
    const backward = planNotes([remote({ id: "a" }), remote({ id: "b" })], [], {})

    expect(forward).toEqual(backward)
  })

  it("separates what goes up from what comes down", () => {
    const plan = planNotes(
      [remote({ id: "down" }), remote({ id: "gone", deleted: true })],
      [local({ id: "up" }), local({ id: "gone", hash: "same" })],
      { gone: known() }
    )

    expect(toPush(plan)).toEqual(["up"])
    expect(toTake(plan)).toEqual(["down", "gone"])
  })

  it("counts every pushing and taking action, not only the plain ones", () => {
    const plan = planNotes(
      [remote({ id: "theirs", hash: "t" }), remote({ id: "ours", deleted: true })],
      [local({ id: "ours", hash: "o" }), local({ id: "theirs", hash: "same", deleted: true })],
      { ours: known(), theirs: known() }
    )

    expect(toPush(plan)).toEqual(["ours"])
    expect(toTake(plan)).toEqual(["theirs"])
  })
})
