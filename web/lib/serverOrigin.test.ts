import { describe, it, expect, afterEach, vi } from "vitest"
import { serverOrigin, withCookies } from "./serverOrigin"

const SERVER = "https://tova.so"

function at(href: string) {
  vi.stubGlobal("window", { location: new URL(href) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("where the server is", () => {
  it("is the page's own origin in a browser", () => {
    at("https://tova.so/app")
    expect(serverOrigin()).toBe(SERVER)

    at("http://localhost:4321/app")
    expect(serverOrigin()).toBe("http://localhost:4321")
  })

  /*
   * The native shell's page comes from the device. `capacitor://localhost` is
   * a real origin and a real secure context, but it is not an address: Better
   * Auth refuses it outright, at module scope, which takes the bundle with it.
   */
  it("is named outright from a shell, where the page came off the device", () => {
    at("capacitor://localhost/")
    expect(serverOrigin()).toBe(SERVER)
  })

  /*
   * Astro prerenders the pages that import this, in Node, at build time. The
   * question has an answer there and reaching for `window.location` first
   * threw instead — which failed a deploy on a page that only wanted the
   * module.
   */
  it("is answerable with no window at all", () => {
    vi.stubGlobal("window", undefined)

    expect(() => serverOrigin()).not.toThrow()
    expect(serverOrigin()).toBe(SERVER)
  })
})

describe("what to tell fetch about cookies", () => {
  it("keeps them same-origin where the server is the page's own site", () => {
    at("https://tova.so/app")
    expect(withCookies()).toBe("same-origin")
  })

  // A cross-site request sends none at all unless it is asked to.
  it("asks for them when the call leaves this origin", () => {
    at("capacitor://localhost/")
    expect(withCookies()).toBe("include")
  })

  it("does not throw with no window", () => {
    vi.stubGlobal("window", undefined)
    expect(() => withCookies()).not.toThrow()
  })
})
