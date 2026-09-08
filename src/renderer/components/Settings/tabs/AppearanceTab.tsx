import {
  PREFERENCE_LIMITS,
  PROSE_WIDTHS,
  ProseWidth,
  TITLE_FONTS,
  TitleFont
} from "../../../../shared/preferences"
import { backgroundUrls } from "../../../backgrounds"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Stepper } from "../Stepper"

/** The glob gives URLs; the filename inside one is what gets stored. */
function nameOf(url: string): string {
  return url.split("/").pop() ?? url
}

export function AppearanceTab() {
  const background = usePreferencesStore((state) => state.preferences.background)
  const titleFont = usePreferencesStore((state) => state.preferences.titleFont)
  const proseWidth = usePreferencesStore((state) => state.preferences.proseWidth)
  const preferences = usePreferencesStore((state) => state.preferences)
  const update = usePreferencesStore((state) => state.update)

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Appearance</h2>
        <p className="settings-note">
          Tova is a light theme over a photograph. A dark theme and a theme picker are on the
          roadmap rather than half-built here — the whole palette is tokenised for it.
        </p>

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
          id="background"
          label="Background"
          hint={
            backgroundUrls.length > 1
              ? "Shuffle picks a different one each launch."
              : "One photograph is bundled. Adding another to the assets folder puts it here."
          }
        >
          <div className="background-choices">
            <button
              type="button"
              className={`background-choice${background === null ? " is-chosen" : ""}`}
              aria-pressed={background === null}
              onClick={() => void update({ background: null })}
            >
              <span className="background-shuffle">Shuffle</span>
            </button>

            {backgroundUrls.map((url) => (
              <button
                key={url}
                type="button"
                className={`background-choice${background === nameOf(url) ? " is-chosen" : ""}`}
                aria-pressed={background === nameOf(url)}
                aria-label={nameOf(url)}
                onClick={() => void update({ background: nameOf(url) })}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
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
