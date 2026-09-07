import { describe, it, expect } from "vitest"
import { assetLink, assetUrl, resolveAssetPath } from "./assets"

describe("assetLink", () => {
  it("climbs out of a section", () => {
    expect(assetLink("notes/river.md", "assets/photo.png")).toBe("../assets/photo.png")
  })

  it("climbs out of a folder inside a section", () => {
    expect(assetLink("notes/trips/river.md", "assets/photo.png")).toBe("../../assets/photo.png")
  })
})

describe("resolveAssetPath", () => {
  it("round-trips a link it produced", () => {
    const link = assetLink("notes/trips/river.md", "assets/photo.png")
    expect(resolveAssetPath("notes/trips/river.md", link)).toBe("assets/photo.png")
  })

  it("resolves a sibling file", () => {
    expect(resolveAssetPath("notes/river.md", "photo.png")).toBe("notes/photo.png")
  })

  it("treats a leading slash as vault-rooted", () => {
    expect(resolveAssetPath("notes/river.md", "/assets/photo.png")).toBe("assets/photo.png")
  })

  it("refuses to climb past the vault root", () => {
    expect(resolveAssetPath("notes/river.md", "../../secrets.png")).toBeNull()
  })

  it("leaves remote and inline sources alone", () => {
    expect(resolveAssetPath("notes/river.md", "https://example.com/a.png")).toBeNull()
    expect(resolveAssetPath("notes/river.md", "data:image/png;base64,AAA")).toBeNull()
    expect(resolveAssetPath("notes/river.md", "//example.com/a.png")).toBeNull()
  })

  it("returns null when there is nothing to point at", () => {
    expect(resolveAssetPath("notes/river.md", "")).toBeNull()
  })
})

describe("assetUrl", () => {
  it("encodes each segment without eating the separators", () => {
    expect(assetUrl("assets/my photo.png")).toBe("tova-asset://vault/assets/my%20photo.png")
  })
})
