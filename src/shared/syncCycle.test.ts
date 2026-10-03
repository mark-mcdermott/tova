import { describe, it, expect } from "vitest"
import { syncOnce } from "./syncCycle"
import type { AgreedNote, NoteStore, StoredNote } from "./noteStore"
import type { SyncTransport } from "./syncTransport"
import { pushRequest, type PushResult, type PushedNote } from "./sync"
import { seal, unseal } from "./crypto"

const KEY = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>

/*
 * Real uuids, because the fake server parses a push with the same schema the
 * endpoint does. Readable names over the wire would have passed here and been
 * refused in production.
 */
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const COPY = "33333333-3333-4333-8333-333333333333"
const text = (value: string) => new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>
const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/** The store a device would have, with nothing in it but a Map. */
function fakeStore(
  notes: StoredNote[] = [],
  agreed: Record<string, AgreedNote> = {},
  at = 0n
): NoteStore & { notes: Map<string, StoredNote>; agreedNow: Record<string, AgreedNote> } {
  const held = new Map(notes.map((note) => [note.id, note]))
  const known = { ...agreed }
  let cursor = at

  return {
    notes: held,
    agreedNow: known,
    all: async () => [...held.values()],
    write: async (note) => void held.set(note.id, note),
    agreed: async () => ({ ...known }),
    agree: async (id, note) => void (known[id] = note),
    cursor: async () => cursor,
    setCursor: async (to) => void (cursor = to)
  }
}

/**
 * A server that behaves like the endpoint: it refuses a push whose base version
 * is not the one it holds, and hands versions out from one counter.
 */
function fakeServer(
  start: { id: string; text: string; version: bigint; deleted?: boolean }[] = []
) {
  const rows = new Map(start.map((row) => [row.id, { ...row, deleted: row.deleted ?? false }]))
  let next = start.reduce((high, row) => (row.version > high ? row.version : high), 0n)
  const pushes: PushedNote[][] = []

  const transport: SyncTransport = {
    async pull(cursor) {
      const above = [...rows.values()].filter((row) => row.version > cursor)
      const sealed = await Promise.all(
        above.map(async (row) => {
          const [, nonce, ciphertext] = (await seal(text(row.text), KEY)).split("\n")
          return {
            id: row.id,
            ciphertext,
            nonce,
            deletedAt: row.deleted ? new Date(0).toISOString() : null,
            version: row.version
          }
        })
      )
      return {
        notes: sealed,
        cursor: sealed.reduce((high, row) => (row.version > high ? row.version : high), cursor),
        more: false
      }
    },
    async push(notes) {
      // Parsed, so a cycle sending something the endpoint would refuse fails
      // here rather than passing against a fake that is more forgiving.
      pushRequest.parse({
        notes: notes.map((note) => ({ ...note, baseVersion: note.baseVersion }))
      })
      pushes.push(notes)

      const results: PushResult[] = []
      for (const note of notes) {
        const held = rows.get(note.id)
        const base = held?.version ?? null
        if ((note.baseVersion ?? null) !== base) {
          results.push(
            held === undefined
              ? { status: "missing", id: note.id }
              : {
                  status: "conflict",
                  id: note.id,
                  current: {
                    id: note.id,
                    ciphertext: note.ciphertext,
                    nonce: note.nonce,
                    deletedAt: null,
                    version: held.version
                  }
                }
          )
          continue
        }

        next += 1n
        const plain = read(
          await unseal(`TOVA-ENCRYPTED-V1\n${note.nonce}\n${note.ciphertext}\n`, KEY)
        )
        rows.set(note.id, {
          id: note.id,
          text: plain,
          version: next,
          deleted: note.deletedAt !== null
        })
        results.push({ status: "accepted", id: note.id, version: next })
      }
      return results
    }
  }

  return { transport, rows, pushes }
}

const ids = (list: string[]) => [...list].sort()

