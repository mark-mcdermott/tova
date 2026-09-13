import { useEffect, useState } from "react"
import { PREFERENCE_LIMITS } from "../../../../shared/preferences"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { ConfirmDialog } from "../../Popup/ConfirmDialog"
import { TagPurge } from "./TagPurge"
import { Field } from "../Field"
import { Stepper } from "../Stepper"

export function GeneralTab() {
  const preferences = usePreferencesStore((state) => state.preferences)
  const update = usePreferencesStore((state) => state.update)

  const load = usePreferencesStore((state) => state.load)

  const [words, setWords] = useState<string[]>([])
  const [asking, setAsking] = useState<"reset" | "nuke" | null>(null)
  const [targets, setTargets] = useState<string[]>([])

  useEffect(() => {
    void window.tova.spellcheck.listWords().then(setWords)
  }, [])

  async function askToNuke() {
    // Fetched before the dialog opens, so it can name the folders it is about
    // to delete rather than ask anyone to take that on trust.
    setTargets(await window.tova.preferences.nukeTargets())
    setAsking("nuke")
  }

  async function reset() {
    setAsking(null)
    await window.tova.preferences.reset()
    await load()
  }

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

      <section className="settings-section">
        <h2 className="settings-section-title">Leaving something behind</h2>
        <p className="settings-note">
          For when a job ends, or a part of your life does, and the notes from it should stop
          existing. A tag on a line of its own owns what is written under it, down to the next such
          line, a <code>---</code>, or the end of the note. A tag inside a sentence owns nothing.
        </p>

        <TagPurge />
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Starting over</h2>
        <p className="settings-note">
          Two ways back to a blank page. The first changes nothing you have written; the second
          leaves nothing at all.
        </p>

        {/* Not the two-column Field the rest of Settings uses: its label is a
            <label>, and a label pointing at a button replaces the button's own
            words with its own. These buttons say what they do. */}
        <div className="reset-actions">
          <div className="reset-action">
            <button type="button" className="settings-button" onClick={() => setAsking("reset")}>
              Reset all settings to defaults
            </button>
            <p className="field-hint">
              Every preference back to its default. Vaults you have added are forgotten — the notes
              in them stay where they are.
            </p>
          </div>

          <div className="reset-action">
            <button
              type="button"
              className="settings-button settings-button-danger"
              onClick={() => void askToNuke()}
            >
              Nuke all settings, data and notes
            </button>
            <p className="field-hint">
              No snapshot survives this, and Tova has no copy anywhere else.
            </p>
          </div>
        </div>
      </section>

      {asking === "reset" && (
        <ConfirmDialog
          title="Reset all settings?"
          body="Every preference goes back to its default and the default vault comes back into use. Nothing you have written is touched."
          confirmLabel="Reset"
          destructive
          onConfirm={() => void reset()}
          onCancel={() => setAsking(null)}
        />
      )}

      {asking === "nuke" && (
        <ConfirmDialog
          title="Delete everything?"
          body="Every note in every vault, and everything Tova stores about you. This cannot be undone, and Tova keeps no copy anywhere else."
          details={targets}
          confirmLabel="Delete everything"
          confirmWord="confirm"
          destructive
          onConfirm={() => void window.tova.preferences.nuke()}
          onCancel={() => setAsking(null)}
        />
      )}
    </>
  )
}
