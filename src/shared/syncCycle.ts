/**
 * One sync, end to end.
 *
 * Pull what changed, decide what each note needs, merge what can be merged,
 * push what should go up. The deciding is `notePlan.ts` and the merging is
 * `merge.ts`; this is the part that talks to a store and a server and turns
 * their answers into the other two's questions.
 *
 * Nothing here holds a password. It is given the content key, seals on the way
 * out and opens on the way in, so the store never sees a ciphertext and the
 * server never sees anything else.
 */

import { seal, unseal, type VaultKey } from "./crypto"
import { mergeThreeWay } from "./merge"
import { planNotes, type KnownNote, type LocalNote, type RemoteNote } from "./notePlan"
import type { AgreedNote, NoteStore, StoredNote } from "./noteStore"
import { isCaughtUp, type PushedNote, type SyncedNote } from "./sync"
import type { SyncTransport } from "./syncTransport"

/** What one sync did, for a status line and for a test. */
export interface SyncReport {
  taken: string[]
  pushed: string[]
  merged: string[]
  /** Kept beside the original because no merge was possible. */
  copied: string[]
  /** Refused by the server; the next cycle will see why. */
  refused: string[]
  cursor: bigint
}

/** A pulled row, opened. */
interface Incoming {
  id: string
  text: string
  version: bigint
  deleted: boolean
}

const encode = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** A hash of the plaintext, so two devices agree about whether a note moved. */
async function hash(text: string): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(text))))
}

/**
 * The envelope `seal` writes, split into what the wire carries.
 *
 * `TOVA-ENCRYPTED-V1\n<nonce>\n<ciphertext>\n`, which the protocol wants as two
 * fields rather than one blob — the nonce is validated separately and a
 * ciphertext column that held the magic line would store it a million times.
 */
async function sealed(text: string, key: VaultKey): Promise<{ ciphertext: string; nonce: string }> {
  const [, nonce, ciphertext] = (await seal(encode(text), key)).split("\n")
  return { ciphertext, nonce }
}

function opened(note: SyncedNote, key: VaultKey): Promise<Uint8Array<ArrayBuffer>> {
  return unseal(`TOVA-ENCRYPTED-V1\n${note.nonce}\n${note.ciphertext}\n`, key)
}

/** Everything above the cursor, however many pages that is. */
async function pullAll(
  transport: SyncTransport,
  from: bigint,
  key: VaultKey
): Promise<{ notes: Incoming[]; cursor: bigint }> {
  const notes: Incoming[] = []
  let cursor = from

  for (;;) {
    const page = await transport.pull(cursor)
    for (const row of page.notes) {
      notes.push({
        id: row.id,
        text: decode(await opened(row, key)),
        version: row.version,
        deleted: row.deletedAt !== null
      })
    }
    cursor = page.cursor
    if (isCaughtUp(page)) return { notes, cursor }
  }
}

/**
 * One sync.
 *
 * The whole pull happens before anything is decided. Planning a page at a time
 * would measure each one against a local picture the pages after it are about
 * to change, and a note could be taken and then overwritten within a single
 * sync.
 *
 * `newId` is passed in rather than called for, because a copy's id has to be
 * the same on every device that makes it — and because a test that cannot
 * predict an id cannot check where a copy went.
 */
export async function syncOnce(
  store: NoteStore,
  transport: SyncTransport,
  key: VaultKey,
  newId: () => string = () => crypto.randomUUID()
): Promise<SyncReport> {
  const pulled = await pullAll(transport, await store.cursor(), key)
  const here = await store.all()
  const agreed = await store.agreed()

  const incoming = new Map(pulled.notes.map((note) => [note.id, note]))
  const local = new Map(here.map((note) => [note.id, note]))

  const remote: RemoteNote[] = await Promise.all(
    pulled.notes.map(async (note) => ({
      id: note.id,
      hash: await hash(note.text),
      version: note.version,
      deleted: note.deleted
    }))
  )
  const mine: LocalNote[] = await Promise.all(
    here.map(async (note) => ({ id: note.id, hash: await hash(note.text), deleted: note.deleted }))
  )
  const known: Record<string, KnownNote> = {}
  for (const [id, note] of Object.entries(agreed)) {
    known[id] = { version: note.version, hash: await hash(note.text), deleted: note.deleted }
  }

  const report: SyncReport = {
    taken: [],
    pushed: [],
    merged: [],
    copied: [],
    refused: [],
    cursor: pulled.cursor
  }
  const going: { note: PushedNote; text: string }[] = []

  /** Writes a note here and records the point it was agreed at. */
  const accept = async (note: Incoming): Promise<void> => {
    await store.write({ id: note.id, text: note.text, deleted: note.deleted })
    await store.agree(note.id, { version: note.version, text: note.text, deleted: note.deleted })
    report.taken.push(note.id)
  }

  /** Queues a note to go up, sealed, with the version it was edited from. */
  const send = async (note: StoredNote, baseVersion: bigint | null): Promise<void> => {
    going.push({
      note: {
        id: note.id,
        ...(await sealed(note.text, key)),
        /*
         * When the server heard, not when the reader deleted. A store holds
         * whether a note is a tombstone and not when it became one — a file in
         * Trash has a timestamp the filesystem chose, which is not the same
         * fact. This column is for ordering a sweep, so the honest answer is
         * the one the server can stand behind.
         */
        deletedAt: note.deleted ? new Date().toISOString() : null,
        baseVersion
      },
      text: note.text
    })
  }

  for (const { id, action } of planNotes(remote, mine, known)) {
    const theirs = incoming.get(id)
    const ours = local.get(id)
    const base = agreed[id] as AgreedNote | undefined

    if (action === "take" || action === "takeDeletion" || action === "takeOverDeletion") {
      await accept(theirs as Incoming)
      continue
    }

    if (action === "push" || action === "pushDeletion" || action === "pushOverDeletion") {
      /*
       * A note the server has moved on from is pushed against the version just
       * pulled, not the one last agreed — otherwise an edit over a deletion is
       * refused for being stale, which is the one case it exists to handle.
       */
      await send(ours as StoredNote, theirs?.version ?? base?.version ?? null)
      continue
    }

    if (action !== "conflict") continue

    const them = theirs as Incoming
    const us = ours as StoredNote
    const merged = base === undefined ? null : mergeThreeWay(base.text, us.text, them.text)

    if (merged !== null) {
      await store.write({ id, text: merged, deleted: false })
      await send({ id, text: merged, deleted: false }, them.version)
      report.merged.push(id)
      continue
    }

    /*
     * No merge, so both survive. Theirs becomes the copy rather than ours: the
     * note under this id is the one open on this device, and moving it out from
     * under somebody mid-sentence is the one thing worse than an extra note.
     */
    const copy: StoredNote = { id: newId(), text: them.text, deleted: false }
    await store.write(copy)
    await send(copy, null)
    await send(us, them.version)
    report.copied.push(copy.id)
  }

  if (going.length > 0) {
    for (const result of await transport.push(going.map((one) => one.note))) {
      const sent = going.find((one) => one.note.id === result.id)
      if (result.status !== "accepted" || sent === undefined) {
        report.refused.push(result.id)
        continue
      }

      await store.agree(result.id, {
        version: result.version,
        text: sent.text,
        deleted: sent.note.deletedAt !== null
      })
      report.pushed.push(result.id)
    }
  }

  /*
   * The cursor moves last, and only here. Moving it as each page arrived would
   * leave a sync that failed halfway with a cursor past notes it never wrote,
   * and those notes would never be pulled again.
   */
  await store.setCursor(pulled.cursor)
  return report
}
