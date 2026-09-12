// This file sits with the renderer because it needs a DOM, and the renderer's
// tsconfig does not expect Node. It reads two files, so it says so.
/// <reference types="node" />
import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileSync } from "node:fs"

// Read rather than imported: Vitest hands back an empty string for a CSS
// import unless CSS processing is turned on for the whole suite, and an empty
// stylesheet would make every assertion here vacuous.
const bridge = readFileSync("src-tauri/bridge.js", "utf-8")
const globals = readFileSync("src/renderer/styles/globals.css", "utf-8")

/*
 * Checked out loud, because an empty stylesheet does not fail these tests —
 * it passes the ones asserting that something does not drag and fails only
 * the few asserting that something does, which reads like a broken fix rather
 * than a missing fixture. It cost an hour once.
 */
if (!globals.includes("-webkit-app-region")) {
  throw new Error("globals.css came back without any drag regions in it")
}

/*
 * Dragging the window by its header, checked by running the bridge.
 *
 * This is the one piece of the port with no Electron counterpart to compare
 * against: Chromium reads `-webkit-app-region` itself and the main process
 * never hears about it, so there is no fixture and no handler. What replaces
 * it is the bridge reading the same CSS and calling `startDragging` — and
 * every way that has gone wrong so far has been silent. A stylesheet that is
 * not there yet, a selector `closest` refuses: both leave a header that simply
 * does not drag, with nothing in the console.
 *
 * So the real bridge is loaded against the real stylesheet, and the assertion
 * is on what a click actually does.
 */
const startDragging = vi.fn()
const toggleMaximize = vi.fn()

/** Enough of `window.__TAURI__` for the bridge to build itself against. */
function stubRuntime(): void {
  Object.defineProperty(window, "__TAURI__", {
    configurable: true,
    value: {
      core: { invoke: vi.fn() },
      event: { listen: vi.fn() },
      window: { getCurrentWindow: () => ({ startDragging, toggleMaximize }) }
    }
  })
}

/**
 * The header markup the stylesheet is written against, with the interactive
 * controls that have to keep working inside a region that swallows clicks.
 */
function paint(): void {
  document.body.className = ""
  document.body.innerHTML = `
    <div class="sidebar-header">
      <span id="title">Notes</span>
      <select id="sort"><option>Recent</option></select>
      <button id="new">New</button>
    </div>
    <div class="editor-header">
      <span id="heading">A note</span>
      <input id="name" value="A note" />
    </div>
    <div class="popup-menu"><button id="rename">Rename</button></div>
    <div class="editor-body"><p id="prose">Some writing.</p></div>
  `
}

function press(id: string, kind: "mousedown" | "dblclick" = "mousedown"): void {
  const target = document.getElementById(id)
  if (target === null) throw new Error(`No ${id} to press`)
  target.dispatchEvent(new MouseEvent(kind, { bubbles: true, button: 0, detail: 1 }))
}

describe("dragging the window by its header", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Inlined the way the dev server serves it. The built app links its
    // stylesheet instead, which the bridge fetches; see the last test.
    document.head.innerHTML = ""
    const style = document.createElement("style")
    style.textContent = globals
    document.head.append(style)

    paint()
    stubRuntime()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(bridge)()
  })

  it("drags from the bare part of a header", () => {
    press("title")
    expect(startDragging).toHaveBeenCalled()
  })

  it.each([
    ["a button", "new"],
    ["a select", "sort"],
    ["an input", "name"]
  ])("leaves the click to %s", (_what, id) => {
    press(id)
    expect(startDragging).not.toHaveBeenCalled()
  })

  it("leaves a menu drawn over a header alone", () => {
    press("rename")
    expect(startDragging).not.toHaveBeenCalled()
  })

  it("stops dragging entirely while a menu is open", () => {
    document.body.classList.add("is-popup-open")
    press("heading")
    expect(startDragging).not.toHaveBeenCalled()
  })

  it("does not drag from the page itself", () => {
    press("prose")
    expect(startDragging).not.toHaveBeenCalled()
  })

  it("zooms on a double click of a header", () => {
    press("heading", "dblclick")
    expect(toggleMaximize).toHaveBeenCalled()
  })

  /*
   * The failure this whole file exists for. The bridge is an initialization
   * script, so it runs before the page has any styles at all; reading them
   * when it loads finds an empty list and reports no drag regions forever.
   */
  it("finds the styles that arrive after it does", () => {
    document.head.innerHTML = ""
    paint()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(bridge)()

    press("title")
    expect(startDragging).not.toHaveBeenCalled()

    const style = document.createElement("style")
    style.textContent = globals
    document.head.append(style)

    press("title")
    expect(startDragging).toHaveBeenCalled()
  })

  /*
   * A brace in a comment would otherwise read as the start of a block and
   * shift every rule after it along by one, which is a plausible thing for
   * someone to write — a comment showing the rule it is explaining.
   */
  it("is not thrown by a brace inside a comment", () => {
    const style = document.createElement("style")
    style.textContent = "/* was: .editor-header { -webkit-app-region: no-drag } */"
    document.head.prepend(style)

    // The header still drags — and, the part that actually breaks, the
    // controls inside it still do not. An unbalanced brace turns the rest of
    // the file into one unterminated comment, which takes the whole no-drag
    // list with it and leaves every button draggable.
    press("title")
    expect(startDragging).toHaveBeenCalled()

    vi.clearAllMocks()
    press("new")
    expect(startDragging).not.toHaveBeenCalled()
  })

  /* And the built app's shape, where the stylesheet is linked rather than inlined. */
  it("fetches a linked stylesheet", async () => {
    document.head.innerHTML = ""
    const sheet = { href: "tova://localhost/assets/index.css", ownerNode: null }
    Object.defineProperty(document, "styleSheets", { configurable: true, value: [sheet] })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ text: async () => globals }))
    )
    paint()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(bridge)()

    // The first click is the one that asks; it cannot wait for the answer.
    press("title")
    expect(startDragging).not.toHaveBeenCalled()

    await vi.waitFor(() => {
      press("title")
      expect(startDragging).toHaveBeenCalled()
    })
  })
})
