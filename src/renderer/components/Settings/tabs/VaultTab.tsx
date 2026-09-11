import { useEffect, useState } from "react"
import { paginate } from "../../../../shared/paging"
import { AppInfo, VaultChoice, BackupSummary } from "../../../../shared/types"
import { ConfirmDialog } from "../../Popup/ConfirmDialog"
import { useNotesStore } from "../../../stores/notesStore"
import { useBlogsStore } from "../../../stores/blogsStore"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  })
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`
}

/** How many snapshots are worth showing before the list stops being a list. */
/*
 * A page, not a cap. This was a slice of the first six, which meant every
 * snapshot past the sixth was unreachable — the list is the only way back to
 * one, so hiding them hid the feature.
 */
const PER_PAGE = 6

export function VaultTab() {
  const restoreFromBackup = useNotesStore((state) => state.restoreFromBackup)
  const load = useNotesStore((state) => state.load)
  const loadBlogs = useBlogsStore((state) => state.load)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [page, setPage] = useState(1)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vaults, setVaults] = useState<VaultChoice[]>([])
  const [switching, setSwitching] = useState(false)
  const [sealing, setSealing] = useState<string | null>(null)
  const [unsealing, setUnsealing] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [typedKey, setTypedKey] = useState("")
  const [wrongKey, setWrongKey] = useState(false)

  // The first is always the default, which cannot be forgotten.
  const defaultPath = vaults[0]?.path

  useEffect(() => {
    void window.tova.preferences.listVaults().then(setVaults)
  }, [])

  /** Everything the app is showing belongs to the old vault, so it all reloads. */
  async function after(next: VaultChoice[]) {
    setVaults(next)
    await Promise.all([load(), loadBlogs()])
    setInfo(await window.tova.app.info())
  }

  async function switchTo(path: string) {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.useVault(path))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function addVault() {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.addVault())
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function encrypt(path: string) {
    setSealing(null)
    setSwitching(true)
    try {
      // Shown once and never again: Tova keeps no readable copy of it, which
      // is the only reason it is worth anything.
      setRecoveryKey(await window.tova.preferences.encryptVault(path))
      setVaults(await window.tova.preferences.listVaults())
    } catch (problem) {
      setError(describe(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function decrypt(path: string) {
    setUnsealing(null)
    setSwitching(true)
    try {
      await after(await window.tova.preferences.decryptVault(path))
    } catch (problem) {
      setError(describe(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function unlock(path: string) {
    setSwitching(true)
    try {
      if (!(await window.tova.preferences.unlockVault(path, typedKey))) {
        setWrongKey(true)
        return
      }
      setUnlocking(null)
      setTypedKey("")
      await after(await window.tova.preferences.listVaults())
    } catch (problem) {
      setError(describe(problem))
    } finally {
      setSwitching(false)
    }
  }

  async function forget(path: string) {
    setSwitching(true)
    try {
      await after(await window.tova.preferences.forgetVault(path))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([window.tova.app.info(), window.tova.backups.list()])
      .then(([loadedInfo, loadedBackups]) => {
        if (cancelled) return
        setInfo(loadedInfo)
        setBackups(loadedBackups)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describe(cause))
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function backUpNow() {
    setBackingUp(true)
    setError(null)
    try {
      await window.tova.backups.run()
      setBackups(await window.tova.backups.list())
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setBackingUp(false)
    }
  }

  async function reveal(target: "vault" | "backups") {
    try {
      await window.tova.app.reveal(target)
    } catch (cause) {
      setError(describe(cause))
    }
  }

  // Clamped inside paginate, so deleting the last snapshot on a page falls back
  // to the new last page rather than showing an empty list.
  const shown = paginate(backups, page, PER_PAGE)

  return (
    <>
      {error !== null && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <section className="settings-section">
        <h2 className="settings-section-title">Vaults</h2>
        <p className="settings-note">
          Every note is a plain markdown file on this machine. Nothing leaves it. Switching changes
          which folder Tova reads; removing one only stops listing it — the folder and its notes
          stay exactly where they are.
        </p>

        <div className="vaults">
          {vaults.map((vault) => (
            <div key={vault.path} className={`vault-row${vault.active ? " is-active" : ""}`}>
              <button
                type="button"
                className="vault-choose"
                aria-label={vault.active ? `${vault.name}, in use` : `Use ${vault.name}`}
                aria-pressed={vault.active}
                disabled={vault.active || switching}
                onClick={() => void switchTo(vault.path)}
              >
                <span className="vault-name">
                  {vault.name}
                  {vault.encrypted && (
                    <span className="vault-sealed">{vault.locked ? "Locked" : "Encrypted"}</span>
                  )}
                </span>
                <span className="vault-path">{vault.path}</span>
              </button>

              {vault.locked ? (
                <button
                  type="button"
                  className="settings-button settings-button-primary"
                  aria-label={`Unlock ${vault.name}`}
                  disabled={switching}
                  onClick={() => {
                    setWrongKey(false)
                    setTypedKey("")
                    setUnlocking(vault.path)
                  }}
                >
                  Unlock
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-button"
                  aria-label={vault.encrypted ? `Decrypt ${vault.name}` : `Encrypt ${vault.name}`}
                  disabled={switching}
                  onClick={() =>
                    vault.encrypted ? setUnsealing(vault.path) : setSealing(vault.path)
                  }
                >
                  {vault.encrypted ? "Decrypt" : "Encrypt"}
                </button>
              )}

              <button
                type="button"
                className="settings-button"
                aria-label={`Forget ${vault.name}`}
                disabled={vault.path === defaultPath || switching}
                onClick={() => void forget(vault.path)}
              >
                Forget
              </button>
            </div>
          ))}
        </div>

        <p className="settings-note">
          Encrypting a vault seals every file in it — notes, pictures and older versions — so the
          folder can sit in a synced drive without the drive being able to read it. Filenames are
          not sealed, so the titles stay legible. Tova opens it on this machine by itself; the
          recovery key is for any other, and is shown once.
        </p>

        <div className="settings-row">
          <button
            type="button"
            className="settings-button settings-button-primary"
            disabled={switching}
            onClick={() => void addVault()}
          >
            Add a vault…
          </button>
          <button type="button" className="settings-button" onClick={() => void reveal("vault")}>
            Open folder
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Snapshots</h2>
        <p className="settings-note">
          Restoring replaces the current vault — which is itself backed up first, so a restore is
          never the end of the line. The schedule is on the General tab.
        </p>

        <div className="settings-row">
          <span className="settings-path">{info?.backupPath ?? "…"}</span>
          <button type="button" className="settings-button" onClick={() => void reveal("backups")}>
            Open folder
          </button>
          <button
            type="button"
            className="settings-button settings-button-primary"
            disabled={backingUp}
            onClick={() => void backUpNow()}
          >
            {backingUp ? "Backing up…" : "Back up now"}
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="settings-empty">No snapshots yet.</p>
        ) : (
          <ul className="settings-list">
            {shown.items.map((backup) => (
              <li key={backup.name} className="settings-list-row">
                <span className="settings-list-label">
                  {formatWhen(backup.createdAt)}
                  <span className="settings-list-meta">{countLabel(backup.noteCount)}</span>
                </span>

                {confirming === backup.name ? (
                  <span className="settings-confirm">
                    <span className="settings-confirm-text">Replace the current vault?</span>
                    <button
                      type="button"
                      className="settings-button settings-button-danger"
                      onClick={() => void restoreFromBackup(backup.name)}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="settings-button"
                    onClick={() => setConfirming(backup.name)}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {shown.pages > 1 && (
          <div className="settings-pager">
            <button
              type="button"
              className="settings-button"
              disabled={shown.page === 1}
              onClick={() => setPage(shown.page - 1)}
            >
              Newer
            </button>
            <span className="settings-pager-count">
              {shown.first}–{shown.last} of {shown.total}
            </span>
            <button
              type="button"
              className="settings-button"
              disabled={shown.page === shown.pages}
              onClick={() => setPage(shown.page + 1)}
            >
              Older
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">About</h2>
        <dl className="settings-facts">
          <div>
            <dt>Tova</dt>
            <dd>{info?.version ?? "…"}</dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info?.electron ?? "…"}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info?.chrome ?? "…"}</dd>
          </div>
        </dl>

        <div className="settings-row">
          <button
            type="button"
            className="settings-button"
            onClick={() =>
              void window.tova.app.openExternal("https://github.com/mark-mcdermott/tova/issues")
            }
          >
            Report a problem
          </button>
        </div>
      </section>

      {sealing !== null && (
        <ConfirmDialog
          title="Encrypt this vault?"
          body="Every file in it is sealed, and Tova will need a key to read them. You will be shown a recovery key once — without it, a machine that loses its keychain loses the notes."
          details={[sealing]}
          confirmLabel="Encrypt"
          onConfirm={() => void encrypt(sealing)}
          onCancel={() => setSealing(null)}
        />
      )}

      {unsealing !== null && (
        <ConfirmDialog
          title="Decrypt this vault?"
          body="Every file goes back to plain markdown. Anything that can read the folder will be able to read the notes again."
          details={[unsealing]}
          confirmLabel="Decrypt"
          destructive
          onConfirm={() => void decrypt(unsealing)}
          onCancel={() => setUnsealing(null)}
        />
      )}

      {recoveryKey !== null && (
        <ConfirmDialog
          title="Write this down"
          body="This is the only way into the vault from any other machine, and the only way back if this one forgets. Tova keeps no readable copy — it cannot show it to you again."
          details={[recoveryKey]}
          confirmLabel="I have written it down"
          onConfirm={() => setRecoveryKey(null)}
          onCancel={() => setRecoveryKey(null)}
        />
      )}

      {unlocking !== null && (
        <div className="confirm-backdrop">
          <div className="confirm-panel" role="alertdialog" aria-modal="true">
            <h2 className="confirm-title">Unlock this vault</h2>
            <p className="confirm-body">
              This machine has no key for it. Enter the recovery key that was written down when it
              was encrypted.
            </p>

            <label className="confirm-word">
              <span>Recovery key</span>
              <input
                className="text-input"
                value={typedKey}
                autoComplete="off"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                aria-label="Recovery key"
                onChange={(event) => {
                  setTypedKey(event.target.value)
                  setWrongKey(false)
                }}
              />
            </label>

            {wrongKey && (
              <p className="settings-error" role="alert">
                That key does not open this vault.
              </p>
            )}

            <div className="confirm-actions">
              <button
                type="button"
                className="settings-button"
                onClick={() => {
                  setUnlocking(null)
                  setTypedKey("")
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button settings-button-primary"
                disabled={typedKey.trim() === "" || switching}
                onClick={() => void unlock(unlocking)}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
