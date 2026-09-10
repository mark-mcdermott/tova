/**
 * Picking several rows out of a list.
 *
 * Kept apart from the list that uses it because the awkward parts are all
 * arithmetic — where a range starts, what a modifier means, what happens when
 * the row you anchored to is no longer there — and none of them need a DOM to
 * be wrong in.
 */

export interface Selection {
  /** Ids currently picked, in no particular order. */
  ids: string[]
  /** The row a range extends from, or null when nothing has been picked. */
  anchor: string | null
}

export const NOTHING_SELECTED: Selection = { ids: [], anchor: null }

export interface Click {
  shift: boolean
  /** Cmd on macOS. Toggles one row rather than taking a range. */
  meta: boolean
}

/**
 * What a click leaves selected, or null when it is not a selecting click at
 * all — which is the signal to do the ordinary thing and open the note.
 *
 * A plain click is never a selecting click. Opening a note is what this list is
 * for, and a list you cannot click into to read something is a worse list.
 */
export function afterClick(
  selection: Selection,
  order: string[],
  id: string,
  click: Click
): Selection | null {
  if (click.meta) {
    const has = selection.ids.includes(id)
    return {
      ids: has ? selection.ids.filter((entry) => entry !== id) : [...selection.ids, id],
      // Toggling off leaves the anchor where it was only if it survived.
      anchor: has && selection.anchor === id ? null : id
    }
  }

  if (!click.shift) return null

  // Nothing to reach back to, so this is where a range will start from. The
  // first Shift-click has to do something, or the gesture looks broken.
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor)
  if (from === -1) return { ids: [id], anchor: id }

  const to = order.indexOf(id)
  if (to === -1) return selection

  const [low, high] = from < to ? [from, to] : [to, from]
  return { ids: order.slice(low, high + 1), anchor: selection.anchor }
}

/**
 * The selection with anything no longer in the list dropped. A note trashed
 * from under a selection should not keep it alive, and an anchor pointing at a
 * row that has gone would make the next Shift-click reach nowhere.
 */
export function prune(selection: Selection, order: string[]): Selection {
  const ids = selection.ids.filter((id) => order.includes(id))
  const anchor =
    selection.anchor !== null && order.includes(selection.anchor) ? selection.anchor : null

  return ids.length === selection.ids.length && anchor === selection.anchor
    ? selection
    : { ids, anchor }
}
