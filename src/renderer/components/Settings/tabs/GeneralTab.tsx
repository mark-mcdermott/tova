import { useEffect, useState } from "react"
import { PREFERENCE_LIMITS } from "../../../../shared/preferences"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Stepper } from "../Stepper"

export function GeneralTab() {
  const preferences = usePreferencesStore((state) => state.preferences)
  const update = usePreferencesStore((state) => state.update)

  const [words, setWords] = useState<string[]>([])

  useEffect(() => {
    void window.tova.spellcheck.listWords().then(setWords)
  }, [])

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Spelling</h2>
        <p className="settings-note">
          Misspellings are underlined as you finish each word. Corrections only ever appear when you
          right-click one — nothing is changed for you.
        </p>

        <Field
          id="tooltips"
          label="Hover hints"
          hint="Labels stay either way — this is only the hint that follows the pointer."
        >
          <label className="switch">
            <input
              id="tooltips"
              type="checkbox"
              checked={preferences.tooltips}
              onChange={(event) => void update({ tooltips: event.target.checked })}
            />
            <span>{preferences.tooltips ? "On" : "Off"}</span>
          </label>
        </Field>

        <Field id="spellcheck" label="Check spelling">
          <label className="switch">
            <input
              id="spellcheck"
              type="checkbox"
              checked={preferences.spellcheck}
              onChange={(event) => void update({ spellcheck: event.target.checked })}
            />
            <span>{preferences.spellcheck ? "On" : "Off"}</span>
          </label>
        </Field>

        <Field
          id="grammar"
          label="Check grammar"
          hint="Runs on this machine — nothing is sent anywhere. The checker is 15.6MB and is only fetched once you turn this on."
        >
          <label className="switch">
            <input
              id="grammar"
              type="checkbox"
              checked={preferences.grammar}
              onChange={(event) => void update({ grammar: event.target.checked })}
            />
            <span>{preferences.grammar ? "On" : "Off"}</span>
          </label>
        </Field>

        <h3 className="settings-subheading">Personal dictionary</h3>
        {words.length === 0 ? (
          <p className="settings-empty">
            Nothing added yet. &ldquo;Add to dictionary&rdquo; in the right-click menu puts a word
            here.
          </p>
        ) : (
          <ul className="settings-list">
            {words.map((word) => (
              <li key={word} className="settings-list-row">
                <span className="settings-list-label">{word}</span>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => void window.tova.spellcheck.removeWord(word).then(setWords)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Backups</h2>
        <p className="settings-note">
          Tova snapshots the vault at launch and on this schedule. Restoring is on the Vault tab.
        </p>

        <Field id="backup-interval" label="Snapshot every">
          <Stepper
            id="backup-interval"
            value={preferences.backupIntervalMinutes}
            limits={PREFERENCE_LIMITS.backupIntervalMinutes}
            suffix="minutes"
            onChange={(backupIntervalMinutes) => void update({ backupIntervalMinutes })}
          />
        </Field>

        <Field
          id="backup-limit"
          label="Snapshots to keep"
          hint="The oldest is dropped once there are more than this."
        >
          <Stepper
            id="backup-limit"
            value={preferences.backupLimit}
            limits={PREFERENCE_LIMITS.backupLimit}
            onChange={(backupLimit) => void update({ backupLimit })}
          />
        </Field>
      </section>
    </>
  )
}
