import { useEffect, useState } from "react"
import {
  PREFERENCE_LIMITS,
  PROSE_WIDTHS,
  THEMES,
  ProseWidth,
  BUNDLED_TITLE_FONTS,
  DEFAULT_PREFERENCES
} from "../../../../shared/preferences"
import { backgroundUrls, userBackgroundUrl } from "../../../backgrounds"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { applyTitleFont, loadSampleFace } from "../../../titleFont"
import { Field } from "../Field"
import { Stepper } from "../Stepper"
import { SectionManager } from "../SectionManager"

/** The glob gives URLs; the filename inside one is what gets stored. */
function nameOf(url: string): string {
  return url.split("/").pop() ?? url
}

function BackgroundChoices({
  chosen,
  onChoose,
  theme
}: {
  chosen: string | null
  onChoose: (name: string | null) => void
  theme: "light" | "dark"
}) {
  const added = usePreferencesStore((state) => state.userBackgrounds)
  const addBackground = usePreferencesStore((state) => state.addBackground)

  return (
    <div className="background-choices">
      <button
        type="button"
        className={`background-choice${chosen === null ? " is-chosen" : ""}`}
        aria-pressed={chosen === null}
        onClick={() => onChoose(null)}
      >
        <span className="background-shuffle">{theme === "dark" ? "None" : "Shuffle"}</span>
      </button>

      {backgroundUrls.map((url) => (
        <button
          key={url}
          type="button"
          className={`background-choice${chosen === nameOf(url) ? " is-chosen" : ""}`}
          aria-pressed={chosen === nameOf(url)}
          aria-label={`${nameOf(url)} for ${theme}`}
          onClick={() => onChoose(nameOf(url))}
        >
          <img src={url} alt="" />
        </button>
      ))}

      {added.map((name) => (
        <button
          key={name}
          type="button"
          className={`background-choice${chosen === name ? " is-chosen" : ""}`}
          aria-pressed={chosen === name}
          aria-label={`${name} for ${theme}`}
          onClick={() => onChoose(name)}
        >
          <img src={userBackgroundUrl(name)} alt="" />
        </button>
      ))}

      <button
        type="button"
        className="background-choice background-add"
        aria-label={`Add a background for ${theme}`}
        onClick={() => void addBackground(theme)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  )
}

export function AppearanceTab() {
  const backgroundLight = usePreferencesStore((state) => state.preferences.backgroundLight)
  const backgroundDark = usePreferencesStore((state) => state.preferences.backgroundDark)
  const theme = usePreferencesStore((state) => state.preferences.theme)
  const titleFont = usePreferencesStore((state) => state.preferences.titleFont)
  const proseWidth = usePreferencesStore((state) => state.preferences.proseWidth)
  const preferences = usePreferencesStore((state) => state.preferences)
  const update = usePreferencesStore((state) => state.update)

  const [addedFonts, setAddedFonts] = useState<string[]>([])
  const [sampleFamilies, setSampleFamilies] = useState<Record<string, string | null>>({})
  const [fontError, setFontError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const names = await window.tova.preferences.listTitleFonts()
      setAddedFonts(names)

      // Each face is registered under a family of its own so its chip can be
      // set in it — the applied family only ever holds one face at a time.
      const families = await Promise.all(names.map(loadSampleFace))
      setSampleFamilies(Object.fromEntries(names.map((name, at) => [name, families[at]])))
    })()
  }, [])

  /** "my-script.otf" reads as a face named My Script in the picker. */
  function labelFor(name: string): string {
    return name
      .replace(/\.(otf|ttf|woff2?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  /** The face's own family once it has loaded; the fallback stack until then. */
  function sampleFor(name: string): string {
    const family = sampleFamilies[name]
    return family === undefined || family === null ? "cursive" : `"${family}", cursive`
  }

  async function addFont() {
    setFontError(null)
    const name = await window.tova.preferences.addTitleFont()
    if (name === null) return

    setAddedFonts(await window.tova.preferences.listTitleFonts())
    await chooseAdded(name)
  }

  async function chooseAdded(name: string) {
    // Load before storing it, so a file that will not decode never becomes the
    // preference — otherwise every launch after this would fall back silently.
    if (!(await applyTitleFont(name))) {
      setFontError(`${labelFor(name)} could not be read as a font.`)
      return
    }
    setFontError(null)
    await update({ titleFont: name })
  }

  async function removeAdded(name: string) {
    await window.tova.preferences.removeTitleFont(name)
    setAddedFonts(await window.tova.preferences.listTitleFonts())
    // The face in use just went; fall back rather than leaving a dead name.
    if (titleFont === name) await update({ titleFont: DEFAULT_PREFERENCES.titleFont })
  }

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Appearance</h2>
        <p className="settings-note">
          Tova is a photograph with writing over it. Light and dark each keep their own background,
          because a bright photograph cannot carry white text however the ink is coloured.
        </p>

        <Field id="theme" label="Mode" hint="System follows the Mac and changes with it.">
          <div className="choices">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`choice choice-compact${theme === option.value ? " is-chosen" : ""}`}
                aria-pressed={theme === option.value}
                onClick={() => void update({ theme: option.value })}
              >
                <span className="choice-name">{option.label}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field
          id="title-font"
          label="Note titles"
          hint="Shown in the face it sets, so the choice is made by eye."
        >
          <div className="choices">
            {BUNDLED_TITLE_FONTS.map((font) => (
              <button
                key={font.value}
                type="button"
                className={`choice${titleFont === font.value ? " is-chosen" : ""}`}
                aria-pressed={titleFont === font.value}
                data-title-font={font.value}
                onClick={() => void update({ titleFont: font.value })}
              >
                <span className="title-font-sample">Tova</span>
                <span className="choice-name">{font.label}</span>
              </button>
            ))}

            {addedFonts.map((name) => (
              <button
                key={name}
                type="button"
                className={`choice${titleFont === name ? " is-chosen" : ""}`}
                aria-pressed={titleFont === name}
                onClick={() => void chooseAdded(name)}
              >
                {/* Set in its own face, like the bundled ones — which is only
                    possible once it has loaded, so the sample doubles as proof
                    that the file decoded. */}
                <span className="title-font-sample" style={{ fontFamily: sampleFor(name) }}>
                  Tova
                </span>
                <span className="choice-name">
                  {labelFor(name)}
                  {sampleFamilies[name] === null && (
                    <span className="choice-warn"> · unreadable</span>
                  )}
                </span>
                <span
                  className="choice-remove"
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${labelFor(name)}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeAdded(name)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    void removeAdded(name)
                  }}
                >
                  ×
                </span>
              </button>
            ))}

            <button type="button" className="choice choice-add" onClick={() => void addFont()}>
              <span className="choice-add-glyph" aria-hidden="true">
                +
              </span>
              <span className="choice-name">Add a font</span>
            </button>
          </div>

          {fontError !== null && <p className="settings-error">{fontError}</p>}
        </Field>

        <Field
          id="prose-width"
          label="Line width"
          hint="How far the prose runs before it wraps. The title and the toolbar keep the pane."
        >
          <div className="choices">
            {PROSE_WIDTHS.map((width) => (
              <button
                key={width.value}
                type="button"
                className={`choice${proseWidth === width.value ? " is-chosen" : ""}`}
                aria-pressed={proseWidth === width.value}
                data-prose-width={width.value}
                onClick={() => void update({ proseWidth: width.value as ProseWidth })}
              >
                <span className="width-sample" aria-hidden="true" />
                <span className="choice-name">
                  {width.label} — {width.hint}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field
          id="background-light"
          label="Background — light"
          hint="Shuffle picks a different one each launch."
        >
          <BackgroundChoices
            chosen={backgroundLight}
            onChoose={(name) => void update({ backgroundLight: name })}
            theme="light"
          />
        </Field>

        <Field
          id="background-dark"
          label="Background — dark"
          hint="Every bundled photograph is a bright one, so dark starts on the gradient."
        >
          <BackgroundChoices
            chosen={backgroundDark}
            onChoose={(name) => void update({ backgroundDark: name })}
            theme="dark"
          />
        </Field>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Sidebar</h2>
        <p className="settings-note">
          Which sections the rail shows, what they are called and in what order. Renaming one only
          changes its label — nothing on disk moves, and no note changes its name.
        </p>

        <SectionManager />
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Editing</h2>

        <Field id="font-size" label="Font size" hint="The writing area, not the interface.">
          <Stepper
            id="font-size"
            value={preferences.fontSize}
            limits={PREFERENCE_LIMITS.fontSize}
            suffix="px"
            onChange={(fontSize) => void update({ fontSize })}
          />
        </Field>

        <Field id="tab-size" label="Indent width">
          <Stepper
            id="tab-size"
            value={preferences.tabSize}
            limits={PREFERENCE_LIMITS.tabSize}
            suffix="spaces"
            onChange={(tabSize) => void update({ tabSize })}
          />
        </Field>
      </section>
    </>
  )
}
