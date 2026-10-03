/**
 * Two one-way signals, kept apart because they mean different things.
 *
 * `localChanged` is this tab saying it wrote something, so a sync knows there
 * is a push to make. `vaultChanged` is a sync saying it *took* something, so
 * the renderer knows to reload a list it did not change itself.
 *
 * One channel would be a loop: a write announces, the renderer reloads, and
 * the reload is indistinguishable from the pull that should have caused it.
 * `EventsApi.onNotesChanged` is documented as changes made elsewhere, and this
 * is what keeps that true.
 */

export interface Signal {
  announce: () => void
  listen: (listener: () => void) => () => void
}

export function signal(): Signal {
  const listeners = new Set<() => void>()

  return {
    announce() {
      /*
       * A copy, so an announcement tells the listeners there were when it
       * started. A `Set` already copes with one removing *itself* — what it
       * does not cope with is one that adds another, which would then be
       * called in the same round and could add another in turn.
       */
      for (const listener of [...listeners]) listener()
    },
    listen(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}
