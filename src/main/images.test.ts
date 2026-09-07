import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { mkdtemp, readdir, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

const paths = vi.hoisted(() => ({ documents: "" }))

vi.mock("electron", () => ({
  app: { getPath: () => paths.documents }
}))

const { saveImage } = await import("./images")
const { vaultRoot } = await import("./vault")

const pixel = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

beforeAll(async () => {
  paths.documents = await mkdtemp(join(tmpdir(), "tova-images-"))
})

afterAll(async () => {
  await rm(paths.documents, { recursive: true, force: true })
})

describe("saveImage", () => {
  it("writes into the vault's assets directory and returns a vault path", async () => {
    const path = await saveImage("River Bend.PNG", pixel)

    expect(path).toBe("assets/river-bend.png")
    expect(new Uint8Array(await readFile(join(vaultRoot(), path)))).toEqual(pixel)
  })

  it("keeps a second image of the same name rather than replacing the first", async () => {
    const first = await saveImage("dusk.png", pixel)
    const second = await saveImage("dusk.png", pixel)

    expect(first).toBe("assets/dusk.png")
    expect(second).toBe("assets/dusk-2.png")
  })

  it("does not let a name of a different format reuse a taken stem", async () => {
    await saveImage("ridge.png", pixel)
    expect(await saveImage("ridge.jpg", pixel)).toBe("assets/ridge-2.jpg")
  })

  it("ignores any directory the caller puts in the name", async () => {
    const path = await saveImage("../../escape.png", pixel)

    expect(path).toBe("assets/escape.png")
    expect(await readdir(join(vaultRoot(), "assets"))).toContain("escape.png")
  })

  it("refuses a format it cannot render", async () => {
    await expect(saveImage("payload.pdf", pixel)).rejects.toThrow(/cannot store/)
    await expect(saveImage("payload", pixel)).rejects.toThrow(/cannot store/)
  })

  it("refuses an empty file", async () => {
    await expect(saveImage("nothing.png", new Uint8Array())).rejects.toThrow(/empty/)
  })

  it("refuses anything larger than the vault should hold", async () => {
    const huge = new Uint8Array(33 * 1024 * 1024)
    await expect(saveImage("huge.png", huge)).rejects.toThrow(/too large/)
  })
})
