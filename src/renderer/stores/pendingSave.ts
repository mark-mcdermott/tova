type Flush = () => Promise<void>

let pending: Flush | null = null

/**
 * The editor registers how to write its debounced edit immediately. Only one
 * editor exists at a time, so a single slot is enough.
 */
export function registerPendingSave(flush: Flush): () => void {
  pending = flush
  return () => {
    if (pending === flush) pending = null
  }
}

/**
 * Writes any debounced edit before an operation that moves the file underneath
 * the editor. Without this, a save scheduled a moment before a drag would land
 * on the old path and resurrect the note where it used to be.
 */
export async function flushPendingSave(): Promise<void> {
  const flush = pending
  if (flush === null) return
  await flush()
}
