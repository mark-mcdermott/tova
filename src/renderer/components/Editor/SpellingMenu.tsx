import { useEffect, useState } from "react"
import { Misspelling } from "../../../shared/types"
import { Menu, MenuItem } from "../Popup/Menu"

/**
 * Corrections appear on right-click and never on their own — the squiggle is
 * Chromium's, the popup is Tova's. Suggestions come from the same event that
 * raised the menu, so the word and its range are the ones actually clicked.
 */
export function SpellingMenu({ onDictionaryChange }: { onDictionaryChange: () => void }) {
  const [misspelling, setMisspelling] = useState<Misspelling | null>(null)

  useEffect(() => {
    return window.tova.spellcheck.onSuggest(setMisspelling)
  }, [])

  if (misspelling === null) return null

  const suggestions: MenuItem[] = misspelling.suggestions.slice(0, 6).map((word) => ({
    label: word,
    accent: true,
    onSelect: () => void window.tova.spellcheck.replace(word)
  }))

  const items: MenuItem[] =
    suggestions.length === 0
      ? [{ label: "No suggestions", onSelect: () => undefined }]
      : suggestions

  return (
    <Menu
      x={misspelling.x}
      y={misspelling.y}
      items={[
        ...items,
        "separator",
        {
          label: `Add “${misspelling.word}” to dictionary`,
          onSelect: () => {
            // Checked again once the word is in, so its underline goes now
            // rather than at the reader's next keystroke.
            void (async () => {
              await window.tova.spellcheck.addWord(misspelling.word)
              onDictionaryChange()
            })()
          }
        }
      ]}
      onClose={() => setMisspelling(null)}
    />
  )
}
