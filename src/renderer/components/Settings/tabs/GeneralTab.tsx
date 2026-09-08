import { useEffect, useState } from "react"
import { PREFERENCE_LIMITS } from "../../../../shared/preferences"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"

function Stepper({
  id,
  value,
  limits,
  suffix,
  onChange
}: {
  id: string
  value: number
  limits: { min: number; max: number }
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <span className="stepper">
      <input
        id={id}
        className="text-input"
        type="number"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix !== undefined && <span className="stepper-suffix">{suffix}</span>}
    </span>
  )
}

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

      <section className="settings-section">
        <h2 className="settings-section-title">Spelling</h2>
        <p className="settings-note">
          Misspellings are underlined as you finish each word. Corrections only ever appear when you
          right-click one — nothing is changed for you.
        </p>

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
