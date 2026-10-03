/**
 * Merging two edits of the same note, or declining to.
 *
 * Returns the merged text, or `null` when the two genuinely disagree. There is
 * no third answer and no conflict markers: `docs/SYNC.md` settles a real
 * conflict by keeping both notes, one as a copy, and telling the reader. A
 * marker left in a file is a note that has silently stopped being prose.
 *
 * Built on the line diff that was already here for showing a conflict, which
 * is plain longest-common-subsequence. Notes are short, and anything cleverer
 * would be harder to trust than the thing it is reconciling.
 */

import { lineDiff } from "./lineDiff"

const split = (text: string) => text.replace(/\r\n/g, "\n").split("\n")

/**
 * One stretch of the base replaced by something else.
 *
 * `[from, to)` are base lines, and `lines` is what takes their place. An
 * insertion is an empty range, which is why the two are kept apart rather than
 * reduced to a line count.
 */
interface Edit {
  from: number
  to: number
  lines: string[]
}

/**
 * An edit of `base` expressed as the stretches it changed.
 *
 * A run of removals and additions becomes one edit rather than several, so two
 * sides are compared by what region each touched — which is the only way a
 * deletion on one line and a rewrite on the next read as two edits instead of
 * one overlapping mess.
 */
function editsOf(base: string, after: string): Edit[] {
  const edits: Edit[] = []
  let at = 0
  let removed = 0
  let added: string[] = []

  const close = (): void => {
    if (removed === 0 && added.length === 0) return
    edits.push({ from: at - removed, to: at, lines: added })
    removed = 0
    added = []
  }

  for (const { kind, text } of lineDiff(base, after)) {
    if (kind === "same") {
      close()
      at += 1
    } else if (kind === "removed") {
      removed += 1
      at += 1
    } else {
      added.push(text)
    }
  }
  close()

  return edits
}

const sameLines = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((line, at) => line === b[at])

const identical = (a: Edit, b: Edit) =>
  a.from === b.from && a.to === b.to && sameLines(a.lines, b.lines)

/**
 * Whether two edits are arguing about the same text.
 *
 * Overlapping stretches are the obvious case. The other is two insertions at
 * the same point: neither covers a line, so nothing overlaps, and yet there is
 * no answer to which goes first. An insertion at the edge of somebody else's
 * replacement is not a conflict — it is next to the change rather than inside
 * it, and both can be kept.
 */
function argues(ours: Edit, theirs: Edit): boolean {
  if (identical(ours, theirs)) return false

  const overlaps = ours.from < theirs.to && theirs.from < ours.to
  const samePoint = ours.from === ours.to && theirs.from === theirs.to && ours.from === theirs.from

  return overlaps || samePoint
}

/**
 * Three texts into one, or `null`.
 *
 * `base` is the version both sides edited from — the last one they agreed on.
 * Each side's changes are worked out against it, and changes that touch
 * different stretches are simply both applied. Where they touch the same
 * stretch and say different things, there is no answer to give.
 *
 * Line endings come back as `\n` whatever went in, which is what the editor
 * writes anyway.
 */
export function mergeThreeWay(base: string, ours: string, theirs: string): string | null {
  const normalize = (text: string) => text.replace(/\r\n/g, "\n")
  if (normalize(ours) === normalize(theirs)) return normalize(ours)
  // One side never moved, so the other is the answer without any of the below.
  if (normalize(base) === normalize(ours)) return normalize(theirs)
  if (normalize(base) === normalize(theirs)) return normalize(ours)

  const baseLines = split(base)
  const ourEdits = editsOf(base, ours)
  const theirEdits = editsOf(base, theirs)

  for (const ourEdit of ourEdits) {
    for (const theirEdit of theirEdits) {
      if (argues(ourEdit, theirEdit)) return null
    }
  }

  // Both sides making the identical edit counts once.
  const shared = theirEdits.filter((theirs) => !ourEdits.some((ours) => identical(ours, theirs)))
  const inOrder = [...ourEdits, ...shared].sort((a, b) => a.from - b.from || a.to - b.to)

  const merged: string[] = []
  let at = 0
  for (const edit of inOrder) {
    merged.push(...baseLines.slice(at, Math.max(at, edit.from)))
    merged.push(...edit.lines)
    at = Math.max(at, edit.to)
  }
  merged.push(...baseLines.slice(at))

  return merged.join("\n")
}
