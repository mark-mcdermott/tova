import { useState } from "react"
import {
  SECTION_ICONS,
  SectionConfig,
  SectionIcon,
  addSection,
  canDelete,
  sectionRole,
  moveSection,
  railKey,
  removeSection,
  renameSection,
  setSectionIcon,
  toggleSection
} from "../../../shared/sections"
import { useNotesStore } from "../../stores/notesStore"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { useRail } from "../../useRail"
import { Icon } from "../Sidebar/icons"

/**
 * The sidebar's rows, as a list you can rearrange. Renaming only rewrites a
 * label — the directory keeps its name — so nothing on disk moves and no note
 * id changes. Adding and removing do touch the vault, and go through main.
 *
 * Blogs are rows here too, so one can sit anywhere in the rail rather than in a
 * fixed block above it. They rename, move and hide like a section; what they
 * cannot do is be deleted from here, because that would take their stored
 * tokens and sync history with them. That stays in the Blogs tab.
 */
export function SectionManager() {
  const sections = useRail()
  const update = usePreferencesStore((state) => state.update)
  const notes = useNotesStore((state) => state.notes)
  const load = useNotesStore((state) => state.load)

  const [adding, setAdding] = useState("")
  const [error, setError] = useState<string | null>(null)

  const held = (entry: SectionConfig) =>
    entry.kind === "blog"
      ? notes.filter((note) => note.section === "posts" && note.folder === entry.id).length
      : notes.filter((note) => note.section === entry.id).length

  async function save(next: SectionConfig[]) {
    await update({ sections: next })
  }

  async function add() {
    const next = addSection(sections, adding)
    if (next === null) {
      setError("That name is already taken, or is one Tova keeps for itself.")
      return
    }

    setError(null)
    const made = next.find((entry) => !sections.some((old) => railKey(old) === railKey(entry)))
    if (made !== undefined) await window.tova.notes.createSection(made.id)

    setAdding("")
    await save(next)
    await load()
  }

  async function remove(entry: SectionConfig) {
    // Says what it will do before it does it: nothing here is destroyed.
    const count = held(entry)
    const warning =
      count === 0
        ? `Remove ${entry.label}?`
        : `Remove ${entry.label}? Its ${count} ${count === 1 ? "note goes" : "notes go"} to Trash.`
    if (!window.confirm(warning)) return

    await window.tova.notes.deleteSection(entry.id)
    await save(removeSection(sections, railKey(entry)))
    await load()
  }

  return (
    <div className="sections">
      {sections.map((section, index) => {
        const key = railKey(section)
        const role = sectionRole(section)

        return (
          <div key={key} className="section-row">
            <div className="section-order">
              <button
                type="button"
                aria-label={`Move ${section.label} up`}
                disabled={index === 0}
                onClick={() => void save(moveSection(sections, key, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${section.label} down`}
                disabled={index === sections.length - 1}
                onClick={() => void save(moveSection(sections, key, 1))}
              >
                ↓
              </button>
            </div>

            <span className="section-glyph">
              <Icon name={section.icon} />
            </span>

            <span className="section-name">
              <input
                className="text-input section-label"
                aria-label={`Name of ${section.label}`}
                value={section.label}
                onChange={(event) => void save(renameSection(sections, key, event.target.value))}
              />
              {/* Call it what you like — this still says which one it is, and by
                  extension why it has no delete button. */}
              {role !== null && <span className="section-role">{role}</span>}
            </span>

            <select
              className="section-icon"
              aria-label={`Icon for ${section.label}`}
              value={section.icon}
              onChange={(event) =>
                void save(setSectionIcon(sections, key, event.target.value as SectionIcon))
              }
            >
              {SECTION_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>

            <label className="switch section-enabled">
              <input
                type="checkbox"
                aria-label={`Show ${section.label}`}
                checked={section.enabled}
                onChange={() => void save(toggleSection(sections, key))}
              />
              <span>{section.enabled ? "Shown" : "Hidden"}</span>
            </label>

            <button
              type="button"
              className="section-remove is-destructive"
              aria-label={`Remove ${section.label}`}
              disabled={!canDelete(section)}
              onClick={() => void remove(section)}
            >
              <Icon name="trash" className="row-action-icon" />
            </button>
          </div>
        )
      })}

      <div className="section-add">
        <input
          className="text-input"
          aria-label="New section name"
          placeholder="New section"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add()
          }}
        />
        <button type="button" onClick={() => void add()} disabled={adding.trim() === ""}>
          Add
        </button>
      </div>

      {error !== null && <p className="settings-error">{error}</p>}

      <p className="settings-note">
        Daily and Trash can be renamed, moved and hidden like the rest — they only cannot be
        removed, because today's note has to be written somewhere and a deleted note has to go
        somewhere. A blog arranges the same way; deleting one stays in the Blogs tab, where its
        tokens and its synced posts are accounted for. Hiding any of them takes it out of this rail
        and changes nothing else.
      </p>
    </div>
  )
}
