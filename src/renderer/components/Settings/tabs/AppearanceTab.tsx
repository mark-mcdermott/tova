import { backgroundUrls } from "../../../backgrounds"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"

/** The glob gives URLs; the filename inside one is what gets stored. */
function nameOf(url: string): string {
  return url.split("/").pop() ?? url
}

export function AppearanceTab() {
  const background = usePreferencesStore((state) => state.preferences.background)
  const update = usePreferencesStore((state) => state.update)

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Appearance</h2>
      <p className="settings-note">
        Tova is a light theme over a photograph. A dark theme and a theme picker are on the roadmap
        rather than half-built here — the whole palette is tokenised for it.
      </p>

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
  )
}
