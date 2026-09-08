import { BrowserWindow, session } from "electron"

/*
 * Spellchecking is Chromium's own, not a decoration layer of Tova's. That is
 * the fix for the timing bug the build plan flags: Chromium only marks a word
 * once the writer has finished it, so nothing squiggles under the cursor
 * mid-word. What Tova adds is the correction popup, which appears on
 * right-click and never on its own.
 */

const LANGUAGES = ["en-US"]

export function configureSpellcheck(win: BrowserWindow): void {
  session.defaultSession.setSpellCheckerLanguages(LANGUAGES)
  session.defaultSession.setSpellCheckerEnabled(true)

  // Chromium raises this for every right-click; only the ones landing on a
  // misspelling are the renderer's business.
  win.webContents.on("context-menu", (_event, params) => {
    if (params.misspelledWord === "") return

    win.webContents.send("spellcheck:suggest", {
      word: params.misspelledWord,
      suggestions: params.dictionarySuggestions,
      x: params.x,
      y: params.y
    })
  })
}

export function addToDictionary(word: string): void {
  session.defaultSession.addWordToSpellCheckerDictionary(word)
}

export function removeFromDictionary(word: string): void {
  session.defaultSession.removeWordFromSpellCheckerDictionary(word)
}

export function listDictionary(): Promise<string[]> {
  return session.defaultSession.listWordsInSpellCheckerDictionary()
}

export function setSpellcheckEnabled(enabled: boolean): void {
  session.defaultSession.setSpellCheckerEnabled(enabled)
}
