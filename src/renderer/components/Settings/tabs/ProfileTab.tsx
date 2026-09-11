import { useEffect, useRef, useState } from "react"
import { AVATARS, AvatarChoice } from "../../../../shared/preferences"
import { discColor, offersAvatar, resolveAvatar } from "../../../avatar"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Avatar } from "../../Sidebar/Avatar"

export function ProfileTab() {
  const displayName = usePreferencesStore((state) => state.preferences.displayName)
  const avatar = usePreferencesStore((state) => state.preferences.avatar)
  const avatarSources = usePreferencesStore((state) => state.avatarSources)
  const avatarColor = usePreferencesStore((state) => state.preferences.avatarColor)
  const update = usePreferencesStore((state) => state.update)
  const chooseAvatar = usePreferencesStore((state) => state.chooseAvatar)

  const offered = AVATARS.filter((option) => offersAvatar(option.value, avatarSources))

  /*
   * The colour the tiles are drawn in while the system picker is open. The
   * picker reports every move of the wheel, and a preference that wrote to disk
   * on each of them would be writing a hundred times for one choice — so the
   * tiles follow the wheel from here and the file catches up when it settles.
   */
  const [dragging, setDragging] = useState<string | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chosenColor = dragging ?? avatarColor

  useEffect(() => {
    return () => {
      if (settle.current !== null) clearTimeout(settle.current)
    }
  }, [])

  function pickColor(value: string) {
    setDragging(value)
    if (settle.current !== null) clearTimeout(settle.current)
    settle.current = setTimeout(() => void update({ avatarColor: value }), 250)
  }

  /**
   * Clearing the picture takes the choice off it too. Leaving it set would show
   * the initials while the picker said Picture, and the next Choose would look
   * like it had done nothing.
   */
  async function removePicture() {
    const patch = {
      avatarFile: null,
      ...(avatar === "custom" ? { avatar: "initials" as const } : {})
    }
    await update(patch)
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">Profile</h2>
      <p className="settings-note">
        Shown at the foot of the sidebar, and nowhere else. Tova has no account and sends nothing
        anywhere.
      </p>

      <Field id="profile-name" label="Display name" hint="Leave it empty to show only the picture.">
        <input
          id="profile-name"
          className="text-input"
          value={displayName}
          maxLength={60}
          placeholder="Your name"
          onChange={(event) => void update({ displayName: event.target.value })}
        />
      </Field>

      <Field
        id="profile-avatar"
        label="Avatar"
        hint="Each one shown as the face it would give you."
      >
        {/* Every option draws itself. A picker that named the choices and left
            the reader to imagine them would be asking them to choose blind. */}
        <div className="avatar-choices">
          {offered.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`avatar-choice${avatar === option.value ? " is-chosen" : ""}`}
              aria-pressed={avatar === option.value}
              onClick={() => void update({ avatar: option.value as AvatarChoice })}
            >
              <Avatar
                className="avatar-choice-face"
                src={resolveAvatar(option.value, avatarSources)}
                name={displayName}
                color={chosenColor}
              />
              <span className="choice-name">{option.label}</span>
              {option.hint !== undefined && (
                <span className="avatar-choice-hint">{option.hint}</span>
              )}
              {/* On the tile rather than beside the row, the way an added font
                  carries its own ×. A button cannot hold a button, so the
                  control is a span that behaves like one. */}
              {option.value === "custom" && (
                <span
                  className="choice-remove"
                  role="button"
                  tabIndex={0}
                  aria-label="Remove the picture"
                  onClick={(event) => {
                    event.stopPropagation()
                    void removePicture()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    void removePicture()
                  }}
                >
                  ×
                </span>
              )}
            </button>
          ))}

          {/* Last in the row, as the font and background pickers have it. It
              is how a picture arrives rather than one of the faces on offer,
              so it is drawn as an opening rather than a tile. */}
          <button
            type="button"
            className="avatar-choice avatar-add"
            onClick={() => void chooseAvatar()}
          >
            <span className="avatar-add-glyph" aria-hidden="true">
              +
            </span>
            <span className="choice-name">Upload</span>
          </button>
        </div>
      </Field>

      <Field
        id="avatar-colour"
        label="Avatar Background Color"
        hint="Applies only to Initials and Tova Robot"
      >
        <input
          type="color"
          id="avatar-colour"
          className="avatar-colour"
          value={discColor(chosenColor)}
          onChange={(event) => pickColor(event.target.value)}
        />
      </Field>
    </section>
  )
}
