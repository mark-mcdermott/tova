/**
 * Choosing an avatar in a browser.
 *
 * The desktop opens a system picker and copies the file into the vault, then
 * hands back a data URL. A browser has a picker of its own and nowhere to copy
 * to, so the file becomes the stored thing — which means it has to be made
 * small first.
 *
 * Small because it goes into IndexedDB beside the preferences, and a photo
 * straight off a phone is several megabytes of base64 that would be read back
 * on every launch. A face in a 40px disc needs none of it.
 */

const SIDE = 256
const QUALITY = 0.82

/** Opens the browser's own picker. Resolves to null if it was dismissed. */
function pick(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"

    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true })

    /*
     * A dismissed picker fires `cancel` in browsers that have it and nothing
     * at all in the ones that do not. Resolving null on `cancel` is what keeps
     * a dismissed dialog from leaving a promise pending for the life of the
     * page; where there is no `cancel`, nothing happens and nothing breaks.
     */
    input.addEventListener("cancel", () => resolve(null), { once: true })
    input.click()
  })
}

/** Squared off and scaled down, as a data URL. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = SIDE
    canvas.height = SIDE

    const ink = canvas.getContext("2d")
    if (ink === null) throw new Error("This browser would not draw the picture")

    // Centre-cropped to a square, because the disc is one and a squashed face
    // is worse than a cropped one.
    const side = Math.min(bitmap.width, bitmap.height)
    ink.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIDE,
      SIDE
    )

    return canvas.toDataURL("image/jpeg", QUALITY)
  } finally {
    // Frees the decoded pixels now rather than at the next collection, which
    // for a phone photo is tens of megabytes.
    bitmap.close()
  }
}

/** The whole of it: pick, shrink, hand back. Null if nothing was chosen. */
export async function chooseAvatar(): Promise<string | null> {
  const file = await pick()
  return file === null ? null : shrink(file)
}
