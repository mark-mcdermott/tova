import type { GrammarNote } from "./components/Editor/grammar"

/**
 * Harper, loaded from the copy on this machine.
 *
 * The 15.6MB of WebAssembly is no longer in the download. It is fetched once,
 * if the reader wants grammar at all, and served back over the `tova-grammar`
 * scheme — which is also where its bytes are checked against the hash this
 * build expects, so what reaches `WebAssembly.instantiate` is the dictionary
 * and not whatever a proxy felt like returning.
 *
 * It runs here rather than in main because it is a renderer-shaped library, and
 * because nothing leaves the machine once it is here: that is the whole reason
 * for choosing an on-device checker over a hosted one.
 */
const BINARY_URL = "tova-grammar://local/harper.wasm"

type Linter = {
  lint: (text: string, options?: { language?: string }) => Promise<unknown[]>
}

let linter: Promise<Linter> | null = null

async function load(): Promise<Linter> {
  // `harper.js/slimBinary` is deliberately not imported: importing it is what
  // put the WebAssembly into the bundle. The URL is handed over instead, and
  // the file behind it arrives only if somebody asked for grammar.
  const { LocalLinter, createBinaryModuleFromUrl } = await import("harper.js")

  // "slim" — a smaller dictionary for the same rules, which is the right side
  // of the trade when the alternative is another megabyte. It has to match the
  // binary being pointed at: the glue and the dictionary are a pair.
  const binary = createBinaryModuleFromUrl(BINARY_URL, "slim")
  const made = new LocalLinter({ binary })
  await made.setup()
  return made as unknown as Linter
}

/*
 * Kept between calls: setup parses a dictionary and is not cheap to repeat.
 *
 * A failure is not kept, which matters now that the dictionary can arrive
 * while Tova is open. A rejected promise stays rejected, so caching one would
 * mean grammar never worked again this session — the reader would turn it on,
 * watch the download finish, and see nothing underlined until they restarted.
 */
function ready(): Promise<Linter> {
  linter ??= load().catch((why: unknown) => {
    linter = null
    throw why
  })
  return linter
}

export interface RawLint {
  span: () => { start: number; end: number }
  message: () => string
  lint_kind: () => string
  suggestions: () => { get_replacement_text: () => string }[]
}

/**
 * Harper is told the text is markdown, so it reads `**bold**` as emphasis
 * rather than as a typo — which is the difference between useful and unusable
 * in a markdown editor.
 */
/*
 * Harper's own kind for a word it does not know, which Tova does not draw.
 *
 * Spelling has one checker here, and it is the system's: that is the one the
 * right-click menu asks, the one "Add to dictionary" writes to, and the one
 * whose answer the reader can act on. Harper carries a second dictionary that
 * knows nothing about the words the reader has added, so its spelling notes
 * underlined words that Tova had been told were words.
 */
const SPELLING = "Spelling"

/**
 * What Tova draws, out of what Harper found. Separate from the call so it can
 * be checked without loading fifteen megabytes of dictionary.
 */
export function notesFrom(found: RawLint[]): GrammarNote[] {
  return found
    .filter((lint) => lint.lint_kind() !== SPELLING)
    .map((lint) => {
      const span = lint.span()
      return {
        from: span.start,
        to: span.end,
        message: lint.message(),
        kind: lint.lint_kind(),
        suggestions: lint
          .suggestions()
          .map((suggestion) => suggestion.get_replacement_text())
          .filter((text) => text !== "")
          .slice(0, 6)
      }
    })
}

export async function checkGrammar(text: string): Promise<GrammarNote[]> {
  if (text.trim() === "") return []

  return notesFrom((await (await ready()).lint(text, { language: "markdown" })) as RawLint[])
}
