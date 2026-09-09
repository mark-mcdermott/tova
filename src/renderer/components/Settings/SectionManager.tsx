import { useState } from "react"
import {
  SECTION_ICONS,
  SectionConfig,
  SectionIcon,
  addSection,
  canDelete,
  sectionRole,
  moveSection,
  removeSection,
  renameSection,
  setSectionIcon,
  toggleSection
} from "../../../shared/sections"
import { useNotesStore } from "../../stores/notesStore"
import { usePreferencesStore } from "../../stores/preferencesStore"
import { Icon } from "../Sidebar/icons"

/**
 * The sidebar's rows, as a list you can rearrange. Renaming only rewrites a
 * label — the directory keeps its name — so nothing on disk moves and no note
 * id changes. Adding and removing do touch the vault, and go through main.
 */
export function SectionManager() {
  const sections = usePreferencesStore((state) => state.preferences.sections)
  const update = usePreferencesStore((state) => state.update)
  const notes = useNotesStore((state) => state.notes)
  const load = useNotesStore((state) => state.load)

  const [adding, setAdding] = useState("")
  const [error, setError] = useState<string | null>(null)

  const held = (id: string) => notes.filter((note) => note.section === id).length

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
    const made = next.find((section) => !sections.some((old) => old.id === section.id))
    if (made !== undefined) await window.tova.notes.createSection(made.id)

    setAdding("")
    await save(next)
    await load()
  }

  async function remove(section: SectionConfig) {
    // Says what it will do before it does it: nothing here is destroyed.
    const count = held(section.id)
    const warning =
      count === 0
        ? `Remove ${section.label}?`
        : `Remove ${section.label}? Its ${count} ${count === 1 ? "note goes" : "notes go"} to Trash.`
    if (!window.confirm(warning)) return

    await window.tova.notes.deleteSection(section.id)
    await save(removeSection(sections, section.id))
    await load()
  }

  return (
    <div className="sections">
      {sections.map((section, index) => (
        <div key={section.id} className="section-row">
          <div className="section-order">
            <button
              type="button"
              aria-label={`Move ${section.label} up`}
              disabled={index === 0}
              onClick={() => void save(moveSection(sections, section.id, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${section.label} down`}
              disabled={index === sections.length - 1}
              onClick={() => void save(moveSection(sections, section.id, 1))}
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
              onChange={(event) =>
                void save(renameSection(sections, section.id, event.target.value))
              }
            />
            {/* Call it what you like — this still says which one it is, and by
                extension why it has no delete button. */}
            {sectionRole(section.id) !== null && (
              <span className="section-role">{sectionRole(section.id)}</span>
            )}
          </span>

          <select
            className="section-icon"
            aria-label={`Icon for ${section.label}`}
            value={section.icon}
            onChange={(event) =>
              void save(setSectionIcon(sections, section.id, event.target.value as SectionIcon))
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
              onChange={() => void save(toggleSection(sections, section.id))}
            />
            <span>{section.enabled ? "Shown" : "Hidden"}</span>
          </label>

          <button
            type="button"
            className="section-remove is-destructive"
            aria-label={`Remove ${section.label}`}
            disabled={!canDelete(section.id)}
            onClick={() => void remove(section)}
          >
            <Icon name="trash" className="row-action-icon" />
          </button>
        </div>
      ))}

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
        somewhere. Hiding one takes it out of this rail and changes nothing else.
      </p>
    </div>
  )
}
