import { describe, it, expect, afterEach, vi } from "vitest"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { blogDecorations } from "./blogDecorations"

const doc = `Notes to myself.

@markmcdermott.io post
@title Quick Git Notes
@tags git, tutorial

The body.
`

let view: EditorView | null = null

function mount(text: string, onPublish = vi.fn()) {
  view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [markdown({ base: markdownLanguage }), blogDecorations(onPublish)]
    }),
    parent: document.body
  })
  return { view, onPublish }
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe("blogDecorations", () => {
  it("sets the decorator lines back from the prose", () => {
    const { view } = mount(doc)
    const lines = view.dom.querySelectorAll(".cm-post-line")

    expect(lines).toHaveLength(3)
    expect(view.dom.querySelector(".cm-post-header")?.textContent).toContain(
      "@markmcdermott.io post"
    )
  })

  it("leaves ordinary prose undecorated", () => {
    const { view } = mount("Just a note with an email@address.com in it.")
    expect(view.dom.querySelectorAll(".cm-post-line")).toHaveLength(0)
  })

  it("puts one rocket at the end of the header line", () => {
    const { view } = mount(doc)
    const rockets = view.dom.querySelectorAll(".cm-post-rocket")

    expect(rockets).toHaveLength(1)
    expect(rockets[0].textContent).toBe("🚀")
    expect(rockets[0].getAttribute("aria-label")).toBe("Publish to markmcdermott.io")
  })

  it("keeps the rocket off the tab order", () => {
    const { view } = mount(doc)
    // Xin let Tab land here, which broke indenting a list inside a post.
    expect(view.dom.querySelector(".cm-post-rocket")?.getAttribute("tabindex")).toBe("-1")
  })

  it("publishes the blog it belongs to when clicked", () => {
    const { view, onPublish } = mount(doc)
    const rocket = view.dom.querySelector(".cm-post-rocket") as HTMLElement

    rocket.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    expect(onPublish).toHaveBeenCalledWith("markmcdermott.io", 2)
  })

  it("shows a tick once the post has gone out, and offers a republish", () => {
    const published = "@a.com post\n@title Hello\n@published 26-05-17-hello.md\n\nBody.\n"
    const { view } = mount(published)

    const rocket = view.dom.querySelector(".cm-post-rocket") as HTMLElement
    expect(rocket.textContent).toBe("✓")
    expect(rocket.getAttribute("aria-label")).toBe("Republish to a.com")
  })

  it("keeps the tick after an edit rather than guessing at being in sync", () => {
    const edited = "@a.com post\n@title Hello Again\n@published 26-05-17-hello.md\n\nMore.\n"
    const { view } = mount(edited)
    expect(view.dom.querySelector(".cm-post-rocket")?.textContent).toBe("✓")
  })

  it("republishes from the tick in one click", () => {
    const published = "@a.com post\n@title Hello\n@published 26-05-17-hello.md\n\nBody.\n"
    const { view, onPublish } = mount(published)

    const rocket = view.dom.querySelector(".cm-post-rocket") as HTMLElement
    rocket.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
    expect(onPublish).toHaveBeenCalledWith("a.com", 0)
  })

  it("gives every post in a note its own rocket", () => {
    const { view } = mount("@one.com post\n@title A\n\nA.\n\n@two.com post\n@title B\n\nB.\n")
    expect(view.dom.querySelectorAll(".cm-post-rocket")).toHaveLength(2)
  })
})
