import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from "@codemirror/view"
import { Range } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import type { SyntaxNode, Tree } from "@lezer/common"
import { findTags, isTagOnlyLine } from "../../../shared/tags"

const hide = Decoration.replace({})
const syntaxMarker = Decoration.mark({ class: "cm-syntax-marker" })

const boldMark = Decoration.mark({ class: "cm-bold" })
const italicMark = Decoration.mark({ class: "cm-italic" })
const strikeMark = Decoration.mark({ class: "cm-strike" })
const inlineCodeMark = Decoration.mark({ class: "cm-inline-code" })
const linkMark = Decoration.mark({ class: "cm-link" })

const tagTopMark = Decoration.mark({ class: "cm-tag cm-tag-top" })
const tagBodyMark = Decoration.mark({ class: "cm-tag cm-tag-body" })
const tagRawMark = Decoration.mark({ class: "cm-tag-raw" })

const headingMarks = [1, 2, 3, 4, 5, 6].map((level) =>
  Decoration.mark({ class: `cm-heading cm-h${level}` })
)

const codeBlockLine = Decoration.line({ class: "cm-code-block" })
const codeBlockFirstLine = Decoration.line({ class: "cm-code-block-first" })
const codeBlockLastLine = Decoration.line({ class: "cm-code-block-last" })
const hiddenLine = Decoration.line({ class: "cm-line-hidden" })

class LinkIconWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const icon = document.createElement("span")
    icon.className = "cm-link-icon"
    icon.textContent = "↗"
    return icon
  }
}

const linkIcon = Decoration.widget({ widget: new LinkIconWidget(), side: 1 })

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const frame = document.createElement("span")
    frame.className = "cm-image"

    const image = document.createElement("img")
    image.src = this.src
    image.alt = this.alt

    // A note outlives the files it points at. A deleted image says so in place
    // rather than leaving a broken glyph behind.
    image.addEventListener("error", () => {
      frame.classList.add("cm-image-missing")
      frame.textContent = this.alt === "" ? "Image not found" : `${this.alt} — image not found`
    })

    frame.append(image)
    return frame
  }
}

export interface MarkdownDecorationOptions {
  /**
   * Turns an image URL into something the renderer may load, or null to leave
   * the markdown as text. Only the vault is resolvable: remote images stay raw
   * rather than quietly reaching for the network.
   */
  resolveImage?: (url: string) => string | null
}

/**
 * Tags are matched with a regex rather than the syntax tree, so they have to be
 * suppressed anywhere a `#` is already meaningful — inside code, URLs, link
 * bodies, or headings.
 */
const EXCLUDES_TAGS = /Code|URL|Link|Image|Heading/

function inExcludedContext(tree: Tree, pos: number): boolean {
  for (let node: SyntaxNode | null = tree.resolveInner(pos, 1); node; node = node.parent) {
    if (EXCLUDES_TAGS.test(node.name)) return true
  }
  return false
}

function buildDecorations(view: EditorView, options: MarkdownDecorationOptions): DecorationSet {
  const { state } = view
  const tree = syntaxTree(state)
  const decorations: Range<Decoration>[] = []

  /**
   * The whole live-preview contract: a construct shows its raw syntax while the
   * cursor is anywhere inside it, and renders once the cursor leaves.
   */
  const cursorTouches = (from: number, to: number): boolean =>
    state.selection.ranges.some((range) => range.from <= to && range.to >= from)

  const forChildren = (
    node: SyntaxNode,
    names: string[],
    visit: (child: SyntaxNode) => void
  ): void => {
    for (const name of names) {
      for (const child of node.getChildren(name)) {
        if (child.to > child.from) visit(child)
      }
    }
  }

  const toggleMarkers = (node: SyntaxNode, open: boolean, ...names: string[]): void => {
    forChildren(node, names, (child) => {
      decorations.push(
        open ? syntaxMarker.range(child.from, child.to) : hide.range(child.from, child.to)
      )
    })
  }

  for (const { from: viewFrom, to: viewTo } of view.visibleRanges) {
    tree.iterate({
      from: viewFrom,
      to: viewTo,
      enter: (ref) => {
        const { from, to, name } = ref
        const node = ref.node
        const open = cursorTouches(from, to)

        if (name === "StrongEmphasis") {
          decorations.push(boldMark.range(from, to))
          toggleMarkers(node, open, "EmphasisMark")
          return
        }

        if (name === "Emphasis") {
          decorations.push(italicMark.range(from, to))
          toggleMarkers(node, open, "EmphasisMark")
          return
        }

        if (name === "Strikethrough") {
          decorations.push(strikeMark.range(from, to))
          toggleMarkers(node, open, "StrikethroughMark")
          return
        }

        if (name === "InlineCode") {
          decorations.push(inlineCodeMark.range(from, to))
          toggleMarkers(node, open, "CodeMark")
          return
        }

        if (name.startsWith("ATXHeading")) {
          const level = Number(name.slice("ATXHeading".length))
          decorations.push(headingMarks[level - 1].range(from, to))

          forChildren(node, ["HeaderMark"], (child) => {
            if (open) {
              decorations.push(syntaxMarker.range(child.from, child.to))
              return
            }
            // Swallow the space after the hashes too, so the text starts flush.
            let end = child.to
            while (end < to && /[ \t]/.test(state.sliceDoc(end, end + 1))) end++
            decorations.push(hide.range(child.from, end))
          })
          return
        }

        if (name === "Image") {
          if (open) {
            toggleMarkers(node, true, "LinkMark")
            return false
          }
          return renderImage(view, node, decorations, options) ? false : undefined
        }

        if (name === "Link") {
          if (open) {
            toggleMarkers(node, true, "LinkMark")
            return
          }
          decorations.push(linkMark.range(from, to))
          toggleMarkers(node, false, "LinkMark", "URL", "LinkTitle")
          decorations.push(linkIcon.range(to))
          return
        }

        if (name === "FencedCode") {
          decorateFencedCode(view, node, decorations, cursorTouches)
          return false
        }

        return
      }
    })
  }

  collectTagDecorations(view, tree, decorations, cursorTouches)

  return Decoration.set(decorations, true)
}

