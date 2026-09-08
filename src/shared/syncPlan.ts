/**
 * Deciding what a sync should do, with no filesystem or network in sight. The
 * whole point is that the awkward cases — a post changed on both sides, one
 * deleted on one side — are settled by a function that can simply be read.
 */

export type SyncAction =
  /** On the blog but not here. */
  | "import"
  /** Changed on the blog since the last sync; unchanged here. */
  | "update"
  /** Changed here since the last sync; unchanged on the blog. */
  | "publishLocal"
  /** Changed on both sides. Tova will not pick a winner. */
  | "conflict"
  /** Gone from the blog; still here. */
  | "removedRemotely"
  /** Same on both sides. */
  | "unchanged"

export interface RemotePost {
  filename: string
  sha: string
}

export interface LocalPost {
  filename: string
  hash: string
}

export interface KnownPost {
  remoteSha: string
  localHash: string
}

export interface PlannedPost {
  filename: string
  action: SyncAction
}

export function planSync(
  remote: RemotePost[],
  local: LocalPost[],
  known: Record<string, KnownPost>
): PlannedPost[] {
  const remoteBy = new Map(remote.map((post) => [post.filename, post]))
  const localBy = new Map(local.map((post) => [post.filename, post]))
  const filenames = new Set([...remoteBy.keys(), ...localBy.keys()])

  return [...filenames].sort().map((filename) => ({
    filename,
    action: actionFor(remoteBy.get(filename), localBy.get(filename), known[filename])
  }))
}

function actionFor(
  remote: RemotePost | undefined,
  local: LocalPost | undefined,
  known: KnownPost | undefined
): SyncAction {
  if (remote !== undefined && local === undefined) {
    // Never seen here, or deleted here since the last sync. Deleting locally is
    // handled explicitly elsewhere, so an unknown file is simply new.
    return "import"
  }

  if (remote === undefined && local !== undefined) {
    // Only counts as removed if Tova had seen it on the blog before; otherwise
    // it is a local draft that has never been published.
    return known === undefined ? "publishLocal" : "removedRemotely"
  }

  if (remote === undefined || local === undefined) return "unchanged"
  if (known === undefined) {
    // Present on both sides with no record of a sync — treat matching content
    // as settled and anything else as a conflict rather than guessing.
    return "conflict"
  }

  const remoteChanged = remote.sha !== known.remoteSha
  const localChanged = local.hash !== known.localHash

  if (remoteChanged && localChanged) return "conflict"
  if (remoteChanged) return "update"
  if (localChanged) return "publishLocal"
  return "unchanged"
}
