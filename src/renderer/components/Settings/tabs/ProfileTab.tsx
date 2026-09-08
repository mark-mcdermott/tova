import { usePreferencesStore } from "../../../stores/preferencesStore"
import { Field } from "../Field"
import { Avatar } from "../../Sidebar/Avatar"

export function ProfileTab() {
  const displayName = usePreferencesStore((state) => state.preferences.displayName)
  const avatarUrl = usePreferencesStore((state) => state.avatarUrl)
  const update = usePreferencesStore((state) => state.update)
  const chooseAvatar = usePreferencesStore((state) => state.chooseAvatar)

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
        label="Picture"
        hint="Copied into Tova, so moving the original does not lose it."
      >
        <div className="profile-avatar-row">
          <Avatar className="profile-avatar" src={avatarUrl} name={displayName} />
          <button
            type="button"
            id="profile-avatar"
            className="settings-button"
            onClick={() => void chooseAvatar()}
          >
            Choose a picture
          </button>
          {avatarUrl !== null && (
            <button
              type="button"
              className="settings-button"
              onClick={() => void update({ avatarFile: null })}
            >
              Use the default
            </button>
          )}
        </div>
      </Field>
    </section>
  )
}
