import { isBundledTitleFont } from "../shared/preferences"

/**
 * The family an added face registers under. One name whatever the file is
 * called, so --font-script can name it in the stack without knowing which
 * font is loaded.
 */
const FAMILY = "Tova Title"

/** Faces already registered this session, so switching back does not re-fetch. */
const loaded = new Map<string, FontFace>()

/**
 * Applies the chosen title face.
 *
 * A bundled id is served by CSS through the data attribute, which is all this
 * has to set. An added face is a file on disk instead: it registers as
 * `Tova Title`, and the attribute switches to "custom" so a stale bundled
 * value cannot win over it in the cascade.
 *
 * Returns false when an added face would not decode — a renamed .txt, a
 * corrupt download — so the caller can say so rather than leave the reader
 * looking at a silent fallback and wondering.
 */
export async function applyTitleFont(value: string): Promise<boolean> {
  const root = document.documentElement

  if (isBundledTitleFont(value)) {
    root.dataset.titleFont = value
    return true
  }

  const already = loaded.get(value)
  if (already !== undefined) {
    root.dataset.titleFont = "custom"
    return true
  }

  let face: FontFace
  try {
    // A data URL rather than a URL onto a scheme: the page runs from file://,
    // and Chromium blocks cross-origin font requests from there. See
    // main/titleFonts.ts.
    const source = await window.tova.preferences.titleFontUrl(value)
    if (source === null) return false

    // Construction inside the try as well: an engine without the CSS Font
    // Loading API should fall back like an undecodable file, not throw.
    face = new FontFace(FAMILY, `url("${source}")`)
    await face.load()
  } catch {
    // Leave the attribute alone: whatever was showing keeps showing, which is
    // a better answer than dropping the titles to the body face.
    return false
  }

  document.fonts.add(face)
  loaded.set(value, face)
  root.dataset.titleFont = "custom"
  return true
}

/** Faces loaded only to draw their own name in the picker. */
const samples = new Map<string, string | null>()

/**
 * Registers an added face under a family of its own and returns that family,
 * or null if it will not decode.
 *
 * The picker's promise is that a face is shown in itself, and the applied
 * family can only ever be one face at a time — so a sample needs its own
 * registration. Cached, so opening Settings twice does not read the files
 * twice, and null is cached too: a file that failed once will fail again.
 */
export async function loadSampleFace(name: string): Promise<string | null> {
  const cached = samples.get(name)
  if (cached !== undefined) return cached

  const family = `Tova Sample ${name}`
  try {
    const source = await window.tova.preferences.titleFontUrl(name)
    if (source === null) throw new Error("gone")

    const face = new FontFace(family, `url("${source}")`)
    await face.load()
    document.fonts.add(face)
    samples.set(name, family)
    return family
  } catch {
    samples.set(name, null)
    return null
  }
}
