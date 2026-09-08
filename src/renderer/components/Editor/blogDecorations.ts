import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from "@codemirror/view"
import { Range } from "@codemirror/state"
import { parsePosts, publishedAs } from "../../../shared/blogPost"

const headerLine = Decoration.line({ class: "cm-post-line cm-post-header" })
const fieldLine = Decoration.line({ class: "cm-post-line cm-post-field" })

class RocketWidget extends WidgetType {
  constructor(
    private readonly blog: string,
    private readonly headerLine: number,
    /** Whether this post has been published before. */
    private readonly published: boolean,
    private readonly onPublish: (blog: string, headerLine: number) => void
  ) {
    super()
  }

  eq(other: RocketWidget): boolean {
    return (
      other.blog === this.blog &&
      other.headerLine === this.headerLine &&
      other.published === this.published
    )
  }

  toDOM(): HTMLElement {
    const rocket = document.createElement("span")
    const label = this.published ? `Republish to ${this.blog}` : `Publish to ${this.blog}`

    rocket.className = `cm-post-rocket${this.published ? " is-published" : ""}`
    rocket.textContent = this.published ? "✓" : "🚀"
    rocket.title = label
    rocket.setAttribute("role", "button")
    rocket.setAttribute("aria-label", label)

    // Xin let Tab reach this, which broke indenting a list inside a post.
    // The rocket is mouse-only on purpose.
    rocket.tabIndex = -1

    rocket.addEventListener("mousedown", (event) => {
      // Keeps the cursor where the writer left it.
      event.preventDefault()
      this.onPublish(this.blog, this.headerLine)
    })

    return rocket
  }
}

/**
 * Renders the `@` authoring block: the decorator lines set back from the prose,
 * and a rocket at the end of the header that publishes the post beneath it.
 */
export function blogDecorations(onPublish: (blog: string, headerLine: number) => void) {
  const build = (view: EditorView): DecorationSet => {
    const { doc } = view.state
    const decorations: Range<Decoration>[] = []

    for (const post of parsePosts(doc.toString())) {
      const header = doc.line(post.headerLine + 1)
      decorations.push(headerLine.range(header.from))
      // A tick once the post has gone out at least once. It says "published",
      // not "in sync" — comparing filenames would call a post current after a
      // body edit and stale after a retitle, which is worse than not claiming.
      // Clicking it republishes.
      const published = publishedAs(post) !== null

      decorations.push(
        Decoration.widget({
          widget: new RocketWidget(post.blog, post.headerLine, published, onPublish),
          side: 1
        }).range(header.to)
      )

      for (const field of post.fields) {
        decorations.push(fieldLine.range(doc.line(field.line + 1).from))
      }
    }

    return Decoration.set(decorations, true)
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = build(view)
      }

      update(update: ViewUpdate): void {
        // Nothing here depends on the cursor: the decorators stay visible as
        // the spec describes them, so only the document matters.
        if (update.docChanged) this.decorations = build(update.view)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
