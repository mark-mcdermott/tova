/*
 * What a JavaScript `\s` matches, which is not quite what anybody remembers:
 * it includes U+FEFF and the Unicode space separators, and excludes U+0085.
 * Spelled out rather than left to a regex because this is asked per character,
 * and a regex per character is the slow way to do it.
 *
 * The same set `js.rs` documents on the Rust side, for the same reason.
 */
function isSpace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  )
}

/**
 * Words in a document, counted without building one.
 *
 * It used to be `text.trim().split(/\s+/).length`, which is the clearest way
 * to write it and allocates a string per word to arrive at a number. It runs
 * on every keystroke, so on a long note that was an array of a hundred
 * thousand strings built and thrown away between letters: 4.8ms a keystroke on
 * a 122,000 word document, against 0.9ms for a scan.
 *
 * There is nothing to see at the length a note usually is. It is the shape of
 * the cost that was wrong — what somebody is typing should not get slower the
 * more of it there is.
 */
export function countWords(text: string): number {
  let words = 0
  let inWord = false

  for (let at = 0; at < text.length; at += 1) {
    if (isSpace(text.charCodeAt(at))) {
      inWord = false
      continue
    }
    if (!inWord) words += 1
    inWord = true
  }

  return words
}
