import { describe, it, expect, beforeEach, vi } from "vitest"
import { applyTitleFont, loadSampleFace } from "./titleFont"
import { stubBridge } from "./testing/bridge"

class FakeFontFace {
  static loads: string[] = []
  static fail = false

  constructor(
    public family: string,
    public source: string
  ) {}

  async load(): Promise<FakeFontFace> {
    FakeFontFace.loads.push(this.source)
    if (FakeFontFace.fail) throw new Error("could not decode")
    return this
  }
}

const added = vi.fn()
const titleFontUrl = vi.fn(async (name: string): Promise<string | null> => `data:font/ttf;base64,${name}`)

beforeEach(() => {
  titleFontUrl.mockClear()
  window.tova = stubBridge({ preferences: { titleFontUrl } })
  FakeFontFace.loads = []
  FakeFontFace.fail = false
  added.mockClear()
  document.documentElement.removeAttribute("data-title-font")
  vi.stubGlobal("FontFace", FakeFontFace)
  vi.stubGlobal("document", Object.assign(document, { fonts: { add: added } }))
})

describe("applyTitleFont", () => {
  it("serves a bundled face from CSS, with nothing to load", async () => {
    expect(await applyTitleFont("vibur")).toBe(true)

    expect(document.documentElement.dataset.titleFont).toBe("vibur")
    expect(FakeFontFace.loads).toEqual([])
  })

  it("loads an added face and switches the attribute to custom", async () => {
    expect(await applyTitleFont("my-script.otf")).toBe(true)

    expect(FakeFontFace.loads).toEqual(['url("data:font/ttf;base64,my-script.otf")'])
    expect(added).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.titleFont).toBe("custom")
  })

  it("asks main for the face rather than reaching at the disk itself", async () => {
    await applyTitleFont("my script #1.otf")
    // The name goes over IPC as-is; main resolves it inside the fonts
    // directory, which is the one place that decision belongs.
    expect(titleFontUrl).toHaveBeenCalledWith("my script #1.otf")
  })

  it("gives up when the face is gone, without constructing anything", async () => {
    titleFontUrl.mockResolvedValueOnce(null)
    expect(await applyTitleFont("missing.otf")).toBe(false)
    expect(FakeFontFace.loads).toEqual([])
  })

  it("says so when the file will not decode, and leaves the face alone", async () => {
    document.documentElement.dataset.titleFont = "vibur"
    FakeFontFace.fail = true

    expect(await applyTitleFont("not-a-font.otf")).toBe(false)
    // Whatever was showing keeps showing: dropping titles to the body face is
    // a worse answer than ignoring the request.
    expect(document.documentElement.dataset.titleFont).toBe("vibur")
    expect(added).not.toHaveBeenCalled()
  })

  it("does not fetch a face twice in one session", async () => {
    // Its own name: the cache is module-level and outlives a single test.
    await applyTitleFont("cached-only.otf")
    await applyTitleFont("vibur")
    await applyTitleFont("cached-only.otf")

    expect(FakeFontFace.loads).toHaveLength(1)
    expect(document.documentElement.dataset.titleFont).toBe("custom")
  })
})

describe("loadSampleFace", () => {
  it("registers a face under a family of its own", async () => {
    const family = await loadSampleFace("sample-a.otf")

    // Its own family, not the applied one: the picker draws every chip at
    // once, and the applied family only ever holds a single face.
    expect(family).toBe("Tova Sample sample-a.otf")
    expect(added).toHaveBeenCalledOnce()
  })

  it("returns null for a file that will not decode", async () => {
    FakeFontFace.fail = true
    expect(await loadSampleFace("sample-bad.otf")).toBeNull()
  })

  it("remembers a failure rather than retrying it every time", async () => {
    FakeFontFace.fail = true
    await loadSampleFace("sample-cached-bad.otf")
    FakeFontFace.loads = []

    expect(await loadSampleFace("sample-cached-bad.otf")).toBeNull()
    expect(FakeFontFace.loads).toEqual([])
  })
})

