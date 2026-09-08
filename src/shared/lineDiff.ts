export type DiffKind = "same" | "added" | "removed"

export interface DiffLine {
  kind: DiffKind
  text: string
}

/**
 * A line diff, so a conflict can be looked at rather than guessed at. Plain
 * longest-common-subsequence: posts are short, and anything cleverer would be
 * harder to trust than the thing it is explaining.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const left = before.replace(/\r\n/g, "\n").split("\n")
  const right = after.replace(/\r\n/g, "\n").split("\n")

  // lengths[i][j] = length of the longest common subsequence of the suffixes.
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0)
  )

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const diff: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      diff.push({ kind: "same", text: left[i] })
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      diff.push({ kind: "removed", text: left[i] })
      i++
    } else {
      diff.push({ kind: "added", text: right[j] })
      j++
    }
  }

  while (i < left.length) diff.push({ kind: "removed", text: left[i++] })
  while (j < right.length) diff.push({ kind: "added", text: right[j++] })

  return diff
}

/** Just the changed lines, with a little context, for a compact summary. */
export function changedLines(diff: DiffLine[], context = 1): DiffLine[] {
  const keep = new Set<number>()

  diff.forEach((line, index) => {
    if (line.kind === "same") return
    for (let offset = -context; offset <= context; offset++) {
      const at = index + offset
      if (at >= 0 && at < diff.length) keep.add(at)
    }
  })

  return diff.filter((_line, index) => keep.has(index))
}
