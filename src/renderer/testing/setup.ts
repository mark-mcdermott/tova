/**
 * jsdom has no layout, so the geometry APIs CodeMirror measures with are either
 * missing or return zeroes.
 *
 * `Range.getClientRects` is the missing one: absent entirely, so a call throws
 * rather than answering nothing. CodeMirror reaches for it whenever it has to
 * find where a position sits on screen — scrolling a match into view, for one —
 * and the throw lands outside any test, as an unhandled error that fails the
 * run while every test still passes.
 *
 * Zeroes are the right answer here. A test asserting on pixels would be
 * asserting on jsdom rather than on the app.
 */
const emptyRect: DOMRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({})
}

if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () =>
    Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => emptyRect
}