/**
 * Swaps `![alt](url)` for the picture itself. Returns false when the image
 * cannot be shown — a remote source, or markdown Tova cannot read — leaving the
 * raw text in place rather than hiding something it failed to render.
 */
function renderImage(
  view: EditorView,
  node: SyntaxNode,
  decorations: Range<Decoration>[],
  options: MarkdownDecorationOptions
): boolean {
  const url = node.getChild("URL")
  const marks = node.getChildren("LinkMark")
  if (url === null || marks.length < 2) return false

  const source = options.resolveImage?.(view.state.doc.sliceString(url.from, url.to))
  if (source === undefined || source === null) return false

  const alt = view.state.doc.sliceString(marks[0].to, marks[1].from)
  decorations.push(
    Decoration.replace({ widget: new ImageWidget(source, alt) }).range(node.from, node.to)
  )
  return true
}

function decorateFencedCode(
  view: EditorView,
  node: SyntaxNode,
  decorations: Range<Decoration>[],
  cursorTouches: (from: number, to: number) => boolean
): void {
  const { state } = view
  const firstLine = state.doc.lineAt(node.from)
  const lastLine = state.doc.lineAt(node.to)

  // A fence the user has not closed yet stays plain text — hiding half a block
  // while it is being typed is exactly the flicker Xin got wrong.
  const closed = lastLine.number > firstLine.number && /^\s*(```|~~~)/.test(lastLine.text)
  const hasContent = lastLine.number - firstLine.number > 1
  if (!closed || !hasContent) return

  const styled: number[] = []
  for (let number = firstLine.number; number <= lastLine.number; number++) {
    const line = state.doc.line(number)
    const isFence = number === firstLine.number || number === lastLine.number

    if (isFence && !cursorTouches(line.from, line.to)) {
      decorations.push(hiddenLine.range(line.from))
      continue
    }

    decorations.push(codeBlockLine.range(line.from))
    styled.push(line.from)
  }

  if (styled.length === 0) return
  decorations.push(codeBlockFirstLine.range(styled[0]))
  decorations.push(codeBlockLastLine.range(styled[styled.length - 1]))
}

function collectTagDecorations(
  view: EditorView,
  tree: Tree,
  decorations: Range<Decoration>[],
  cursorTouches: (from: number, to: number) => boolean
): void {
  const { state } = view

  for (const { from: viewFrom, to: viewTo } of view.visibleRanges) {
    let pos = viewFrom
    while (pos <= viewTo) {
      const line = state.doc.lineAt(pos)
      pos = line.to + 1
      if (line.text.trim() === "") continue

      const topZone = isTagOnlyLine(line.text)

      for (const match of findTags(line.text)) {
        const from = line.from + match.from
        const to = line.from + match.to
        if (inExcludedContext(tree, from)) continue

        // A line of nothing but tags reads as a header strip, so those pills
        // stay put rather than flickering as the cursor moves through them.
        if (topZone) {
          decorations.push(tagTopMark.range(from, to))
          continue
        }

        if (cursorTouches(from, to)) {
          decorations.push(tagRawMark.range(from, to))
          continue
        }

        decorations.push(hide.range(from, from + 1))
        decorations.push(tagBodyMark.range(from, to))
      }
    }
  }
}

export function markdownDecorations(options: MarkdownDecorationOptions = {}) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, options)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
