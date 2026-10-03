/**
 * Deciding what a sync should do with each note, with no filesystem, no
 * network and no cipher in sight.
 *
 * The same shape as `syncPlan.ts`, which does this for blog posts: the awkward
 * cases — changed on both sides, deleted on one — are settled by a function
 * that can be read. Everything here works on hashes and versions, so a note's
 * contents never reach it and the decisions can be tested without a key.
 *
 * `docs/SYNC.md` is the protocol this plans against.
 */

/** A note as a pull described it. Absent from a pull means unchanged there. */
export interface RemoteNote {
  id: string
  /** Of the plaintext, so two devices agree about it; never of the ciphertext. */
  hash: string
  version: bigint
  deleted: boolean
}

export interface LocalNote {
  id: string
  hash: string
  /** A tombstone, which still travels. Not the same as the note being absent. */
  deleted: boolean
}

/** What this device believes was last agreed with the server about a note. */
export interface KnownNote {
  version: bigint
  hash: string
  deleted: boolean
}

export type NoteAction =
  /** The server's copy comes here. */
  | "take"
  /** Ours goes up. */
  | "push"
  /** Changed on both sides, and differently. Tova will not pick a winner. */
  | "conflict"
  /** Deleted on the server, untouched here. */
  | "takeDeletion"
  /** Deleted here, untouched on the server. */
  | "pushDeletion"
  /** Deleted on the server, edited here. The edit goes up and it comes back. */
  | "pushOverDeletion"
  /** Deleted here, edited on the server. The edit comes here. */
  | "takeOverDeletion"
  /** Nothing to do, though a version may still be worth recording. */
  | "unchanged"

export interface PlannedNote {
  id: string
  action: NoteAction
}

/** Everything one side knows about a note, or nothing. */
interface Sides {
  remote: RemoteNote | null
  local: LocalNote | null
  known: KnownNote | null
}

/**
 * What to do about one note.
 *
 * Two asymmetries are deliberate and are the whole of the interesting part.
 *
 * **An edit beats a deletion.** Undoing a deletion costs one more deletion;
 * undoing a lost edit costs the writing. Deletions here are tombstones rather
 * than erasures, so a note that comes back is the cheap outcome and a note that
 * goes is not.
 *
 * **A note missing locally with no tombstone is a missing file, not a
 * deletion.** Tova reads a folder somebody else can reach, so a note can vanish
 * because of a stray `rm`, a half-restored backup, or a sync client that has
 * not caught up. Reading absence as intent would turn any of those into a
 * deletion on every device at once.
 */
function decide({ remote, local, known }: Sides): NoteAction {
  // Never seen here, and the server has it: take it, unless what it has is a
  // tombstone for a note this device never held, which is nothing at all.
  if (local === null && known === null) {
    if (remote === null) return "unchanged"
    return remote.deleted ? "unchanged" : "take"
  }

  // Gone from disk without a tombstone. See the second asymmetry above.
  if (local === null) {
    if (remote === null) return "unchanged"
    return remote.deleted ? "unchanged" : "take"
  }

  // Here, and the server has never heard of it.
  if (known === null && remote === null) {
    return local.deleted ? "unchanged" : "push"
  }

  // Both have it and neither has told the other. The contents decide, because
  // there is no agreed point to measure a change from.
  if (known === null && remote !== null) {
    if (remote.deleted && local.deleted) return "unchanged"
    if (remote.deleted) return "pushOverDeletion"
    if (local.deleted) return "takeOverDeletion"
    return remote.hash === local.hash ? "unchanged" : "conflict"
  }

  const agreed = known as KnownNote
  const localChanged = local.hash !== agreed.hash || local.deleted !== agreed.deleted
  // Absent from the pull means the server has not moved since the cursor.
  const remoteChanged = remote !== null && remote.version > agreed.version

  if (!localChanged && !remoteChanged) return "unchanged"

  if (!localChanged) {
    const server = remote as RemoteNote
    return server.deleted ? "takeDeletion" : "take"
  }

  if (!remoteChanged) {
    return local.deleted ? "pushDeletion" : "push"
  }

  const server = remote as RemoteNote
  if (server.deleted && local.deleted) return "unchanged"
  if (server.deleted) return "pushOverDeletion"
  if (local.deleted) return "takeOverDeletion"

  // Both edited. Landing on the same text is convergence, not a conflict.
  return server.hash === local.hash ? "unchanged" : "conflict"
}

/**
 * The plan for every note either side knows about.
 *
 * Sorted by id, so two devices given the same inputs produce the same plan in
 * the same order — which is what makes a plan something to compare rather than
 * something to run and hope.
 */
export function planNotes(
  remote: readonly RemoteNote[],
  local: readonly LocalNote[],
  known: Readonly<Record<string, KnownNote>>
): PlannedNote[] {
  const byRemote = new Map(remote.map((note) => [note.id, note]))
  const byLocal = new Map(local.map((note) => [note.id, note]))
  const ids = new Set([...byRemote.keys(), ...byLocal.keys(), ...Object.keys(known)])

  return [...ids].sort().map((id) => ({
    id,
    action: decide({
      remote: byRemote.get(id) ?? null,
      local: byLocal.get(id) ?? null,
      known: known[id] ?? null
    })
  }))
}

/** The ids a plan says to send, which is what a push is built from. */
export function toPush(plan: readonly PlannedNote[]): string[] {
  return plan
    .filter(
      ({ action }) =>
        action === "push" || action === "pushDeletion" || action === "pushOverDeletion"
    )
    .map(({ id }) => id)
}

/** The ids a plan says to accept. */
export function toTake(plan: readonly PlannedNote[]): string[] {
  return plan
    .filter(
      ({ action }) =>
        action === "take" || action === "takeDeletion" || action === "takeOverDeletion"
    )
    .map(({ id }) => id)
}
