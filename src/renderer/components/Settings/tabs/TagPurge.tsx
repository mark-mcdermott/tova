import { useState } from "react"
import type { PurgePlan, PurgePlanned, Purged } from "../../../../shared/types"
import { ConfirmDialog } from "../../Popup/ConfirmDialog"
import { useNotesStore } from "../../../stores/notesStore"
import { Field } from "../Field"

/**
 * One line of the preview: what this note loses, and to whom else.
 *
 * Named rather than counted, because "12 notes" is not something anybody can
 * check and this is the last chance to notice a tag typed wrong.
 */
function describe(note: PurgePlanned): string {
  const what = note.deletesNote
    ? note.because === "tagRow"
      ? "the whole note — tagged in its tag row"
      : "the whole note — nothing is left without its blocks"
    : `${note.blocks} ${note.blocks === 1 ? "block" : "blocks"}`

  const shared =
    note.sharedWith.length === 0
      ? ""
      : ` · also under ${note.sharedWith.map((tag) => `#${tag}`).join(", ")}`

  return `${note.title || note.id} — ${what}${shared}`
}

/** What the reader is told happened, in the same terms as the preview. */
function summarize(done: Purged): string {
  const parts = [
    `${done.notesDeleted} ${done.notesDeleted === 1 ? "note" : "notes"} deleted`,
    `${done.notesTrimmed} trimmed`,
    `${done.copiesDeleted + done.copiesTrimmed} copies in backups and history`
  ]
  if (done.snapshotsSkipped > 0) {
    parts.push(`${done.snapshotsSkipped} snapshots from another vault left alone`)
  }
  if (done.failed.length > 0) {
    parts.push(`${done.failed.length} could not be removed`)
  }
  return `${parts.join(", ")}.`
}

/**
 * Deleting everything a tag holds.
 *
 * The plan is fetched and shown before anything happens, and the confirm asks
 * for a word to be typed: nothing here can be undone, and the difference
 * between `#work` and `#works` is one keystroke.
 */
export function TagPurge() {
  const [tag, setTag] = useState("")
  const [plan, setPlan] = useState<PurgePlan | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /*
   * The sidebar and the index are holding a list of notes, some of which are
   * about to stop existing. The backend says so too, for anything else
   * listening; this is the half that does not wait for a round trip.
   */
  const reload = useNotesStore((state) => state.load)

  async function look(): Promise<void> {
    setSaid(null)
    setBusy(true)
    try {
      const found = await window.tova.preferences.tagPurgePlan(tag)
      if (found.tag === "") {
        setSaid(`“${tag.trim()}” is not a tag. A tag is a word starting with a letter.`)
        return
      }
      if (found.notes.length === 0) {
        setSaid(`Nothing carries #${found.tag}. A tag written inside a sentence does not count.`)
        return
      }
      setPlan(found)
    } finally {
      setBusy(false)
    }
  }

  async function purge(): Promise<void> {
    if (plan === null) return
    const target = plan.tag
    setPlan(null)
    setBusy(true)
    try {
      const done = await window.tova.preferences.tagPurge(target)
      await reload()
      setSaid(summarize(done))
      setTag("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field
        id="purge-tag"
        label="Tag"
        hint="Notes tagged in their tag row go. Elsewhere, only the blocks that tag heads."
      >
        <div className="purge-row">
          <input
            id="purge-tag"
            className="text-input"
            value={tag}
            placeholder="work"
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && tag.trim() !== "") void look()
            }}
          />
          <button
            type="button"
            className="settings-button settings-button-danger"
            disabled={busy || tag.trim() === ""}
            onClick={() => void look()}
          >
            Find what it holds
          </button>
        </div>
      </Field>

      {said !== null && (
        <p className="field-hint" role="status">
          {said}
        </p>
      )}

      {plan !== null && (
        <ConfirmDialog
          title={`Delete everything under #${plan.tag}?`}
          body="This cannot be undone. The notes go from the vault, from their version history, and from every backup snapshot of this vault — Tova keeps no copy anywhere else."
          details={plan.notes.map(describe)}
          confirmLabel={`Delete everything under #${plan.tag}`}
          confirmWord="confirm"
          destructive
          onConfirm={() => void purge()}
          onCancel={() => setPlan(null)}
        />
      )}
    </>
  )
}
