import {
  PREFERENCE_LIMITS,
  PROSE_WIDTHS,
  THEMES,
  ProseWidth,
  TITLE_FONTS,
  TitleFont
} from "../../../../shared/preferences"
import { backgroundUrls, userBackgroundUrl } from "../../../backgrounds"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Stepper } from "../Stepper"

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
            {TITLE_FONTS.map((font) => (
              <button
                key={font.value}
                type="button"
                className={`choice${titleFont === font.value ? " is-chosen" : ""}`}
                aria-pressed={titleFont === font.value}
                data-title-font={font.value}
                onClick={() => void update({ titleFont: font.value as TitleFont })}
              >
                <span className="title-font-sample">Tova</span>
                <span className="choice-name">{font.label}</span>
              </button>
            ))}
          </div>
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
