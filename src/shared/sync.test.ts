import { describe, it, expect } from "vitest"
import {
  pullRequest,
  pullResponse,
  pushRequest,
  pushResponse,
  pushedNote,
  syncedNote,
  isConflict,
  isCaughtUp,
  nextCursor
} from "./sync"

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
/** Base64 of twelve bytes, which is what a GCM nonce is. */
const NONCE = "AAAAAAAAAAAAAAA="
const BLOB = "Zm9vYmFy"

function note(over: Record<string, unknown> = {}) {
  return { id: ID, ciphertext: BLOB, nonce: NONCE, ...over }
}

describe("a note on the wire", () => {
  it("carries a blob and nothing that could be read", () => {
    const parsed = syncedNote.parse(note())

    expect(parsed).toEqual({ id: ID, ciphertext: BLOB, nonce: NONCE, deletedAt: null })
  })

  /*
   * The server orders a pull by its own counter, so a client sending one would
   * be claiming a place in an order it does not keep.
   */
  it("refuses a version sent from the client", () => {
    const parsed = syncedNote.parse(note({ version: 9n }))

    expect("version" in parsed).toBe(false)
  })

  it("refuses an id that is not one", () => {
    expect(syncedNote.safeParse(note({ id: "notes/river.md" })).success).toBe(false)
  })

  /*
   * A nonce is twelve bytes, reused never. A short one is not a format slip:
   * repeating a nonce under one key is the failure that takes GCM apart.
   */
  it("refuses a nonce that is not twelve bytes", () => {
    expect(syncedNote.safeParse(note({ nonce: "AAAA" })).success).toBe(false)
    expect(syncedNote.safeParse(note({ nonce: NONCE })).success).toBe(true)
  })

  it("refuses a ciphertext that is not base64", () => {
    expect(syncedNote.safeParse(note({ ciphertext: "not base64!" })).success).toBe(false)
    expect(syncedNote.safeParse(note({ ciphertext: "" })).success).toBe(false)
  })

  it("carries a tombstone, because a deletion has to travel", () => {
    const parsed = syncedNote.parse(note({ deletedAt: "2026-10-03T04:00:00Z" }))

    expect(parsed.deletedAt).toBe("2026-10-03T04:00:00Z")
  })
})

describe("pulling", () => {
  it("starts from nothing and asks for a page", () => {
    expect(pullRequest.parse({ cursor: 0 })).toEqual({ cursor: 0n, limit: 100 })
  })

  /*
   * JSON has no bigint, so a cursor arrives as a string or a number and has to
   * become one — a version counter that silently became a float would start
   * skipping notes somewhere past 2^53.
   */
  it("takes a cursor over the wire as a string", () => {
    expect(pullRequest.parse({ cursor: "9007199254740993" }).cursor).toBe(9007199254740993n)
  })

  it("will not be asked for an unbounded page", () => {
    expect(pullRequest.safeParse({ cursor: 0, limit: 10_000 }).success).toBe(false)
    expect(pullRequest.safeParse({ cursor: 0, limit: 0 }).success).toBe(false)
  })

  it("will not take a cursor from before the beginning", () => {
    expect(pullRequest.safeParse({ cursor: -1 }).success).toBe(false)
  })

  /*
   * The server's cursor, not the highest version in the page. A page can come
   * back empty, and the maximum of nothing would send a client back to zero and
   * pull the whole vault again.
   */
  it("resumes from the cursor the server gave, even on an empty page", () => {
    const response = pullResponse.parse({ notes: [], cursor: "42", more: false })

    expect(nextCursor(response)).toBe(42n)
    expect(isCaughtUp(response)).toBe(true)
  })

  /*
   * The case the other two miss, and the reason this is `more` and not a count:
   * a page can come back empty and still not be the end. A server working
   * through a run of tombstones has rows above the cursor that the reader has
   * already deleted, and answers with none of them and another page to come.
   */
  it("is not caught up on an empty page the server says has more behind it", () => {
    const page = pullResponse.parse({ notes: [], cursor: "120", more: true })

    expect(isCaughtUp(page)).toBe(false)
    expect(nextCursor(page)).toBe(120n)
  })

  it("knows a full page is not the same as a finished one", () => {
    const page = pullResponse.parse({
      notes: [{ ...note(), version: "7" }],
      cursor: "7",
      more: true
    })

    expect(isCaughtUp(page)).toBe(false)
  })
})

describe("pushing", () => {
  it("says which version it edited from", () => {
    expect(pushedNote.parse({ ...note(), baseVersion: "3" }).baseVersion).toBe(3n)
  })

  /*
   * Null is "the server has never seen this note", which is a different claim
   * from "I read version zero" — and the two want different answers when a row
   * already exists.
   */
  it("distinguishes a new note from one edited at the beginning", () => {
    expect(pushedNote.parse({ ...note(), baseVersion: null }).baseVersion).toBeNull()
    expect(pushedNote.parse({ ...note(), baseVersion: 0 }).baseVersion).toBe(0n)
  })

  it("will not be handed an empty push", () => {
    expect(pushRequest.safeParse({ notes: [] }).success).toBe(false)
  })

  it("hands back the winning row with a refusal, so a merge costs one trip", () => {
    const response = pushResponse.parse({
      results: [
        { status: "accepted", id: ID, version: "8" },
        { status: "conflict", id: ID, current: { ...note(), version: "9" } }
      ]
    })

    const [accepted, refused] = response.results
    expect(isConflict(accepted)).toBe(false)
    expect(isConflict(refused)).toBe(true)
    if (isConflict(refused)) {
      expect(refused.current.version).toBe(9n)
      expect(refused.current.ciphertext).toBe(BLOB)
    }
  })

  it("refuses a result that is neither one thing nor the other", () => {
    expect(pushResponse.safeParse({ results: [{ status: "maybe", id: ID }] }).success).toBe(false)
  })
})