describe("a first sync", () => {
  it("takes everything the server has", async () => {
    const store = fakeStore()
    const { transport } = fakeServer([{ id: A, text: "theirs", version: 3n }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.taken).toEqual([A])
    expect(store.notes.get(A)?.text).toBe("theirs")
    expect(report.cursor).toBe(3n)
  })

  it("pushes everything this device has", async () => {
    const store = fakeStore([{ id: A, text: "ours", deleted: false }])
    const { transport, rows } = fakeServer()

    const report = await syncOnce(store, transport, KEY)

    expect(report.pushed).toEqual([A])
    expect(rows.get(A)?.text).toBe("ours")
  })

  /*
   * What goes up is a sealed blob and a nonce. The plaintext never leaves, and
   * a test that only checked the note arrived would not have noticed.
   */
  it("sends nothing the server could read", async () => {
    const store = fakeStore([{ id: A, text: "a private thought", deleted: false }])
    const { transport, pushes } = fakeServer()

    await syncOnce(store, transport, KEY)

    expect(JSON.stringify(pushes)).not.toContain("a private thought")
    expect(pushes[0][0].nonce).toMatch(/^[A-Za-z0-9+/]{16}$/)
  })
})

describe("the cursor", () => {
  it("moves to where the pull stopped", async () => {
    const store = fakeStore()
    const { transport } = fakeServer([{ id: A, text: "x", version: 7n }])

    await syncOnce(store, transport, KEY)

    expect(await store.cursor()).toBe(7n)
  })

  /*
   * The claim the ordering rests on, and it is only visible when something
   * fails. A cursor moved as the pages arrived would sit past notes this device
   * never wrote, and nothing would ever pull them again — the sync would look
   * caught up while a note had simply evaporated.
   */
  it("does not move when a write fails partway through", async () => {
    const store = fakeStore()
    let written = 0
    store.write = async (note) => {
      written += 1
      if (written === 2) throw new Error("the disk said no")
      store.notes.set(note.id, note)
    }
    const { transport } = fakeServer([
      { id: A, text: "first", version: 1n },
      { id: B, text: "second", version: 2n }
    ])

    await expect(syncOnce(store, transport, KEY)).rejects.toThrow("the disk said no")

    expect(await store.cursor()).toBe(0n)
  })

  it("asks only for what is above it the next time", async () => {
    const store = fakeStore()
    const { transport } = fakeServer([{ id: A, text: "x", version: 2n }])

    await syncOnce(store, transport, KEY)
    const second = await syncOnce(store, transport, KEY)

    expect(second.taken).toEqual([])
  })
})

describe("an edit on one side", () => {
  it("takes the server's when this device has not moved", async () => {
    const store = fakeStore([{ id: A, text: "agreed", deleted: false }], {
      [A]: { version: 1n, text: "agreed", deleted: false }
    })
    const { transport } = fakeServer([{ id: A, text: "theirs", version: 2n }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.taken).toEqual([A])
    expect(store.notes.get(A)?.text).toBe("theirs")
  })

  it("pushes ours against the version last agreed", async () => {
    const store = fakeStore([{ id: A, text: "ours", deleted: false }], {
      [A]: { version: 1n, text: "agreed", deleted: false }
    })
    const { transport, rows, pushes } = fakeServer([{ id: A, text: "agreed", version: 1n }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.pushed).toEqual([A])
    expect(pushes[0][0].baseVersion).toBe(1n)
    expect(rows.get(A)?.text).toBe("ours")
  })
})

describe("both sides moved", () => {
  it("merges when the edits do not meet, and pushes the merge", async () => {
    const base = "one\ntwo\nthree"
    const store = fakeStore([{ id: A, text: "ONE\ntwo\nthree", deleted: false }], {
      [A]: { version: 1n, text: base, deleted: false }
    })
    const { transport, rows } = fakeServer([{ id: A, text: "one\ntwo\nTHREE", version: 2n }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.merged).toEqual([A])
    expect(store.notes.get(A)?.text).toBe("ONE\ntwo\nTHREE")
    expect(rows.get(A)?.text).toBe("ONE\ntwo\nTHREE")
  })

  /*
   * The merge has to be pushed against the version it merged against, not the
   * one last agreed — the server has moved since then and would refuse.
   */
  it("pushes a merge against the version it merged with", async () => {
    const store = fakeStore([{ id: A, text: "ONE\ntwo", deleted: false }], {
      [A]: { version: 1n, text: "one\ntwo", deleted: false }
    })
    const { transport, pushes } = fakeServer([{ id: A, text: "one\nTWO", version: 5n }])

    const report = await syncOnce(store, transport, KEY)

    expect(pushes[0][0].baseVersion).toBe(5n)
    expect(report.refused).toEqual([])
  })

  /*
   * No merge, so both survive. Theirs becomes the copy: the note under this id
   * is the one open on this device, and moving it out from under somebody
   * mid-sentence is worse than an extra note.
   */
  it("keeps both when no merge is possible, with theirs as the copy", async () => {
    const store = fakeStore([{ id: A, text: "ours", deleted: false }], {
      [A]: { version: 1n, text: "base", deleted: false }
    })
    const { transport, rows } = fakeServer([{ id: A, text: "theirs", version: 2n }])

    const report = await syncOnce(store, transport, KEY, () => COPY)

    expect(report.copied).toEqual([COPY])
    expect(store.notes.get(A)?.text).toBe("ours")
    expect(store.notes.get(COPY)?.text).toBe("theirs")
    expect(rows.get(COPY)?.text).toBe("theirs")
    expect(rows.get(A)?.text).toBe("ours")
  })
})

describe("deletions", () => {
  it("pushes a tombstone as a tombstone", async () => {
    const store = fakeStore([{ id: A, text: "gone", deleted: true }], {
      [A]: { version: 1n, text: "gone", deleted: false }
    })
    const { transport, rows, pushes } = fakeServer([{ id: A, text: "gone", version: 1n }])

    await syncOnce(store, transport, KEY)

    expect(pushes[0][0].deletedAt).not.toBeNull()
    expect(rows.get(A)?.deleted).toBe(true)
  })

  it("takes a deletion the server made", async () => {
    const store = fakeStore([{ id: A, text: "here", deleted: false }], {
      [A]: { version: 1n, text: "here", deleted: false }
    })
    const { transport } = fakeServer([{ id: A, text: "here", version: 2n, deleted: true }])

    await syncOnce(store, transport, KEY)

    expect(store.notes.get(A)?.deleted).toBe(true)
  })

  /*
   * The asymmetry notePlan settles, carried through to a real push: the edit
   * goes up against the version that deleted it, so the server accepts it and
   * the note comes back.
   */
  it("sends an edit up over a deletion, and the note comes back", async () => {
    const store = fakeStore([{ id: A, text: "still writing", deleted: false }], {
      [A]: { version: 1n, text: "base", deleted: false }
    })
    const { transport, rows } = fakeServer([{ id: A, text: "base", version: 2n, deleted: true }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.pushed).toEqual([A])
    expect(rows.get(A)?.deleted).toBe(false)
    expect(rows.get(A)?.text).toBe("still writing")
  })
})

describe("what the server refuses", () => {
  /*
   * A base version the server does not have. Here that comes from local state
   * that has run ahead — a cursor past the row and an agreed version that was
   * never real — but the shape is the same as the case that matters: another
   * device wrote between this one's pull and its push.
   */
  it("reports it and leaves the note for the next cycle", async () => {
    const store = fakeStore(
      [{ id: A, text: "ours, edited", deleted: false }],
      { [A]: { version: 99n, text: "ours", deleted: false } },
      5n
    )
    const { transport, rows } = fakeServer([{ id: A, text: "ours", version: 1n }])

    const report = await syncOnce(store, transport, KEY)

    expect(report.refused).toEqual([A])
    expect(report.pushed).toEqual([])
    // Nothing recorded as agreed, and the server's row left where it was.
    expect(store.agreedNow[A].version).toBe(99n)
    expect(rows.get(A)?.text).toBe("ours")
  })
})

describe("agreement", () => {
  it("records what was agreed, so the next sync has a base to merge from", async () => {
    const store = fakeStore([{ id: A, text: "ours", deleted: false }])
    const { transport } = fakeServer()

    await syncOnce(store, transport, KEY)

    expect(store.agreedNow[A].text).toBe("ours")
    expect(store.agreedNow[A].version).toBe(1n)
  })

  it("settles after one round trip, with nothing left to do", async () => {
    const store = fakeStore([{ id: A, text: "ours", deleted: false }])
    const { transport } = fakeServer([{ id: B, text: "theirs", version: 1n }])

    await syncOnce(store, transport, KEY)
    const second = await syncOnce(store, transport, KEY)

    expect(ids([...second.taken, ...second.pushed, ...second.merged])).toEqual([])
    expect(second.refused).toEqual([])
  })
})
