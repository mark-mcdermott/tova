import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { Extension } from "@codemirror/state"

/**
 * Highlighting for fenced code. Quiet on purpose: a note is prose with the
 * occasional block in it, not a source file, so this marks the few things worth
 * telling apart and leaves everything else as ordinary text.
 *
 * The colours are CSS variables rather than literals, so light and dark are
 * settled in the stylesheet with the rest of the palette.
 */
const style = HighlightStyle.define([
  { tag: [tags.keyword, tags.moduleKeyword, tags.controlKeyword], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--code-comment)",
    fontStyle: "italic"
  },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--code-number)" },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    color: "var(--code-name)"
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--code-type)" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--code-operator)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--code-property)" }
])

export function codeHighlight(): Extension {
  return syntaxHighlighting(style)
}
