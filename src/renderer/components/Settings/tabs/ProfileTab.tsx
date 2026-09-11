import { AVATARS, AvatarChoice } from "../../../../shared/preferences"
import { offersAvatar, resolveAvatar } from "../../../avatar"
import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Avatar } from "../../Sidebar/Avatar"

export function ProfileTab() {
  const displayName = usePreferencesStore((state) => state.preferences.displayName)
  const avatar = usePreferencesStore((state) => state.preferences.avatar)
  const avatarSources = usePreferencesStore((state) => state.avatarSources)
  const update = usePreferencesStore((state) => state.update)
  const chooseAvatar = usePreferencesStore((state) => state.chooseAvatar)

  const offered = AVATARS.filter((option) => offersAvatar(option.value, avatarSources))

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
              />
              <span className="choice-name">{option.label}</span>
              <span className="avatar-choice-hint">{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="profile-avatar-row">
          <button type="button" className="settings-button" onClick={() => void chooseAvatar()}>
            {avatarSources.custom === null ? "Choose a picture…" : "Choose another…"}
          </button>
          {avatarSources.custom !== null && (
            <button type="button" className="settings-button" onClick={() => void removePicture()}>
              Remove the picture
            </button>
          )}
        </div>
      </Field>
    </section>
  )
}
